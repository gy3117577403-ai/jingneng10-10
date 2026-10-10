<?php

namespace App\Services\SalesControl;

use App\Models\User;
use App\Models\Workflow\{Orders, Quotes};
use App\Services\Presales\PresalesService;
use Illuminate\Support\Facades\DB;

class TechnicalHandoff
{
    public function __construct(private FlowSupport $flow, private QuoteReview $reviews) {}
    public function manages(Orders $order, User $user): bool { return FlowSupport::owns($user, $order) && FlowSupport::can($user, '发起技术交接'); }
    public function visible(Orders $order, User $user): bool
    {
        return $this->manages($order, $user) || (FlowSupport::can($user, '接收技术交接') && DB::table('jn_technical_handoffs')->where('order_id', $order->id)->where('receiver_id', $user->id)->exists());
    }
    private function basis(Orders $order): ?object
    {
        return DB::table('jn_order_quote_reviews as l')->join('jn_quote_reviews as r', 'r.id', '=', 'l.review_id')->where('l.order_id', $order->id)->first(['r.*']);
    }
    public function snapshot(Orders $order, ?array $ids = null): array
    {
        $order = $order->fresh(['OrderLines.Unit', 'companie']);
        $review = $this->basis($order);
        $quote = $order->quotes_id ? Quotes::find($order->quotes_id) : null;
        return ['order' => $order->only(['id', 'code', 'label', 'customer_reference', 'companies_id', 'validity_date', 'comment', 'quotes_id']),
            'customer' => $order->companie?->label,
            'lines' => $order->OrderLines->sortBy('id')->map(fn ($l) => [...$l->only(['id', 'code', 'label', 'qty', 'product_id', 'delivery_date', 'line_type', 'quote_lines_id']), 'unit' => $l->Unit?->label])->values()->all(),
            'quote_review' => $review ? ['id' => $review->id, 'version' => $review->version, 'quote_id' => $review->quote_id, 'fingerprint' => $review->fingerprint] : null,
            'materials' => $quote ? $this->reviews->materials($quote, $ids) : ['inquiry' => null, 'files' => []]];
    }
    public function context(int $id, User $user): array
    {
        $order = Orders::findOrFail($id); abort_unless($this->visible($order, $user), 404, '技术交接不存在或你没有权限。');
        $manage = $this->manages($order, $user); $row = DB::table('jn_technical_handoffs')->where('order_id', $id)->first();
        $versions = $row ? DB::table('jn_handoff_versions')->where('handoff_id', $row->id)->orderByDesc('version')->get()->map(fn ($v) => [...(array) $v, 'snapshot' => FlowSupport::decode($v->snapshot)])->all() : [];
        $current = $manage ? $this->snapshot($order) : null;
        $stale = $row && !$this->current($versions[0], $order);
        return ['id' => $id, 'code' => $order->code, 'title' => $order->label, 'current' => $current,
            'fingerprint' => $current ? FlowSupport::hash($current) : null, 'handoff' => $row,
            'versions' => $versions, 'stale' => (bool) $stale, 'users' => $manage ? $this->flow->users('接收技术交接') : [],
            'can_send' => $manage && (bool) $this->basis($order),
            'can_receive' => $row && FlowSupport::can($user, '接收技术交接') && ($user->hasRole('Admin') || (int) $row->receiver_id === (int) $user->id),
            'receiver' => $row ? User::find($row->receiver_id)?->name : null, 'events' => $this->flow->events('order', $id),
            'record_url' => $manage && $user->can('orders-menu') ? route('orders.show', $id) : null];
    }
    private function current(array $version, Orders $order): bool
    {
        $snapshot = $version['snapshot'];
        $fresh = $this->snapshot($order, array_column($snapshot['materials']['files'], 'id'));
        // Checklist, deadline and note are intentionally outside the business-data fingerprint.
        return hash_equals($version['fingerprint'], FlowSupport::hash($fresh));
    }
    public function send(int $id, User $user, string $key, array $input): array
    {
        $data = validator($input, ['fingerprint' => 'required|string|size:64', 'revision' => 'required|integer|min:0',
            'receiver_id' => 'required|integer', 'due_date' => 'required|date_format:Y-m-d', 'note' => 'required|string|max:2000', 'confirmed' => 'accepted',
            'version_ids' => 'present|array|max:50', 'version_ids.*' => 'integer|distinct',
            'checklist' => 'required|array|min:1|max:12', 'checklist.*' => 'required|string|max:160|distinct'], [],
            ['note' => '交接说明', 'receiver_id' => '接收人', 'due_date' => '期望完成日期', 'checklist' => '交接核对项', 'confirmed' => '交接资料确认'])->validate();
        return $this->flow->mutate('order', $id, $user, $key, ['action' => 'send', ...$data],
            fn ($order) => abort_unless($this->manages($order, $user), 404), function ($order) use ($user, $data) {
                abort_unless($this->basis($order), 422, '此订单还没有确认报价的转单依据，请先完成报价核对并转单。');
                abort_if(in_array((int) $order->statu, [5, 6]), 409, '已停止或取消的订单不能交接。');
                $receiver = User::find($data['receiver_id']);
                abort_unless($receiver && FlowSupport::can($receiver, '接收技术交接'), 422, '请选择有技术接收权限的有效人员。');
                $quote = Quotes::findOrFail($order->quotes_id);
                $materials = $this->reviews->materials($quote, $data['version_ids'], true);
                if ($inquiry = $materials['inquiry']) app(PresalesService::class)->record($inquiry['id'], $user, false, true);
                abort_unless(hash_equals($data['fingerprint'], FlowSupport::hash($this->snapshot($order))), 409, '订单或资料已有变化，请刷新后重新交接。');
                $row = DB::table('jn_technical_handoffs')->where('order_id', $order->id)->first();
                abort_unless((int) ($row->revision ?? 0) === (int) $data['revision'], 409, '交接已更新，请刷新后查看。');
                // A new version also permits explicit reassignment; old recipient access ends immediately.
                $version = ($row->version ?? 0) + 1; $revision = ($row->revision ?? 0) + 1;
                $values = ['sender_id' => $user->id, 'receiver_id' => $receiver->id, 'state' => 'pending', 'version' => $version,
                    'revision' => $revision, 'due_date' => $data['due_date'], 'updated_at' => now()];
                if ($row) { DB::table('jn_technical_handoffs')->where('id', $row->id)->update($values); $handoffId = $row->id; }
                else $handoffId = DB::table('jn_technical_handoffs')->insertGetId(['order_id' => $order->id, 'created_at' => now(), ...$values]);
                $snapshot = $this->snapshot($order, $data['version_ids']); $hash = FlowSupport::hash($snapshot);
                $snapshot += ['checklist' => array_values($data['checklist']), 'due_date' => $data['due_date'], 'receiver_id' => $receiver->id];
                DB::table('jn_handoff_versions')->insert(['handoff_id' => $handoffId, 'version' => $version, 'snapshot' => FlowSupport::json($snapshot),
                    'fingerprint' => $hash, 'actor_id' => $user->id, 'note' => $data['note'], 'created_at' => now()]);
                $this->flow->event('order', $order->id, $user, $row ? '补充或调整后重新交接' : '发起技术交接',
                    ['version' => $version, 'note' => $data['note'], 'receiver_id' => $receiver->id, 'previous_receiver_id' => $row->receiver_id ?? null]);
                return ['handoff_id' => $handoffId, 'version' => $version];
            });
    }
    public function action(int $id, User $user, string $key, array $input): array
    {
        $data = validator($input, ['revision' => 'required|integer|min:1', 'action' => 'required|in:accept,request_info,return,complete,cancel',
            'note' => 'required|string|max:2000', 'checked' => 'sometimes|array|max:12', 'checked.*' => 'integer|distinct|min:0'], [], ['note' => '处理说明'])->validate();
        $authorize = function ($order) use ($user, $data) {
            $row = DB::table('jn_technical_handoffs')->where('order_id', $order->id)->first();
            abort_unless($row && ($data['action'] === 'cancel' ? $this->manages($order, $user) :
                (FlowSupport::can($user, '接收技术交接') && ($user->hasRole('Admin') || (int) $row->receiver_id === (int) $user->id))), 404);
        };
        return $this->flow->mutate('order', $id, $user, $key, $data, $authorize, function ($order) use ($user, $data) {
            $row = DB::table('jn_technical_handoffs')->where('order_id', $order->id)->first();
            abort_unless((int) $row->revision === (int) $data['revision'], 409, '交接已被其他人处理，请刷新。');
            $states = ['accept' => ['pending'], 'request_info' => ['pending', 'working'], 'return' => ['pending', 'working'],
                'complete' => ['working'], 'cancel' => ['pending', 'working', 'needs_info', 'returned']];
            abort_unless(in_array($row->state, $states[$data['action']]), 409, '当前状态不能执行此操作。');
            $v = DB::table('jn_handoff_versions')->where('handoff_id', $row->id)->where('version', $row->version)->first();
            $snapshot = FlowSupport::decode($v->snapshot);
            if (in_array($data['action'], ['accept', 'complete'])) {
                if ($inquiry = $snapshot['materials']['inquiry']) DB::table('jn_inquiries')->where('id', $inquiry['id'])->lockForUpdate()->first();
                abort_if(in_array((int) $order->statu, [5, 6]), 409, '订单已停止或取消，不能接收或完成交接。');
                abort_unless($this->current(['snapshot' => $snapshot, 'fingerprint' => $v->fingerprint], $order), 409, '订单或资料已变化，请要求发起人补充并重新交接。');
                $this->reviews->materials(Quotes::findOrFail($order->quotes_id), array_column($snapshot['materials']['files'], 'id'), true);
            }
            if ($data['action'] === 'complete') {
                $checked = $data['checked'] ?? []; sort($checked);
                abort_unless($checked === range(0, count($snapshot['checklist']) - 1), 422, '请逐项确认全部交接核对项。');
            }
            $state = ['accept' => 'working', 'request_info' => 'needs_info', 'return' => 'returned', 'complete' => 'completed', 'cancel' => 'cancelled'][$data['action']];
            DB::table('jn_technical_handoffs')->where('id', $row->id)->update(['state' => $state, 'revision' => $row->revision + 1, 'updated_at' => now()]);
            $this->flow->event('order', $order->id, $user, ['accept' => '接收技术交接', 'request_info' => '要求补充资料', 'return' => '退回技术交接',
                'complete' => '完成技术交接', 'cancel' => '撤回技术交接'][$data['action']], ['version' => $row->version, 'note' => $data['note'], 'checked' => $data['checked'] ?? []]);
            return ['handoff_id' => $row->id, 'state' => $state];
        });
    }
    public function file(int $id, int $version, int $vid, User $user)
    {
        $order = Orders::findOrFail($id); abort_unless($this->visible($order, $user), 404);
        $handoff = DB::table('jn_technical_handoffs')->where('order_id', $id)->first();
        $row = $handoff ? DB::table('jn_handoff_versions')->where('handoff_id', $handoff->id)->where('version', $version)->first() : null;
        abort_unless($row && in_array($vid, array_column(FlowSupport::decode($row->snapshot)['materials']['files'], 'id')), 404);
        $file = DB::table('jn_file_versions')->find($vid); abort_unless($file, 404);
        return $this->flow->download($file->path, $file->sha256, $file->filename, 'application/octet-stream');
    }
}
