<?php
namespace App\Services\CompanyData;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class DataSearch
{
    public function search(User $user, array $params): array
    {
        return DB::transaction(function () use ($user, $params) {
            // All policy and publication writes use this same lock. Check before emitting any snippet.
            DB::table('jn_data_state')->where('id', 1)->lockForUpdate()->firstOrFail(); $user->refresh();
            abort_unless(DataSupport::active($user), 403);
            $q = trim($params['q'] ?? ''); $history = (bool) ($params['history'] ?? false); $page = max(1, (int) ($params['page'] ?? 1));
            $result = $q === '' ? ['items' => [], 'limited' => false, 'incomplete_files' => 0] : $this->retrieve($user, [$q], $history, (int) ($params['category'] ?? 0));
            $total = count($result['items']); $pages = max(1, (int) ceil($total / 20)); $page = min($page, $pages);
            return [...$result, 'items' => array_map(function ($s) { unset($s['body']); return $s; }, array_slice($result['items'], ($page - 1) * 20, 20)), 'total' => $total, 'page' => $page, 'pages' => $pages];
        });
    }
    /** Internal retrieval contract shared with the assistant; caller must recheck before delivery. */
    public function retrieve(User $user, array $terms, bool $history = false, int $category = 0, int $limit = 200): array
    {
        $a = new DataAccess(); $items = []; $incomplete = []; $terms = array_values(array_filter(array_map(fn ($q) => mb_strtolower(trim($q)), $terms)));
        if (!$terms || !DataSupport::active($user)) return ['items' => [], 'limited' => false, 'incomplete_files' => 0];
        foreach (DB::table('jn_data_records')->where('archived', false)->when($category, fn ($q) => $q->where('category_id', $category))->orderByDesc('updated_at')->orderByDesc('id')->cursor() as $r) {
            $versions = $history ? DB::table('jn_data_versions')->where('record_id', $r->id)->whereNotNull('published_at')->orderByDesc('number')->get() : ($r->published_version_id ? [$a->version($r->published_version_id)] : []);
            foreach ($versions as $v) {
                if (!$a->canVersion($user, $r, $v)) continue;
                $base = ['record_id' => (int) $r->id, 'version_id' => (int) $v->id, 'version' => (int) $v->number, 'title' => $v->title, 'code' => $r->code, 'category' => $a->category($r->category_id)->name,
                    'historical' => (int) $v->id !== (int) $r->published_version_id, 'published_at' => $v->published_at];
                $values = DataSupport::decode($v->values); $lines = [$r->code, $v->title];
                foreach (DataSupport::decode($v->fields) as $f) { $value = $values[$f['key']] ?? ''; $lines[] = $f['label'] . '：' . (is_bool($value) ? ($value ? '是' : '否') : (string) $value); }
                $body = implode("\n", $lines);
                if ($this->matches($body, $terms)) $items[] = [...$base, 'file_id' => null, 'chunk_id' => null, 'filename' => null, 'page' => 1, 'row' => 1, 'location' => '台账字段', 'body' => $body, 'snippet' => $this->snippet($body, $terms)];
                foreach (DB::table('jn_data_files')->whereIn('id', DataSupport::decode($v->file_ids))->where('record_id', $r->id)->orderBy('id')->get() as $file) {
                    $d = DB::table('jn_data_documents')->where('file_id', $file->id)->first();
                    if (!$d || $d->state !== 'ready') $incomplete[$file->id] = true;
                    if (!$d || !in_array($d->state, ['ready', 'partial'], true) || !hash_equals($file->sha256, $d->source_hash)) continue;
                    $query = DB::table('jn_data_chunks')->where('file_id', $file->id)->where(function ($builder) use ($terms) {
                        foreach ($terms as $term) $builder->orWhereRaw("LOWER(body) LIKE ? ESCAPE '!'", ['%' . str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $term) . '%']);
                    })->orderBy('position')->limit($limit + 1);
                    foreach ($query->get() as $chunk) $items[] = [...$base, 'file_id' => (int) $file->id, 'chunk_id' => (int) $chunk->id, 'filename' => $file->filename, 'page' => (int) $chunk->page, 'row' => (int) $chunk->row, 'location' => $chunk->location,
                        'body' => $chunk->body, 'snippet' => $this->snippet($chunk->body, $terms), 'reading_state' => $d->state];
                }
                if (count($items) >= $limit) return ['items' => array_slice($items, 0, $limit), 'limited' => true, 'incomplete_files' => count($incomplete)];
            }
        }
        return ['items' => $items, 'limited' => false, 'incomplete_files' => count($incomplete)];
    }
    private function matches(string $text, array $terms): bool { foreach ($terms as $q) if (mb_stripos($text, $q) !== false) return true; return false; }
    private function snippet(string $text, array $terms): string
    {
        $positions = []; foreach ($terms as $q) { $pos = mb_stripos($text, $q); if ($pos !== false) $positions[] = $pos; }
        $start = max(0, ($positions ? min($positions) : 0) - 65); $length = 280;
        return ($start ? '…' : '') . mb_substr($text, $start, $length) . (mb_strlen($text) > $start + $length ? '…' : '');
    }
}
