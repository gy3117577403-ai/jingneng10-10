@extends('adminlte::page')

@section('title', __('Assistant IA'))

@section('content_header')
    <h1>
        <i class="fas fa-robot mr-1"></i> {{ __('Assistant IA') }}
        <small class="text-muted">{{ __('provider, clé API et modèle') }}</small>
    </h1>
@stop

@section('content')

    @if(session('success'))
        <x-adminlte-alert theme="success" dismissable>{{ session('success') }}</x-adminlte-alert>
    @endif

    @if($errors->any())
        <x-adminlte-alert theme="danger" dismissable>
            <ul class="mb-0">
                @foreach($errors->all() as $error)
                    <li>{{ $error }}</li>
                @endforeach
            </ul>
        </x-adminlte-alert>
    @endif

    <div class="row">
        <div class="col-lg-8">
            <div class="card card-outline card-primary">
                <div class="card-header">
                    <h3 class="card-title">{{ __('Configuration') }}</h3>
                    <div class="card-tools">
                        @if($source === 'db')
                            <span class="badge badge-success" title="{{ __('Lue depuis la base — modifiable ici.') }}">{{ __('DB') }}</span>
                        @else
                            <span class="badge badge-warning" title="{{ __('Lue depuis le fichier .env — cliquez sur « Importer depuis .env » pour basculer.') }}">
                                {{ __('.env') }}
                            </span>
                        @endif
                        @if($has_key)
                            <span class="badge badge-info ml-1">{{ __('Clé configurée') }}</span>
                        @elseif(! $providers[$active]['key_required'])
                            <span class="badge badge-secondary ml-1" title="{{ __('Fonctionne sans clé, avec un débit fortement limité.') }}">{{ __('Accès anonyme') }}</span>
                        @else
                            <span class="badge badge-danger ml-1">{{ __('Clé manquante') }}</span>
                        @endif
                    </div>
                </div>

                <form method="POST" action="{{ route('admin.integrations.ai.update') }}">
                    @csrf
                    @method('PUT')

                    <div class="card-body">
                        <div class="form-group">
                            <label for="provider">{{ __('Provider') }}</label>
                            <select id="provider" name="provider" class="form-control" required>
                                @foreach($providers as $key => $info)
                                    <option value="{{ $key }}"
                                            data-default-model="{{ $info['default_model'] }}"
                                            data-base-url="{{ $info['base_url'] }}"
                                            @if(! $info['enabled']) disabled @endif
                                            @selected(($setting->provider ?? 'claude') === $key)>
                                        {{ $info['label'] }}
                                        @if(! $info['enabled']) — prochainement @endif
                                    </option>
                                @endforeach
                            </select>
                            <small class="form-text text-muted">
                                <strong>{{ __('OVHcloud AI Endpoints') }}</strong> {{ __(': modèles open source hébergés en France
                                (données hors des États-Unis). Choisissez un modèle marqué') }}
                                <em>{{ __('Function Calling') }}</em> {{ __('au catalogue OVH, sinon l\'assistant ne peut pas interroger l\'ERP.
                                Changer de provider sans saisir de clé efface la clé précédente.') }}
                            </small>
                        </div>

                        <div class="form-group">
                            <label for="api_key">
                                Clé API
                                @if($has_key)
                                    <small class="text-success">{{ __('(déjà enregistrée — laissez vide pour ne pas changer)') }}</small>
                                @endif
                            </label>
                            <input type="password"
                                   id="api_key"
                                   name="api_key"
                                   class="form-control"
                                   autocomplete="off"
                                   placeholder="{{ $has_key ? '••••••••••••••••' : ($active === 'ovh' ? 'Jeton AI Endpoints (facultatif)' : 'sk-ant-...') }}">
                            <small class="form-text text-muted">
                                {{ __('Chiffrée au repos avec la clé') }} <code>APP_KEY</code> {{ __('de Laravel.
                                Ne sera jamais renvoyée en clair dans une réponse HTTP.') }}
                            </small>
                        </div>

                        <div class="row">
                            <div class="col-md-6">
                                <div class="form-group">
                                    <label for="model">{{ __('Modèle') }}</label>
                                    <input type="text"
                                           id="model"
                                           name="model"
                                           class="form-control"
                                           value="{{ old('model', $setting->model ?? $default_model) }}"
                                           placeholder="{{ $providers[$active]['default_model'] }}">
                                </div>
                            </div>

                            <div class="col-md-3">
                                <div class="form-group">
                                    <label for="max_tokens">{{ __('Max tokens') }}</label>
                                    <input type="number"
                                           id="max_tokens"
                                           name="max_tokens"
                                           class="form-control"
                                           min="256" max="8192"
                                           value="{{ old('max_tokens', $setting->max_tokens ?? 2048) }}">
                                </div>
                            </div>

                            <div class="col-md-3">
                                <div class="form-group">
                                    <label for="timeout_seconds">{{ __('Timeout (s)') }}</label>
                                    <input type="number"
                                           id="timeout_seconds"
                                           name="timeout_seconds"
                                           class="form-control"
                                           min="5" max="300"
                                           value="{{ old('timeout_seconds', $setting->timeout_seconds ?? 60) }}">
                                </div>
                            </div>
                        </div>

                        <div class="form-group">
                            <label for="base_url">{{ __('Base URL') }} <small class="text-muted">{{ __('(laissez vide pour l\'URL officielle du provider)') }}</small></label>
                            <input type="url"
                                   id="base_url"
                                   name="base_url"
                                   class="form-control"
                                   value="{{ old('base_url', $setting->base_url ?? '') }}"
                                   placeholder="{{ $providers[$active]['base_url'] }}">
                        </div>

                        <div class="custom-control custom-switch">
                            <input type="hidden" name="is_active" value="0">
                            <input type="checkbox"
                                   id="is_active"
                                   name="is_active"
                                   value="1"
                                   class="custom-control-input"
                                   @checked(old('is_active', $setting->is_active ?? true))>
                            <label class="custom-control-label" for="is_active">{{ __('Configuration active') }}</label>
                        </div>
                    </div>

                    <div class="card-footer d-flex justify-content-between align-items-center">
                        <div>
                            @if($source === 'env' && $env_key_set)
                                <button type="submit"
                                        form="import-env-form"
                                        class="btn btn-outline-warning">
                                    <i class="fas fa-file-import"></i> {{ __('Importer depuis .env') }}
                                </button>
                            @endif

                            <button type="button" id="btn-test" class="btn btn-outline-info">
                                <i class="fas fa-plug"></i> {{ __('Tester la connexion') }}
                            </button>
                        </div>

                        <button type="submit" class="btn btn-primary">
                            <i class="fas fa-save"></i> {{ __('Enregistrer') }}
                        </button>
                    </div>
                </form>
            </div>

            {{-- Formulaire séparé pour l'import (bouton ci-dessus le déclenche) --}}
            @if($source === 'env' && $env_key_set)
                <form id="import-env-form"
                      method="POST"
                      action="{{ route('admin.integrations.ai.import-env') }}"
                      class="d-none">
                    @csrf
                </form>
            @endif
        </div>

        <div class="col-lg-4">
            <div class="card card-outline card-info">
                <div class="card-header">
                    <h3 class="card-title">{{ __('Où se sert la config ?') }}</h3>
                </div>
                <div class="card-body">
                    <p class="mb-2">{{ __('Ce provider est utilisé par :') }}</p>
                    <ul class="mb-3">
                        <li><strong>{{ __('ChatWidget') }}</strong> {{ __('(bulle en bas à droite) — assistant ERP.') }}</li>
                        <li><strong>{{ __('get_daily_journal') }}</strong> {{ __('— génération du journal.') }}</li>
                        <li><strong>{{ __('UniversalQueryTool') }}</strong> {{ __('— requêtes ad hoc (top clients, retards…).') }}</li>
                    </ul>
                    <p class="mb-2 text-muted">
                        {{ __('La modification est prise en compte au bout de') }} <strong>{{ __('60 secondes') }}</strong>
                        {{ __('(cache interne), ou immédiatement après un') }} <em>{{ __('Enregistrer') }}</em>.
                    </p>
                </div>
            </div>

            <div id="test-result" class="mt-3"></div>
        </div>
    </div>
@stop

@push('js')
<script>
(function () {
    const providerEl = document.getElementById('provider');
    providerEl?.addEventListener('change', () => {
        const opt = providerEl.selectedOptions[0];
        document.getElementById('model').placeholder    = opt.dataset.defaultModel || '';
        document.getElementById('base_url').placeholder = opt.dataset.baseUrl || '';
    });

    const btn      = document.getElementById('btn-test');
    const resultEl = document.getElementById('test-result');
    if (! btn) return;

    btn.addEventListener('click', async () => {
        btn.disabled = true;
        const original = btn.innerHTML;
        btn.innerHTML  = '<i class="fas fa-spinner fa-spin"></i> Test en cours…';
        resultEl.innerHTML = '';

        try {
            const res = await fetch(@json(route('admin.integrations.ai.test')), {
                method:  'POST',
                headers: {
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').content,
                    'Accept':       'application/json',
                },
            });
            const data = await res.json();

            const theme = data.ok ? 'success' : 'danger';
            const icon  = data.ok ? 'check-circle' : 'times-circle';
            const esc   = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
            const parts = [];
            parts.push(`<strong>${esc(data.message)}</strong>`);
            if (data.ok) {
                if (data.model)  parts.push(`Modèle : <code>${esc(data.model)}</code>`);
                if (data.reply)  parts.push(`Réponse : <em>${esc(data.reply)}</em>`);
                if (data.source) parts.push(`Source : <code>${data.source}</code>`);
            } else if (Array.isArray(data.models) && data.models.length) {
                parts.push(`Modèles disponibles : ${data.models.map((m) => `<code>${esc(m)}</code>`).join(', ')}`);
            }

            resultEl.innerHTML = `
                <div class="alert alert-${theme}">
                    <i class="fas fa-${icon}"></i>
                    ${parts.join(' — ')}
                </div>
            `;
        } catch (e) {
            resultEl.innerHTML = `<div class="alert alert-danger">Erreur réseau : ${e.message}</div>`;
        } finally {
            btn.disabled = false;
            btn.innerHTML = original;
        }
    });
})();
</script>
@endpush
