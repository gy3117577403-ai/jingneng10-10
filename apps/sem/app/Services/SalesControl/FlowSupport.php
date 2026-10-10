<?php

namespace App\Services\SalesControl;

use App\Models\User;
use App\Models\Workflow\{Quotes, Orders};
use Illuminate\Support\Facades\{DB, Storage};

class FlowSupport
{
    public static function json(mixed $data): string { return json_encode($data, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR); }
    public static function decode(string $data): array { return json_decode($data, true, 512, JSON_THROW_ON_ERROR); }
    public static function hash(array $data): string { return hash('sha256', self::json($data)); }
    public static function can(User $user, string $permission): bool
    {
        return !$user->trashed() && !($user->banned_until && now()->lessThan($user->banned_until)) && ($user->hasRole('Admin') || $user->can($permission));
    }
    public static function owns(User $user, object $row): bool { return $user->hasRole('Admin') || (int) $row->user_id === (int) $user->id; }

    public function mutate(string $scope, int $id, User $user, string $key, array $input, callable $authorize, callable $callback): array
    {
        validator(['key' => $key], ['key' => 'required|uuid'], ['key.uuid' => '请求标识无效，请刷新后重试。'])->validate();
        return DB::transaction(function () use ($scope, $id, $user, $key, $input, $authorize, $callback) {
            $model = $scope === 'quote' ? Quotes::class : Orders::class;
            $record = $model::whereKey($id)->lockForUpdate()->firstOrFail();
            $authorize($record); // Recheck current access before replaying a receipt.
            $hash = self::hash([$user->id, $input]);
            $receipts = DB::table('jn_sales_receipts')->where('scope', $scope)->where('entity_id', $id)->where('request_key', $key);
            if ($receipt = $receipts->first()) {
                abort_unless(hash_equals($receipt->fingerprint, $hash), 409, '请求内容已变化，请重新提交。');
                return self::decode($receipt->response);
            }
            $result = $callback($record);
            DB::table('jn_sales_receipts')->insert(['scope' => $scope, 'entity_id' => $id, 'request_key' => $key,
                'actor_id' => $user->id, 'fingerprint' => $hash, 'response' => self::json($result), 'created_at' => now()]);
            return $result;
        });
    }

    public function event(string $scope, int $id, User $user, string $label, array $detail): void
    {
        DB::table('jn_sales_events')->insert(['scope' => $scope, 'entity_id' => $id, 'actor_id' => $user->id,
            'label' => $label, 'detail' => self::json($detail), 'created_at' => now()]);
    }
    public function events(string $scope, int $id): array
    {
        return DB::table('jn_sales_events as e')->leftJoin('users as u', 'u.id', '=', 'e.actor_id')
            ->where('e.scope', $scope)->where('e.entity_id', $id)->orderByDesc('e.id')->limit(100)
            ->get(['e.id', 'e.label', 'e.detail', 'e.created_at', 'u.name as actor'])->map(fn ($e) => [...(array) $e, 'detail' => self::decode($e->detail)])->all();
    }
    public function users(string $permission): array
    {
        return User::where(fn ($q) => $q->whereHas('roles', fn ($r) => $r->where('name', 'Admin'))
            ->orWhereHas('permissions', fn ($p) => $p->where('name', $permission))
            ->orWhereHas('roles.permissions', fn ($p) => $p->where('name', $permission)))
            ->where(fn ($q) => $q->whereNull('banned_until')->orWhere('banned_until', '<=', now()))
            ->orderBy('name')->get(['id', 'name'])->toArray();
    }
    public function file(object $version): void
    {
        $path = Storage::disk('local')->path($version->path);
        abort_unless(is_file($path) && hash_equals($version->sha256, hash_file('sha256', $path)), 409, '资料原件校验未通过，请联系负责人。');
    }
    public function download(string $path, string $hash, string $name, string $type)
    {
        $this->file((object) ['path' => $path, 'sha256' => $hash]);
        return Storage::disk('local')->download($path, $name, ['Content-Type' => $type, 'Cache-Control' => 'private, no-store', 'X-Content-Type-Options' => 'nosniff']);
    }
}
