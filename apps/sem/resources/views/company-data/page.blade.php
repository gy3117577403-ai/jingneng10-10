@extends('adminlte::page')
@section('title', '公司资料')
@section('content_header')
@stop
@section('js')
    @viteReactRefresh
    @vite(['resources/sass/app.scss', 'resources/js/app.js'])
@stop
@section('content')
    <div id="company-data-app" data-endpoint="{{ route('company-data.index') }}"></div>
@stop
