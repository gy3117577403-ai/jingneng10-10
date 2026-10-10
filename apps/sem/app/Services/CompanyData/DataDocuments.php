<?php
namespace App\Services\CompanyData;

use App\Jobs\ProcessCompanyDocument;
use App\Models\User;
use Illuminate\Support\Facades\{DB, Http, Storage};
use Illuminate\Support\Str;
use PhpOffice\PhpSpreadsheet\{IOFactory, RichText\RichText, Style\NumberFormat};
use Symfony\Component\Process\Process;

/** Private, reproducible derivatives. File bytes and version associations never change. */
class DataDocuments
{
    public const LABELS = ['queued' => '等待处理', 'processing' => '正在处理', 'ready' => '正文可检索', 'partial' => '部分正文可检索', 'no_text' => '尚未识别正文', 'unsupported' => '暂不支持正文识别', 'failed' => '处理失败'];
    public function enqueue(int $fileId): void
    {
        $file = DB::table('jn_data_files')->find($fileId); if (!$file) return;
        $created = DB::table('jn_data_documents')->insertOrIgnore(['file_id' => $fileId, 'source_hash' => $file->sha256, 'created_at' => now(), 'updated_at' => now()]);
        // The durable queued row is the outbox; the scheduler recovers a lost dispatch.
        if ($created) try { ProcessCompanyDocument::dispatch($fileId)->afterCommit(); } catch (\Throwable) {}
    }
    public function recover(): int
    {
        $count = 0;
        foreach (DB::table('jn_data_files')->whereNotIn('id', DB::table('jn_data_documents')->select('file_id'))->orderBy('id')->limit(100)->pluck('id') as $id) { $this->enqueue($id); $count++; }
        $stale = DB::table('jn_data_documents')->whereIn('state', ['queued', 'processing'])->where('updated_at', '<', now()->subMinutes(4))->get();
        foreach ($stale as $d) {
            $state = $d->attempts >= 3 ? 'failed' : 'queued';
            $updated = DB::table('jn_data_documents')->where('id', $d->id)->where('updated_at', $d->updated_at)->where('state', $d->state)->update(['state' => $state, 'lease' => null, 'updated_at' => now(), 'message' => $state === 'failed' ? '处理多次中断，请检查文件后重试。' : '正在重新安排处理。']);
            if ($updated && $state === 'queued') { ProcessCompanyDocument::dispatch($d->file_id); $count++; }
        }
        return $count;
    }
    public function status(int $fileId): array
    {
        $d = DB::table('jn_data_documents')->where('file_id', $fileId)->first();
        return ['state' => $d->state ?? 'queued', 'label' => self::LABELS[$d->state ?? 'queued'], 'message' => $d->message ?? '正在等待正文处理。',
            'pages' => (int) ($d->pages ?? 0), 'empty_pages' => (int) ($d->empty_pages ?? 0), 'chunks' => (int) ($d->chunks ?? 0), 'updated_at' => $d->updated_at ?? null];
    }
    public function retry(User $user, string $key, int $recordId, int $versionId, int $fileId): array
    {
        return app(DataSupport::class)->mutate($user, $key, "document-retry:$recordId:$versionId:$fileId", [], function (DataAccess $a) use ($user, $recordId, $versionId, $fileId) {
            $r = $a->record($recordId); $v = $a->version($versionId);
            abort_unless($a->canVersion($user, $r, $v) && $a->can($user, 'edit', $r), 403, '需要该资料的查看和编辑权限。');
            abort_unless(in_array($fileId, DataSupport::decode($v->file_ids), true), 404);
        }, function () use ($user, $recordId, $versionId, $fileId) {
            $d = DB::table('jn_data_documents')->where('file_id', $fileId)->first();
            abort_unless(!$d || $d->state === 'failed', 409, '文件正在处理或已完成，不需要重复提交。');
            if (!$d) $this->enqueue($fileId);
            else {
                DB::table('jn_data_documents')->where('id', $d->id)->update(['state' => 'queued', 'attempts' => 0, 'lease' => null, 'message' => '已重新安排处理。', 'updated_at' => now()]);
                ProcessCompanyDocument::dispatch($fileId)->afterCommit();
            }
            app(DataSupport::class)->event($user, 'record', $recordId, '重新处理附件正文', ['file_id' => $fileId], $versionId);
            return ['file_id' => $fileId];
        });
    }
    public function process(int $fileId): void
    {
        $lease = (string) Str::uuid();
        if (!DB::table('jn_data_documents')->where('file_id', $fileId)->where('state', 'queued')->update(['state' => 'processing', 'lease' => $lease, 'attempts' => DB::raw('attempts + 1'), 'message' => '正在准备预览与正文。', 'updated_at' => now()])) return;
        $disk = Storage::disk('local'); $prefix = 'company-data/derived/' . $fileId . '/' . $lease; $disk->makeDirectory($prefix);
        try {
            $file = DB::table('jn_data_files')->find($fileId); $path = $disk->path($file->path);
            $this->ensure(is_file($path) && hash_equals($file->sha256, hash_file('sha256', $path)), '原件缺失或校验不一致，请恢复原件后重试。');
            $result = $this->extract($file, $path, $prefix);
            $saved = DB::transaction(function () use ($fileId, $lease, $result) {
                $d = DB::table('jn_data_documents')->where('file_id', $fileId)->lockForUpdate()->first();
                if ($d->lease !== $lease || $d->state !== 'processing') return false;
                DB::table('jn_data_chunks')->where('file_id', $fileId)->delete();
                foreach (array_chunk($result['items'], 50) as $batch) DB::table('jn_data_chunks')->insert(array_map(fn ($c) => ['file_id' => $fileId, ...$c], $batch));
                unset($result['items']);
                DB::table('jn_data_documents')->where('id', $d->id)->update([...$result, 'lease' => null, 'updated_at' => now()]);
                return true;
            });
            if (!$saved) $disk->deleteDirectory($prefix);
        } catch (\Throwable $e) {
            $disk->deleteDirectory($prefix);
            $message = $e instanceof DocumentReadException ? $e->getMessage() : '未能完成处理。文件可能损坏、加密，或预览服务暂不可用；请检查后重试。';
            DB::table('jn_data_documents')->where('file_id', $fileId)->where('lease', $lease)->update(['state' => 'failed', 'lease' => null, 'message' => $message, 'updated_at' => now()]);
        }
    }
    private function ensure(bool $condition, string $message): void { if (!$condition) throw new DocumentReadException($message); }
    private function zipGuard(string $path): void
    {
        $zip = new \ZipArchive(); $this->ensure($zip->open($path) === true, '文件无法打开，请确认是有效的 Office 文件。');
        try {
            $this->ensure($zip->numFiles <= 2000, '文件内容过于复杂，请拆分后重新上传。'); $size = 0;
            for ($i = 0; $i < $zip->numFiles; $i++) $size += $zip->statIndex($i)['size'];
            $this->ensure($size <= 50000000, '文件展开后过大，请拆分后重新上传。');
        } finally { $zip->close(); }
    }
    private function extract(object $file, string $path, string $prefix): array
    {
        $disk = Storage::disk('local'); $items = []; $pages = 0; $empty = 0; $partial = false; $preview = null; $type = null;
        if (in_array($file->extension, ['xlsx', 'docx', 'pptx'], true)) $this->zipGuard($path);
        if (in_array($file->extension, ['xls', 'xlsx'], true)) return $this->spreadsheet($file, $path, $prefix);
        if (in_array($file->extension, ['doc', 'docx', 'ppt', 'pptx'], true)) {
            $preview = "$prefix/preview.pdf"; $converted = $disk->path($preview); $stream = fopen($path, 'rb');
            try {
                $response = Http::connectTimeout(5)->timeout(75)->withOptions(['sink' => $converted, 'progress' => function ($total, $downloaded) { $this->ensure($total <= 50000000 && $downloaded <= 50000000, '预览文件过大，请拆分原文件。'); }])
                    ->attach('files', $stream, 'document.' . $file->extension)->post(rtrim(config('company_data.converter_url'), '/') . '/forms/libreoffice/convert');
                $this->ensure($response->successful() && is_file($converted) && str_starts_with(file_get_contents($converted, false, null, 0, 5), '%PDF-'), '预览转换失败，请确认文件未加密且内容完整，再重新处理。');
            } finally { fclose($stream); }
            $path = $converted; $type = 'pdf';
        }
        if ($file->extension === 'pdf' || $type === 'pdf') {
            $type = 'pdf'; $proc = new Process(['pdfinfo', $path]); $proc->setTimeout(10); $proc->run();
            $this->ensure($proc->isSuccessful() && (bool) preg_match('/Pages:\s+(\d+)/', $proc->getOutput(), $m), '无法读取页码，请检查文件是否加密或损坏。');
            $pages = (int) $m[1]; $partial = $pages > 200; $textPath = $disk->path("$prefix/text.txt");
            $proc = new Process(['pdftotext', '-layout', '-enc', 'UTF-8', '-f', '1', '-l', (string) min($pages, 200), $path, $textPath]); $proc->setTimeout(25); $proc->run();
            $this->ensure($proc->isSuccessful() && is_file($textPath), '无法提取正文，请检查文件后重试。');
            $partial = $partial || filesize($textPath) > 8000000; $raw = file_get_contents($textPath, false, null, 0, 8000000); $raw = mb_strcut($raw, 0, 8000000, 'UTF-8');
            foreach (array_slice(explode("\f", $raw), 0, min($pages, 200)) as $i => $text) {
                if (trim($text) === '') { $empty++; continue; }
                $this->chunks($items, $text, $i + 1, '第' . ($i + 1) . '页');
            }
            $disk->delete("$prefix/text.txt");
        } elseif (in_array($file->extension, ['txt', 'csv'], true)) {
            $type = 'text'; $pages = 1; $partial = $file->size > 2000000; $raw = file_get_contents($path, false, null, 0, 2000000);
            $raw = mb_strcut($raw, 0, 2000000, 'UTF-8'); $this->ensure(mb_check_encoding($raw, 'UTF-8'), '正文需要使用 UTF-8 编码，请转换后重新上传。');
            $lines = preg_split('/\r\n|\r|\n/', $raw);
            foreach (array_chunk($lines, 30) as $i => $lineset) $this->chunks($items, implode("\n", $lineset), 1, '第' . ($i * 30 + 1) . '—' . ($i * 30 + count($lineset)) . '行', $i * 30 + 1);
        } else {
            $image = in_array($file->extension, ['png', 'jpg', 'jpeg'], true);
            return ['state' => $image ? 'no_text' : 'unsupported', 'preview_path' => null, 'preview_type' => null, 'pages' => $image ? 1 : 0, 'empty_pages' => $image ? 1 : 0, 'chunks' => 0, 'items' => [],
                'message' => $image ? '图片尚未识别正文，可查看原图；当前搜索不包含图片中的文字。' : '原件已保存，当前不支持此格式的正文识别。'];
        }
        $state = !$items ? 'no_text' : (($partial || $empty > 0) ? 'partial' : 'ready');
        return ['state' => $state, 'preview_path' => $preview, 'preview_type' => $type, 'pages' => $pages, 'empty_pages' => $empty, 'chunks' => count($items), 'items' => $items,
            'message' => !$items ? '尚未识别正文，可能是扫描件；当前只能通过名称和台账字段查找。' : ($partial ? '文件超过单次处理范围，仅部分正文可检索；请拆分文件以完整处理。' : ($empty ? "有{$empty}页未提取到文字，可能为空白页或扫描页；请结合原文核对。" : '已准备阅读预览和正文检索。'))];
    }
    private function chunks(array &$items, string $text, int $page, string $location, int $row = 1): void
    {
        $text = trim(str_replace("\0", '', $text)); if ($text === '') return;
        // Overlap preserves matches across chunk boundaries; each location remains stable.
        for ($start = 0, $length = mb_strlen($text); $start < $length; $start += 3800) {
            $items[] = ['position' => count($items) + 1, 'page' => $page, 'row' => $row, 'location' => $location, 'body' => mb_substr($text, $start, 4000)];
            $this->ensure(count($items) <= 10000, '正文过多，请拆分文件后重新上传。');
            if ($start + 4000 >= $length) break;
        }
    }
    private function spreadsheet(object $file, string $path, string $prefix): array
    {
        $reader = IOFactory::createReader($file->extension === 'xls' ? 'Xls' : 'Xlsx'); $info = $reader->listWorksheetInfo($path);
        $this->ensure(count($info) <= 10, '每份表格最多预览10个工作表，请拆分后重新上传。'); $cells = 0;
        foreach ($info as $s) { $cells += $s['totalRows'] * $s['totalColumns']; $this->ensure($s['totalRows'] <= 2000 && $s['totalColumns'] <= 50 && $cells <= 100000, '表格超过阅读范围（每表2000行、50列，总计10万个单元格），请拆分后上传。'); }
        $book = $reader->load($path); $sheets = []; $items = []; $formulas = false; $textSize = 0;
        try {
            foreach ($book->getWorksheetIterator() as $index => $sheet) {
                $rows = []; $cols = $info[$index]['totalColumns'];
                for ($row = 1; $row <= $info[$index]['totalRows']; $row++) {
                    $values = []; $text = [];
                    for ($col = 1; $col <= $cols; $col++) {
                        $cell = $sheet->getCell([$col, $row]); $value = $cell->getValue();
                        if ($cell->getDataType() === 'f') { $formulas = true; $value = $cell->getOldCalculatedValue(); if ($value === null) $value = '〔公式未保存结果〕'; }
                        if ($value instanceof RichText) $value = $value->getPlainText();
                        if (is_bool($value)) $value = $value ? '是' : '否';
                        elseif (is_numeric($value)) $value = NumberFormat::toFormattedString($value, $cell->getStyle()->getNumberFormat()->getFormatCode());
                        $value = (string) ($value ?? ''); $textSize += mb_strlen($value);
                        $this->ensure(mb_strlen($value) <= 5000 && $textSize <= 2000000, '单元格或正文内容过长，请拆分表格后上传。');
                        $values[] = $value; if ($value !== '') $text[] = $cell->getCoordinate() . '：' . $value;
                    }
                    $rows[] = $values; $this->chunks($items, implode('　', $text), $index + 1, $sheet->getTitle() . ' · 第' . $row . '行', $row);
                }
                $sheets[] = ['name' => $sheet->getTitle(), 'columns' => $cols, 'rows' => $rows];
            }
        } finally { $book->disconnectWorksheets(); }
        $preview = "$prefix/sheets.json"; Storage::disk('local')->put($preview, DataSupport::json(['sheets' => $sheets, 'formulas' => $formulas]));
        return ['state' => $items ? 'ready' : 'no_text', 'preview_path' => $preview, 'preview_type' => 'sheet', 'pages' => count($sheets), 'empty_pages' => 0, 'chunks' => count($items), 'items' => $items,
            'message' => $formulas ? '已按工作表建立阅读内容。公式仅展示文件中已保存的结果，不在系统内重新计算；未缓存结果会明确标注。' : '已按工作表与单元格建立阅读内容。'];
    }
}

class DocumentReadException extends \RuntimeException {}
