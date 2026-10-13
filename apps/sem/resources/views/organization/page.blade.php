@extends('adminlte::page')
@section('title', '组织与成员')
@section('classes_body')
    @parent org-body jn-org-page
@stop
@section('content_header')
@stop
@section('js')
    @viteReactRefresh
    @vite(['resources/sass/app.scss', 'resources/js/app.js', 'resources/js/organization.jsx'])
@stop
@section('content')
    <div id="organization-app" data-endpoint="{{ route('organization.index') }}" data-home="{{ url('/') }}" data-documents="{{ route('company-data.page') }}" data-presales="{{ url('presales') }}" data-user="{{ auth()->user()->name }}"></div>
    <noscript>组织工作区需要启用浏览器脚本。</noscript>
@stop
