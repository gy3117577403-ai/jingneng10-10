@extends('adminlte::page')

@section('title', '工作台')

@section('content_header')
@stop

@section('content')

  @if($userRoleCount < 1)
  <div class="card">
    <div class="card-body">
        <x-adminlte-alert theme="info" title="{{ __('Info') }}">
          当前账号尚未分配岗位角色，请联系管理员配置可访问的功能。
        </x-adminlte-alert>
    </div>
  </div>
  @endif

  <div
    id="home-dashboard-app"
    data-props="{{ json_encode($reactProps) }}"
  ></div>

@stop

@section('css')@stop

@section('js')
@viteReactRefresh
@vite(['resources/sass/app.scss', 'resources/js/app.js'])
@stop
