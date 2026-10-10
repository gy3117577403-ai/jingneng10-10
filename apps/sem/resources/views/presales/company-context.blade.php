@php $inquiries = app(\App\Services\Presales\SalesHandoff::class)->companyInquiries($Companie->id, auth()->user()); @endphp
<section class="jn-sales-context" aria-label="客户售前协同">
    <div class="jn-sales-context-heading"><strong>售前协同</strong><span>近期可访问的询价</span><a class="btn btn-sm btn-primary" href="{{ route('presales.index', ['new' => 1, 'company' => $Companie->id]) }}">为此客户新建询价</a></div>
    @if($inquiries->isNotEmpty())
        <div class="jn-customer-inquiries">@foreach($inquiries as $inquiry)<a href="{{ route('presales.show', $inquiry->id) }}"><span class="ps-kind">{{ $inquiry->kind === 'cabinet' ? '成套' : '钣金' }}</span><strong>{{ $inquiry->title }}</strong><small>{{ $inquiry->expected_date ?: '交期待补充' }}</small></a>@endforeach</div>
    @else
        <p class="mb-0 text-muted">尚无可访问的关联询价，可直接从此客户开始。</p>
    @endif
</section>
