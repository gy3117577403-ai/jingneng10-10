<?php

namespace App\Services\SalesControl;

use App\Models\User;
use Illuminate\Support\Facades\DB;

class SalesInbox
{
    public function items(User $user, string $scope, string $search): array
    {
        $items = []; $sources = [];
        foreach (['review', 'handoff'] as $type) {
            $review = $type === 'review';
            $table = $review ? 'jn_quote_reviews' : 'jn_technical_handoffs'; $parent = $review ? 'quotes' : 'orders';
            $actor = $review ? 'reviewer_id' : 'receiver_id'; $sender = $review ? 'submitted_by' : 'sender_id';
            $receive = FlowSupport::can($user, $review ? '核对报价版本' : '接收技术交接');
            $manage = FlowSupport::can($user, $review ? '提交报价核对' : '发起技术交接');
            if (!$receive && !$manage) continue;
            $q = DB::table("$table as f")->join("$parent as p", 'p.id', '=', $review ? 'f.quote_id' : 'f.order_id')
                ->leftJoin('companies as c', 'c.id', '=', 'p.companies_id')->leftJoin('users as u', 'u.id', '=', "f.$actor")->whereNull('p.deleted_at');
            if ($review) $q->whereIn('f.state', ['pending', 'rejected', 'withdrawn'])->whereNotExists(fn ($n) => $n->selectRaw('1')->from('jn_quote_reviews as newer')->whereColumn('newer.quote_id', 'f.quote_id')->whereColumn('newer.version', '>', 'f.version'));
            else $q->whereNotIn('f.state', ['completed', 'cancelled']);
            $ownerStates = $review ? ['rejected', 'withdrawn'] : ['needs_info', 'returned'];
            if (!$user->hasRole('Admin') || $scope !== 'all') {
                $q->where(function ($w) use ($user, $scope, $actor, $sender, $receive, $manage, $ownerStates) {
                    if ($scope === 'requested') {
                        $w->where("f.$sender", $user->id)->whereRaw($manage ? '1=1' : '1=0');
                        if (!$user->hasRole('Admin')) $w->where('p.user_id', $user->id);
                        return;
                    }
                    $w->whereRaw('1=0');
                    if ($manage) $w->orWhere(function ($o) use ($user, $scope, $ownerStates) {
                        $o->where('p.user_id', $user->id); if ($scope === 'mine') $o->whereIn('f.state', $ownerStates);
                    });
                    if ($receive) $w->orWhere(function ($o) use ($user, $scope, $actor, $ownerStates) {
                        $o->where("f.$actor", $user->id); if ($scope === 'mine') $o->whereNotIn('f.state', $ownerStates);
                    });
                });
            }
            if ($search !== '') $q->where(fn ($w) => $w->where('p.code', 'like', "%$search%")->orWhere('p.label', 'like', "%$search%")->orWhere('c.label', 'like', "%$search%"));
            $key = $review ? 'quote_review' : 'technical_handoff'; $label = $review ? '报价核对' : '技术交接';
            $sources[] = ['key' => $key, 'label' => $label, 'total' => (clone $q)->count()];
            $columns = ['f.id', 'p.id as parent_id', 'f.state', 'f.version', 'p.code', 'p.label', 'c.label as customer', 'u.name as receiver'];
            $columns[] = $review ? 'p.validity_date as date' : 'f.due_date as date';
            foreach ($q->orderBy('f.updated_at')->limit(50)->get($columns) as $row) {
                $state = ['pending' => $review ? '待核对' : '待接收', 'rejected' => '待修改', 'withdrawn' => '待重新提交', 'working' => '处理中', 'needs_info' => '待补充', 'returned' => '待重新交接'][$row->state];
                $items[] = ['key' => "$key:$row->id", 'source' => $key, 'source_label' => $label, 'title' => $row->label, 'code' => $row->code,
                    'company' => $row->customer, 'owner' => $row->receiver, 'date' => $row->date, 'state' => $state, 'tone' => 'warning',
                    'reason' => '第' . $row->version . '版 · 打开记录查看当前内容、资料和处理意见。', 'action' => '处理' . $label,
                    'url' => route('sales-control.page', [$parent, $row->parent_id])];
            }
        }
        return ['items' => $items, 'sources' => $sources];
    }
}
