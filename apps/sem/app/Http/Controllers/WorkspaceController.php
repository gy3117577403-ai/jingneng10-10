<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\Workflow\{Quotes, Orders, Invoices, Leads};
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Read models only. Formal changes continue through their original authorized workflows. */
class WorkspaceController extends Controller
{
    private function inquiries(User $user)
    {
        $q = DB::table('jn_inquiries as i');
        if (!$user->hasRole('Admin')) {
            $q->where(fn ($w) => $w->where('i.owner_id', $user->id)->orWhereExists(fn ($m) => $m->selectRaw('1')->from('jn_inquiry_members')->whereColumn('inquiry_id', 'i.id')->where('user_id', $user->id)));
        }
        return $q;
    }

    public function inbox(Request $request)
    {
        $input = $request->validate(['scope' => 'nullable|in:mine,all,requested', 'q' => 'nullable|string|max:160']);
        $user = $request->user(); $scope = $input['scope'] ?? 'mine'; $search = trim($input['q'] ?? '');
        $control = app(\App\Services\SalesControl\SalesInbox::class)->items($user, $scope, $search);
        $items = collect($control['items']); $sources = $control['sources'];
        $dataItems = app(\App\Services\CompanyData\DataInbox::class)->items($user, $scope, $search);
        $items = $items->concat($dataItems['items']); $sources = [...$sources, ...$dataItems['sources']];
        $runs = $this->inquiries($user)->join('jn_ai_runs as r', 'r.inquiry_id', '=', 'i.id')
            ->leftJoin('users as u', 'u.id', '=', 'i.owner_id')->whereIn('r.state', ['queued', 'running', 'review', 'failed']);
        if ($scope === 'mine') $runs->where('i.owner_id', $user->id);
        if ($scope === 'requested') $runs->where('r.requested_by', $user->id);
        if ($search !== '') $runs->where(fn ($q) => $q->where('i.title', 'like', "%$search%")->orWhere('i.customer_name', 'like', "%$search%")->orWhere('i.code', 'like', "%$search%"));
        $sources[] = ['key' => 'presales', 'label' => '售前核对', 'total' => (clone $runs)->count()];
        foreach ($runs->orderBy('r.created_at')->orderBy('r.id')->limit(50)->get(['r.id', 'r.inquiry_id', 'r.state', 'r.revision as run_revision', 'r.created_at', 'i.revision', 'i.title', 'i.code', 'i.kind', 'i.customer_name', 'i.expected_date', 'u.name as owner_name']) as $run) {
            $state = ['queued' => '等待处理', 'running' => '正在提取', 'review' => '待人工核对', 'failed' => '处理失败'][$run->state];
            $stale = $run->state === 'review' && $run->run_revision !== $run->revision;
            $items->push(['key' => 'presales:' . $run->id, 'source' => 'presales', 'source_label' => '售前核对', 'title' => $run->title,
                'code' => $run->code, 'company' => $run->customer_name, 'owner' => $run->owner_name, 'date' => $run->expected_date,
                'state' => $stale ? '需重新提取' : $state, 'tone' => $stale || $run->state === 'failed' ? 'danger' : ($run->state === 'review' ? 'warning' : 'info'),
                'reason' => $stale ? '询价或资料已有更新，旧候选不能直接确认。' : '固定标签模拟提取；确认后的字段才会更新询价。',
                'action' => $run->state === 'review' ? '进入核对' : '查看处理', 'inquiry_id' => $run->inquiry_id, 'run_id' => $run->id,
                'url' => route('presales.index') . '/inquiries/' . $run->inquiry_id . '?tab=ai&run=' . $run->id . '&focus=1',
                'detail_url' => route('presales.index') . '/api/inquiries/' . $run->inquiry_id, 'kind' => $run->kind === 'cabinet' ? '成套' : '钣金']);
        }
        if ($scope !== 'requested') {
            $definitions = [
                ['quote', '报价', 'quotes-menu', Quotes::class, 'validity_date', 'quotes.show'],
                ['order', '订单', 'orders-menu', Orders::class, 'validity_date', 'orders.show'],
                ['invoice', '发票', 'invoices-menu', Invoices::class, 'due_date', 'invoices.show'],
                ['lead', '线索', 'leads-menu', Leads::class, 'created_at', 'leads.show'],
            ];
            foreach ($definitions as [$type, $label, $permission, $model, $dateField, $route]) {
                if (!$user->can($permission)) continue;
                $query = $model::query()->with(['companie:id,label', 'UserManagement:id,name']);
                // Each source retains its own definition of unfinished work.
                if ($type === 'quote') $query->where(fn ($q) => $q->where('statu', 1)->orWhere(fn ($w) => $w->where('statu', 2)->where('validity_date', '<=', today()->addDays(7))));
                if ($type === 'order') $query->whereIn('statu', [1, 2]);
                if ($type === 'quote') $query->whereNotIn('id', DB::table('jn_quote_reviews')->select('quote_id'));
                if ($type === 'order') $query->whereNotIn('id', DB::table('jn_technical_handoffs')->whereNotIn('state', ['completed', 'cancelled'])->select('order_id'));
                if ($type === 'invoice') $query->whereNotIn('statu', [5])->whereNotNull('due_date')->where('due_date', '<', today());
                if ($type === 'lead') $query->where('statu', 1)->where('created_at', '<', today()->subDays(2));
                if ($scope === 'mine') $query->where('user_id', $user->id);
                if ($search !== '') $query->where(function ($q) use ($search, $type) {
                    if ($type === 'lead') $q->where('source', 'like', "%$search%");
                    else $q->where('label', 'like', "%$search%")->orWhere('code', 'like', "%$search%");
                    $q->orWhereHas('companie', fn ($c) => $c->where('label', 'like', "%$search%"));
                });
                $sources[] = ['key' => $type, 'label' => $label, 'total' => (clone $query)->count()];
                foreach ($query->orderBy($dateField)->orderBy('id')->limit(50)->get() as $row) {
                    $date = $row->getRawOriginal($dateField); $date = $date ? substr((string) $date, 0, 10) : null;
                    $late = $type !== 'lead' && $date && $date < today()->toDateString();
                    $state = match ($type) { 'quote' => (int) $row->statu === 1 ? '待处理' : ($late ? '已过期' : '即将到期'), 'order' => $late ? '交期已过' : ((int) $row->statu === 1 ? '待执行' : '执行中'), 'invoice' => '已逾期', default => '待跟进' };
                    $items->push(['key' => "$type:$row->id", 'source' => $type, 'source_label' => $label,
                        'title' => $type === 'lead' ? ($row->source ?: '跟进客户线索') : ($row->label ?: $row->code),
                        'code' => $type === 'lead' ? '线索 ' . $row->id : $row->code, 'company' => $row->companie?->label,
                        'owner' => $row->UserManagement?->name ?: '未指定', 'date' => $date, 'state' => $state,
                        'tone' => $late ? 'danger' : 'info', 'action' => "处理$label", 'url' => route($route, $row->id),
                        'reason' => match ($type) { 'quote' => '在报价详情中核对价格、有效期及后续处理。', 'order' => '在订单详情中核对交期与执行情况。', 'invoice' => '在发票详情中核对付款与到期情况。', default => '该线索尚未处理，请核对客户需求与跟进情况。' }]);
                }
            }
        }
        $sorted = $items->sortBy(fn ($i) => (($i['tone'] === 'danger' ? '0' : ($i['tone'] === 'warning' ? '1' : '2')) . ($i['date'] ?? '9999-12-31') . $i['key']))->values();
        return response()->json(['items' => $sorted, 'sources' => $sources, 'total' => array_sum(array_column($sources, 'total')), 'limit_per_source' => 50, 'scope' => $scope])->header('Cache-Control', 'no-store');
    }

    public function search(Request $request)
    {
        $input = $request->validate(['q' => 'required|string|min:1|max:160']); $term = trim($input['q']); $user = $request->user(); $items = [];
        if ($term === '') return response()->json(['items' => []])->header('Cache-Control', 'no-store');
        $inquiries = $this->inquiries($user)->where(fn ($q) => $q->where('i.title', 'like', "%$term%")->orWhere('i.code', 'like', "%$term%")->orWhere('i.customer_name', 'like', "%$term%"));
        foreach ($inquiries->orderByDesc('i.id')->limit(8)->get(['i.id', 'i.title', 'i.code']) as $row) $items[] = ['key' => "inquiry:$row->id", 'title' => $row->title, 'section' => '询价 · ' . $row->code, 'href' => route('presales.index') . '/inquiries/' . $row->id];
        $files = $this->inquiries($user)->join('jn_documents as d', 'd.inquiry_id', '=', 'i.id')->where('d.name', 'like', "%$term%");
        foreach ($files->orderByDesc('d.id')->limit(8)->get(['d.id', 'd.name', 'i.id as inquiry_id', 'i.title']) as $row) $items[] = ['key' => "file:$row->id", 'title' => $row->name, 'section' => '售前资料 · ' . $row->title, 'href' => route('presales.index') . '/inquiries/' . $row->inquiry_id . '?tab=files'];
        foreach ([[Quotes::class, 'quotes-menu', 'quotes.show', '报价'], [Orders::class, 'orders-menu', 'orders.show', '订单']] as [$model, $permission, $route, $label]) {
            if (!$user->can($permission)) continue;
            $rows = $model::query()->where(fn ($q) => $q->where('code', 'like', "%$term%")->orWhere('label', 'like', "%$term%"))->orderByDesc('id')->limit(8)->get(['id', 'code', 'label']);
            foreach ($rows as $row) $items[] = ['key' => $route . ':' . $row->id, 'title' => $row->label ?: $row->code, 'section' => $label . ' · ' . $row->code, 'href' => route($route, $row->id)];
        }
        return response()->json(['items' => $items])->header('Cache-Control', 'no-store');
    }
}
