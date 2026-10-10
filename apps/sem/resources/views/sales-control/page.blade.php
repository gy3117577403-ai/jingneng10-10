@extends('adminlte::page')
@section('title', $kind === 'quotes' ? '报价核对' : '技术交接')
@section('content_header')
    <h1>{{ $kind === 'quotes' ? '报价核对' : '技术交接' }} · {{ $context['title'] }}</h1>
@stop
@section('js')
    @viteReactRefresh
    @vite(['resources/sass/app.scss', 'resources/js/app.js'])
@stop
@section('content')
    <div class="jn-control-page">
        <a class="btn btn-sm btn-default" href="{{ route('home') }}">返回工作台</a>
        @if($context['record_url'])<a class="btn btn-sm btn-default" href="{{ $context['record_url'] }}">查看原单据</a>@endif
        @include('sales-control.mount', ['mode' => $kind === 'quotes' ? 'quote' : 'order', 'recordId' => $id])
    </div>
@stop
