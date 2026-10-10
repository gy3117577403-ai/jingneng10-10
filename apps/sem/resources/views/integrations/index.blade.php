@extends('adminlte::page')

@section('title', __('Intégrations'))

@section('content_header')
    <h1>{{ __('Intégrations') }} <small class="text-muted">{{ __('connecteurs et flux externes') }}</small></h1>
@stop

@section('content')

    @if(session('success'))
        <x-adminlte-alert theme="success" title="{{ __('general_content.success_trans_key') }}" dismissable>
            {{ session('success') }}
        </x-adminlte-alert>
    @endif

    <div class="row">

        {{-- ─────────────────────────── Qonto ─────────────────────────── --}}
        <div class="col-md-6">
            <div class="card card-outline {{ $qonto['connected'] && ! $qonto['expired'] ? 'card-success' : ($qonto['configured'] ? 'card-secondary' : 'card-warning') }}">
                <div class="card-header">
                    <h3 class="card-title">
                        <i class="fas fa-university mr-1"></i> {{ __('Qonto') }}
                    </h3>
                    <div class="card-tools">
                        @if(! $qonto['configured'])
                            <span class="badge badge-warning">{{ __('Non configuré') }}</span>
                        @elseif(! $qonto['connected'])
                            <span class="badge badge-secondary">{{ __('Déconnecté') }}</span>
                        @elseif($qonto['expired'])
                            <span class="badge badge-danger">{{ __('Jeton expiré') }}</span>
                        @else
                            <span class="badge badge-success">{{ __('Connecté') }}</span>
                        @endif
                    </div>
                </div>
                <div class="card-body">
                    <p class="text-muted mb-2">
                        {{ __('Banque - synchronisation des clients (OAuth2, par utilisateur).') }}
                    </p>

                    @if(! $qonto['configured'])
                        <p class="mb-0">
                            <code>QONTO_CLIENT_ID</code> / <code>QONTO_CLIENT_SECRET</code> {{ __('absents du') }} <code>{{ __('.env') }}</code>.
                        </p>
                    @else
                        <dl class="row mb-0">
                            @if($qonto['organization'])
                                <dt class="col-6">{{ __('Organisation') }}</dt>
                                <dd class="col-6"><code>{{ $qonto['organization'] }}</code></dd>
                            @endif

                            <dt class="col-6">{{ __('Clients mappés') }}</dt>
                            <dd class="col-6">{{ $qonto['mapped_clients'] }}</dd>

                            <dt class="col-6">{{ __('À arbitrer') }}</dt>
                            <dd class="col-6">
                                @if($qonto['pending_reviews'] > 0)
                                    <span class="badge badge-warning">{{ $qonto['pending_reviews'] }}</span>
                                @else
                                    <span class="text-muted">-</span>
                                @endif
                            </dd>

                            <dt class="col-6">{{ __('Import bidirectionnel') }}</dt>
                            <dd class="col-6">{{ $qonto['bidirectionnel'] ? __('Oui') : __('Non') }}</dd>

                            <dt class="col-6">{{ __('Dernière synchro') }}</dt>
                            <dd class="col-6">
                                @if($qonto['last_sync_at'])
                                    <span title="{{ $qonto['last_sync_at'] }}">{{ $qonto['last_sync_at']->diffForHumans() }}</span>
                                @else
                                    <span class="text-muted">{{ __('jamais') }}</span>
                                @endif
                            </dd>
                        </dl>
                    @endif
                </div>
                <div class="card-footer text-right">
                    <a href="{{ route('admin.integrations.qonto.index') }}" class="btn btn-sm btn-primary">
                        <i class="fas fa-cog"></i> {{ __('Configurer') }}
                    </a>
                </div>
            </div>
        </div>

        {{-- Carte dédiée Nest2Prod SUPPRIMÉE (refactor 2026-08-12) :
             N2P se gère désormais comme n'importe quel endpoint webhook,
             visible dans la carte générique "Endpoints webhook" ci-dessous.
             Contrairement à Qonto (OAuth utilisateur) ou PDP (env config),
             il n'a plus rien de spécifique qui justifie une carte dédiée. --}}

        {{-- ─────────────────── Endpoints webhook génériques ─────────────────── --}}
        <div class="col-md-6">
            <div class="card card-outline {{ $endpoints['failing'] > 0 ? 'card-danger' : 'card-info' }}">
                <div class="card-header">
                    <h3 class="card-title">
                        <i class="fas fa-exchange-alt mr-1"></i> {{ __('Endpoints webhook') }}
                    </h3>
                    <div class="card-tools">
                        @if($endpoints['failing'] > 0)
                            <span class="badge badge-danger">{{ $endpoints['failing'] }} en erreur</span>
                        @else
                            <span class="badge badge-info">{{ $endpoints['active'] }} {{ __('active') }}</span>
                        @endif
                    </div>
                </div>
                <div class="card-body">
                    <p class="text-muted mb-2">
                        {{ __('Flux partenaires signés (bearer / HMAC), entrants et sortants.') }}
                    </p>
                    <dl class="row mb-0">
                        <dt class="col-6">{{ __('Configurés') }}</dt>
                        <dd class="col-6">{{ $endpoints['total'] }}</dd>

                        <dt class="col-6">{{ __('Sens') }}</dt>
                        <dd class="col-6">{{ $endpoints['inbound'] }} {{ __('Inbound') }} / {{ $endpoints['outbound'] }} {{ __('Outbound') }}</dd>

                        <dt class="col-6">{{ __('Systèmes') }}</dt>
                        <dd class="col-6">
                            @forelse($endpoints['systems'] as $system)
                                <code>{{ $system }}</code>@if(! $loop->last), @endif
                            @empty
                                <span class="text-muted">-</span>
                            @endforelse
                        </dd>
                    </dl>
                </div>
                <div class="card-footer text-right">
                    <a href="{{ route('admin.integrations.endpoints.index') }}" class="btn btn-sm btn-primary">
                        <i class="fas fa-list"></i> {{ __('Gérer les endpoints') }}
                    </a>
                </div>
            </div>
        </div>

        {{-- ─────────────────────────── n8n ─────────────────────────── --}}
        <div class="col-md-6">
            <div class="card card-outline {{ $n8n['failing'] > 0 ? 'card-danger' : ($n8n['active'] > 0 ? 'card-success' : 'card-secondary') }}">
                <div class="card-header">
                    <h3 class="card-title">
                        <i class="fas fa-project-diagram mr-1"></i> {{ __('n8n') }}
                    </h3>
                    <div class="card-tools">
                        @if($n8n['failing'] > 0)
                            <span class="badge badge-danger">{{ $n8n['failing'] }} en erreur</span>
                        @elseif($n8n['active'] > 0)
                            <span class="badge badge-success">{{ $n8n['active'] }} {{ __('active') }}</span>
                        @elseif($n8n['total'] > 0)
                            <span class="badge badge-secondary">{{ __('Inactif') }}</span>
                        @else
                            <span class="badge badge-light">{{ __('Non branché') }}</span>
                        @endif
                    </div>
                </div>
                <div class="card-body">
                    <p class="text-muted mb-2">
                        {{ __('Automation open source — un webhook n8n reçoit les événements
                        ERP (devis, commandes, tâches...) ou déclenche des actions dans
                        l\'ERP (créer une commande, attacher un fichier...).') }}
                    </p>
                    @if($n8n['total'] === 0)
                        <p class="mb-0">
                            <small class="text-muted">
                                {{ __('Sens sortant : l\'ERP appelle l\'URL webhook n8n signée en HMAC.
                                Sens entrant : n8n POST vers') }} <code>/api/integrations/n8n/inbound</code>.
                            </small>
                        </p>
                    @else
                        <dl class="row mb-0">
                            <dt class="col-6">{{ __('Endpoints') }}</dt>
                            <dd class="col-6">{{ $n8n['total'] }}</dd>

                            <dt class="col-6">{{ __('Sens') }}</dt>
                            <dd class="col-6">{{ $n8n['inbound'] }} {{ __('Inbound') }} / {{ $n8n['outbound'] }} {{ __('Outbound') }}</dd>

                            <dt class="col-6">{{ __('Dernier succès') }}</dt>
                            <dd class="col-6">
                                @if($n8n['last_success_at'])
                                    <span title="{{ $n8n['last_success_at'] }}">{{ $n8n['last_success_at']->diffForHumans() }}</span>
                                @else
                                    <span class="text-muted">{{ __('jamais') }}</span>
                                @endif
                            </dd>
                        </dl>
                    @endif
                </div>
                <div class="card-footer text-right">
                    @if($n8n['total'] > 0)
                        <a href="{{ route('admin.integrations.endpoints.index') }}" class="btn btn-sm btn-default">
                            <i class="fas fa-list"></i> {{ __('Voir les endpoints') }}
                        </a>
                    @endif
                    <a href="{{ route('admin.integrations.endpoints.create', ['preset' => 'n8n']) }}" class="btn btn-sm btn-primary">
                        <i class="fas fa-plus"></i> {{ __('Ajouter un endpoint n8n') }}
                    </a>
                </div>
            </div>
        </div>

        {{-- ─────────────────────────── Assistant IA ─────────────────────────── --}}
        <div class="col-md-6">
            <div class="card card-outline {{ $ai['configured'] && $ai['is_active'] ? 'card-success' : ($ai['configured'] ? 'card-secondary' : 'card-warning') }}">
                <div class="card-header">
                    <h3 class="card-title">
                        <i class="fas fa-robot mr-1"></i> {{ __('Assistant IA') }}
                    </h3>
                    <div class="card-tools">
                        @if(! $ai['configured'])
                            <span class="badge badge-warning">{{ __('Non configuré') }}</span>
                        @elseif(! $ai['is_active'])
                            <span class="badge badge-secondary">{{ __('Désactivé') }}</span>
                        @else
                            <span class="badge badge-success">{{ __('Actif') }}</span>
                        @endif
                    </div>
                </div>
                <div class="card-body">
                    <p class="text-muted mb-2">
                        {{ __('Chat ERP en langage naturel — commandes, stock, factures, devis, requêtes ad hoc.') }}
                    </p>
                    <dl class="row mb-0">
                        <dt class="col-6">{{ __('Provider') }}</dt>
                        <dd class="col-6"><code>{{ $ai['provider'] }}</code></dd>

                        <dt class="col-6">{{ __('Modèle') }}</dt>
                        <dd class="col-6">
                            @if($ai['model'])
                                <code>{{ $ai['model'] }}</code>
                            @else
                                <span class="text-muted">-</span>
                            @endif
                        </dd>

                        <dt class="col-6">{{ __('Source de la clé') }}</dt>
                        <dd class="col-6">
                            @if($ai['source'] === 'db')
                                <span class="badge badge-success">{{ __('Base') }}</span>
                            @else
                                <span class="badge badge-warning" title="{{ __('Encore lue depuis le .env — à migrer.') }}">
                                    {{ __('.env (legacy)') }}
                                </span>
                            @endif
                        </dd>
                    </dl>
                </div>
                <div class="card-footer text-right">
                    <a href="{{ route('admin.integrations.ai.index') }}" class="btn btn-sm btn-primary">
                        <i class="fas fa-cog"></i> {{ __('Configurer') }}
                    </a>
                </div>
            </div>
        </div>

        {{-- ──────────────────────── Envoi d'e-mail (SMTP) ─────────────────────── --}}
        <div class="col-md-6">
            <div class="card card-outline {{ $mail['configured'] && $mail['is_active'] ? 'card-success' : ($mail['configured'] ? 'card-secondary' : 'card-warning') }}">
                <div class="card-header">
                    <h3 class="card-title">
                        <i class="fas fa-envelope mr-1"></i> {{ __('Envoi d\'e-mail') }}
                    </h3>
                    <div class="card-tools">
                        @if(! $mail['configured'])
                            <span class="badge badge-warning">{{ __('Non configuré') }}</span>
                        @elseif(! $mail['is_active'])
                            <span class="badge badge-secondary">{{ __('Désactivé') }}</span>
                        @else
                            <span class="badge badge-success">{{ __('Actif') }}</span>
                        @endif
                    </div>
                </div>
                <div class="card-body">
                    <p class="text-muted mb-2">
                        {{ __('Serveur SMTP, expéditeur des documents et journal des envois.') }}
                    </p>
                    <dl class="row mb-0">
                        <dt class="col-6">{{ __('Serveur') }}</dt>
                        <dd class="col-6">
                            @if($mail['host'])
                                <code>{{ $mail['host'] }}</code>
                            @else
                                <span class="text-muted">-</span>
                            @endif
                        </dd>

                        <dt class="col-6">{{ __('Expéditeur') }}</dt>
                        <dd class="col-6">
                            @if($mail['from'])
                                <code>{{ $mail['from'] }}</code>
                            @else
                                <span class="text-muted">-</span>
                            @endif
                        </dd>

                        <dt class="col-6">{{ __('Source') }}</dt>
                        <dd class="col-6">
                            @if($mail['source'] === 'db')
                                <span class="badge badge-success">{{ __('Base') }}</span>
                            @else
                                <span class="badge badge-warning" title="{{ __('Encore lue depuis le .env — à migrer.') }}">{{ __('.env (legacy)') }}</span>
                            @endif
                        </dd>

                        <dt class="col-6">{{ __('Dernières 24 h') }}</dt>
                        <dd class="col-6">
                            <span class="badge badge-success mr-1">{{ $mail['sent_24h'] }} {{ __('Sent') }}</span>
                            @if($mail['failed_24h'] > 0)
                                <span class="badge badge-danger">{{ $mail['failed_24h'] }} échecs</span>
                            @endif
                        </dd>
                    </dl>
                </div>
                <div class="card-footer text-right">
                    <a href="{{ route('admin.email-logs.index') }}" class="btn btn-sm btn-outline-secondary">
                        <i class="fas fa-history"></i> {{ __('Journal') }}
                    </a>
                    <a href="{{ route('admin.integrations.mail.index') }}" class="btn btn-sm btn-primary">
                        <i class="fas fa-cog"></i> {{ __('Configurer') }}
                    </a>
                </div>
            </div>
        </div>

        {{-- ──────────────────── Signature électronique (DocuSign) ──────────────────── --}}
        <div class="col-md-6">
            <div class="card card-outline {{ $esign['configured'] && $esign['is_active'] ? 'card-success' : ($esign['configured'] ? 'card-secondary' : 'card-warning') }}">
                <div class="card-header">
                    <h3 class="card-title">
                        <i class="fas fa-file-signature mr-1"></i> {{ __('esignature.title') }}
                    </h3>
                    <div class="card-tools">
                        @if(! $esign['configured'])
                            <span class="badge badge-warning">{{ __('Non configuré') }}</span>
                        @elseif(! $esign['is_active'])
                            <span class="badge badge-secondary">{{ __('Désactivé') }}</span>
                        @else
                            <span class="badge badge-success">{{ __('Actif') }}</span>
                        @endif
                    </div>
                </div>
                <div class="card-body">
                    <p class="text-muted mb-2">{{ __('esignature.hub_description') }}</p>
                    <dl class="row mb-0">
                        <dt class="col-6">{{ __('esignature.environment') }}</dt>
                        <dd class="col-6">
                            @if($esign['environment'])
                                <code>{{ $esign['environment'] }}</code>
                            @else
                                <span class="text-muted">-</span>
                            @endif
                        </dd>

                        <dt class="col-6">{{ __('esignature.hub_pending') }}</dt>
                        <dd class="col-6">{{ $esign['pending'] }}</dd>

                        <dt class="col-6">{{ __('esignature.hub_completed') }}</dt>
                        <dd class="col-6">{{ $esign['completed'] }}</dd>
                    </dl>
                </div>
                <div class="card-footer text-right">
                    <a href="{{ route('admin.integrations.esignature.index') }}" class="btn btn-sm btn-primary">
                        <i class="fas fa-cog"></i> {{ __('Configurer') }}
                    </a>
                </div>
            </div>
        </div>

        {{-- ──────────────────── PDP (facturation électronique) ──────────────────── --}}
        <div class="col-md-6">
            <div class="card card-outline {{ $pdp['enabled'] ? 'card-success' : 'card-secondary' }}">
                <div class="card-header">
                    <h3 class="card-title">
                        <i class="fas fa-file-invoice mr-1"></i> {{ __('Facturation électronique (PDP)') }}
                    </h3>
                    <div class="card-tools">
                        <span class="badge badge-{{ $pdp['enabled'] ? 'success' : 'secondary' }}">
                            {{ $pdp['enabled'] ? __('Opérationnelle') : __('Indisponible') }}
                        </span>
                    </div>
                </div>
                <div class="card-body">
                    <p class="text-muted mb-2">
                        {{ __('Dépôt des factures auprès de la plateforme de dématérialisation.') }}
                    </p>
                    <dl class="row mb-0">
                        <dt class="col-6">{{ __('Driver actif') }}</dt>
                        <dd class="col-6"><code>{{ $pdp['driver'] }}</code></dd>

                        <dt class="col-6">{{ __('Drivers disponibles') }}</dt>
                        <dd class="col-6">
                            @foreach($pdp['available'] as $key)
                                <code>{{ $key }}</code>@if(! $loop->last), @endif
                            @endforeach
                        </dd>

                        <dt class="col-6">{{ __('Factures déposées') }}</dt>
                        <dd class="col-6">{{ $pdp['total'] }}</dd>

                        @if($pdp['total'] > 0)
                            <dt class="col-6">{{ __('Par statut') }}</dt>
                            <dd class="col-6">
                                @foreach($pdp['counts'] as $status => $count)
                                    <span class="badge badge-{{ in_array($status, ['rejected', 'refused'], true) ? 'danger' : 'light' }} mr-1">
                                        {{ $status }} : {{ $count }}
                                    </span>
                                @endforeach
                            </dd>
                        @endif
                    </dl>
                </div>
                <div class="card-footer text-muted">
                    <small>
                        {{ __('Configurée par') }} <code>PDP_DRIVER</code> {{ __('dans le') }} <code>{{ __('.env') }}</code> {{ __('- le driver') }}
                        <code>{{ __('qonto') }}</code> {{ __('réutilise la connexion Qonto ci-dessus.') }}
                    </small>
                </div>
            </div>
        </div>

    </div>
@stop
