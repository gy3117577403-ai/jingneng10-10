@extends('adminlte::page')

@section('title', __('Inspection - Projets'))

@section('content_header')
    <div class="d-flex justify-content-between align-items-center">
        <h1>{{ __('Inspections - Projets') }}</h1>
        <a class="btn btn-primary" href="{{ route('quality') }}">{{ __('Retour à la qualité') }}</a>
    </div>
@stop

@section('content')
    <x-InfocalloutComponent note="{{ __('Cet écran pilote les inspections via les contrôleurs Inspection (projets, points de contrôle, documents, sessions).') }}" />

    <div
        id="inspection-projects-app"
        data-endpoints='@json($endpoints, JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT | JSON_HEX_TAG)'
        data-can-approve='@json($canApprove)'>
    </div>
@stop

@section('css')
@viteReactRefresh
@vite(['resources/sass/app.scss', 'resources/js/app.js'])
@stop
