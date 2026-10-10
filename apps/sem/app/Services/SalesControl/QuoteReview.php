<?php

namespace App\Services\SalesControl;

use App\Models\User;
use App\Models\Workflow\Quotes;
use App\Services\Presales\PresalesService;
use App\Services\QuoteCalculatorService;
use App\Http\Controllers\PrintController;
use Illuminate\Support\Facades\{DB, Storage};
use Illuminate\Support\Str;
use Barryvdh\DomPDF\Facade\Pdf;

class QuoteReview
{
    public function __construct(private FlowSupport $flow) {}
    public function manages(Quotes $quote, User $user): bool { return FlowSupport::owns($user, $quote) && FlowSupport::can($user, '提交报价核对'); }
    public function visible(Quotes $quote, User $user): bool
    {
        return $this->manages($quote, $user) || (FlowSupport::can($user, '核对报价版本') && DB::table('jn_quote_reviews')->where('quote_id', $quote->id)->where('reviewer_id', $user->id)->exists());
    }
    public function required(Quotes $quote): bool
    {
        return DB::table('jn_quote_sources')->where('quote_id', $quote->id)->exists() || DB::table('jn_quote_reviews')->where('quote_id', $quote->id)->exists();
    }
    public function materials(Quotes $quote, ?array $ids = null, bool $verify = false): array
    {
        $inquiryId = DB::table('jn_quote_sources')->where('quote_id', $quote->id)->value('inquiry_id');
        if (!$inquiryId) { abort_if(!empty($ids), 422, '当前报价没有对应售前资料。'); return ['inquiry' => null, 'files' => []]; }
        $inquiry = DB::table('jn_inquiries')->find($inquiryId);
        $versions = DB::table('jn_file_versions as v')->join('jn_documents as d', 'd.id', '=', 'v.document_id')->where('d.inquiry_id', $inquiryId);
        if ($ids !== null) $versions->whereIn('v.id', $ids);
        else $versions->whereRaw('v.version = (select max(v2.version) from jn_file_versions v2 where v2.document_id = v.document_id)');
        $rows = $versions->orderBy('v.document_id')->get(['v.*']);
        abort_if($ids !== null && $rows->count() !== count($ids), 422, '资料版本不属于本次询价。');
        abort_if($rows->pluck('document_id')->unique()->count() !== $rows->count(), 422, '同一资料只能选择一个版本。');
        if ($verify) foreach ($rows as $file) {
            $this->flow->file($file);
            abort_unless((int) DB::table('jn_file_versions')->where('document_id', $file->document_id)->max('version') === (int) $file->version, 409, '所选资料已有新版本，请重新核对。');
        }
        return ['inquiry' => $inquiry ? array_intersect_key((array) $inquiry, array_flip(['id', 'code', 'kind', 'requirements', 'expected_date', 'revision'])) : null,
            'files' => $rows->map(fn ($v) => array_intersect_key((array) $v, array_flip(['id', 'document_id', 'filename', 'version', 'sha256', 'size'])))->all()];
    }
    public function snapshot(Quotes $quote, ?array $ids = null): array
    {
        $quote = $quote->fresh(['QuoteLines.Unit', 'QuoteLines.VAT', 'QuoteLines.QuoteLineDetails', 'companie', 'contact', 'adresse', 'payment_condition', 'payment_method', 'delevery_method']);
        $fields = ['id', 'code', 'label', 'companies_id', 'companies_contacts_id', 'companies_addresses_id', 'customer_reference', 'validity_date', 'comment',
            'accounting_payment_conditions_id', 'accounting_payment_methods_id', 'accounting_deliveries_id'];
        $lines = $quote->QuoteLines->sortBy('id')->map(fn ($l) => [
            ...$l->only(['id', 'ordre', 'code', 'label', 'product_id', 'qty', 'selling_price', 'discount', 'delivery_date', 'line_type', 'hide_on_pdf', 'pdf_package']),
            'unit' => $l->Unit?->only(['id', 'label', 'code']), 'vat' => $l->VAT?->only(['id', 'label', 'rate']),
            'detail' => $l->QuoteLineDetails ? array_diff_key($l->QuoteLineDetails->getAttributes(), array_flip(['created_at', 'updated_at', 'deleted_at'])) : null,
        ])->values()->all();
        $calc = new QuoteCalculatorService($quote);
        $relations = [];
        // Share only the commercial fields used by the quotation, not the full customer record.
        foreach ([
            'companie' => ['id', 'code', 'label'],
            'contact' => ['id', 'civility', 'first_name', 'name', 'number', 'mail'],
            'adresse' => ['id', 'adress', 'zipcode', 'city', 'province', 'country'],
            'payment_condition' => ['id', 'label'], 'payment_method' => ['id', 'label'], 'delevery_method' => ['id', 'label'],
        ] as $relation => $visibleFields) {
            $relations[$relation] = $quote->$relation?->only($visibleFields);
        }
        return ['document' => $quote->only($fields), 'relations' => $relations, 'lines' => $lines,
            'currency' => app('Factory')->curency ?? 'CNY', 'subtotal' => $calc->getSubTotal(), 'total' => $calc->getTotalPrice(),
            'vat' => $calc->getVatTotal(), 'materials' => $this->materials($quote, $ids)];
    }
    public function current(object $review, Quotes $quote): bool
    {
        $basis = FlowSupport::decode($review->snapshot);
        return hash_equals($review->fingerprint, FlowSupport::hash($this->snapshot($quote, array_column($basis['materials']['files'], 'id'))));
    }
    public function context(int $id, User $user): array
    {
        $quote = Quotes::findOrFail($id); abort_unless($this->visible($quote, $user), 404, '报价核对不存在或你没有权限。');
        $manage = $this->manages($quote, $user);
        $reviews = DB::table('jn_quote_reviews')->where('quote_id', $id)->orderByDesc('version');
        if (!$manage) $reviews->where('reviewer_id', $user->id);
        $rows = $reviews->get()->map(function ($r) use ($quote, $user) {
            $row = (array) $r; unset($row['print_html'], $row['draft_path'], $row['approved_path'], $row['draft_sha256'], $row['approved_sha256']);
            return [...$row, 'snapshot' => FlowSupport::decode($r->snapshot), 'stale' => !$this->current($r, $quote),
                'reviewer' => User::find($r->reviewer_id)?->name ?? '原核对人',
                'can_decide' => $r->state === 'pending' && FlowSupport::can($user, '核对报价版本') && ($user->hasRole('Admin') || (int) $r->reviewer_id === (int) $user->id),
                'pdf_url' => route('sales-control.review-pdf', [$quote->id, $r->id])];
        })->all();
        $current = $manage ? $this->snapshot($quote) : null;
        return ['id' => $id, 'code' => $quote->code, 'title' => $quote->label, 'can_submit' => $manage && in_array((int) $quote->statu, [1, 2]),
            'current' => $current, 'fingerprint' => $current ? FlowSupport::hash($current) : null, 'reviews' => $rows,
            'users' => $manage ? $this->flow->users('核对报价版本') : [], 'events' => $manage ? $this->flow->events('quote', $id) : [],
            'record_url' => $manage && $user->can('quotes-menu') ? route('quotes.show', $id) : null];
    }
    public function submit(int $id, User $user, string $key, array $input): array
    {
        $data = validator($input, ['fingerprint' => 'required|string|size:64', 'reviewer_id' => 'required|integer', 'note' => 'required|string|max:2000',
            'confirmed' => 'accepted', 'version_ids' => 'present|array|max:50', 'version_ids.*' => 'integer|distinct'], [],
            ['note' => '提交说明', 'reviewer_id' => '核对人', 'confirmed' => '资料共享与核对确认'])->validate();
        return $this->flow->mutate('quote', $id, $user, $key, ['action' => 'submit', ...$data],
            fn ($q) => abort_unless($this->manages($q, $user), 404), function ($quote) use ($user, $data) {
                abort_unless(in_array((int) $quote->statu, [1, 2]) && !$quote->is_template, 409, '当前报价状态不能提交核对。');
                $reviewer = User::find($data['reviewer_id']);
                abort_unless($reviewer && FlowSupport::can($reviewer, '核对报价版本'), 422, '请选择有核对权限的有效人员。');
                abort_if($reviewer->id === $user->id && !$user->hasRole('Admin'), 422, '请由另一位核对人确认报价。');
                $inquiryId = DB::table('jn_quote_sources')->where('quote_id', $quote->id)->value('inquiry_id');
                if ($inquiryId) app(PresalesService::class)->record($inquiryId, $user, false, true);
                abort_unless(hash_equals($data['fingerprint'], FlowSupport::hash($this->snapshot($quote))), 409, '报价或资料已变化，请刷新并重新核对。');
                $this->materials($quote, $data['version_ids'], true);
                $snapshot = $this->snapshot($quote, $data['version_ids']);
                abort_unless($quote->QuoteLines()->articles()->where('qty', '>', 0)->exists(), 422, '请先录入至少一条有效产品明细。');
                $hash = FlowSupport::hash($snapshot);
                $latest = DB::table('jn_quote_reviews')->where('quote_id', $quote->id)->orderByDesc('version')->first();
                if ($latest && in_array($latest->state, ['pending', 'approved']) && hash_equals($latest->fingerprint, $hash)) {
                    abort_unless((int) $latest->reviewer_id === (int) $data['reviewer_id'], 409, '当前内容已提交核对；更换核对人前请先撤回。');
                    return ['review_id' => $latest->id, 'reused' => true];
                }
                DB::table('jn_quote_reviews')->where('quote_id', $quote->id)->where('state', 'pending')->update(['state' => 'superseded', 'updated_at' => now()]);
                $version = ($latest->version ?? 0) + 1;
                $html = app(PrintController::class)->quoteVersionHtml($quote->fresh(), $version, $snapshot['materials']);
                $file = $this->savePdf($html, '待核对草稿', $quote->id, $version);
                $review = DB::table('jn_quote_reviews')->insertGetId(['quote_id' => $quote->id, 'version' => $version, 'state' => 'pending',
                    'submitted_by' => $user->id, 'reviewer_id' => $reviewer->id, 'snapshot' => FlowSupport::json($snapshot), 'fingerprint' => $hash,
                    'note' => $data['note'], 'print_html' => $html, 'draft_path' => $file['path'], 'draft_sha256' => $file['sha256'], 'created_at' => now(), 'updated_at' => now()]);
                $this->flow->event('quote', $quote->id, $user, '提交报价核对', ['review_id' => $review, 'version' => $version, 'note' => $data['note'], 'reviewer_id' => $reviewer->id]);
                return ['review_id' => $review, 'reused' => false];
            });
    }
    public function decide(int $id, int $rid, User $user, string $key, array $input): array
    {
        $data = validator($input, ['decision' => 'required|in:approve,reject,withdraw', 'note' => 'required|string|max:2000', 'confirmed' => 'accepted'], [], ['note' => '核对意见', 'confirmed' => '核对确认'])->validate();
        $authorize = function ($quote) use ($rid, $user, $data) {
            $review = DB::table('jn_quote_reviews')->where('quote_id', $quote->id)->where('id', $rid)->first();
            abort_unless($review && ($data['decision'] === 'withdraw' ? $this->manages($quote, $user) :
                (FlowSupport::can($user, '核对报价版本') && ($user->hasRole('Admin') || (int) $review->reviewer_id === (int) $user->id))), 404);
        };
        return $this->flow->mutate('quote', $id, $user, $key, ['action' => 'decide', 'review_id' => $rid, ...$data], $authorize,
            function ($quote) use ($id, $rid, $user, $data) {
                $review = DB::table('jn_quote_reviews')->find($rid);
                abort_unless($review->state === 'pending', 409, '此版本已处理，请刷新查看。');
                $values = ['state' => ['approve' => 'approved', 'reject' => 'rejected', 'withdraw' => 'withdrawn'][$data['decision']],
                    'decision_note' => $data['note'], 'decided_by' => $user->id, 'decided_at' => now(), 'updated_at' => now()];
                if ($data['decision'] === 'approve') {
                    abort_unless(in_array((int) $quote->statu, [1, 2]) && !$quote->is_template, 409, '报价状态已变化，请退回并核对。');
                    $snapshot = FlowSupport::decode($review->snapshot);
                    if ($inquiry = $snapshot['materials']['inquiry']) DB::table('jn_inquiries')->where('id', $inquiry['id'])->lockForUpdate()->first();
                    abort_unless($this->current($review, $quote), 409, '报价或资料已变化，旧版本不能确认，请退回后重新提交。');
                    $this->materials($quote, array_column($snapshot['materials']['files'], 'id'), true);
                    $file = $this->savePdf($review->print_html, '已核对确认', $quote->id, $review->version);
                    $values += ['approved_path' => $file['path'], 'approved_sha256' => $file['sha256']];
                }
                DB::table('jn_quote_reviews')->where('id', $rid)->update($values);
                $this->flow->event('quote', $id, $user, ['approve' => '确认报价版本', 'reject' => '退回报价修改', 'withdraw' => '撤回报价核对'][$data['decision']], ['review_id' => $rid, 'version' => $review->version, 'note' => $data['note']]);
                return ['review_id' => $rid, 'state' => $values['state']];
            });
    }
    public function assertConvertible(Quotes $quote): ?object
    {
        if (!$this->required($quote)) return null;
        $review = DB::table('jn_quote_reviews')->where('quote_id', $quote->id)->orderByDesc('version')->first();
        // Conversion runs inside the quote transaction. Serialize against source uploads as well.
        $inquiryId = DB::table('jn_quote_sources')->where('quote_id', $quote->id)->value('inquiry_id');
        if ($inquiryId) DB::table('jn_inquiries')->where('id', $inquiryId)->lockForUpdate()->first();
        abort_unless($review && $review->state === 'approved' && $this->current($review, $quote), 409, '请先完成当前版本的报价核对，再转为订单。');
        $this->materials($quote, array_column(FlowSupport::decode($review->snapshot)['materials']['files'], 'id'), true);
        return $review;
    }
    private function savePdf(string $html, string $state, int $quote, int $version): array
    {
        $pdf = Pdf::loadHTML(str_replace('JN_REVIEW_STATE_7D85', $state, $html));
        $pdf->render(); \App\Support\ChinesePdfFooter::apply($pdf->getDomPDF());
        $bytes = $pdf->output();
        $path = 'sales-control/quotes/' . $quote . '/' . $version . '/' . Str::uuid() . '.pdf';
        abort_unless(Storage::disk('local')->put($path, $bytes), 500, '报价文件保存失败，请重试。');
        return ['path' => $path, 'sha256' => hash('sha256', $bytes)];
    }
    public function pdf(int $id, int $rid, User $user)
    {
        $quote = Quotes::findOrFail($id); $r = DB::table('jn_quote_reviews')->where('quote_id', $id)->where('id', $rid)->first();
        abort_unless($r && ($this->manages($quote, $user) || ((int) $r->reviewer_id === (int) $user->id && FlowSupport::can($user, '核对报价版本'))), 404);
        $approved = $r->state === 'approved';
        return $this->flow->download($approved ? $r->approved_path : $r->draft_path, $approved ? $r->approved_sha256 : $r->draft_sha256,
            '报价-' . preg_replace('/[^\p{L}\p{N}_-]/u', '-', $quote->code) . '-第' . $r->version . '版-' . ($approved ? '已确认' : '提交时草稿') . '.pdf', 'application/pdf');
    }
    public function sourceFile(int $id, int $rid, int $vid, User $user)
    {
        $quote = Quotes::findOrFail($id); $r = DB::table('jn_quote_reviews')->where('quote_id', $id)->where('id', $rid)->first();
        abort_unless($r && ($this->manages($quote, $user) || ((int) $r->reviewer_id === (int) $user->id && FlowSupport::can($user, '核对报价版本'))), 404);
        abort_unless(in_array($vid, array_column(FlowSupport::decode($r->snapshot)['materials']['files'], 'id')), 404);
        $file = DB::table('jn_file_versions')->find($vid); abort_unless($file, 404);
        return $this->flow->download($file->path, $file->sha256, $file->filename, 'application/octet-stream');
    }
}
