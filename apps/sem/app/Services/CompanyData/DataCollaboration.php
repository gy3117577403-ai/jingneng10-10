<?php

namespace App\Services\CompanyData;

use App\Models\User;
use Illuminate\Support\Facades\DB;

class DataCollaboration
{
    public function __construct(private DataSupport $support) {}
    public function items(User $user): array
    {
        $a = new DataAccess(); $items = [];
        foreach (DB::table('jn_data_versions')->where('state', 'pending')->where(fn ($q) => $q->where('reviewer_id', $user->id)->orWhere('submitted_by', $user->id))->get() as $v) {
            $r = $a->record($v->record_id); if (!$a->canVersion($user, $r, $v)) continue;
            $items[] = ['type' => 'review', 'id' => $v->id, 'record_id' => $r->id, 'version_id' => $v->id, 'record_title' => $v->title, 'title' => '资料发布审核', 'state' => 'pending', 'revision' => $r->revision, 'actor_id' => $v->submitted_by, 'assignee_id' => $v->reviewer_id, 'can_act' => (int) $v->reviewer_id === (int) $user->id && $a->can($user, 'review', $r), 'created_at' => $v->submitted_at];
        }
        foreach (DB::table('jn_data_access_requests')->where(fn ($q) => $q->where('applicant_id', $user->id)->orWhere('approver_id', $user->id))->orderByDesc('id')->get() as $item) {
            $r = $a->record($item->record_id); if (!$a->visibleVersion($user, $r)) continue;
            $v = $a->version($item->version_id);
            // Approval and applicant inboxes may show request metadata, never borrowed content here.
            if ((int) $item->applicant_id !== (int) $user->id && !$a->can($user, 'access', $r)) continue;
            $items[] = [...(array) $item, 'type' => 'access', 'record_title' => $v->title, 'title' => '申请查看 · 版本 ' . $v->number, 'state' => in_array($item->state, ['pending', 'approved']) && now()->gte($item->expires_at) ? 'expired' : $item->state,
                'actor_id' => $item->applicant_id, 'assignee_id' => $item->approver_id, 'can_act' => (int) $item->approver_id === (int) $user->id && $a->can($user, 'access', $r)];
        }
        foreach (DB::table('jn_data_tasks')->where(fn ($q) => $q->where('created_by', $user->id)->orWhere('assignee_id', $user->id))->orderByDesc('id')->get() as $item) {
            $r = $a->record($item->record_id); $v = $a->version($item->version_id);
            if (!$a->canVersion($user, $r, $v)) continue;
            $items[] = [...(array) $item, 'type' => 'task', 'record_title' => $v->title, 'actor_id' => $item->created_by, 'can_act' => $a->can($user, 'collaborate', $r)];
        }
        usort($items, fn ($l, $r) => strcmp($r['created_at'] ?? '', $l['created_at'] ?? '')); return $items;
    }
    public function save(User $user, string $key, string $action, int $id, array $p): array
    {
        $authorize = function (DataAccess $a) use ($user, $action, $id, $p) {
            if (in_array($action, ['comment', 'task', 'request'], true)) {
                $r = $a->record($id); abort_if($r->archived, 403, '已归档资料不能发起协作。');
                abort_unless($a->can($user, $action === 'request' ? 'request' : 'collaborate', $r), 403, '当前没有此操作权限。');
                if ($action !== 'request') abort_unless($a->canVersion($user, $r, $a->version((int) ($p['version_id'] ?? 0))), 403);
                else abort_unless($a->can($user, 'discover', $r), 403);
            } elseif ($action === 'task-action') {
                $t = DB::table('jn_data_tasks')->where('id', $id)->firstOrFail(); $r = $a->record($t->record_id);
                abort_unless(!$r->archived && $a->canVersion($user, $r, $a->version($t->version_id)) && $a->can($user, 'collaborate', $r) && in_array((int) $user->id, [(int) $t->created_by, (int) $t->assignee_id], true), 403);
            } elseif ($action === 'access-action') {
                $t = DB::table('jn_data_access_requests')->where('id', $id)->firstOrFail(); $r = $a->record($t->record_id);
                abort_unless(!$r->archived && $a->can($user, 'discover', $r), 403);
                if (($p['decision'] ?? '') === 'cancel') abort_unless((int) $t->applicant_id === (int) $user->id, 403);
                else abort_unless((int) $t->approver_id === (int) $user->id && $a->can($user, 'access', $r), 403);
            } else abort(404);
        };
        return $this->support->mutate($user, $key, "collaboration:$action:$id", $p, $authorize, function (DataAccess $a) use ($user, $action, $id, $p) {
            if ($action === 'comment') {
                validator($p, ['body' => 'required|string|max:2000'])->validate();
                DB::table('jn_data_comments')->insert(['record_id' => $id, 'version_id' => $p['version_id'], 'actor_id' => $user->id, 'body' => $p['body'], 'created_at' => now()]);
                $this->support->event($user, 'record', $id, '添加版本评论', [], $p['version_id']); return ['id' => $id];
            }
            if ($action === 'task') {
                validator($p, ['title' => 'required|string|max:160', 'description' => 'required|string|max:3000', 'due_date' => 'required|date_format:Y-m-d|after_or_equal:today', 'assignee_id' => 'required|integer'])->validate();
                $r = $a->record($id); $assignee = DataSupport::user($p['assignee_id']);
                abort_unless($a->can($assignee, 'collaborate', $r) && $a->canVersion($assignee, $r, $a->version($p['version_id'])), 422, '协作人需要已有该版本的查看与协作权限，派发任务不会自动授权。');
                $tid = DB::table('jn_data_tasks')->insertGetId(['record_id' => $id, 'version_id' => $p['version_id'], 'created_by' => $user->id, 'assignee_id' => $assignee->id, 'title' => $p['title'], 'description' => $p['description'], 'due_date' => $p['due_date'], 'created_at' => now(), 'updated_at' => now()]);
                $this->support->event($user, 'record', $id, '派发版本协作任务', [], $p['version_id']); return ['id' => $tid, 'record_id' => $id];
            }
            if ($action === 'request') {
                validator($p, ['reason' => 'required|string|max:2000', 'days' => 'required|integer|min:1|max:30', 'approver_id' => 'required|integer'])->validate();
                $r = $a->record($id); abort_unless($r->published_version_id, 422, '仅已发布的资料可以申请查看。');
                abort_if($a->can($user, 'view', $r, false) || $a->ruleDecision($user, 'view', $r)['denied'], 422, '当前已经可以查看，或存在明确禁止规则，不能通过申请覆盖。');
                $approver = DataSupport::user($p['approver_id']); abort_unless($approver->id !== $user->id && $a->can($approver, 'access', $r), 422, '请选择另一位有审批权限的人员。');
                abort_if(DB::table('jn_data_access_requests')->where('record_id', $id)->where('version_id', $r->published_version_id)->where('applicant_id', $user->id)->whereIn('state', ['pending', 'approved'])->where('expires_at', '>', now())->exists(), 422, '此版本已有待处理申请或有效查看授权。');
                $rid = DB::table('jn_data_access_requests')->insertGetId(['record_id' => $id, 'version_id' => $r->published_version_id, 'applicant_id' => $user->id, 'approver_id' => $approver->id, 'reason' => $p['reason'], 'expires_at' => now()->addDays($p['days']), 'created_at' => now(), 'updated_at' => now()]);
                $this->support->event($user, 'record', $id, '发起指定版本查看申请', [], $r->published_version_id); return ['id' => $rid, 'record_id' => $id];
            }
            if ($action === 'access-action') {
                validator($p, ['decision' => 'required|in:approve,reject,cancel,revoke', 'note' => 'required|string|max:2000'])->validate();
                $t = DB::table('jn_data_access_requests')->where('id', $id)->firstOrFail(); DataSupport::revision($t, $p['revision'] ?? 0);
                $decision = $p['decision'];
                abort_unless($t->state === ($decision === 'revoke' ? 'approved' : 'pending'), 409, '申请已处理，请刷新。');
                if ($decision === 'approve') {
                    abort_if(now()->gte($t->expires_at), 422, '申请已经过期，请重新申请。');
                    $applicant = DataSupport::user($t->applicant_id); $r = $a->record($t->record_id);
                    abort_if($a->ruleDecision($applicant, 'view', $r)['denied'] || !$a->can($applicant, 'discover', $r), 422, '申请人的当前权限不允许获得此授权。');
                }
                DB::table('jn_data_access_requests')->where('id', $id)->update(['state' => ['approve' => 'approved', 'reject' => 'rejected', 'cancel' => 'cancelled', 'revoke' => 'revoked'][$decision], 'decision_note' => $p['note'], 'revision' => $t->revision + 1, 'updated_at' => now()]);
                $this->support->event($user, 'record', $t->record_id, ['approve' => '批准指定版本限时查看', 'reject' => '拒绝查看申请', 'cancel' => '撤回查看申请', 'revoke' => '撤销临时查看授权'][$decision], [], $t->version_id); return ['id' => $id, 'record_id' => $t->record_id];
            }
            validator($p, ['decision' => 'required|in:accept,block,complete,cancel', 'result' => 'required|string|max:3000'])->validate();
            $t = DB::table('jn_data_tasks')->where('id', $id)->firstOrFail(); DataSupport::revision($t, $p['revision'] ?? 0);
            abort_if(in_array($t->state, ['completed', 'cancelled'], true), 409, '协作任务已经结束。');
            if ($p['decision'] === 'cancel') abort_unless((int) $t->created_by === (int) $user->id, 403, '只有发起人可以取消任务。');
            else abort_unless((int) $t->assignee_id === (int) $user->id, 403, '只有执行人可以处理任务。');
            DB::table('jn_data_tasks')->where('id', $id)->update(['state' => ['accept' => 'accepted', 'block' => 'blocked', 'complete' => 'completed', 'cancel' => 'cancelled'][$p['decision']], 'result' => $p['result'], 'revision' => $t->revision + 1, 'updated_at' => now()]);
            $this->support->event($user, 'record', $t->record_id, ['accept' => '接收协作任务', 'block' => '协作等待补充', 'complete' => '完成协作并填写结果', 'cancel' => '取消协作任务'][$p['decision']], ['result' => $p['result']], $t->version_id);
            return ['id' => $id, 'record_id' => $t->record_id];
        });
    }
}
