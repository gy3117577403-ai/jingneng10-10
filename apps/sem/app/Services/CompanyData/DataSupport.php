<?php

namespace App\Services\CompanyData;

use App\Models\User;
use Illuminate\Support\Facades\{DB, Storage};

class DataSupport
{
    private array $createdFiles = [];
    public static function json(mixed $value): string { return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR); }
    public static function decode(?string $value): array { return $value === null ? [] : json_decode($value, true, 64, JSON_THROW_ON_ERROR); }
    public static function active(User $user): bool { return !$user->trashed() && !($user->banned_until && now()->lt($user->banned_until)); }
    public static function manager(User $user): bool { return self::active($user) && ($user->hasRole('Admin') || $user->can('管理资料中心')); }
    public static function revision(object $row, mixed $revision): void { abort_unless((int) $row->revision === (int) $revision, 409, '内容已被更新，请重新读取后再提交。填写内容已保留。'); }
    public static function user(int $id): User { $user = User::find($id); abort_unless($user && self::active($user), 422, '所选人员当前不可用。'); return $user; }
    public static function users(): array { return User::where(fn ($q) => $q->whereNull('banned_until')->orWhere('banned_until', '<=', now()))->orderBy('name')->get(['id', 'name'])->toArray(); }

    /** Module mutations share a short transaction lock so policy changes cannot race writes. */
    public function mutate(User $user, string $key, string $operation, array $input, callable $authorize, callable $write): array
    {
        validator(['key' => $key], ['key' => 'required|uuid'], ['key.uuid' => '请求标识无效，请重新打开操作窗口。'])->validate();
        $this->createdFiles = [];
        try {
            return DB::transaction(function () use ($user, $key, $operation, $input, $authorize, $write) {
                DB::table('jn_data_state')->where('id', 1)->lockForUpdate()->firstOrFail();
                $user->refresh();
                abort_unless(self::active($user), 403, '当前账号不可使用资料中心。');
                $access = new DataAccess(); $authorize($access);
                $hash = hash('sha256', self::json([$operation, $input]));
                if ($receipt = DB::table('jn_data_receipts')->where('actor_id', $user->id)->where('request_key', $key)->first()) {
                    abort_unless(hash_equals($hash, $receipt->fingerprint), 409, '同一次请求的内容发生变化，请重新提交。');
                    return self::decode($receipt->response);
                }
                $result = $write($access);
                DB::table('jn_data_receipts')->insert(['actor_id' => $user->id, 'request_key' => $key, 'fingerprint' => $hash, 'response' => self::json($result), 'created_at' => now()]);
                DB::table('jn_data_state')->where('id', 1)->increment('revision');
                return $result;
            });
        } catch (\Throwable $e) {
            foreach ($this->createdFiles as $path) Storage::disk('local')->delete($path);
            throw $e;
        } finally { $this->createdFiles = []; }
    }
    public function stored(string $path): void { $this->createdFiles[] = $path; }
    public function event(User $user, string $scope, int $id, string $label, array $detail = [], ?int $version = null): void
    {
        DB::table('jn_data_events')->insert(['scope_type' => $scope, 'scope_id' => $id, 'actor_id' => $user->id, 'version_id' => $version, 'label' => $label, 'detail' => self::json($detail), 'created_at' => now()]);
    }
}
