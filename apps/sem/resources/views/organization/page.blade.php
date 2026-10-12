<!doctype html>
<html lang="zh-CN">
<head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}"><meta name="workspace-user" content="{{ auth()->id() }}">
    <title>组织与成员 · 京能</title>
    @viteReactRefresh
    @vite('resources/js/organization.jsx')
</head>
<body class="org-body">
    <div id="organization-app" data-endpoint="{{ route('organization.index') }}" data-home="{{ url('/') }}" data-documents="{{ route('company-data.page') }}" data-presales="{{ url('presales') }}" data-user="{{ auth()->user()->name }}"></div>
    <noscript>组织工作区需要启用浏览器脚本。</noscript>
</body>
</html>
