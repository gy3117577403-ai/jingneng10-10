<?php

namespace App\Services\CompanyData;

use App\Models\User;
use Illuminate\Support\Facades\DB;

class DataAccess
{
    public const ACTIONS = ['discover' => '查看目录', 'view' => '查看内容', 'create' => '新增资料', 'edit' => '编辑草稿', 'submit' => '提交审核', 'review' => '审核发布', 'download' => '下载原件', 'export' => '导出台账', 'archive' => '归档与恢复', 'request' => '申请查看', 'access' => '审批查看申请', 'collaborate' => '协作与评论'];
    private array $rules; private array $members; private array $categories; private array $grants;
    public function __construct()
    {
        $this->rules = DB::table('jn_data_rules')->get()->groupBy(fn ($r) => "$r->scope_type:$r->scope_id")->all();
        $this->members = DB::table('jn_data_members')->get()->groupBy('user_id')->map(fn ($rows) => $rows->pluck('group_id')->map(fn ($i) => (int) $i)->all())->all();
        $this->categories = DB::table('jn_data_categories')->get()->keyBy('id')->all();
        $this->grants = DB::table('jn_data_access_requests')->where('state', 'approved')->where('expires_at', '>', now())->orderByDesc('id')->get()->groupBy('applicant_id')->all();
    }
    public function category(int $id): object { abort_unless(isset($this->categories[$id]), 404, '资料分类不存在。'); return $this->categories[$id]; }
    public function record(int $id): object { $r = DB::table('jn_data_records')->where('id', $id)->first(); abort_unless($r, 404, '资料不存在。'); return $r; }
    public function version(int $id): object { $v = DB::table('jn_data_versions')->where('id', $id)->first(); abort_unless($v, 404, '资料版本不存在。'); return $v; }
    public function ruleDecision(User $user, string $action, object $target): array
    {
        $record = isset($target->category_id); $category = $record ? $this->category($target->category_id) : $target;
        $scope = $record && $target->policy_mode === 'custom' ? 'record:' . $target->id : 'category:' . $category->id;
        $matches = [];
        foreach ($this->rules[$scope] ?? [] as $r) {
            if ($r->action !== $action) continue;
            $match = $r->principal_type === 'everyone' || ($r->principal_type === 'user' && (int) $r->principal_id === (int) $user->id)
                || ($r->principal_type === 'group' && in_array((int) $r->principal_id, $this->members[$user->id] ?? [], true));
            if ($match) $matches[] = $r;
        }
        $deny = collect($matches)->contains(fn ($r) => $r->effect === 'deny');
        return ['allowed' => !$deny && count($matches) > 0, 'denied' => $deny, 'scope' => $scope,
            'rules' => array_map(fn ($r) => ['principal_type' => $r->principal_type, 'principal_id' => (int) $r->principal_id, 'effect' => $r->effect], $matches)];
    }
    public function grant(User $user, object $record, ?int $version = null): ?object
    {
        foreach ($this->grants[$user->id] ?? [] as $g) {
            if ((int) $g->record_id === (int) $record->id && ($version === null || (int) $g->version_id === $version)) return $g;
        }
        return null;
    }
    public function can(User $user, string $action, object $target, bool $withGrant = true): bool
    {
        if (!DataSupport::active($user)) return false;
        $record = isset($target->category_id); $cat = $record ? $this->category($target->category_id) : $target;
        if (!$cat->enabled) return false;
        $d = $this->ruleDecision($user, $action, $target);
        if ($d['denied']) return false;
        $discover = $this->ruleDecision($user, 'discover', $target);
        if ($action !== 'discover' && $discover['denied']) return false;
        $view = $this->ruleDecision($user, 'view', $target);
        if ($action === 'discover') return $d['allowed'] || $view['allowed'] || ($withGrant && !$view['denied'] && $record && $this->grant($user, $target));
        if ($action === 'view') return $d['allowed'] || ($withGrant && $record && $this->grant($user, $target));
        if (in_array($action, ['request', 'create'], true)) return $d['allowed'];
        // Borrowed read access never grants editing, downloads, exports or approval.
        return $d['allowed'] && $view['allowed'];
    }
    public function draft(User $user, object $record): bool
    {
        return $this->can($user, 'view', $record, false) && ($this->can($user, 'edit', $record) || $this->can($user, 'review', $record)
            || ((int) $record->owner_id === (int) $user->id && $this->can($user, 'create', $record)));
    }
    public function canVersion(User $user, object $record, object $version): bool
    {
        if ((int) $version->record_id !== (int) $record->id || !$this->can($user, 'view', $record)) return false;
        if ($record->archived && !$this->can($user, 'archive', $record)) return false;
        if ($version->published_at) return $this->can($user, 'view', $record, false) || (bool) $this->grant($user, $record, $version->id);
        return $this->draft($user, $record);
    }
    public function visibleVersion(User $user, object $record): ?object
    {
        if (!$this->can($user, 'discover', $record)) return null;
        if ($record->archived && !$this->can($user, 'archive', $record)) return null;
        if ($this->draft($user, $record) && $record->draft_version_id) return $this->version($record->draft_version_id);
        if ($this->can($user, 'view', $record, false) && $record->published_version_id) return $this->version($record->published_version_id);
        if ($g = $this->grant($user, $record)) return $this->version($g->version_id);
        return $record->published_version_id ? $this->version($record->published_version_id) : null;
    }
    public function abilities(User $user, object $target): array
    {
        return array_map(fn ($action) => $this->can($user, $action, $target), array_combine(array_keys(self::ACTIONS), array_keys(self::ACTIONS)));
    }
    public function explain(User $user, object $target): array
    {
        $result = [];
        foreach (self::ACTIONS as $action => $label) {
            $decision = $this->ruleDecision($user, $action, $target); $allowed = $this->can($user, $action, $target);
            $reason = $allowed ? ($decision['allowed'] ? '匹配允许规则' : '由内容查看权限或有效借阅开放') : ($decision['denied'] ? '匹配明确禁止规则，禁止优先' : '未获得有效授权，或查看权限/分类状态不满足');
            $result[] = ['action' => $action, 'label' => $label, 'allowed' => $allowed, 'reason' => $reason, ...$decision];
            $result[array_key_last($result)]['allowed'] = $allowed;
        }
        return $result;
    }
}
