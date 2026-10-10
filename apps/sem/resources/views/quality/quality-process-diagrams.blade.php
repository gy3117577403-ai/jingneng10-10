@extends('adminlte::page')

@section('title', __('Cartographie des processus'))

@section('content_header')
    <div class="d-flex justify-content-between align-items-center">
        <h1>{{ __('Cartographie des processus') }}</h1>
        <a class="btn btn-primary" href="{{ route('quality') }}">{{ __('Retour à la qualité') }}</a>
    </div>
@stop

@section('content')
    <div
        id="process-diagram-app"
        data-endpoints='@json($endpoints, JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT | JSON_HEX_TAG)'>
    </div>
@stop

@section('css')
@viteReactRefresh
@vite(['resources/sass/app.scss', 'resources/js/app.js'])
@stop
