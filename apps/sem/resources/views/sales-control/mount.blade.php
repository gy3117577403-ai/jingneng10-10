<div class="jn-sales-control" data-mode="{{ $mode }}" data-endpoint="{{ route('sales-control.' . $mode, $recordId) }}" id="{{ $mode === 'quote' ? 'QuoteReview' : 'TechnicalHandoff' }}">
    <p role="status">正在读取{{ $mode === 'quote' ? '报价核对' : '技术交接' }}…</p>
</div>
