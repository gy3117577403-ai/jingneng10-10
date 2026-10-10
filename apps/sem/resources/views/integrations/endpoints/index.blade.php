@extends('adminlte::page')

@section('title', __('Intégrations'))

@section('content_header')
    <h1>
        <a href="{{ route('admin.integrations.index') }}" class="text-muted mr-2" title="{{ __('Intégrations') }}"><i class="fas fa-arrow-left"></i></a>
        {{ __('Intégrations - endpoints') }}
    </h1>
@stop

@section('content')
    @if(session('success'))
        <x-adminlte-alert theme="success" title="{{ __('general_content.success_trans_key') }}">
            {{ session('success') }}
        </x-adminlte-alert>
    @endif

    <div class="mb-3">
        <a href="{{ route('admin.integrations.endpoints.create') }}" class="btn btn-primary">
            <i class="fas fa-plus"></i> {{ __('Nouvel endpoint') }}
        </a>
    </div>

    <x-adminlte-card title="{{ __('Endpoints configurés') }}" theme="primary" theme-mode="outline">
        @if($endpoints->isEmpty())
            <p class="text-muted mb-0">{{ __('Aucun endpoint pour l\'instant.') }}</p>
        @else
            <div class="table-responsive">
                <table class="table table-hover mb-0">
                    <thead>
                        <tr>
                            <th>{{ __('Système') }}</th>
                            <th>{{ __('Nom') }}</th>
                            <th>{{ __('Direction') }}</th>
                            <th>{{ __('Auth') }}</th>
                            <th>{{ __('Actif') }}</th>
                            <th>{{ __('Dernière activité') }}</th>
                            <th class="text-right">{{ __('Actions') }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        @foreach($endpoints as $endpoint)
                            <tr>
                                <td><code>{{ $endpoint->system_code }}</code></td>
                                <td>{{ $endpoint->name }}</td>
                                <td>
                                    @if($endpoint->direction === 'outbound')
                                        <span class="badge badge-info">{{ __('Sortant') }}</span>
                                    @else
                                        <span class="badge badge-warning">{{ __('Entrant') }}</span>
                                    @endif
                                </td>
                                <td><code>{{ $endpoint->auth_method }}</code></td>
                                <td>
                                    @if($endpoint->is_active)
                                        <span class="badge badge-success">{{ __('Oui') }}</span>
                                    @else
                                        <span class="badge badge-secondary">{{ __('Non') }}</span>
                                    @endif
                                </td>
                                <td>
                                    @if($endpoint->last_error_at && (! $endpoint->last_success_at || $endpoint->last_error_at->gt($endpoint->last_success_at)))
                                        <span class="text-danger" title="{{ $endpoint->last_error_message }}">
                                            <i class="fas fa-exclamation-triangle"></i> {{ $endpoint->last_error_at->diffForHumans() }}
                                        </span>
                                    @elseif($endpoint->last_success_at)
                                        <span class="text-success">
                                            <i class="fas fa-check"></i> {{ $endpoint->last_success_at->diffForHumans() }}
                                        </span>
                                    @else
                                        <span class="text-muted">-</span>
                                    @endif
                                </td>
                                <td class="text-right">
                                    <a href="{{ route('admin.integrations.endpoints.deliveries', $endpoint) }}" class="btn btn-sm btn-outline-secondary" title="{{ __('Journal') }}">
                                        <i class="fas fa-list"></i>
                                    </a>
                                    <a href="{{ route('admin.integrations.endpoints.edit', $endpoint) }}" class="btn btn-sm btn-outline-primary" title="{{ __('Éditer') }}">
                                        <i class="fas fa-edit"></i>
                                    </a>
                                    <form method="POST" action="{{ route('admin.integrations.endpoints.destroy', $endpoint) }}" class="d-inline" onsubmit="return confirm('Supprimer cet endpoint ? Toutes ses livraisons seront également effacées.');">
                                        @csrf
                                        @method('DELETE')
                                        <button type="submit" class="btn btn-sm btn-outline-danger" title="{{ __('Supprimer') }}">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </form>
                                </td>
                            </tr>
                        @endforeach
                    </tbody>
                </table>
            </div>
        @endif
    </x-adminlte-card>
@stop
