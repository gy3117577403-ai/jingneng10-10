<?php

namespace App\Services\CompanyData;

use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\{DB, Storage};
use Symfony\Component\Process\Process;

class DataFiles
{
    public function __construct(private DataSupport $support, private DataRecords $records) {}
    public function upload(User $user, string $key, int $id, array $p, UploadedFile $file): array
    {
        validator(['file' => $file], ['file' => 'required|file|max:20480'])->validate();
        $ext = strtolower($file->getClientOriginalExtension());
        abort_unless(in_array($ext, ['pdf', 'png', 'jpg', 'jpeg', 'txt', 'csv', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'dwg', 'dxf', 'step', 'stp', 'zip'], true), 422, '暂不支持此文件格式。');
        $mime = $file->getMimeType();
        $expectedMime = ['pdf' => 'application/pdf', 'png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg'];
        abort_if(isset($expectedMime[$ext]) && $mime !== $expectedMime[$ext], 422, '文件内容与扩展名不一致。');
        $p['sha256'] = hash_file('sha256', $file->getRealPath()); $p['filename'] = mb_substr(basename(str_replace('\\', '/', $file->getClientOriginalName())), 0, 200);
        abort_if(preg_match('/[\x00-\x1F\x7F]/', $p['filename']), 422, '文件名含无效控制字符。');
        $result = $this->support->mutate($user, $key, "file:$id", $p, fn (DataAccess $a) => abort_unless($a->can($user, 'edit', $a->record($id)), 403), function (DataAccess $a) use ($user, $id, $p, $file, $ext, $mime) {
            $r = $a->record($id); DataSupport::revision($r, $p['revision'] ?? 0); abort_if($r->archived, 422, '资料已归档。');
            $v = $a->version($r->draft_version_id ?? $r->published_version_id); abort_if($v->state === 'pending', 422, '请先撤回审核再上传附件。');
            $ids = DataSupport::decode($v->file_ids); abort_if(count($ids) >= 20, 422, '每个版本最多关联20份附件。');
            abort_if(DB::table('jn_data_files')->whereIn('id', $ids)->where('sha256', $p['sha256'])->exists(), 422, '当前版本已经包含相同内容的附件。');
            $path = $file->store('company-data/originals', 'local'); abort_unless($path, 503, '文件存储暂不可用，未保存此次上传。'); $this->support->stored($path);
            $fid = DB::table('jn_data_files')->insertGetId(['record_id' => $id, 'uploaded_by' => $user->id, 'filename' => $p['filename'], 'extension' => $ext, 'mime' => $mime,
                'path' => $path, 'size' => $file->getSize(), 'sha256' => $p['sha256'], 'created_at' => now()]);
            $this->records->newVersion($user, $r, ['title' => $v->title, 'values' => DataSupport::decode($v->values), 'note' => '上传附件：' . $p['filename']], [...$ids, $fid]);
            return ['id' => $id, 'file_id' => $fid];
        });
        app(DataDocuments::class)->enqueue($result['file_id']);
        return $result;
    }
    public function serve(User $user, int $id, int $version, int $fid, bool $download, int $page = 1, int $row = 1): mixed
    {
        $a = new DataAccess(); $r = $a->record($id); $v = $a->version($version);
        abort_unless($a->canVersion($user, $r, $v) && (!$download || $a->can($user, 'download', $r)), 403, '当前没有此文件操作权限。');
        abort_unless(in_array($fid, DataSupport::decode($v->file_ids), true), 404);
        $file = DB::table('jn_data_files')->where('id', $fid)->where('record_id', $id)->firstOrFail(); $path = Storage::disk('local')->path($file->path);
        abort_unless(is_file($path), 404, '文件暂不可用，请联系管理员核对备份。');
        $headers = ['Cache-Control' => 'private, no-store, max-age=0', 'X-Content-Type-Options' => 'nosniff', 'Content-Security-Policy' => "default-src 'none'; sandbox"];
        if ($download) { $this->support->event($user, 'record', $id, '下载原件', ['file_id' => $fid], $version); return response()->download($path, $file->filename, $headers); }
        $document = DB::table('jn_data_documents')->where('file_id', $fid)->first();
        if (in_array($file->extension, ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'], true)) {
            if (!$document || !in_array($document->state, ['ready', 'partial', 'no_text'], true)) return response()->json(['type' => 'processing', ...app(DataDocuments::class)->status($fid)], 200, $headers);
            abort_unless($document->preview_path && hash_equals($file->sha256, $document->source_hash), 422, '预览与原件不匹配，请联系维护人员。');
            $path = Storage::disk('local')->path($document->preview_path);
            abort_unless(is_file($path), 422, '预览文件缺失，请联系维护人员核对备份。');
            if ($document->preview_type === 'sheet') {
                $book = DataSupport::decode(file_get_contents($path)); abort_unless($page > 0 && isset($book['sheets'][$page - 1]), 422, '工作表不存在。'); $sheet = $book['sheets'][$page - 1];
                $start = (int) floor((max(1, $row) - 1) / 50) * 50; $total = count($sheet['rows']); abort_unless($start < max(1, $total), 422, '行号超出工作表范围。');
                return response()->json(['type' => 'sheet', 'sheets' => array_column($book['sheets'], 'name'), 'page' => $page, 'name' => $sheet['name'], 'columns' => $sheet['columns'], 'rows' => array_slice($sheet['rows'], $start, 50), 'start' => $start + 1, 'total' => $total, 'message' => $document->message], 200, $headers);
            }
        }
        if (in_array($file->extension, ['txt', 'csv'], true)) {
            $content = file_get_contents($path, false, null, 0, 2000000); $content = mb_strcut($content, 0, 2000000, 'UTF-8');
            abort_unless(mb_check_encoding($content, 'UTF-8'), 422, '当前仅支持 UTF-8 文本预览，请转换编码后重新上传。');
            $lines = preg_split('/\r\n|\r|\n/', $content); $start = (int) floor((max(1, $row) - 1) / 200) * 200;
            abort_unless($start < count($lines), 422, '行号超出阅读范围。');
            return response()->json(['type' => 'text', 'text' => implode("\n", array_slice($lines, $start, 200)), 'start' => $start + 1, 'total' => count($lines), 'truncated' => $file->size > 2000000], 200, $headers);
        }
        if ($file->extension === 'pdf' || $document?->preview_type === 'pdf') {
            $info = new Process(['pdfinfo', $path]); $info->setTimeout(10); $info->run();
            abort_unless($info->isSuccessful() && preg_match('/Pages:\s+(\d+)/', $info->getOutput(), $m), 422, '此 PDF 暂时无法预览，可能已加密或损坏。');
            $pages = (int) $m[1]; abort_unless($page >= 1 && $page <= min($pages, 200), 422, '页码超出预览范围，最多预览200页。');
            $prefix = Storage::disk('local')->path('company-data/previews/' . $file->sha256 . '-' . ($document?->preview_path ? hash('sha256', $document->preview_path) : 'original') . '-' . $page);
            if (!is_file($prefix . '.png')) {
                Storage::disk('local')->makeDirectory('company-data/previews');
                $temp = $prefix . '-' . bin2hex(random_bytes(6));
                $proc = new Process(['pdftoppm', '-f', (string) $page, '-l', (string) $page, '-scale-to', '1600', '-singlefile', '-png', $path, $temp]); $proc->setTimeout(20);
                try { $proc->mustRun(); abort_unless(is_file($temp . '.png'), 422, '此页暂时无法预览。'); rename($temp . '.png', $prefix . '.png'); }
                finally { if (is_file($temp . '.png')) unlink($temp . '.png'); }
            }
            return response()->file($prefix . '.png', [...$headers, 'Content-Type' => 'image/png', 'X-Preview-Pages' => (string) $pages]);
        }
        if (in_array($file->extension, ['jpg', 'jpeg', 'png'], true)) {
            $size = @getimagesize($path); abort_unless($size && $size[0] * $size[1] <= 25000000, 422, '图片尺寸超出预览限制。');
            $source = @imagecreatefromstring(file_get_contents($path)); abort_unless($source, 422, '图片内容无法解析。');
            $scale = min(1, 1600 / max($size[0], $size[1])); $w = max(1, (int) ($size[0] * $scale)); $h = max(1, (int) ($size[1] * $scale));
            $preview = imagecreatetruecolor($w, $h); imagefill($preview, 0, 0, imagecolorallocate($preview, 255, 255, 255)); imagecopyresampled($preview, $source, 0, 0, 0, 0, $w, $h, $size[0], $size[1]);
            ob_start(); imagepng($preview); $bytes = ob_get_clean(); imagedestroy($source); imagedestroy($preview);
            return response($bytes, 200, [...$headers, 'Content-Type' => 'image/png', 'X-Preview-Pages' => '1']);
        }
        return response()->json(['type' => 'unsupported', 'message' => '该格式已保存原件，暂不支持在线阅读；有下载权限的人员可使用本机软件打开。'], 200, $headers);
    }
}
