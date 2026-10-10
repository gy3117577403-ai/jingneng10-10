import React, { useEffect, useState } from 'react';
import DashboardGrid from './dashboard/DashboardGrid.jsx';
import TodayView from './TodayView.jsx';

const VIEW_KEY = 'jn.home.view';
const VIEWS = { overview: '工作概览', today: '今日事项', kpi: '分析看板' };
function preference() { try { const value = localStorage.getItem(VIEW_KEY); return VIEWS[value] ? value : 'overview'; } catch { return 'overview'; } }
function permissions() { try { return JSON.parse(document.querySelector('meta[name="user-permissions"]')?.content || '[]'); } catch { return []; } }

function RecentList({ title, rows = [], base, index, quote = false }) {
    const states = quote ? { 1:'待处理',2:'已发送',3:'已成交',4:'未成交',5:'已关闭',6:'已作废' } : { 1:'待执行',2:'执行中',3:'已交付',4:'部分交付',5:'已暂停',6:'已取消' };
    return <section className="jn-panel"><header><h2>{title}</h2><a href={index}>查看全部 →</a></header>
        {rows.length ? <div className="jn-panel-list">{rows.slice(0, 5).map(row => <a key={row.id} href={`${base}${row.id}`}><div><strong>{row.label || row.code}</strong><small>{row.companie_label || '内部业务'} · {row.code}</small></div><div className="text-right"><span className={`badge ${Number(row.statu) === 3 ? 'badge-success' : 'badge-secondary'}`}>{states[row.statu] || '待核对'}</span><small>{row.formatted_total_price}</small></div></a>)}</div>
            : <p className="jn-panel-empty">暂无记录，可从列表创建并继续处理。</p>}
    </section>;
}

function WorkOverview({ kpi = {}, urls = {}, recentOrders, recentQuotes, delivery = {} }) {
    const allowed = permissions(), can = name => allowed.includes(name);
    const [inquiries, setInquiries] = useState(null), [error, setError] = useState('');
    async function load() {
        setError('');
        try {
            const response = await fetch(`${urls.presales}/api/inquiries`, { credentials:'same-origin', headers:{Accept:'application/json'} });
            if (!response.ok) throw new Error('无法读取询价，请稍后重试。');
            setInquiries(await response.json());
        } catch (e) { setError(e.message); }
    }
    useEffect(() => { if (urls.presales) load(); }, [urls.presales]);
    const stats = [
        can('quotes-menu') && { label:'待处理报价', value:kpi.quotes_count, href:urls.quotes_index + '?tab=list' },
        can('orders-menu') && { label:'待执行订单', value:kpi.orders_count, href:urls.orders_index + '?tab=list' },
        can('scheduling-menu') && { label:'逾期交付明细', value:delivery.lateOrdersCount, href:urls.calendar },
        can('companies-menu') && { label:'本年新增客户', value:kpi.customers_count, href:urls.companies_show?.replace(/\/$/, '') },
    ].filter(Boolean);
    return <>
        {stats.length > 0 && <div className="jn-stat-strip">{stats.map(s => <a key={s.label} href={s.href}><span>{s.label}</span><strong>{s.value ?? '—'}</strong></a>)}</div>}
        <div className="jn-overview"><div>
            <section className="jn-panel"><header><h2>最近询价{inquiries ? ` · ${inquiries.total}` : ''}</h2><a href={urls.presales}>进入售前 →</a></header>
                {error ? <div className="jn-panel-empty" role="alert">{error} <button className="btn btn-sm btn-default" onClick={load}>重试</button></div>
                    : !inquiries ? <p className="jn-panel-empty" role="status">正在读取…</p>
                    : inquiries.items.length ? <div className="jn-panel-list">{inquiries.items.slice(0, 5).map(row => <a key={row.id} href={`${urls.presales}/inquiries/${row.id}?tab=${row.review_count ? 'ai' : 'overview'}`}><div><strong>{row.title}</strong><small>{row.kind === 'cabinet' ? '成套' : '钣金'} · {row.customer_name || '客户待补充'} · {row.document_count} 份资料</small></div><span className={`badge ${row.review_count ? 'badge-warning' : 'badge-secondary'}`}>{row.review_count ? `${row.review_count} 项待核对` : row.owner_name}</span></a>)}</div>
                    : <p className="jn-panel-empty">从一条询价开始，整理需求和资料。<a href={urls.presales}>新建询价 →</a></p>}
            </section>
            {can('orders-menu') && <RecentList title="最近订单" rows={recentOrders} base={urls.orders_show} index={urls.orders_index + '?tab=list'} />}
        </div><div>
            <section className="jn-panel"><header><h2>常用入口</h2></header><div className="jn-shortcuts">
                <a href={urls.presales}><i className="far fa-folder-open" />售前资料</a>
                {can('quotes-menu') && <a href={urls.quotes_index + '?tab=list'}><i className="fas fa-calculator" />报价管理</a>}
                {can('scheduling-menu') && <a href={urls.calendar}><i className="far fa-calendar-alt" />生产计划</a>}
                {can('purchases-menu') && <a href={urls.purchases}><i className="fas fa-boxes" />采购管理</a>}
                {can('quality-menu') && <a href={urls.quality}><i className="far fa-check-circle" />质量管理</a>}
                {can('deliverys-menu') && <a href={urls.deliveries}><i className="fas fa-truck" />交付管理</a>}
            </div></section>
            {can('quotes-menu') && <RecentList title="最近报价" rows={recentQuotes} base={urls.quotes_show} index={urls.quotes_index + '?tab=list'} quote />}
        </div></div>
    </>;
}

export default function HomeDashboard(props) {
    const [view, setView] = useState(preference), [editMode, setEditMode] = useState(false);
    function switchView(value) { setView(value); setEditMode(false); try { localStorage.setItem(VIEW_KEY, value); } catch { /* optional preference */ } }
    const date = new Intl.DateTimeFormat('zh-CN', {month:'long',day:'numeric',weekday:'long'}).format(new Date());
    return <div className="jn-home">
        <header className="jn-home-header"><div><h1>工作台</h1><p>{date} · 继续处理今天的工作</p></div>
            <div className="jn-home-tabs" role="tablist" aria-label="工作台视图">{Object.entries(VIEWS).map(([key,label]) => <button key={key} role="tab" aria-selected={key === view} className={key === view ? 'active' : ''} onClick={() => switchView(key)}>{label}</button>)}</div>
        </header>
        {view === 'overview' && <WorkOverview {...props} />}
        {view === 'today' && <TodayView endpoints={props.endpoints} />}
        {view === 'kpi' && <><div className="d-flex justify-content-end mb-3"><button className="btn btn-default" onClick={() => setEditMode(value => !value)}>{editMode ? '完成调整' : '调整看板'}</button></div><DashboardGrid dashProps={props} configEndpoint={props.endpoints?.dashboard_config ?? '/dashboard/config'} editMode={editMode} onEditModeChange={setEditMode} /></>}
    </div>;
}
