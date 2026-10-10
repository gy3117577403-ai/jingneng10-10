import { confirmAction } from '../ui/confirmAction';
import { translateUiText } from '../lib/i18n.js';
import React, { useEffect, useMemo, useState } from 'react';

function getCsrf() {
    return document.querySelector('meta[name="csrf-token"]')?.content ?? '';
}

const STATUS_CONFIG = {
    success: { label: translateUiText("OK"),      icon: 'fas fa-check-circle',        badge: 'badge-success' },
    warning: { label: translateUiText("Alerte"),  icon: 'fas fa-exclamation-triangle', badge: 'badge-warning' },
    danger:  { label: translateUiText("Rupture"), icon: 'fas fa-times-circle',         badge: 'badge-danger'  },
};

function StatusBadge({ color }) {
    const cfg = STATUS_CONFIG[color] ?? STATUS_CONFIG.danger;
    return (
        <span className={`badge ${cfg.badge}`} style={{ fontSize: '0.8em', whiteSpace: 'nowrap' }}>
            <i className={`${cfg.icon} mr-1`} />
            {cfg.label}
        </span>
    );
}

function TaskBreakdown({ tasks, taskUrlBase }) {
    if (!tasks.length) return null;
    return (
        <tr>
            <td colSpan={7} className="p-0 bg-light">
                <table className="table table-sm mb-0" style={{ background: '#fafafa' }}>
                    <thead>
                        <tr>
                            <th style={{ width: '2rem' }} />
                            <th>{translateUiText("Tâche")}</th>
                            <th>{translateUiText("Commande")}</th>
                            <th>{translateUiText("Échéance")}</th>
                            <th className="text-right">{translateUiText("Demandé")}</th>
                            <th className="text-right">{translateUiText("Réservé")}</th>
                            <th className="text-right">{translateUiText("Manque")}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tasks.map((t) => (
                            <tr key={t.task_id}>
                                <td />
                                <td>
                                    <a href={`${taskUrlBase}/order/0/show/${t.task_id}`} target="_blank" rel="noreferrer">
                                        {t.task_code || `#${t.task_id}`}
                                    </a>
                                    <div className="text-muted small">{t.task_label}</div>
                                </td>
                                <td>{t.order_code || <span className="text-muted">—</span>}</td>
                                <td>{t.end_date || <span className="text-muted">—</span>}</td>
                                <td className="text-right">{t.requested}</td>
                                <td className="text-right">{t.reserved}</td>
                                <td className="text-right">
                                    {t.missing > 0
                                        ? <span className="badge badge-danger">{t.missing}</span>
                                        : <span className="text-muted">0</span>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </td>
        </tr>
    );
}

function ProductRow({ product, expanded, onToggle, endpoints }) {
    const [ordering, setOrdering] = useState(false);
    const [error, setError] = useState(null);

    const canExpand = product.purchased && product.reservation_breakdown.length > 0;

    async function createOrder() {
        if (!await confirmAction(translateUiText("Créer une commande interne pour \":v0\" (qté : :v1) ?", { v0: (product.label), v1: (product.qty_need) }))) return;
        setOrdering(true);
        setError(null);
        try {
            const res = await fetch(endpoints.store_order, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'X-CSRF-TOKEN': getCsrf(),
                },
                body: JSON.stringify({ product_id: product.id, qty: product.qty_need }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? translateUiText("Erreur serveur"));
            window.location.href = data.redirect_url;
        } catch (e) {
            setError(e.message);
            setOrdering(false);
        }
    }

    return (
        <>
            <tr>
                <td className="text-center align-middle" style={{ width: '2rem' }}>
                    {canExpand ? (
                        <button className="btn btn-xs btn-link p-0" onClick={onToggle} title={translateUiText("Voir la répartition par tâche")}>
                            <i className={`fas fa-chevron-${expanded ? 'down' : 'right'}`} />
                        </button>
                    ) : null}
                </td>
                <td className="align-middle">
                    <a href={product.product_url} className="font-weight-bold text-dark">{product.label}</a>
                    {product.code && <div className="text-muted small">{product.code}</div>}
                </td>
                <td className="text-center align-middle"><StatusBadge color={product.status_color} /></td>
                <td className="align-middle">
                    <span><strong>{product.total_stock_move}</strong>
                        <span className="text-muted mx-1">/</span>
                        <strong className={product.status_color === 'danger' ? 'text-danger' : ''}>{product.qty_need}</strong>
                    </span>
                    {(product.undelivered_qty > 0 || product.task_qty > 0) && (
                        <div className="text-muted small">{translateUiText("OF :")} {product.undelivered_qty} {translateUiText("· Tâches :")} {product.task_qty}</div>
                    )}
                </td>
                <td className="align-middle text-right">
                    {product.reserved_total > 0 ? (
                        <>
                            <div>
                                <span className="badge badge-primary">{translateUiText("Réservé")} {product.reserved_total}</span>
                            </div>
                            <div className="text-muted small mt-1">
                                {translateUiText("Dispo")} <strong className={product.available_qty < 0 ? 'text-danger' : ''}>{product.available_qty}</strong>
                                {product.missing_total > 0 && (
                                    <> · <span className="text-danger">{translateUiText("Manque")} {product.missing_total}</span></>
                                )}
                            </div>
                        </>
                    ) : (
                        <span className="text-muted small">—</span>
                    )}
                </td>
                <td className="align-middle">
                    {product.locations.length === 0
                        ? <span className="text-muted">—</span>
                        : (
                            <div className="d-flex flex-wrap" style={{ gap: '4px' }}>
                                {product.locations.map((loc) => (
                                    <a key={loc.id} href={loc.url}
                                       className={`btn btn-xs btn-${loc.color}`}
                                       title={translateUiText("Qté : :v0 (min : :v1)", { v0: (loc.current_stock), v1: (loc.mini_qty) })}>
                                        {loc.code}
                                        <span className="ml-1 badge badge-light text-dark">{loc.current_stock}</span>
                                    </a>
                                ))}
                            </div>
                        )}
                </td>
                <td className="align-middle text-center">
                    <a href={product.product_url} className="btn btn-xs btn-info mr-1" title={translateUiText("Voir le produit")}>
                        <i className="fas fa-eye" />
                    </a>
                    {product.qty_need > 0 && (
                        <button className="btn btn-xs btn-primary" onClick={createOrder} disabled={ordering}
                                title={translateUiText("Créer une commande interne")}>
                            <i className={`fas ${ordering ? 'fa-spinner fa-spin' : 'fa-folder-plus'}`} />
                        </button>
                    )}
                    {error && <div className="text-danger mt-1"><small>{error}</small></div>}
                </td>
            </tr>
            {expanded && canExpand && <TaskBreakdown tasks={product.reservation_breakdown} taskUrlBase={endpoints.task} />}
        </>
    );
}

export default function StockShortagesApp() {
    const [data, setData]       = useState(null);
    const [error, setError]     = useState(null);
    const [expanded, setExpanded] = useState({});
    const [statusFilter, setStatusFilter] = useState('all'); // all|success|warning|danger
    const [typeFilter, setTypeFilter]     = useState('all'); // all|purchased|manufactured
    const [search, setSearch]   = useState('');

    useEffect(() => {
        let cancelled = false;
        const el = document.getElementById('stock-shortages-app');
        const url = JSON.parse(el?.dataset?.endpoints ?? '{}').shortages;
        fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .then((json) => { if (!cancelled) setData(json); })
            .catch((e) => { if (!cancelled) setError(e.message); });
        return () => { cancelled = true; };
    }, []);

    const filtered = useMemo(() => {
        if (!data) return [];
        const q = search.trim().toLowerCase();
        return data.products.filter((p) => {
            if (statusFilter !== 'all' && p.status_color !== statusFilter) return false;
            if (typeFilter === 'purchased' && !p.purchased) return false;
            if (typeFilter === 'manufactured' && p.purchased) return false;
            if (q && !p.label.toLowerCase().includes(q) && !(p.code || '').toLowerCase().includes(q)) return false;
            return true;
        });
    }, [data, statusFilter, typeFilter, search]);

    if (error)  return <div className="alert alert-danger">{translateUiText("Erreur :")} {error}</div>;
    if (!data)  return <div className="text-muted"><i className="fas fa-spinner fa-spin mr-1" /> Chargement...</div>;

    const t = data.totals;

    return (
        <>
            <div className="row mb-3">
                <div className="col-md-3">
                    <div className="small-box bg-success">
                        <div className="inner"><h4>{t.ok_count}</h4><p>{translateUiText("Stock OK")}</p></div>
                        <div className="icon"><i className="fas fa-check-circle" /></div>
                    </div>
                </div>
                <div className="col-md-3">
                    <div className="small-box bg-warning">
                        <div className="inner"><h4>{t.warning_count}</h4><p>{translateUiText("Seuil / alerte")}</p></div>
                        <div className="icon"><i className="fas fa-exclamation-triangle" /></div>
                    </div>
                </div>
                <div className="col-md-3">
                    <div className="small-box bg-danger">
                        <div className="inner"><h4>{t.danger_count}</h4><p>{translateUiText("Rupture")}</p></div>
                        <div className="icon"><i className="fas fa-times-circle" /></div>
                    </div>
                </div>
                <div className="col-md-3">
                    <div className="small-box bg-info">
                        <div className="inner">
                            <h4>{t.missing_qty}</h4>
                            <p>{translateUiText("Qté manquante (")}{t.shortage_tasks} {translateUiText("tâches)")}</p>
                        </div>
                        <div className="icon"><i className="fas fa-tasks" /></div>
                    </div>
                </div>
            </div>

            <div className="card">
                <div className="card-header">
                    <div className="d-flex flex-wrap align-items-center" style={{ gap: '0.75rem' }}>
                        <div className="btn-group btn-group-sm" role="group">
                            {['all', 'success', 'warning', 'danger'].map((s) => (
                                <button key={s} type="button"
                                        className={`btn ${statusFilter === s ? 'btn-primary' : 'btn-outline-primary'}`}
                                        onClick={() => setStatusFilter(s)}>
                                    {s === 'all' ? translateUiText("Tous") : STATUS_CONFIG[s].label}
                                </button>
                            ))}
                        </div>
                        <div className="btn-group btn-group-sm" role="group">
                            <button type="button"
                                    className={`btn ${typeFilter === 'all' ? 'btn-secondary' : 'btn-outline-secondary'}`}
                                    onClick={() => setTypeFilter('all')}>{translateUiText("Tous produits")}</button>
                            <button type="button"
                                    className={`btn ${typeFilter === 'purchased' ? 'btn-secondary' : 'btn-outline-secondary'}`}
                                    onClick={() => setTypeFilter('purchased')}>{translateUiText("Achetés")}</button>
                            <button type="button"
                                    className={`btn ${typeFilter === 'manufactured' ? 'btn-secondary' : 'btn-outline-secondary'}`}
                                    onClick={() => setTypeFilter('manufactured')}>{translateUiText("Fabriqués")}</button>
                        </div>
                        <input type="search" className="form-control form-control-sm" placeholder={translateUiText("Recherche...")}
                               value={search} onChange={(e) => setSearch(e.target.value)}
                               style={{ maxWidth: '220px' }} />
                        <span className="text-muted small ml-auto">{filtered.length} / {t.total_products} {translateUiText("produits")}</span>
                    </div>
                </div>
                <div className="card-body p-0 table-responsive">
                    <table className="table table-hover mb-0">
                        <thead>
                            <tr>
                                <th style={{ width: '2rem' }} />
                                <th>{translateUiText("Produit")}</th>
                                <th className="text-center">{translateUiText("Statut")}</th>
                                <th>{translateUiText("Stock / Besoin")}</th>
                                <th className="text-right">{translateUiText("Réservé / Dispo")}</th>
                                <th>{translateUiText("Emplacements")}</th>
                                <th className="text-center">{translateUiText("Actions")}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0
                                ? <tr><td colSpan={7} className="text-center text-muted py-3">{translateUiText("Aucun produit ne correspond au filtre.")}</td></tr>
                                : filtered.map((p) => (
                                    <ProductRow key={p.id} product={p} endpoints={data.endpoints}
                                                expanded={!!expanded[p.id]}
                                                onToggle={() => setExpanded((e) => ({ ...e, [p.id]: !e[p.id] }))} />
                                ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </>
    );
}
