@php
    $source = app(\App\Services\Presales\SalesHandoff::class)->source($quoteId, auth()->user());
@endphp
@if($source)
    @php $basis = $source['snapshot']; @endphp
    <section class="jn-sales-context" aria-label="售前来源">
        <div class="jn-sales-context-heading">
            <div><small>售前来源</small><a href="{{ route('presales.show', $source['inquiry']->id) }}">{{ $basis['record']['title'] }}</a><span class="ps-kind">{{ $basis['record']['kind'] === 'cabinet' ? '成套' : '钣金' }}</span></div>
            <span>依据：询价第 {{ $basis['record']['revision'] }} 版</span>
            @if($source['stale'])<span class="jn-source-warning">询价已有更新，当前报价依据保持原版</span>@endif
        </div>
        <details class="jn-source-summary">
            <summary>查看已确认需求与原件（{{ count($basis['versions']) }} 份）</summary>
            <dl><div><dt>客户档案</dt><dd>{{ $basis['company']['label'] }}</dd></div><div><dt>期望交期</dt><dd>{{ $basis['record']['expected_date'] ?: '待补充' }}</dd></div></dl>
            <p class="ps-prewrap">{{ $basis['record']['requirements'] }}</p>
            <p>{{ $basis['confirmed_by'] }} · {{ \Carbon\Carbon::parse($basis['confirmed_at'])->timezone('Asia/Shanghai')->format('Y年m月d日 H:i') }}<br>{{ $basis['note'] }}</p>
            @foreach($basis['versions'] as $file)
                <a class="jn-source-file" href="{{ url(app()->getLocale() . '/presales/api/inquiries/' . $source['inquiry']->id . '/versions/' . $file['id'] . '/download') }}">{{ $file['filename'] }} · 第 {{ $file['version'] }} 版 · 下载原件</a>
            @endforeach
        </details>
    </section>
@endif
