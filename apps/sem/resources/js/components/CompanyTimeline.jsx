import { translateUiText, uiLocale } from '../lib/i18n.js';
import React, { useState, useEffect } from 'react';

// ---------------------------------------------------------------------------
// Config per document type
// ---------------------------------------------------------------------------
const TYPE_CONFIG = {
    lead: {
        label:   translateUiText("Lead"),
        color:   '#17a2b8',
        bg:      '#e8f7fa',
        icon:    'fas fa-bullseye',
        statuses: {
            1: { label: translateUiText("Nouveau"),      badge: 'badge-info' },
            2: { label: translateUiText("Assigné"),      badge: 'badge-warning' },
            3: { label: translateUiText("En cours"),     badge: 'badge-primary' },
            4: { label: translateUiText("Converti"),     badge: 'badge-success' },
            5: { label: translateUiText("Perdu"),        badge: 'badge-danger' },
        },
    },
    quote: {
        label:   translateUiText("Devis"),
        color:   '#007bff',
        bg:      '#e8f0fe',
        icon:    'fas fa-file-alt',
        statuses: {
            1: { label: translateUiText("Brouillon"),    badge: 'badge-secondary' },
            2: { label: translateUiText("Envoyé"),       badge: 'badge-info' },
            3: { label: translateUiText("En révision"),  badge: 'badge-warning' },
            4: { label: translateUiText("Accepté"),      badge: 'badge-success' },
            5: { label: translateUiText("Refusé"),       badge: 'badge-danger' },
            6: { label: translateUiText("Expiré"),       badge: 'badge-dark' },
        },
    },
    order: {
        label:   translateUiText("Commande"),
        color:   '#fd7e14',
        bg:      '#fff3e0',
        icon:    'fas fa-shopping-cart',
        statuses: {
            1: { label: translateUiText("Nouvelle"),     badge: 'badge-info' },
            2: { label: translateUiText("En cours"),     badge: 'badge-primary' },
            3: { label: translateUiText("Terminée"),     badge: 'badge-success' },
            4: { label: translateUiText("Annulée"),      badge: 'badge-danger' },
        },
    },
    delivery: {
        label:   translateUiText("Bon de livraison"),
        color:   '#20c997',
        bg:      '#e8faf4',
        icon:    'fas fa-truck',
        statuses: {
            1: { label: translateUiText("Préparation"),  badge: 'badge-warning' },
            2: { label: translateUiText("Expédié"),      badge: 'badge-primary' },
            3: { label: translateUiText("Livré"),        badge: 'badge-success' },
            4: { label: translateUiText("Annulé"),       badge: 'badge-danger' },
        },
    },
    invoice: {
        label:   translateUiText("Facture"),
        color:   '#28a745',
        bg:      '#eafaf1',
        icon:    'fas fa-file-invoice-dollar',
        statuses: {
            1: { label: translateUiText("Brouillon"),    badge: 'badge-secondary' },
            2: { label: translateUiText("Envoyée"),      badge: 'badge-info' },
            3: { label: translateUiText("Payée"),        badge: 'badge-success' },
            4: { label: translateUiText("En retard"),    badge: 'badge-danger' },
            5: { label: translateUiText("Annulée"),      badge: 'badge-dark' },
        },
    },
    purchase: {
        label:   translateUiText("Achat"),
        color:   '#6f42c1',
        bg:      '#f3eeff',
        icon:    'fas fa-box',
        statuses: {
            1: { label: translateUiText("Brouillon"),    badge: 'badge-secondary' },
            2: { label: translateUiText("Envoyé"),       badge: 'badge-info' },
            3: { label: translateUiText("Reçu"),         badge: 'badge-success' },
            4: { label: translateUiText("Annulé"),       badge: 'badge-danger' },
        },
    },
};

const ALL_TYPES = Object.keys(TYPE_CONFIG);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatDate(dateStr) {
    if (!dateStr) return '—';
    try {
        const [y, m, d] = dateStr.split('-').map(Number);
        return new Intl.DateTimeFormat(uiLocale(), { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(y, m - 1, d));
    } catch {
        return dateStr;
    }
}

function statusInfo(type, statu) {
    const cfg = TYPE_CONFIG[type]?.statuses?.[statu];
    return cfg ?? { label: translateUiText("Statut :v0", { v0: (statu) }), badge: 'badge-secondary' };
}

// ---------------------------------------------------------------------------
// TimelineItem
// ---------------------------------------------------------------------------
function TimelineItem({ item }) {
    const cfg   = TYPE_CONFIG[item.type] ?? {};
    const statu = statusInfo(item.type, item.statu);

    return (
        <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
            {/* Left rail */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: cfg.bg ?? '#f8f9fa',
                    border: `2px solid ${cfg.color ?? '#6c757d'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: cfg.color ?? '#6c757d',
                    fontSize: 14,
                }}>
                    <i className={cfg.icon ?? 'fas fa-circle'} />
                </div>
                <div style={{ width: 2, flexGrow: 1, background: '#dee2e6', minHeight: 8 }} />
            </div>

            {/* Card */}
            <div style={{
                flex: 1,
                background: '#fff',
                border: '1px solid #dee2e6',
                borderLeft: `3px solid ${cfg.color ?? '#6c757d'}`,
                borderRadius: 4,
                padding: '8px 12px',
                marginBottom: 4,
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 4 }}>
                    <div>
                        <span style={{
                            display: 'inline-block',
                            fontSize: 10,
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            letterSpacing: 0.5,
                            color: cfg.color ?? '#6c757d',
                            marginBottom: 2,
                        }}>
                            {cfg.label ?? item.type}
                        </span>

                        <div style={{ fontWeight: 600, fontSize: 13 }}>
                            {item.code && (
                                <span style={{ marginRight: 6, color: '#495057' }}>{item.code}</span>
                            )}
                            {item.label && (
                                <span style={{ color: '#6c757d', fontWeight: 400 }}>{item.label}</span>
                            )}
                            {!item.code && !item.label && <span style={{ color: '#adb5bd' }}>—</span>}
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <span className={`badge ${statu.badge}`} style={{ fontSize: 10 }}>
                            {statu.label}
                        </span>
                        <small style={{ color: '#adb5bd', fontSize: 11 }}>{formatDate(item.date)}</small>
                        <a href={item.url} className="btn btn-xs btn-outline-secondary" style={{ fontSize: 10, padding: '1px 6px' }}>
                            <i className="fas fa-external-link-alt" />
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// CompanyTimeline
// ---------------------------------------------------------------------------
export default function CompanyTimeline({ endpoint }) {
    const [items,       setItems]       = useState([]);
    const [loading,     setLoading]     = useState(true);
    const [error,       setError]       = useState(null);
    const [activeTypes, setActiveTypes] = useState(new Set(ALL_TYPES));

    useEffect(() => {
        fetch(endpoint, { headers: { Accept: 'application/json' } })
            .then(r => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
            .then(data => { setItems(data); setLoading(false); })
            .catch(e  => { setError(e.message); setLoading(false); });
    }, [endpoint]);

    function toggleType(type) {
        setActiveTypes(prev => {
            const next = new Set(prev);
            next.has(type) ? next.delete(type) : next.add(type);
            return next;
        });
    }

    const visible = items.filter(i => activeTypes.has(i.type));

    // Group by year-month for date separators
    const grouped = [];
    let lastMonth = null;
    for (const item of visible) {
        const month = item.date ? item.date.substring(0, 7) : 'unknown';
        if (month !== lastMonth) {
            grouped.push({ type: 'separator', month });
            lastMonth = month;
        }
        grouped.push({ type: 'item', item });
    }

    return (
        <div>
            {/* Filter pills */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                {ALL_TYPES.map(type => {
                    const cfg    = TYPE_CONFIG[type];
                    const active = activeTypes.has(type);
                    const count  = items.filter(i => i.type === type).length;
                    if (count === 0) return null;
                    return (
                        <button
                            key={type}
                            onClick={() => toggleType(type)}
                            style={{
                                border: `1px solid ${cfg.color}`,
                                borderRadius: 20,
                                padding: '3px 10px',
                                fontSize: 12,
                                cursor: 'pointer',
                                background: active ? cfg.color : '#fff',
                                color:      active ? '#fff'     : cfg.color,
                                transition: 'all .15s',
                            }}
                        >
                            <i className={`${cfg.icon} mr-1`} style={{ fontSize: 10 }} />
                            {cfg.label} ({count})
                        </button>
                    );
                })}
            </div>

            {/* Timeline */}
            {loading && (
                <div className="text-center text-muted py-4">
                    <i className="fas fa-spinner fa-spin mr-2" /> {translateUiText("Chargement…")}
                </div>
            )}
            {error && (
                <div className="alert alert-danger">{error}</div>
            )}
            {!loading && !error && visible.length === 0 && (
                <div className="text-center text-muted py-4">
                    <i className="fas fa-inbox fa-2x mb-2 d-block" />
                    {translateUiText("Aucun document pour ce client.")}
                </div>
            )}

            {!loading && grouped.map((entry, idx) => {
                if (entry.type === 'separator') {
                    const [y, m] = (entry.month ?? '').split('-');
                    const label  = entry.month === 'unknown' ? translateUiText("Date inconnue")
                        : new Intl.DateTimeFormat(uiLocale(), { month: 'long', year: 'numeric' }).format(new Date(+y, +m - 1));
                    return (
                        <div key={`sep-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '16px 0 8px' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#6c757d', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                                {label}
                            </div>
                            <div style={{ flex: 1, height: 1, background: '#dee2e6' }} />
                        </div>
                    );
                }
                return <TimelineItem key={`${entry.item.type}-${entry.item.id}`} item={entry.item} />;
            })}
        </div>
    );
}
