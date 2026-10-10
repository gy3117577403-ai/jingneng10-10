<?php

namespace App\Services\CompanyData;

use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\{DB, Storage};
use Illuminate\Validation\ValidationException;
use PhpOffice\PhpSpreadsheet\{IOFactory, Shared\Date};

class DataImports
{
    public function __construct(private DataSupport $support, private DataRecords $records) {}
    private function authorize(User $user, DataAccess $a, int $category): void
    {
        $c = $a->category($category); abort_unless($a->can($user, 'create', $c) && $a->can($user, 'view', $c, false), 403, '需要该分类的新增与查看权限。');
    }
    public function stage(User $user, string $key, int $category, UploadedFile $file): array
    {
        $this->authorize($user, new DataAccess(), $category);
        validator(['file' => $file], ['file' => 'required|file|max:5120'])->validate();
        $ext = strtolower($file->getClientOriginalExtension()); abort_unless(in_array($ext, ['csv', 'xlsx']), 422, '导入支持 UTF-8 CSV 或 XLSX 文件。');
        $p = ['sha256' => hash_file('sha256', $file->getRealPath()), 'filename' => mb_substr(basename(str_replace('\\', '/', $file->getClientOriginalName())), 0, 200)];
        return $this->support->mutate($user, $key, "import-stage:$category", $p, fn (DataAccess $a) => $this->authorize($user, $a, $category), function (DataAccess $a) use ($user, $category, $file, $p, $ext) {
            $rows = [];
            if ($ext === 'csv') {
                $raw = file_get_contents($file->getRealPath()); abort_unless(mb_check_encoding($raw, 'UTF-8'), 422, 'CSV 文件需要使用 UTF-8 编码。');
                $h = fopen($file->getRealPath(), 'rb');
                try { while (($row = fgetcsv($h, 0, ',', '"', '')) !== false) { $rows[] = $row; abort_if(count($rows) > 501 || count($row) > 50, 422, '每批最多500行、50列，请拆分文件。'); } }
                finally { fclose($h); }
            } else {
                $zip = new \ZipArchive(); abort_unless($zip->open($file->getRealPath()) === true, 422, 'XLSX 文件无法打开。'); $expanded = 0;
                try { abort_if($zip->numFiles > 1000, 422, '文件内容过于复杂，请另存为普通表格。'); for ($i = 0; $i < $zip->numFiles; $i++) $expanded += $zip->statIndex($i)['size']; abort_if($expanded > 50000000, 422, '文件解压后过大，请拆分。'); }
                finally { $zip->close(); }
                $reader = IOFactory::createReader('Xlsx'); $info = $reader->listWorksheetInfo($file->getRealPath());
                abort_unless(count($info) === 1 && $info[0]['totalRows'] <= 501 && $info[0]['totalColumns'] <= 50, 422, '请使用单工作表，每批最多500行、50列。');
                $book = $reader->load($file->getRealPath()); $sheet = $book->getSheet(0);
                try {
                    for ($row = 1; $row <= $info[0]['totalRows']; $row++) {
                        $values = [];
                        for ($col = 1; $col <= $info[0]['totalColumns']; $col++) {
                            $cell = $sheet->getCell([$col, $row]); abort_if($cell->getDataType() === 'f', 422, '导入不计算公式，请先将公式粘贴为值。');
                            $value = $cell->getValue();
                            if (is_numeric($value) && Date::isDateTime($cell)) $value = Date::excelToDateTimeObject((float) $value)->format('Y-m-d');
                            $values[] = $value === null ? '' : (is_bool($value) ? ($value ? '是' : '否') : (string) $value);
                        }
                        $rows[] = $values;
                    }
                } finally { $book->disconnectWorksheets(); }
            }
            abort_unless(count($rows) >= 2, 422, '文件需要一行表头和至少一行数据。');
            $headers = array_map(fn ($v) => trim((string) $v), array_shift($rows)); $headers[0] = preg_replace('/^\x{FEFF}/u', '', $headers[0]);
            abort_if(in_array('', $headers, true) || count($headers) !== count(array_unique($headers)), 422, '表头不能为空或重复。');
            $clean = [];
            foreach ($rows as $index => $row) {
                if (!array_filter($row, fn ($v) => $v !== null && trim((string) $v) !== '')) continue;
                abort_if(count($row) > count($headers), 422, '第' . ($index + 2) . '行列数超过表头。');
                foreach ($row as $value) abort_if(mb_strlen((string) $value) > 5000, 422, '单元格内容不能超过5000字。');
                $clean[] = ['line' => $index + 2, 'cells' => array_pad($row, count($headers), '')];
            }
            abort_unless($clean, 422, '没有可导入的数据。');
            $mapping = []; $c = $a->category($category); $fields = [['key' => 'code', 'label' => '编号'], ['key' => 'title', 'label' => '名称'], ...DataSupport::decode($c->fields)];
            foreach ($fields as $f) $mapping[$f['key']] = in_array($f['label'], $headers, true) ? $f['label'] : '';
            $path = $file->store('company-data/imports', 'local'); abort_unless($path, 503, '文件存储暂不可用，未创建导入批次。'); $this->support->stored($path);
            $id = DB::table('jn_data_imports')->insertGetId(['category_id' => $category, 'actor_id' => $user->id, 'filename' => $p['filename'], 'path' => $path, 'sha256' => $p['sha256'], 'headers' => DataSupport::json($headers), 'rows' => DataSupport::json($clean), 'mapping' => DataSupport::json($mapping), 'category_revision' => $c->revision, 'result' => '[]', 'created_at' => now(), 'updated_at' => now()]);
            return ['id' => $id];
        });
    }
    private function validateRows(object $batch, array $mapping): array
    {
        $cat = DB::table('jn_data_categories')->where('id', $batch->category_id)->firstOrFail(); $fields = DataSupport::decode($cat->fields); $headers = DataSupport::decode($batch->headers);
        abort_if(array_diff(array_keys($mapping), ['code', 'title', ...array_column($fields, 'key')]), 422, '映射含未定义字段。');
        foreach ($mapping as $header) abort_unless(is_string($header) && ($header === '' || in_array($header, $headers, true)), 422, '映射列不在上传表头中。');
        $used = array_filter($mapping, fn ($x) => $x !== ''); abort_if(count($used) !== count(array_unique($used)), 422, '同一列不能映射给多个字段。');
        $existing = DB::table('jn_data_records')->where('category_id', $batch->category_id)->pluck('code')->map(fn ($x) => mb_strtolower($x))->all(); $seen = []; $result = [];
        foreach (DataSupport::decode($batch->rows) as $row) {
            $read = fn ($key) => isset($mapping[$key]) && $mapping[$key] !== '' ? trim((string) ($row['cells'][array_search($mapping[$key], $headers, true)] ?? '')) : '';
            $code = $read('code'); $title = $read('title'); $errors = []; $values = [];
            if ($code === '' || mb_strlen($code) > 80) $errors[] = '编号不能为空且不能超过80字';
            if ($title === '' || mb_strlen($title) > 180) $errors[] = '名称不能为空且不能超过180字';
            $normalized = mb_strtolower($code);
            if (in_array($normalized, $existing, true) || isset($seen[$normalized])) $errors[] = '编号已存在或批次内重复'; $seen[$normalized] = true;
            foreach ($fields as $f) $values[$f['key']] = $read($f['key']);
            try { $values = DataSchema::values($values, $fields); } catch (ValidationException $e) { $errors = [...$errors, ...array_merge(...array_values($e->errors()))]; }
            $result[] = ['line' => $row['line'], 'code' => $code, 'title' => $title, 'values' => $values, 'errors' => $errors];
        }
        return $result;
    }
    public function get(User $user, ?int $id = null): array
    {
        $a = new DataAccess(); $batches = DB::table('jn_data_imports')->where('actor_id', $user->id)->when($id, fn ($q) => $q->where('id', $id))->orderByDesc('id')->get(); $out = [];
        foreach ($batches as $b) {
            $c = $a->category($b->category_id); if (!$a->can($user, 'create', $c) || !$a->can($user, 'view', $c, false)) continue;
            $item = ['id' => $b->id, 'category_id' => $b->category_id, 'category' => $c->name, 'filename' => $b->filename, 'state' => $b->state, 'created_at' => $b->created_at, 'count' => count(DataSupport::decode($b->rows))];
            if ($id) $item += ['headers' => DataSupport::decode($b->headers), 'mapping' => DataSupport::decode($b->mapping), 'fields' => DataSupport::decode($c->fields), 'stale' => (int) $b->category_revision !== (int) $c->revision,
                'rows' => $b->state === 'preview' ? $this->validateRows($b, DataSupport::decode($b->mapping)) : [], 'result' => DataSupport::decode($b->result)];
            $out[] = $item;
        }
        if ($id) { abort_unless($out, 403, '当前无权读取这个导入批次。'); return $out[0]; } return $out;
    }
    public function action(User $user, string $key, int $id, array $p): array
    {
        return $this->support->mutate($user, $key, "import:$id", $p, function (DataAccess $a) use ($user, $id) {
            $b = DB::table('jn_data_imports')->where('id', $id)->firstOrFail(); abort_unless((int) $b->actor_id === (int) $user->id, 403); $this->authorize($user, $a, $b->category_id);
        }, function (DataAccess $a) use ($user, $id, $p) {
            validator($p, ['action' => 'required|in:map,commit,undo,cancel', 'mapping' => 'sometimes|array'])->validate();
            $b = DB::table('jn_data_imports')->where('id', $id)->firstOrFail(); $action = $p['action'];
            abort_unless($b->state === ($action === 'undo' ? 'committed' : 'preview'), 409, '该导入批次已经处理。');
            if ($action === 'cancel') DB::table('jn_data_imports')->where('id', $id)->update(['state' => 'cancelled', 'updated_at' => now()]);
            elseif ($action === 'undo') {
                $ids = DataSupport::decode($b->result);
                foreach ($ids as $rid) {
                    $r = $a->record($rid); abort_unless($a->can($user, 'archive', $r), 403, '撤销导入需要所有新增资料的归档权限。');
                    abort_unless($r->revision === 2 && !$r->published_version_id && !$r->archived && $a->version($r->draft_version_id)->state === 'draft'
                        && !DB::table('jn_data_tasks')->where('record_id', $rid)->exists() && !DB::table('jn_data_comments')->where('record_id', $rid)->exists(), 422, '批次中已有资料被修改或参与协作，不能整批撤销，请逐条核对。');
                }
                foreach ($ids as $rid) { DB::table('jn_data_records')->where('id', $rid)->update(['archived' => true, 'revision' => 3, 'updated_at' => now()]); $this->support->event($user, 'record', $rid, '撤销导入并归档草稿'); }
                DB::table('jn_data_imports')->where('id', $id)->update(['state' => 'undone', 'updated_at' => now()]);
            } else {
                abort_unless((int) $b->category_revision === (int) $a->category($b->category_id)->revision, 409, '分类配置已变化，请取消本批次并重新上传校验。');
                $mapping = $p['mapping'] ?? DataSupport::decode($b->mapping); $rows = $this->validateRows($b, $mapping);
                if ($action === 'map') DB::table('jn_data_imports')->where('id', $id)->update(['mapping' => DataSupport::json($mapping), 'updated_at' => now()]);
                else {
                    abort_if(collect($rows)->contains(fn ($r) => count($r['errors']) > 0), 422, '还有未解决的校验错误，未写入任何资料。');
                    $ids = []; foreach ($rows as $row) $ids[] = $this->records->create($user, $b->category_id, [...$row, 'kind' => 'ledger', 'note' => '导入批次 ' . $id . '，原文件第' . $row['line'] . '行']);
                    DB::table('jn_data_imports')->where('id', $id)->update(['mapping' => DataSupport::json($mapping), 'result' => DataSupport::json($ids), 'state' => 'committed', 'updated_at' => now()]);
                }
            }
            return ['id' => $id];
        });
    }
    public function export(User $user, int $category, bool $template = false): mixed
    {
        $a = new DataAccess(); $c = $a->category($category);
        abort_unless($template ? $a->can($user, 'create', $c) && $a->can($user, 'view', $c, false) : $a->can($user, 'export', $c), 403, '当前没有导出权限。');
        $fields = DataSupport::decode($c->fields); $rows = [['编号', '名称', ...array_column($fields, 'label')]];
        if (!$template) foreach (DB::table('jn_data_records')->where('category_id', $category)->where('archived', false)->whereNotNull('published_version_id')->orderBy('id')->cursor() as $r) {
            if (!$a->can($user, 'export', $r)) continue; $v = $a->version($r->published_version_id); if (!$a->canVersion($user, $r, $v)) continue; $values = DataSupport::decode($v->values);
            $rows[] = [$r->code, $v->title, ...array_map(fn ($f) => $values[$f['key']] ?? '', $fields)];
        }
        $this->support->event($user, 'category', $category, $template ? '下载台账模板' : '导出已发布台账', ['rows' => count($rows) - 1]);
        return response()->streamDownload(function () use ($rows) { $h = fopen('php://output', 'w'); fwrite($h, "\xEF\xBB\xBF"); foreach ($rows as $row) fputcsv($h, array_map(function ($v) { if (is_bool($v)) return $v ? '是' : '否'; $s = (string) $v; return preg_match('/^[\s]*[=+@\-]/u', $s) ? "'" . $s : $s; }, $row), ',', '"', ''); fclose($h); }, ($template ? '台账模板' : '已发布台账') . '.csv', ['Content-Type' => 'text/csv; charset=UTF-8', 'Cache-Control' => 'private, no-store']);
    }
}
