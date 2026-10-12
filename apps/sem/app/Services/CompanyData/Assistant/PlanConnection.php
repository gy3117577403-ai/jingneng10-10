<?php
namespace App\Services\CompanyData\Assistant;

use App\Models\User;
use App\Services\CompanyData\{DataSupport};
use Illuminate\Http\Request;
use Illuminate\Support\Facades\{Cache, DB};

/** Only the explicitly bound local user may use this personal connection. */
class PlanConnection
{
    public function binding(): array
    {
        $directory = config('company_data.plan_bridge_directory');
        if (!$directory || !is_file($directory . '/binding.json') || !is_file($directory . '/bridge.key')) return [];
        $binding = json_decode(file_get_contents($directory . '/binding.json'), true);
        $key = trim(file_get_contents($directory . '/bridge.key'));
        if (!is_array($binding) || !is_int($binding['owner_id'] ?? null) || $binding['owner_id'] < 1 || !preg_match('/^[a-f0-9]{64}$/D', $key)) return [];
        return ['owner_id' => $binding['owner_id'], 'key' => $key];
    }
    public function authenticate(Request $request): int
    {
        $binding = $this->binding();
        $stamp = $request->header('X-JN-Time', ''); $nonce = $request->header('X-JN-Nonce', '');
        abort_unless($binding && ctype_digit($stamp) && abs(time() - (int) $stamp) <= 30 && preg_match('/^[a-f0-9]{32}$/D', $nonce), 403);
        $message = $stamp . "\n" . $nonce . "\n" . $request->method() . "\n/" . $request->path() . "\n" . hash('sha256', $request->getContent());
        abort_unless(hash_equals(hash_hmac('sha256', $message, $binding['key']), $request->header('X-JN-Signature', '')), 403);
        abort_unless(Cache::add('jn-plan-nonce:' . $nonce, true, 70), 409);
        $user = User::find($binding['owner_id']);
        abort_unless($user && DataSupport::active($user), 403);
        return $binding['owner_id'];
    }
    public function status(User $user): ?array
    {
        if (($this->binding()['owner_id'] ?? null) !== (int) $user->id) return null;
        $row = DB::table('jn_data_plan_connections')->where('owner_id', $user->id)->first();
        $meta = $row ? DataSupport::decode($row->metadata) : [];
        $fresh = $row && $row->heartbeat_at && now()->diffInSeconds($row->heartbeat_at, true) < 35;
        $state = $fresh ? $row->status : 'offline';
        if ($row && in_array($row->desired, ['paused', 'disconnect', 'checking'])) $state = ['paused' => 'paused', 'disconnect' => 'disconnecting', 'checking' => 'checking'][$row->desired];
        return ['status' => $state, 'available' => $fresh && $row->desired === 'enabled' && $state === 'ready',
            'account' => $meta['account'] ?? '', 'model' => $meta['model'] ?? '',
            'connection_url' => $fresh ? ($meta['connection_url'] ?? null) : null,
            'message' => self::message(!empty($meta['error']) && in_array($state, ['error', 'paused', 'disconnected']) ? $meta['error'] : $state),
            'usage_url' => 'https://chatgpt.com/settings/usage'];
    }
    public function heartbeat(int $owner, array $input): array
    {
        $data = validator($input, ['status' => 'required|in:ready,reauthorize,disconnected,error', 'account' => 'nullable|string|max:180',
            'model' => 'nullable|string|max:100', 'connection_url' => ['nullable', 'regex:~^http://127\.0\.0\.1:[0-9]{1,5}/?$~'],
            'error' => 'nullable|string|max:80', 'check_complete' => 'nullable|boolean'])->validate();
        return DB::transaction(function () use ($owner, $data) {
            DB::table('jn_data_plan_connections')->insertOrIgnore(['owner_id' => $owner, 'created_at' => now(), 'updated_at' => now()]);
            $row = DB::table('jn_data_plan_connections')->where('owner_id', $owner)->lockForUpdate()->first();
            $desired = $row->desired;
            // A signed acknowledgement closes a disconnect; no automatic re-enable.
            if ($desired === 'disconnect' && $data['status'] === 'disconnected') $desired = 'paused';
            if ($desired === 'checking' && $data['status'] === 'ready') $desired = 'enabled';
            if ($desired === 'checking' && !empty($data['check_complete']) && $data['status'] === 'error') $desired = 'paused';
            DB::table('jn_data_plan_connections')->where('owner_id', $owner)->update(['desired' => $desired, 'status' => $data['status'],
                'metadata' => DataSupport::json($data), 'heartbeat_at' => now(), 'updated_at' => now()]);
            return ['desired' => $desired];
        });
    }
    public function change(User $user, string $key, string $action): array
    {
        abort_unless(($this->binding()['owner_id'] ?? null) === (int) $user->id, 403);
        abort_unless(in_array($action, ['enable', 'pause', 'disconnect', 'check']), 422);
        return (new DataSupport())->mutate($user, $key, 'assistant.connection', ['action' => $action], fn () => null,
            function () use ($user, $action) {
                $row = DB::table('jn_data_plan_connections')->where('owner_id', $user->id)->first(); abort_unless($row, 409, '本机连接尚未启动。');
                if ($action === 'enable') abort_unless($row->status === 'ready' && now()->diffInSeconds($row->heartbeat_at, true) < 35, 409, '连接尚未就绪，请先完成授权。');
                DB::table('jn_data_plan_connections')->where('owner_id', $user->id)->update(['desired' => ['enable' => 'enabled', 'pause' => 'paused', 'disconnect' => 'disconnect', 'check' => 'checking'][$action], 'updated_at' => now()]);
                if ($action !== 'enable') DB::table('jn_data_answers')->whereIn('conversation_id', DB::table('jn_data_conversations')->where('owner_id', $user->id)->select('id'))
                    ->where('mode', 'openai')->whereIn('state', ['queued', 'processing'])->update(['state' => 'cancelled', 'lease' => null, 'finished_at' => now(), 'updated_at' => now()]);
                (new DataSupport())->event($user, 'assistant', $user->id, ['enable' => '启用个人套餐连接', 'pause' => '暂停个人套餐连接', 'disconnect' => '请求断开个人套餐连接', 'check' => '重新检查个人套餐连接'][$action]);
                return ['connection' => $this->status($user)];
            });
    }
    public static function message(string $code): string
    {
        return match ($code) {
            'ready' => 'ChatGPT 套餐已连接，仅当前软件账号可用。', 'paused' => 'AI 解读已暂停，原文摘录仍可使用。',
            'offline' => '本机连接进程未运行，请启动资料助手连接。', 'reauthorize', 'authorization_expired', 'invalid_grant' => '授权已失效，请重新授权后再提问。',
            'checking' => '正在重新核对连接，此操作不会发送模型问题。',
            'disconnected' => '已清除本机授权，需要重新连接 ChatGPT。', 'disconnecting' => '正在停止请求并断开授权。',
            'revocation_unconfirmed' => '本机授权已清除；远端撤销未确认，请在 ChatGPT 用量设置中断开应用。',
            'subscription_sharing_usage_limit_exceeded' => '此应用的套餐用量已达上限，请到 ChatGPT 用量设置查看。',
            'subscription_sharing_user_not_eligible', 'sharing_not_enabled' => '当前授权不允许使用套餐解读，请核对 ChatGPT 中的应用权限。',
            'provider_forbidden' => '模型服务拒绝了本次连接，具体原因尚未确认。请重新检查连接；若仍失败，再核对授权与服务访问限制。',
            'request_timeout', 'INTERRUPTED' => '解读已超时或连接中断，未自动重发。重试可能产生新的用量。',
            'invalid_answer', 'INVALID_RESPONSE', 'invalid_citation' => '回答或原文引用未通过核对，结果未展示。可以调整问题后重试。',
            'model_not_found', 'no_models' => '当前授权中没有配置的模型，请检查本机连接配置。',
            'transport_failed', 'provider_unavailable' => '模型服务暂时无法连接，未自动重试。请稍后重新查询。',
            default => '处理未完成，未自动切换或重发。原始资料未被修改。',
        };
    }
}
