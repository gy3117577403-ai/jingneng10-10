<?php
namespace App\Services\Quotes;

use App\Models\User;
use App\Models\Workflow\{Quotes, QuoteLines};
use App\Models\Companies\Companies;
use App\Models\Methods\MethodsUnits;
use App\Models\Accounting\AccountingVat;
use App\Services\Presales\SalesHandoff;
use App\Services\SalesControl\{FlowSupport, QuoteReview};
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/** The workspace edits the existing sales documents; metadata never replaces their lines. */
class QuotationWorkspace
{
    private const MESSAGES = ['required' => ':attribute不能为空。', 'exists' => ':attribute不可用，请重新选择。', 'numeric' => ':attribute必须是数字。',
        'decimal' => ':attribute最多保留三位小数。', 'date_format' => ':attribute请使用年-月-日格式。', 'gt' => ':attribute必须大于零。', 'in' => ':attribute选项无效。'];
    private array $details = [];
    public function __construct(private FlowSupport $flow, private QuoteReview $review) {}
    public function access(User $u): void { abort_unless(FlowSupport::can($u, 'quotes-menu'), 403, '没有报价访问权限。'); }
    private function query(User $u) {
        $this->access($u);
        return Quotes::query()->when(!$u->hasRole('Admin'), fn ($q) => $q->where('user_id', $u->id));
    }
    private function quote(User $u, int $id): Quotes { return $this->query($u)->findOrFail($id); }
    private function meta(int $id): array {
        $row = DB::table('jn_quote_workspaces')->where('quote_id', $id)->first();
        return $row ? ['revision' => $row->revision, ...FlowSupport::decode($row->payload)] : ['revision' => 0, 'type' => '待分类', 'lines' => []];
    }
    private function token(Quotes $q): string {
        return FlowSupport::hash([$this->review->snapshot($q), $this->meta($q->id), $q->statu]);
    }
    private function locked(Quotes $q): bool {
        return !in_array((int) $q->statu, [1, 2]) || $q->QuoteLines->contains(fn ($l) => $l->use_calculated_price)
            || DB::table('jn_quote_reviews')->where('quote_id', $q->id)->where('state', 'pending')->exists()
            || DB::table('jn_quote_reviews')->where('quote_id', $q->id)->where('state', 'approved')->get()->contains(fn ($r) => $this->review->current($r, $q));
    }
    private function line(QuoteLines $l, array $meta): array {
        $m = $meta['lines'][(string) $l->id] ?? [];
        $d = $l->QuoteLineDetails;
        return ['id' => (string) $l->id, 'name' => $l->label, 'drawing' => $m['drawing'] ?? $l->code ?? '',
            'spec' => $m['spec'] ?? implode(' × ', array_filter([$d?->x_size, $d?->y_size, $d?->z_size])),
            'material' => $m['material'] ?? $d?->material ?? '', 'finish' => $m['finish'] ?? $d?->finishing ?? '',
            'qty' => (float) $l->qty, 'price' => (float) $l->selling_price, 'unit' => $l->Unit?->label ?? '',
            'unitId' => $l->methods_units_id, 'vatId' => $l->accounting_vats_id, 'discount' => (float) $l->discount,
            'sourceId' => $m['sourceId'] ?? '', 'sourceQty' => $m['sourceQty'] ?? 0, 'sourcePrice' => $m['sourcePrice'] ?? 0,
            'source' => $m['source'] ?? null, 'checked' => ($m['checked'] ?? false) && ($m['commercial'] ?? null) == $this->commercial($l), 'costs' => $m['costs'] ?? []];
    }
    private function commercial(QuoteLines $l): array {
        return ['qty' => (float) $l->qty, 'price' => (float) $l->selling_price, 'discount' => (float) $l->discount,
            'unit' => (int) $l->methods_units_id, 'vat' => (int) $l->accounting_vats_id];
    }
    public function detail(User $u, int $id): array {
        $q = $this->quote($u, $id); $m = $this->meta($id);
        $q->load(['QuoteLines.Unit', 'QuoteLines.QuoteLineDetails', 'companie']);
        $kind = $m['type'];
        if ($kind === '待分类') {
            $source = DB::table('jn_quote_sources as s')->join('jn_inquiries as i', 'i.id', '=', 's.inquiry_id')->where('s.quote_id', $id)->value('i.kind');
            $kind = ['cabinet' => '成套', 'sheet_metal' => '钣金'][$source ?? ''] ?? '待分类';
        }
        return ['id' => (string) $q->id, 'code' => $q->code, 'title' => $q->label, 'customer' => $q->companie?->label ?? '原客户不可用',
            'companyId' => $q->companies_id, 'owner' => User::find($q->user_id)?->name ?? '未指定', 'updatedAt' => $q->updated_at?->format('Y-m-d H:i'),
            'type' => $kind, 'due' => $q->validity_date ? substr((string) $q->validity_date, 0, 10) : '', 'revision' => (int) $m['revision'],
            'status' => [1 => '草稿', 2 => '已发送', 3 => '已成交', 4 => '未成交', 5 => '已关闭', 6 => '已作废'][(int) $q->statu] ?? '待处理',
            'readOnly' => $this->locked($q), 'note' => $q->comment ?? '', 'token' => $this->token($q),
            'lines' => $q->QuoteLines->filter(fn ($l) => $l->isArticle())->map(fn ($l) => $this->line($l, $m))->values()->all(),
            'presentationCount' => $q->QuoteLines->filter(fn ($l) => !$l->isArticle())->count(),
            'legacyUrl' => route('quotes.show', $id), 'reviewUrl' => route('sales-control.page', ['quotes', $id]),
            'currency' => app('Factory')->curency ?? 'CNY',
            'versions' => DB::table('jn_quote_workspace_versions')->where('quote_id', $id)->orderByDesc('revision')->limit(50)->get(['revision', 'created_at'])->all()];
    }
    public function index(User $u, array $input): array {
        $q = $this->query($u)->with('companie');
        if (!empty($input['companyId'])) $q->where('companies_id', (int) $input['companyId']);
        $this->typeFilter($q, (string) ($input['type'] ?? '全部'));
        if (($input['scope'] ?? '') === 'pending') $q->whereIn('statu', [1, 2]);
        if (($input['scope'] ?? '') === 'reviewed') $q->whereNotIn('statu', [1, 2]);
        // All authorized documents are queried on the server; never silently truncate the library.
        $term = mb_substr(trim((string) ($input['q'] ?? '')), 0, 150);
        if ($term !== '') $q->where(fn ($w) => $w->where('label', 'like', "%$term%")->orWhere('code', 'like', "%$term%")
            ->orWhereHas('companie', fn ($c) => $c->where('label', 'like', "%$term%")));
        $page = $q->orderByDesc('id')->paginate(30);
        return ['quotes' => $page->getCollection()->map(fn ($q) => $this->detail($u, $q->id))->all(), 'total' => $page->total(), 'lastPage' => $page->lastPage()];
    }
    public function history(User $u, array $input): array {
        $this->access($u);
        $allowed = $this->query($u); $this->typeFilter($allowed, (string) ($input['type'] ?? '全部'));
        $q = QuoteLines::query()->articles()->whereIn('quotes_id', $allowed->select('id'))->with(['quote.companie', 'Unit', 'QuoteLineDetails']);
        if (($input['verified'] ?? '') === '1') {
            $path = DB::getDriverName() === 'sqlite' ? "'$.lines.\"' || quote_lines.id || '\".checked'" : "CONCAT('$.lines.\"', quote_lines.id, '\".checked')";
            $q->whereExists(function ($w) use ($path) {
                $w->selectRaw('1')->from('jn_quote_workspaces')->whereColumn('quote_id', 'quote_lines.quotes_id')->whereRaw("json_extract(payload, $path) = true");
                foreach (['qty' => 'qty', 'price' => 'selling_price', 'discount' => 'discount', 'unit' => 'methods_units_id', 'vat' => 'accounting_vats_id'] as $key => $column) {
                    $field = str_replace('.checked', '.commercial.' . $key, $path);
                    $w->whereRaw("json_extract(payload, $field) = quote_lines.$column");
                }
            });
        }
        $term = mb_substr(trim((string) ($input['q'] ?? '')), 0, 150);
        if ($term !== '') $q->where(fn ($w) => $w->where('label', 'like', "%$term%")->orWhere('code', 'like', "%$term%")
            ->orWhereHas('quote', fn ($p) => $p->where('code', 'like', "%$term%")->orWhere('label', 'like', "%$term%")->orWhereHas('companie', fn ($c) => $c->where('label', 'like', "%$term%")))
            ->orWhereHas('QuoteLineDetails', fn ($d) => $d->where('material', 'like', "%$term%"))
            ->orWhereExists(fn ($m) => $m->selectRaw('1')->from('jn_quote_workspaces')->whereColumn('quote_id', 'quote_lines.quotes_id')->where('payload', 'like', "%$term%")));
        $p = $q->orderByDesc('id')->paginate(50);
        return ['lines' => $p->getCollection()->map(function ($l) use ($u) {
            $q = $this->details[$l->quotes_id] ??= $this->detail($u, $l->quotes_id); $line = $this->line($l, $this->meta($l->quotes_id));
            return [...$line, 'type' => $q['type'], 'customer' => $q['customer'], 'companyId' => $q['companyId'], 'project' => $q['title'],
                'quote' => $q['code'], 'date' => $l->created_at->format('Y-m-d'), 'revision' => (string) $q['revision'],
                'result' => $q['status'], 'verified' => $line['checked'], 'sourceToken' => $q['token']];
        })->all(), 'total' => $p->total(), 'lastPage' => $p->lastPage()];
    }
    private function typeFilter($q, string $type): void {
        if (!in_array($type, ['成套', '钣金'])) return;
        $kind = $type === '成套' ? 'cabinet' : 'sheet_metal';
        $q->where(function ($w) use ($type, $kind) {
            $w->whereExists(fn ($m) => $m->selectRaw('1')->from('jn_quote_workspaces')->whereColumn('quote_id', 'quotes.id')->where('payload->type', $type))
                ->orWhere(fn ($legacy) => $legacy->whereNotExists(fn ($m) => $m->selectRaw('1')->from('jn_quote_workspaces')->whereColumn('quote_id', 'quotes.id'))
                    ->whereExists(fn ($s) => $s->selectRaw('1')->from('jn_quote_sources as s')->join('jn_inquiries as i', 'i.id', '=', 's.inquiry_id')->whereColumn('s.quote_id', 'quotes.id')->where('i.kind', $kind)));
        });
    }
    public function options(User $u, array $input): array {
        $this->access($u);
        $companies = Companies::where('active', 1)->whereIn('statu_customer', [2, 3]);
        if (!empty($input['q'])) $companies->where('label', 'like', '%' . mb_substr($input['q'], 0, 100) . '%');
        $company = isset($input['company']) ? (int) $input['company'] : null;
        return [...app(SalesHandoff::class)->options((object) ['company_id' => $company]),
            'canCustomers' => FlowSupport::can($u, 'companies-menu'),
            'companies' => $companies->orderBy('label')->limit(30)->get(['id', 'label']),
            'units' => MethodsUnits::get(['id', 'label']), 'vats' => AccountingVat::get(['id', 'label', 'rate'])];
    }
    public function create(User $u, string $key, array $input): array {
        $this->access($u);
        validator(['key' => $key], ['key' => 'required|uuid'])->validate();
        return DB::transaction(function () use ($u, $key, $input) {
            User::whereKey($u->id)->lockForUpdate()->firstOrFail();
            $hash = FlowSupport::hash($input);
            $old = DB::table('jn_sales_receipts')->where('scope', 'quotation-create')->where('entity_id', $u->id)->where('request_key', $key)->first();
            if ($old) { abort_unless(hash_equals($old->fingerprint, $hash), 409, '请求内容已变化。'); return $this->detail($u, FlowSupport::decode($old->response)['id']); }
            $d = validator($input, ['title' => 'required|string|max:255', 'type' => 'required|in:成套,钣金',
                'companyId' => ['required', 'integer', Rule::exists('companies', 'id')->where('active', 1)->whereIn('statu_customer', [2, 3])->whereNull('deleted_at')],
                'contactId' => ['required', Rule::exists('companies_contacts', 'id')->where('companies_id', $input['companyId'] ?? 0)->whereNull('deleted_at')],
                'addressId' => ['required', Rule::exists('companies_addresses', 'id')->where('companies_id', $input['companyId'] ?? 0)->whereNull('deleted_at')],
                'conditionId' => 'required|exists:accounting_payment_conditions,id', 'methodId' => 'required|exists:accounting_payment_methods,id',
                'deliveryId' => 'required|exists:accounting_deliveries,id', 'due' => 'nullable|date_format:Y-m-d'], self::MESSAGES,
                ['title' => '项目名称', 'type' => '业务类型', 'companyId' => '客户档案', 'contactId' => '联系人', 'addressId' => '客户地址',
                    'conditionId' => '付款条件', 'methodId' => '付款方式', 'deliveryId' => '交付方式', 'due' => '报价有效期'])->validate();
            $q = Quotes::create(['uuid' => (string) Str::uuid(), 'code' => 'JNQ-' . Str::upper((string) Str::ulid()), 'label' => trim($d['title']),
                'companies_id' => $d['companyId'], 'companies_contacts_id' => $d['contactId'], 'companies_addresses_id' => $d['addressId'],
                'accounting_payment_conditions_id' => $d['conditionId'], 'accounting_payment_methods_id' => $d['methodId'], 'accounting_deliveries_id' => $d['deliveryId'],
                'validity_date' => $d['due'] ?? null, 'statu' => 1, 'user_id' => $u->id]);
            $this->storeMeta($u, $q, ['type' => $d['type'], 'lines' => []]);
            DB::table('jn_sales_receipts')->insert(['scope' => 'quotation-create', 'entity_id' => $u->id, 'request_key' => $key, 'actor_id' => $u->id,
                'fingerprint' => $hash, 'response' => FlowSupport::json(['id' => $q->id]), 'created_at' => now()]);
            return $this->detail($u, $q->id);
        });
    }
    private function storeMeta(User $u, Quotes $q, array $m): void {
        $revision = $this->meta($q->id)['revision'] + 1;
        DB::table('jn_quote_workspaces')->updateOrInsert(['quote_id' => $q->id], ['revision' => $revision, 'payload' => FlowSupport::json($m), 'created_at' => now(), 'updated_at' => now()]);
        DB::table('jn_quote_workspace_versions')->insert(['quote_id' => $q->id, 'revision' => $revision, 'actor_id' => $u->id,
            'snapshot' => FlowSupport::json(['document' => $this->review->snapshot($q), 'costs' => $m]), 'created_at' => now()]);
    }
    private function mutable(User $u, Quotes $q, string $token): void {
        $this->quote($u, $q->id);
        abort_if($this->locked($q), 409, '当前报价只读：已进入核对、结束或使用工艺自动计价。请复用为新报价，或到原报价处理。');
        abort_unless(hash_equals($this->token($q), $token), 409, '报价已被其他操作更新。你的输入仍保留，请先重新载入并核对。');
    }
    public function save(User $u, int $id, string $key, array $input): array {
        $this->quote($u, $id);
        return $this->flow->mutate('quote', $id, $u, $key, $input, fn ($q) => $this->quote($u, $q->id), function ($q) use ($u, $input) {
            $this->mutable($u, $q, (string) ($input['token'] ?? ''));
            $d = validator($input, ['title' => 'required|string|max:255', 'type' => 'required|in:成套,钣金,待分类', 'note' => 'nullable|string|max:10000',
                'due' => 'nullable|date_format:Y-m-d', 'lines' => 'present|array|max:200', 'lines.*.id' => 'required|string|max:80|distinct',
                'lines.*.name' => 'required|string|max:255', 'lines.*.qty' => 'required|numeric|decimal:0,3|gt:0|max:1000000',
                'lines.*.price' => 'required|numeric|decimal:0,3|min:0|max:9999999.999', 'lines.*.unitId' => 'required|exists:methods_units,id',
                'lines.*.vatId' => 'required|exists:accounting_vats,id', 'lines.*.spec' => 'nullable|string|max:500', 'lines.*.drawing' => 'nullable|string|max:255',
                'lines.*.material' => 'nullable|string|max:255', 'lines.*.finish' => 'nullable|string|max:255', 'lines.*.checked' => 'required|boolean',
                'lines.*.costs' => 'present|array|max:100', 'lines.*.costs.*.id' => 'required|string|max:80', 'lines.*.costs.*.name' => 'required|string|max:120',
                'lines.*.costs.*.spec' => 'nullable|string|max:255', 'lines.*.costs.*.unit' => 'required|string|max:30',
                'lines.*.costs.*.qty' => 'required|numeric|gt:0|max:1000000', 'lines.*.costs.*.price' => 'present|nullable|numeric|min:0|max:9999999.999',
                'lines.*.costs.*.source' => 'nullable|string|max:2000', 'lines.*.costs.*.checked' => 'required|boolean'], self::MESSAGES,
                ['title' => '项目名称', 'type' => '业务类型', 'due' => '报价有效期', 'lines.*.name' => '产品名称', 'lines.*.qty' => '报价数量',
                    'lines.*.price' => '报价单价', 'lines.*.unitId' => '计量单位', 'lines.*.vatId' => '税率', 'lines.*.costs.*.name' => '成本名称',
                    'lines.*.costs.*.qty' => '成本用量', 'lines.*.costs.*.price' => '成本价格', 'lines.*.costs.*.unit' => '成本单位'])->validate();
            $old = $this->meta($q->id); $mapped = []; $kept = [];
            foreach ($d['lines'] as $i => $row) {
                $existing = ctype_digit($row['id']);
                $line = $existing ? $q->QuoteLines()->whereKey($row['id'])->firstOrFail() : new QuoteLines(['quotes_id' => $q->id, 'ordre' => (int) $q->QuoteLines()->max('ordre') + 1, 'discount' => 0, 'statu' => 1]);
                abort_if($existing && !$line->isArticle(), 422, '不能以产品明细覆盖说明行。');
                $prior = $old['lines'][(string) $line->id] ?? [];
                $costs = $row['costs'];
                abort_if(count(array_unique(array_column($costs, 'id'))) !== count($costs), 422, '同一产品的成本项标识不能重复。');
                foreach ($costs as &$cost) {
                    $cost['source'] = trim($cost['source'] ?? '');
                    if ($cost['price'] === null || $cost['source'] === '') $cost['checked'] = false;
                } unset($cost);
                $checked = $row['checked'] && count($costs) > 0 && collect($costs)->every(fn ($c) => $c['checked']) && $row['price'] > 0;
                $line->fill(['label' => $row['name'], 'qty' => $row['qty'], 'selling_price' => $row['price'], 'methods_units_id' => $row['unitId'], 'accounting_vats_id' => $row['vatId']]);
                $line->save(); $kept[] = $line->id;
                $mapped[(string) $line->id] = [...$prior, 'spec' => $row['spec'] ?? '', 'drawing' => $row['drawing'] ?? '', 'material' => $row['material'] ?? '', 'finish' => $row['finish'] ?? '', 'costs' => $costs, 'checked' => $checked, 'commercial' => $this->commercial($line)];
            }
            foreach ($q->QuoteLines()->get()->filter(fn ($l) => $l->isArticle() && !in_array($l->id, $kept)) as $removed) {
                abort_if($removed->orderLine()->exists() || $removed->Task()->exists() || $removed->SubAssembly()->exists() || $removed->files()->exists(), 422, '关联工艺、附件或订单的明细需到原报价处理，尚未保存。');
                $removed->delete();
            }
            $q->update(['label' => trim($d['title']), 'comment' => $d['note'] ?? '', 'validity_date' => $d['due'] ?? null]);
            $this->storeMeta($u, $q, ['type' => $d['type'], 'lines' => $mapped]);
            $this->flow->event('quote', $q->id, $u, '保存报价及成本依据', ['revision' => $this->meta($q->id)['revision']]);
            return $this->detail($u, $q->id);
        });
    }
    public function reuse(User $u, int $id, string $key, array $input): array {
        $this->quote($u, $id);
        validator($input, ['sourceId' => 'required|integer', 'sourceToken' => 'required|string', 'token' => 'required|string'])->validate();
        $source = QuoteLines::findOrFail($input['sourceId']); $this->quote($u, $source->quotes_id);
        // Stable parent ordering prevents two simultaneous cross-reuses deadlocking.
        return DB::transaction(function () use ($u, $id, $key, $input, $source) {
            Quotes::whereIn('id', [$id, $source->quotes_id])->orderBy('id')->lockForUpdate()->get();
            return $this->flow->mutate('quote', $id, $u, $key, $input, function ($q) use ($u, $source) { $this->quote($u, $q->id); $this->quote($u, $source->quotes_id); }, function ($q) use ($u, $input, $source) {
                $this->mutable($u, $q, $input['token']); $original = $this->quote($u, $source->quotes_id);
                abort_unless(hash_equals($this->token($original), $input['sourceToken']), 409, '历史报价已更新，请重新查询后复用。');
                $source = $source->fresh(); abort_unless($source && $source->isArticle(), 422, '来源明细不可用。');
                abort_if($source->use_calculated_price, 422, '此明细使用工艺自动计价，请从原报价复制完整工艺。');
                $line = app(QuoteLineCopier::class)->copy($source, $q->id, (int) $q->QuoteLines()->max('ordre') + 1, ['statu' => 1, 'delivery_date' => null]);
                $src = $this->line($source, $this->meta($original->id)); $m = $this->meta($q->id); unset($m['revision']);
                $m['lines'][(string) $line->id] = [...$src, 'checked' => false, 'sourceId' => (string) $source->id, 'sourceQty' => $source->qty, 'sourcePrice' => (float) $source->selling_price,
                    'source' => ['quote' => $original->code, 'date' => now()->toDateString(), 'revision' => $this->meta($original->id)['revision'], 'drawing' => $src['drawing'],
                        'line' => array_intersect_key($src, array_flip(['name', 'drawing', 'spec', 'material', 'finish', 'qty', 'price', 'unit', 'discount', 'costs']))],
                    'costs' => array_map(fn ($c) => [...$c, 'checked' => false], $src['costs'])];
                $this->storeMeta($u, $q, $m);
                $this->flow->event('quote', $q->id, $u, '复用历史报价明细', ['source_quote_id' => $original->id, 'source_line_id' => $source->id]);
                return $this->detail($u, $q->id);
            });
        });
    }
    public function version(User $u, int $id, int $revision): array {
        $this->quote($u, $id);
        $v = DB::table('jn_quote_workspace_versions')->where('quote_id', $id)->where('revision', $revision)->first();
        abort_unless($v, 404); return ['revision' => $v->revision, 'date' => $v->created_at, 'snapshot' => FlowSupport::decode($v->snapshot)];
    }
}
