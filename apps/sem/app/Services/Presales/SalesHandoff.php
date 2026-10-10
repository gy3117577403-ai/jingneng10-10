<?php

namespace App\Services\Presales;

use App\Models\User;
use App\Models\Companies\{Companies, CompaniesContacts, CompaniesAddresses};
use App\Models\Accounting\{AccountingPaymentConditions, AccountingPaymentMethod, AccountingDelivery};
use App\Models\Workflow\Quotes;
use Illuminate\Support\Facades\{DB, Storage};
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class SalesHandoff
{
    public function options(object $record): array
    {
        $company = $record->company_id ? Companies::find($record->company_id) : null;
        return [
            'company' => $company ? ['id' => $company->id, 'label' => $company->label, 'url' => route('companies.show', $company->id)] : null,
            'contacts' => $company ? CompaniesContacts::where('companies_id', $company->id)->get()->map(fn ($c) => ['id' => $c->id, 'label' => trim($c->first_name . ' ' . $c->name)]) : [],
            'addresses' => $company ? CompaniesAddresses::where('companies_id', $company->id)->get(['id', 'label']) : [],
            'conditions' => AccountingPaymentConditions::get(['id', 'label']),
            'methods' => AccountingPaymentMethod::get(['id', 'label']),
            'deliveries' => AccountingDelivery::get(['id', 'label']),
        ];
    }

    /** Called inside the presales receipt transaction with the inquiry already locked. */
    public function create(object $record, User $user, array $input): array
    {
        $data = validator($input, [
            'revision' => 'required|integer|min:1', 'confirmed' => 'accepted',
            'note' => 'required|string|max:1000',
            'version_ids' => 'present|array|max:50', 'version_ids.*' => 'integer|distinct',
        ], [], ['revision' => '询价版本', 'confirmed' => '报价依据确认', 'note' => '确认说明', 'version_ids' => '资料版本'])->validate();
        abort_if((int) $record->revision !== (int) $data['revision'], 409, '询价或资料已更新，请关闭窗口后重新核对报价依据。');
        // One draft per confirmed inquiry revision, even across request IDs or actors.
        $existing = DB::table('jn_quote_sources')->where('inquiry_id', $record->id)->where('revision', $data['revision'])->first();
        if ($existing) {
            abort_unless(Quotes::find($existing->quote_id), 409, '本版本已生成的报价不可用，请联系负责人核对历史。');
            return ['id' => $record->id, 'quote_id' => $existing->quote_id, 'url' => route('quotes.show', $existing->quote_id), 'reused' => true];
        }
        $company = $record->company_id ? Companies::where('active', 1)->whereIn('statu_customer', [2, 3])->find($record->company_id) : null;
        abort_unless($company, 422, '请先在询价信息中关联一个启用的客户档案。');
        abort_if(trim($record->requirements ?? '') === '', 422, '请先补充或确认需求说明，再生成报价草稿。');
        $commercial = validator($input, [
            'companies_contacts_id' => ['required', 'integer', Rule::exists('companies_contacts', 'id')->where('companies_id', $company->id)->whereNull('deleted_at')],
            'companies_addresses_id' => ['required', 'integer', Rule::exists('companies_addresses', 'id')->where('companies_id', $company->id)->whereNull('deleted_at')],
            'accounting_payment_conditions_id' => ['required', 'integer', Rule::exists('accounting_payment_conditions', 'id')],
            'accounting_payment_methods_id' => ['required', 'integer', Rule::exists('accounting_payment_methods', 'id')],
            'accounting_deliveries_id' => ['required', 'integer', Rule::exists('accounting_deliveries', 'id')],
            'validity_date' => 'nullable|date_format:Y-m-d',
        ], [], ['companies_contacts_id' => '客户联系人', 'companies_addresses_id' => '客户地址', 'accounting_payment_conditions_id' => '付款条件',
            'accounting_payment_methods_id' => '付款方式', 'accounting_deliveries_id' => '交付方式', 'validity_date' => '报价有效期'])->validate();
        $versions = []; $documents = [];
        foreach ($data['version_ids'] as $id) {
            $v = app(PresalesService::class)->version($record->id, $id, $user);
            abort_if(in_array($v->document_id, $documents), 422, '同一资料只能选择一个版本。');
            abort_unless((int) DB::table('jn_file_versions')->where('document_id', $v->document_id)->max('version') === (int) $v->version, 409, '资料已有新版本，请重新核对。');
            $path = Storage::disk('local')->path($v->path);
            abort_unless(is_file($path) && hash_equals($v->sha256, hash_file('sha256', $path)), 409, '报价依据原件校验未通过。');
            $documents[] = $v->document_id;
            $versions[] = array_intersect_key((array) $v, array_flip(['id', 'document_id', 'version', 'filename', 'sha256', 'size', 'extension']));
        }
        $snapshot = ['record' => array_intersect_key((array) $record, array_flip(['id', 'code', 'title', 'kind', 'customer_name', 'company_id', 'expected_date', 'requirements', 'revision'])),
            'company' => ['id' => $company->id, 'label' => $company->label], 'versions' => $versions, 'commercial' => $commercial,
            'note' => trim($data['note']), 'confirmed_by' => $user->name, 'confirmed_at' => now()->toIso8601String()];
        $quote = Quotes::create([...$commercial, 'uuid' => (string) Str::uuid(), 'code' => 'JNQ-' . strtoupper((string) Str::ulid()),
            'label' => $record->title, 'companies_id' => $company->id, 'user_id' => $user->id, 'statu' => 1,
            'customer_reference' => $record->code, 'comment' => $record->requirements]);
        DB::table('jn_quote_sources')->insert(['inquiry_id' => $record->id, 'quote_id' => $quote->id, 'revision' => $record->revision,
            'snapshot' => json_encode($snapshot, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR), 'confirmed_by' => $user->id, 'created_at' => now()]);
        // Creating a draft must not notify a customer, approve engineering files, or price a line.
        return ['id' => $record->id, 'quote_id' => $quote->id, 'url' => route('quotes.show', $quote->id), 'reused' => false];
    }

    public function links(int $inquiry): array
    {
        return DB::table('jn_quote_sources as s')->join('quotes as q', 'q.id', '=', 's.quote_id')->where('s.inquiry_id', $inquiry)
            ->whereNull('q.deleted_at')->orderByDesc('s.id')->limit(50)->get(['q.id', 'q.code', 'q.label', 'q.statu', 's.revision', 's.created_at'])
            ->map(fn ($q) => [...(array) $q, 'url' => route('quotes.show', $q->id), 'orders' => DB::table('orders')->where('quotes_id', $q->id)->whereNull('deleted_at')
                ->get(['id', 'code'])->map(fn ($o) => [...(array) $o, 'url' => route('orders.show', $o->id)])])->all();
    }

    public function source(int $quote, User $user): ?array
    {
        $row = DB::table('jn_quote_sources')->where('quote_id', $quote)->first();
        if (!$row) { return null; }
        $record = DB::table('jn_inquiries')->find($row->inquiry_id);
        if (!$record || !app(PresalesService::class)->allowed($user, $record)) { return null; }
        return ['inquiry' => $record, 'snapshot' => json_decode($row->snapshot, true, 512, JSON_THROW_ON_ERROR), 'stale' => (int) $record->revision !== (int) $row->revision];
    }

    public function companyInquiries(int $company, User $user)
    {
        $query = DB::table('jn_inquiries')->where('company_id', $company);
        if (!$user->hasRole('Admin')) {
            $query->where(fn ($q) => $q->where('owner_id', $user->id)->orWhereExists(fn ($m) => $m->selectRaw('1')->from('jn_inquiry_members')->whereColumn('inquiry_id', 'jn_inquiries.id')->where('user_id', $user->id)));
        }
        return $query->orderByDesc('updated_at')->limit(10)->get(['id', 'title', 'kind', 'expected_date']);
    }
}
