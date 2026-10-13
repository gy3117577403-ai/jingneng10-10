<?php
namespace App\Services\Quotes;

use App\Models\User;
use App\Models\Companies\{Companies, CompaniesContacts, CompaniesAddresses};
use App\Models\Workflow\Quotes;
use App\Services\SalesControl\FlowSupport;
use Illuminate\Support\Facades\{DB, Cache};
use Illuminate\Support\Str;

/** Customer master data stays in the existing company/contact/address tables. */
class CustomerWorkspace
{
    public function access(User $user): void
    {
        app(QuotationWorkspace::class)->access($user);
        abort_unless(FlowSupport::can($user, 'companies-menu'), 403, '当前账号没有客户资料访问权限。');
    }

    private function customers()
    {
        return Companies::whereIn('statu_customer', [2, 3])->with(['Contacts', 'Addresses']);
    }

    private function quotes(User $user)
    {
        return Quotes::query()->when(!$user->hasRole('Admin'), fn ($q) => $q->where('user_id', $user->id));
    }

    private function editable(User $user, Companies $customer): bool
    {
        return $user->hasRole('Admin') || (int) $customer->user_id === (int) $user->id;
    }

    private function token(Companies $customer): string
    {
        return FlowSupport::hash([$customer->getAttributes(),
            $customer->Contacts()->orderBy('id')->get()->map->getAttributes()->all(),
            $customer->Addresses()->orderBy('id')->get()->map->getAttributes()->all()]);
    }

    private function summary(User $user, Companies $customer): array
    {
        $quotes = $this->quotes($user)->where('companies_id', $customer->id);
        $last = (clone $quotes)->orderByDesc('updated_at')->first(['id', 'label', 'updated_at']);
        $contact = $customer->Contacts->sortByDesc('default')->first();
        return ['id' => (string) $customer->id, 'code' => $customer->code, 'name' => $customer->label,
            'active' => (bool) $customer->active, 'status' => !$customer->active ? '已停用' : ((int) $customer->statu_customer === 3 ? '潜在客户' : '合作客户'),
            'owner' => User::find($customer->user_id)?->name ?? '未指定负责人',
            'contact' => $contact ? trim($contact->first_name . ' ' . $contact->name) : '',
            'phone' => $contact?->mobile ?: $contact?->number ?: '',
            'quoteCount' => (clone $quotes)->count(), 'ongoingCount' => (clone $quotes)->whereIn('statu', [1, 2])->count(),
            'lastQuote' => $last ? ['id' => (string) $last->id, 'title' => $last->label, 'date' => $last->updated_at->format('Y-m-d')] : null,
            'canEdit' => $this->editable($user, $customer), 'canQuote' => (bool) $customer->active];
    }

    public function index(User $user, array $input): array
    {
        $this->access($user); $query = $this->customers();
        $term = mb_substr(trim((string) ($input['q'] ?? '')), 0, 150);
        if ($term !== '') $query->where(fn ($q) => $q->where('label', 'like', "%$term%")->orWhere('code', 'like', "%$term%")
            ->orWhereHas('Contacts', fn ($c) => $c->where('name', 'like', "%$term%")->orWhere('first_name', 'like', "%$term%")
                ->orWhere('mobile', 'like', "%$term%")->orWhere('number', 'like', "%$term%")));
        if (($input['scope'] ?? '') === 'active') $query->where('active', 1);
        if (($input['scope'] ?? '') === 'prospect') $query->where('active', 1)->where('statu_customer', 3);
        if (($input['scope'] ?? '') === 'inactive') $query->where('active', 0);
        $page = $query->orderBy('label')->paginate(20);
        return ['customers' => $page->getCollection()->map(fn ($c) => $this->summary($user, $c))->all(),
            'total' => $page->total(), 'lastPage' => $page->lastPage()];
    }

    public function detail(User $user, int $id): array
    {
        $this->access($user); $customer = $this->customers()->findOrFail($id);
        return [...$this->summary($user, $customer), 'token' => $this->token($customer),
            'editName' => $customer->getRawOriginal('label'), 'individual' => (int) $customer->client_type === 2,
            'comment' => $customer->comment ?? '', 'website' => $customer->website ?? '',
            'customerStatus' => (string) $customer->statu_customer, 'legacyUrl' => route('companies.show', $id),
            'contacts' => $customer->Contacts->map(fn ($c) => ['id' => (string) $c->id, 'first_name' => $c->first_name ?? '',
                'name' => $c->name, 'function' => $c->function ?? '', 'mobile' => $c->mobile ?? '', 'number' => $c->number ?? '',
                'mail' => $c->mail ?? '', 'default' => (bool) $c->default])->values()->all(),
            'addresses' => $customer->Addresses->map(fn ($a) => ['id' => (string) $a->id, 'label' => $a->label,
                'adress' => $a->adress ?? '', 'city' => $a->city ?? '', 'province' => $a->province ?? '', 'country' => $a->country ?? '',
                'zipcode' => $a->zipcode ?? '', 'number' => $a->number ?? '', 'mail' => $a->mail ?? '', 'default' => (bool) $a->default])->values()->all()];
    }

    private function validate(array $input): array
    {
        return validator($input, [
            'name' => 'required|string|max:255', 'comment' => 'nullable|string|max:5000', 'website' => 'nullable|url:http,https|max:255',
            'active' => 'required|boolean', 'customerStatus' => 'required|in:2,3',
            'contacts' => 'present|array|max:50', 'contacts.*.id' => 'required|string|max:80|distinct', 'contacts.*.name' => 'required|string|max:255',
            'contacts.*.first_name' => 'nullable|string|max:255', 'contacts.*.function' => 'nullable|string|max:120',
            'contacts.*.mobile' => 'nullable|string|max:80', 'contacts.*.number' => 'nullable|string|max:80', 'contacts.*.mail' => 'nullable|email|max:255',
            'addresses' => 'present|array|max:50', 'addresses.*.id' => 'required|string|max:80|distinct', 'addresses.*.label' => 'required|string|max:255',
            'addresses.*.adress' => 'required|string|max:255', 'addresses.*.city' => 'nullable|string|max:120',
            'addresses.*.province' => 'nullable|string|max:120', 'addresses.*.country' => 'nullable|string|max:120',
            'addresses.*.zipcode' => 'nullable|string|max:40', 'addresses.*.number' => 'nullable|string|max:80', 'addresses.*.mail' => 'nullable|email|max:255',
        ], ['required' => ':attribute不能为空。', 'email' => ':attribute格式不正确。', 'url' => '网站请填写以 http:// 或 https:// 开头的完整网址。',
            'max' => ':attribute超出允许长度或数量。', 'in' => ':attribute选项无效。'],
            ['name' => '客户名称', 'contacts.*.name' => '联系人姓名', 'contacts.*.mail' => '联系人邮箱',
                'addresses.*.label' => '地址名称', 'addresses.*.adress' => '详细地址'])->validate();
    }

    public function save(User $user, ?int $id, string $key, array $input): array
    {
        $this->access($user);
        validator(['key' => $key], ['key' => 'required|uuid'])->validate();
        return Cache::lock('jn-customer-workspace-write', 30)->block(5, fn () => DB::transaction(function () use ($user, $id, $key, $input) {
            // Serializes normalized duplicate checks and retries across workspace writers.
            User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            $customer = $id ? $this->customers()->lockForUpdate()->findOrFail($id) : null;
            abort_if($customer && !$this->editable($user, $customer), 403, '仅客户负责人或管理员可以维护这份档案。');
            $scope = $id ? 'customer-update' : 'customer-create'; $entity = $id ?? $user->id;
            $fingerprint = FlowSupport::hash([$user->id, $input]);
            $receipt = DB::table('jn_sales_receipts')->where('scope', $scope)->where('entity_id', $entity)->where('request_key', $key)->first();
            if ($receipt) {
                abort_unless(hash_equals($receipt->fingerprint, $fingerprint), 409, '本次请求内容已改变，请重新提交。');
                return $this->detail($user, FlowSupport::decode($receipt->response)['id']);
            }
            if ($customer) abort_unless(hash_equals($this->token($customer), (string) ($input['token'] ?? '')), 409, '客户档案已被更新，填写内容已保留。请重新打开档案后核对修改。');
            $data = $this->validate($input); $name = preg_replace('/\s+/u', ' ', trim($data['name']));
            abort_if($name === '', 422, '客户名称不能为空。');
            $duplicate = Companies::whereRaw('LOWER(TRIM(label)) = ?', [mb_strtolower($name)])->when($id, fn ($q) => $q->where('id', '!=', $id))->first();
            abort_if($duplicate, 422, '已存在同名档案，请从客户资料搜索并核对，避免重复建档。');
            if (!$customer) $customer = Companies::create(['code' => 'JNC-' . Str::upper((string) Str::ulid()), 'label' => $name,
                'client_type' => 1, 'user_id' => $user->id, 'statu_customer' => $data['customerStatus'], 'active' => $data['active']]);
            $customer->update(['label' => $name, 'comment' => $data['comment'] ?? '', 'website' => $data['website'] ?? '',
                'statu_customer' => $data['customerStatus'], 'active' => $data['active']]);
            foreach (['contacts' => ['Contacts', CompaniesContacts::class], 'addresses' => ['Addresses', CompaniesAddresses::class]] as $section => [$relation, $model]) {
                foreach ($data[$section] as $row) {
                    $record = ctype_digit($row['id']) ? $customer->$relation()->whereKey($row['id'])->lockForUpdate()->firstOrFail()
                        : new $model(['companies_id' => $customer->id, 'ordre' => (int) $customer->$relation()->max('ordre') + 1]);
                    $allowed = $section === 'contacts' ? ['name', 'first_name', 'function', 'mobile', 'number', 'mail'] : ['label', 'adress', 'city', 'province', 'country', 'zipcode', 'number', 'mail'];
                    $record->fill(\Illuminate\Support\Arr::only($row, $allowed)); $record->save();
                }
            }
            // Omitted contacts/addresses remain; existing quote references are never removed.
            DB::table('jn_sales_receipts')->insert(['scope' => $scope, 'entity_id' => $entity, 'request_key' => $key, 'actor_id' => $user->id,
                'fingerprint' => $fingerprint, 'response' => FlowSupport::json(['id' => $customer->id]), 'created_at' => now()]);
            app(FlowSupport::class)->event('customer', $customer->id, $user, $id ? '维护客户资料' : '建立客户档案', []);
            return $this->detail($user, $customer->id);
        }));
    }
}
