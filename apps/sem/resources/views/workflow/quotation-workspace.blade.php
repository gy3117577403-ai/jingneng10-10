<!doctype html>
<html lang="zh-CN">
<head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>京能 · 报价工作台</title>
    @viteReactRefresh
    @vite('resources/js/quotation.jsx')
</head>
<body style="margin:0">
    <div id="quotation-app" data-endpoint="{{ route('quotation-workspace.index') }}" data-home="{{ url('/') }}" data-organization="{{ url('organization') }}" data-presales="{{ url('presales') }}" data-user="{{ auth()->user()->name }}"></div>
    <noscript>报价工作台需要启用浏览器脚本。</noscript>
</body>
</html>
