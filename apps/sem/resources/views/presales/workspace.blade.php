@extends('adminlte::page')
@section('title', '售前工作台')
@section('content_header')
    <h1>售前工作台</h1>
@stop
@section('content')
    @php
        $workspaceProps = ['base' => route('presales.index'), 'initialId' => $initialId];
    @endphp
    <div id="presales-workspace" data-props='@json($workspaceProps)'></div>
@stop
@section('js')
    @viteReactRefresh
    @vite('resources/js/presales.jsx')
@stop
