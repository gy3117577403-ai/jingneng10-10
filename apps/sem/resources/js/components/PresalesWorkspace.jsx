import React, { useEffect, useRef, useState } from 'react';
import { Segments, SurfaceDialog, readPreference, savePreference } from '../ui/WorkspaceKit';
import { PanelLeftClose, PanelLeftOpen, ArrowLeft, FileSearch, Check, Clock3, ChevronRight } from 'lucide-react';
import PrivateFilePreview from './PrivateFilePreview';
import CompanyPicker from './presales/CompanyPicker';
import QuoteHandoff from './presales/QuoteHandoff';
import { readDraft, writeDraft, clearDraft } from '../ui/sessionDraft';

const KINDS = { cabinet: '成套', sheet_metal: '钣金' };
const FIELDS = { customer_name: '客户名称', expected_date: '期望交期', requirements: '需求说明' };
const STATES = { queued: '等待处理', running: '正在提取', review: '待人工核对', accepted: '已确认', rejected: '已驳回', failed: '处理失败', cancelled: '已取消' };
const BLANK = { title: '', kind: 'cabinet', customer_name: '', expected_date: '', requirements: '' };
const time = value => value ? new Date(value.replace(' ', 'T') + (/Z|[+]\d\d:\d\d$/.test(value) ? '' : '+08:00')).toLocaleString('zh-CN', { hour12: false }) : '—';

function Modal({ title, children, onClose }) {
    return <SurfaceDialog title={title} onClose={onClose} className="ps-modal jn-form-dialog">{children}</SurfaceDialog>;
}

function InquiryForm({ initial, busy, errors, onSave, onClose, onDirty, api }) {
    const scope = `inquiry.${initial?.id || 'new'}`, revision = initial?.revision || 0;
    const restored = useRef(readDraft(scope, revision));
    const [values, setValues] = useState(restored.current || { ...BLANK, ...initial, company_id: initial?.company_id || null, expected_date: initial?.expected_date || '' });
    const [draftNotice,setDraftNotice] = useState(restored.current ? '已恢复本标签页草稿，尚未提交。' : '');
    useEffect(()=>{if(restored.current)onDirty(true);},[]);
    const set = (key, value) => { setValues(v => {const next={...v,[key]:value};setDraftNotice(writeDraft(scope,revision,next)?'草稿已保存在本标签页，尚未提交。':'本机草稿无法保存，请保持页面打开。');return next;}); onDirty(true); };
    const field = (key, label, props = {}) => <label key={key}>{label}{key === 'requirements'
        ? <textarea rows="4" value={values[key] || ''} onChange={e => set(key, e.target.value)} maxLength={4000} />
        : <input value={values[key] || ''} onChange={e => set(key, e.target.value)} {...props} />}
        {errors?.[key] && <span className="ps-field-error">{errors[key][0]}</span>}</label>;
    return <form onSubmit={e => { e.preventDefault(); onSave(values); }}>
        {draftNotice&&<p className="jn-draft-note" role="status">{draftNotice}</p>}
        <div className="ps-form-grid">
            {field('title', '询价名称', { required: true, maxLength: 160, autoFocus: true })}
            <label>业务类型<select value={values.kind} onChange={e => set('kind', e.target.value)}>{Object.entries(KINDS).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
            {field('customer_name', '客户名称', { maxLength: 140 })}{field('expected_date', '期望交期', { type: 'date' })}
            <div className="ps-span"><CompanyPicker api={api} value={values.company_id} onChange={value=>set('company_id',value)}/>{errors?.company_id&&<span className="ps-field-error">{errors.company_id[0]}</span>}</div>
            <div className="ps-span">{field('requirements', '需求说明')}</div>
        </div>
        <footer><button type="button" disabled={busy} onClick={onClose}>取消</button><button className="ps-primary" disabled={busy}>{busy ? '正在保存…' : '保存询价'}</button></footer>
    </form>;
}

export default function PresalesWorkspace({ base, initialId = null }) {
    const params = useRef(new URLSearchParams(location.search)).current;
    const [id, setId] = useState(initialId), [tab, setTab] = useState(['overview', 'files', 'ai', 'history'].includes(params.get('tab')) ? params.get('tab') : 'overview');
    const [kind, setKind] = useState(params.get('kind') || ''), [query, setQuery] = useState(params.get('q') || ''), [page, setPage] = useState(Number(params.get('page')) || 1);
    const [list, setList] = useState({ items: [], total: 0 }), [data, setData] = useState(null), [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false), [error, setError] = useState(''), [errors, setErrors] = useState({}), [notice, setNotice] = useState('');
    const [editorRecord, setEditorRecord] = useState(null);
    const [modal, setModal] = useState(params.get('new')==='1' ? 'create' : null), [dirty, setDirty] = useState(false), [confirm, setConfirm] = useState(null);
    const [selectedFiles, setSelectedFiles] = useState([]), [selectedRun, setSelectedRun] = useState(Number(params.get('run')) || null), [source, setSource] = useState(null);
    const [focused, setFocused] = useState(params.get('focus') === '1'), [split, setSplit] = useState(Math.min(65,Math.max(35,Number(readPreference('review.split',48))||48))), [preview, setPreview] = useState(null), [listLoading,setListLoading] = useState(true);
    const sourceRef = useRef(null);
    const fromInbox = params.get('return') === 'inbox';
    const [fields, setFields] = useState({}), [checked, setChecked] = useState({}), [note, setNote] = useState('');
    const [uploadDocument, setUploadDocument] = useState(null), [users, setUsers] = useState([]), [members, setMembers] = useState([]);
    const fileInput = useRef(), pending = useRef(readDraft('presales.request',0)), mutationLock = useRef(false), listSequence = useRef(0), detailSequence = useRef(0);
    const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
    const currentId = useRef(id); currentId.current = id;
    const endpoint = suffix => `${base.replace(/\/$/, '')}/api${suffix}`;
    const run = data?.runs.find(r => r.id === selectedRun) || data?.runs[0];
    const record = data?.record;
    const urlFor = (recordId, targetTab = tab) => {
        const p = new URLSearchParams({ tab: targetTab, kind, q: query, page: String(page) });
        if (selectedRun) p.set('run',String(selectedRun)); if (focused) p.set('focus','1'); if (fromInbox) p.set('return','inbox');
        return `${base}${recordId ? `/inquiries/${recordId}` : ''}?${p}`;
    };
    const guard = action => dirtyRef.current ? setConfirm({ text: '候选或表单有未保存的修改，是否放弃并继续？', action: () => { setDirty(false); setFields(Object.fromEntries(Object.entries(run?.output?.candidates || {}).map(([k, v]) => [k, v.value]))); setChecked({}); setNote(''); action(); } }) : action();
    async function api(path, options = {}) {
        const response = await fetch(endpoint(path), { credentials: 'same-origin', ...options, headers: { Accept: 'application/json', 'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.content, ...options.headers } });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            const message = [401, 419].includes(response.status) ? '登录状态已过期，请重新登录后再提交。' : response.status >= 500 ? '服务暂时不可用，请稍后重试。' : result.message || '操作未完成，请刷新后重试。';
            const e = new Error(message); e.fields = result.errors || {}; throw e;
        }
        return result;
    }
    async function reloadList() {
        const seq = ++listSequence.current;
        const result = await api(`/inquiries?${new URLSearchParams({ q: query, kind, page })}`);
        if (seq === listSequence.current) { setList(result); setListLoading(false); }
    }
    async function reloadDetail(target = id) {
        if (!target) return;
        const seq = ++detailSequence.current;
        const result = await api(`/inquiries/${target}`);
        if (seq === detailSequence.current && target === currentId.current) setData(result);
        return result;
    }
    const fail = e => { setError(e.message); setErrors(e.fields || {}); };
    async function mutate(path, payload, message, method = 'POST') {
        if (mutationLock.current) return null;
        mutationLock.current = true;
        setBusy(true); setError(''); setErrors({});
        const multipart = payload instanceof FormData;
        const fingerprint = path + method + (multipart ? [...payload].map(([k, v]) => `${k}:${v instanceof File ? `${v.name}:${v.size}:${v.lastModified}` : v}`).join('|') : JSON.stringify(payload));
        if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, key: crypto.randomUUID() };
        writeDraft('presales.request',0,pending.current);
        try {
            const result = await api(path, { method, headers: { 'X-Request-ID': pending.current.key, ...(multipart ? {} : { 'Content-Type': 'application/json' }) }, body: multipart ? payload : JSON.stringify(payload) });
            pending.current = null; clearDraft('presales.request'); dirtyRef.current=false; setDirty(false); setNotice(message);
            try { await reloadList(); await reloadDetail(); } catch { setNotice(`${message}，列表暂未刷新，可稍后重试。`); }
            return result;
        } catch (e) { fail(e); return null; } finally { mutationLock.current=false; setBusy(false); }
    }
    useEffect(() => { setListLoading(true); const t = setTimeout(() => reloadList().catch(e => {setListLoading(false);fail(e);}), 180); return () => { clearTimeout(t); listSequence.current++; }; }, [query, kind, page]);
    useEffect(() => { setData(null); setSelectedFiles([]); setSelectedRun(Number(new URLSearchParams(location.search).get('run')) || null); setSource(null); setError(''); if (id) { setLoading(true); reloadDetail().catch(fail).finally(() => setLoading(false)); } }, [id]);
    useEffect(() => { history.replaceState({}, '', urlFor(id)); }, [query, kind, page, tab, selectedRun, focused]);
    useEffect(() => {
        const handler = () => {
            const match = location.pathname.match(/\/inquiries\/(\d+)$/), target = match ? Number(match[1]) : null;
            if (dirtyRef.current) { history.pushState({}, '', urlFor(currentId.current)); guard(() => select(target)); return; }
            const p = new URLSearchParams(location.search);
            setId(target); setTab(['overview','files','ai','history'].includes(p.get('tab'))?p.get('tab'):'overview');
            setKind(KINDS[p.get('kind')]?p.get('kind'):'');setQuery(p.get('q')||'');setPage(Math.max(1,Number(p.get('page'))||1));
            setFocused(p.get('focus')==='1');setSelectedRun(Number(p.get('run'))||null);
        };
        window.addEventListener('popstate', handler); return () => window.removeEventListener('popstate', handler);
    }, [kind, query, page, tab]);
    useEffect(() => { const handler = e => { if (dirtyRef.current) { e.preventDefault(); e.returnValue = ''; } }; window.addEventListener('beforeunload', handler); return () => window.removeEventListener('beforeunload', handler); }, []);
    useEffect(() => {
        const leave = e => {
            const link=e.target.closest('a[href]');
            if(!dirtyRef.current || !link || e.button!==0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || link.hasAttribute('download') || link.target==='_blank')return;
            const next=new URL(link.href,location.origin);
            if(next.origin!==location.origin || next.pathname===location.pathname && next.search===location.search)return;
            e.preventDefault();e.stopImmediatePropagation();
            setConfirm({text:'候选或表单有未保存的修改，是否放弃并离开？',action:()=>{dirtyRef.current=false;setDirty(false);window.location.assign(next.href);}});
        };
        document.addEventListener('click',leave,true);return()=>document.removeEventListener('click',leave,true);
    },[]);
    useEffect(() => {
        if (!data?.runs.some(r => ['queued', 'running'].includes(r.state))) return;
        const t = setInterval(() => reloadDetail().catch(fail), 2200); return () => clearInterval(t);
    }, [id, data?.runs.map(r => `${r.id}:${r.state}`).join(',')]);
    useEffect(() => {
        setFields(Object.fromEntries(Object.entries(run?.output?.candidates || {}).map(([k, v]) => [k, v.value]))); setChecked({}); setNote(''); setSource(null);
    }, [run?.id, run?.state]);
    useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(''), 5000); return () => clearTimeout(t); }, [notice]);
    useEffect(() => {
        const pane=sourceRef.current, line=pane?.querySelector('.highlight'), list=pane?.querySelector('ol');if(!line||!list)return;
        const behavior=window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth';
        if(window.matchMedia('(min-width: 992px)').matches) list.scrollTo({top:list.scrollTop+line.getBoundingClientRect().top-list.getBoundingClientRect().top-8,behavior});
        else pane.scrollIntoView({block:'nearest',behavior});
    }, [source]);
    function select(target) { setId(target); setTab('overview'); setSelectedRun(null); const url=new URL(urlFor(target,'overview'),location.origin);url.searchParams.delete('run');history.pushState({}, '', url); }
    async function save(values) {
        const result = await mutate(modal === 'create' ? '/inquiries' : `/inquiries/${id}`, { ...values, ...(modal === 'edit' ? { revision: editorRecord.revision } : {}) }, '询价已保存', modal === 'edit' ? 'PUT' : 'POST');
        if (result) { clearDraft(`inquiry.${modal === 'edit' ? id : 'new'}`); setModal(null); if (modal === 'create') select(result.id); }
    }
    async function upload(event) {
        const file = event.target.files?.[0]; if (!file) return;
        const form = new FormData(); form.append('file', file); form.append('revision', record.revision); if (uploadDocument) form.append('document_id', uploadDocument);
        const result = await mutate(`/inquiries/${id}/files`, form, uploadDocument ? '新版本已保存，旧版本仍可下载' : '资料已上传');
        if (result) setSelectedFiles([]); event.target.value = '';
    }
    async function start() {
        const result = await mutate(`/inquiries/${id}/runs`, { revision: record.revision, version_ids: selectedFiles }, '已提交模拟提取');
        if (result) { setSelectedRun(result.run_id); if (result.reused) setNotice('相同资料已有处理记录，已为你打开'); }
    }
    async function submitReview(decision) {
        const chosen = Object.fromEntries(Object.entries(fields).filter(([key]) => checked[key]));
        const result = await mutate(`/inquiries/${id}/runs/${run.id}/review`, { decision, fields: decision === 'accept' ? chosen : {}, note }, decision === 'accept' ? '已确认，所选字段已更新' : '已驳回，询价内容保持不变');
        if (result) setDirty(false);
    }
    const download = vid => `${endpoint(`/inquiries/${id}/versions/${vid}/download`)}`;
    const closeModal = () => !busy && guard(() => { if(['create','edit'].includes(modal))clearDraft(`inquiry.${modal==='edit'?id:'new'}`);if(modal==='quote')clearDraft(`quote.${id}`);setModal(null); setError(''); });
    const button = (label, action, primary = false, disabled = false) => <button type="button" className={primary ? 'ps-primary' : ''} onClick={action} disabled={busy || disabled}>{label}</button>;
    return <div className={`ps-workspace ${id ? 'has-selection' : ''} ${focused && id ? 'is-focused' : ''}`} style={{'--review-split':`${split}%`}}>
        <div className="ps-review-tools"><div>{fromInbox && <a className="ps-button" href={`${base.replace(/\/presales\/?$/, '/dashboard')}?view=today`}><ArrowLeft size={15}/> 返回待办</a>}{id && <button type="button" aria-pressed={focused} onClick={()=>setFocused(v=>!v)}>{focused?<PanelLeftOpen size={15}/>:<PanelLeftClose size={15}/>} {focused?'显示询价列表':'专注核对'}</button>}</div>{focused&&tab==='ai'&&<label className="ps-review-width">候选与来源比例<input type="range" aria-label="候选与来源比例" min="35" max="65" value={split} onChange={e=>{setSplit(Number(e.target.value));savePreference('review.split',Number(e.target.value));}}/></label>}</div>
        {notice && <div className="ps-notice" role="status">{notice}</div>}
        {error && <div className="ps-error" role="alert">{error}<button onClick={() => { setError(''); reloadDetail().catch(fail); reloadList().catch(fail); }}>刷新数据</button></div>}
        <aside className="ps-list-panel">
            <div className="ps-list-title"><div><h2>询价与资料</h2><span className="ps-muted">{listLoading?'正在读取…':`共 ${list.total} 项`}</span></div>{button('新建询价', () => guard(() => { setModal('create'); setErrors({}); }), true)}</div>
            <label className="ps-search"><span className="ps-sr">搜索询价</span><input type="search" placeholder="搜索名称、客户或编号" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} /></label>
            <div className="ps-filter" aria-label="筛选业务类型">{[['', '全部'], ...Object.entries(KINDS)].map(([key, name]) => <button key={key} aria-pressed={kind === key} className={kind === key ? 'is-active' : ''} onClick={() => { setKind(key); setPage(1); }}>{name}</button>)}</div>
            <div className="ps-records">{list.items.map(item => <button key={item.id} className={`ps-record ${item.id === id ? 'selected' : ''}`} onClick={() => guard(() => select(item.id))}>
                <span className="ps-record-heading"><strong>{item.title}</strong><span className="ps-kind">{KINDS[item.kind]}</span></span>
                <span className="ps-muted">{item.customer_name || '客户待补充'}</span><span className="ps-record-meta">{item.document_count} 份资料<span>{item.review_count > 0 ? <b>{item.review_count} 项待核对</b> : item.owner_name}</span></span>
            </button>)}{listLoading&&!list.items.length&&<p className="ps-empty" role="status">正在读取询价…</p>}{!listLoading&&!list.items.length && <p className="ps-empty">{query || kind ? '没有匹配的询价，试试调整筛选。' : '从一条询价开始，集中整理需求与资料。'}</p>}</div>
            {list.total > 20 && <div className="ps-pagination">{button('上一页', () => setPage(p => p - 1), false, page === 1)}<span>第 {page} 页</span>{button('下一页', () => setPage(p => p + 1), false, page * 20 >= list.total)}</div>}
        </aside>
        <main className="ps-detail" aria-busy={loading}>
            {id && <button className="ps-mobile-back" onClick={() => guard(() => select(null))}>返回询价列表</button>}
            {!id ? <div className="ps-welcome"><span className="ps-kind">售前协同</span><h2>把需求、资料和核对放在一起</h2><p>选择左侧询价，或新建一条成套、钣金询价。</p><ol><li>整理客户需求</li><li>上传并保留资料版本</li><li>核对候选后确认写入</li></ol>{button('新建询价', () => setModal('create'), true)}</div>
            : !record ? <p className="ps-empty">{loading ? '正在读取询价…' : '无法读取该询价，请返回列表或刷新。'}</p> : <>
                <header className="ps-detail-header"><div><span className="ps-kind">{KINDS[record.kind]}</span><h2>{record.title}</h2><p>{record.customer_name || '客户待补充'}<span>负责人：{record.owner_name}</span></p></div><div className="ps-actions">{data.can_manage && button('编辑信息', () => guard(() => { setErrors({}); setEditorRecord(record); setModal('edit'); }))}{data.can_manage && button('协作者', async () => { try { setUsers(await api(`/inquiries/${id}/users`)); setMembers(data.members.map(m => m.id)); guard(() => setModal('members')); } catch (e) { fail(e); } })}</div></header>
                <Segments className="ps-tabs" value={tab} onChange={key=>guard(()=>setTab(key))} label="询价内容" items={[["overview","需求概览"],["files",`资料 ${data.documents.length}`],["ai","AI 辅助"],["history","操作记录"]]}/>

                <div className="jn-sales-chain" aria-label="业务关联">
                    <div><small>客户档案</small>{data.company ? <a href={`${base.replace(/\/presales\/?$/, '/companies')}/${data.company.id}`}>{data.company.label}</a> : <span>待关联</span>}</div>
                    <ChevronRight size={15}/><div><small>询价</small><strong>{KINDS[record.kind]} · 第 {record.revision} 版</strong></div><ChevronRight size={15}/>
                    <div><small>报价与订单</small>{data.quotes?.length ? <span>{data.quotes.length} 份报价 · {data.quotes.reduce((n,q)=>n+q.orders.length,0)} 份订单</span> : <span>尚未生成报价</span>}</div>
                    {data.can_manage && button(data.quotes?.some(q=>q.revision===record.revision)?'打开本版报价':'生成报价草稿',()=>guard(()=>{const current=data.quotes?.find(q=>q.revision===record.revision);if(current){location.assign(current.url);}else{setErrors({});setError('');setModal('quote');}}),true)}
                </div>
                {data.quotes?.length>0&&<details className="jn-linked-records"><summary>关联报价与订单</summary>{data.quotes.map(q=><div key={q.id}><a href={q.url}>{q.label}</a><small>询价第 {q.revision} 版{q.revision!==record.revision?' · 需求已有更新':''}</small>{q.orders.map(o=><a key={o.id} href={o.url}>订单 · {o.code}</a>)}</div>)}</details>}
                <div className="ps-tab-content">
                    {tab === 'overview' && <><dl className="ps-summary"><div><dt>客户名称</dt><dd>{record.customer_name || '待补充'}</dd></div><div><dt>期望交期</dt><dd>{record.expected_date || '待补充'}</dd></div><div className="ps-span"><dt>需求说明</dt><dd className="ps-prewrap">{record.requirements || '尚未填写需求，可手工补充或从资料生成候选。'}</dd></div><div><dt>协作者</dt><dd>{data.members.map(m => m.name).join('、') || '尚未指定'}</dd></div><div><dt>最近更新</dt><dd>{time(record.updated_at)}</dd></div></dl><div className="ps-next"><div><strong>{data.documents.length ? '资料已归集，继续核对关键信息' : '下一步：上传客户需求与图纸'}</strong><p>原件保留版本，确认后的内容才会更新询价。</p></div>{button(data.documents.length ? '进入 AI 辅助' : '整理资料', () => setTab(data.documents.length ? 'ai' : 'files'), true)}</div></>}
                    {tab === 'files' && <><div className="ps-section-head"><div><h3>资料与版本</h3><p>上传新版本会保留旧原件，供后续追溯。</p></div>{button('上传资料', () => { setUploadDocument(null); fileInput.current.click(); }, true)}</div><input ref={fileInput} className="ps-sr" type="file" aria-label="选择资料文件" onChange={upload} accept=".txt,.csv,.pdf,.png,.jpg,.jpeg,.xlsx,.docx,.dxf,.step,.stp" />
                        {!data.documents.length && <p className="ps-empty">还没有资料。支持文本、文档、表格、图片及工程文件，单个文件不超过 25 MB。</p>}
                        {data.documents.map(doc => <section key={doc.id} className="ps-file"><div><strong>{doc.name}</strong><span className="ps-muted">当前第 {doc.versions[0].version} 版 · {(doc.versions[0].size / 1024).toFixed(1)} KB</span></div><div className="ps-actions">{button('预览资料',()=>setPreview(doc.versions[0]))}<a className="ps-button" href={download(doc.versions[0].id)}>下载原件</a>{button('上传新版本', () => { setUploadDocument(doc.id); fileInput.current.click(); })}</div><details><summary>版本记录（{doc.versions.length}）</summary>{doc.versions.map(v => <div className="ps-version" key={v.id}><span>第 {v.version} 版 · {time(v.created_at)}</span><a href={download(v.id)}>下载</a></div>)}</details></section>)}
                        <div className="ps-example"><strong>试用资料</strong><p>下载带固定标签的虚构文本，上传后可以验证模拟审核流程。</p><a href={`${base}/examples/cabinet`}>下载成套示例</a><a href={`${base}/examples/sheet_metal`}>下载钣金示例</a></div>
                    </>}
                    {tab === 'ai' && <><div className="ps-section-head"><div><h3>资料核对 <span className="ps-simulation">模拟测试</span></h3><p>当前按固定标签提取文本；尚未接入真实模型或图纸识别。</p></div></div>
                        <details key={run?.id || 'new'} className="ps-extract" open={!data.runs.length || undefined}><summary>选择资料并开始提取</summary><div className="ps-file-choices">{data.documents.filter(d => ['txt', 'csv'].includes(d.versions[0].extension)).map(d => <label key={d.id}><input type="checkbox" checked={selectedFiles.includes(d.versions[0].id)} onChange={e => setSelectedFiles(s => e.target.checked ? [...s, d.versions[0].id] : s.filter(v => v !== d.versions[0].id))} />{d.name}<span className="ps-muted">第 {d.versions[0].version} 版</span></label>)}</div>{!data.documents.some(d => ['txt', 'csv'].includes(d.versions[0].extension)) && <p>请先在“资料”上传 UTF-8 文本或 CSV。其他文件本批仅保存原件。</p>}{button('开始模拟提取', () => guard(start), true, !selectedFiles.length || selectedFiles.length > 5)}<span className="ps-muted">每次最多 5 份当前版本</span></details>
                        {data.runs.length > 0 && <><div className="ps-run-steps" aria-label="处理阶段"><span><Check size={13}/>资料已保存</span><ChevronRight size={12}/><span className={['queued','running'].includes(run.state)?'is-active':''}><Clock3 size={13}/>{['queued','running'].includes(run.state)?'后台提取':'提取记录'}</span><ChevronRight size={12}/><span className={run.state==='review'?'is-active':''}><FileSearch size={13}/>人工核对</span><ChevronRight size={12}/><span className={run.review?'is-active':''}>确认回执</span></div><div className="ps-run-picker"><label>处理记录<select aria-label="选择处理记录" value={run.id} onChange={e => guard(() => setSelectedRun(Number(e.target.value)))}>{data.runs.map(r => <option key={r.id} value={r.id}>第 {r.id} 次 · {STATES[r.state]} · {time(r.created_at)}</option>)}</select></label><span className={`ps-state ps-state-${run.state}`}>{STATES[run.state]}</span></div>
                            {['queued', 'running'].includes(run.state) && <p className="ps-empty" role="status">{run.state === 'queued' ? '任务已保存，正在等待后台处理。可以离开页面，稍后继续。' : '正在核对来源并生成候选…'}</p>}
                            {run.metrics && <p className="ps-muted jn-run-metrics">{run.provider?.label || '本机模拟提取'} · 第 {run.metrics.attempt} 次尝试 · {run.metrics.duration_ms} 毫秒 · {run.output?.mode==='simulation'?'未调用外部模型':run.metrics.usage?`输入 ${run.metrics.usage.input_tokens} / 输出 ${run.metrics.usage.output_tokens} 令牌`:'用量未返回'}</p>}
                            {run.error && <div className="ps-error">{run.error}{run.state === 'failed' && !run.stale && run.attempts < 3 && button('重试', () => mutate(`/inquiries/${id}/runs/${run.id}/retry`, {}, '已重新提交'))}</div>}
                            {run.stale && run.state === 'review' && <p className="ps-warning">询价或资料已有更新，这份候选已过期。请重新提取；旧记录仍可核对和驳回。</p>}
                            {run.review && <section className="ps-receipt"><h4>{run.review.decision === 'accept' ? '确认回执' : '驳回记录'}</h4><p>{run.review.reviewer_name} · {time(run.review.reviewed_at)}</p><p>{run.review.note}</p>{Object.entries(run.review.after).map(([key, value]) => <div key={key}><strong>{FIELDS[key]}</strong><span>{run.review.before[key] || '未填写'} → {value}</span></div>)}</section>}
                            {run.output && <details key={`${run.id}-${run.state}`} className={`ps-review-disclosure ${run.state === 'review' ? 'is-review' : ''}`} open={run.state === 'review'}><summary>查看候选与来源</summary><div className="ps-review-grid"><section><h4>候选信息</h4>{Object.entries(run.output.candidates).map(([key, candidate]) => <div className="ps-candidate" key={key}><label><input type="checkbox" disabled={!data.can_manage || run.state !== 'review' || run.stale} checked={checked[key] || false} onChange={e => { setChecked(s => ({ ...s, [key]: e.target.checked })); setDirty(true); }} /><strong>{FIELDS[key]}</strong></label><span className="ps-muted">当前：{record[key] || '未填写'}</span>{key === 'requirements' ? <textarea aria-label={`${FIELDS[key]}候选`} rows="3" readOnly={!data.can_manage || run.state !== 'review' || run.stale} value={fields[key] || ''} onChange={e => { setFields(s => ({ ...s, [key]: e.target.value })); setDirty(true); }} /> : <input aria-label={`${FIELDS[key]}候选`} type={key === 'expected_date' ? 'date' : 'text'} readOnly={!data.can_manage || run.state !== 'review' || run.stale} value={fields[key] || ''} onChange={e => { setFields(s => ({ ...s, [key]: e.target.value })); setDirty(true); }} />}<div className="ps-source-links">{candidate.sources.map((s, n) => <button key={n} onClick={() => setSource(s)}>查看来源 · 第 {s.line} 行</button>)}</div></div>)}{!Object.keys(run.output.candidates).length && <p className="ps-empty">没有可确认的候选，请按下方提示补充资料。</p>}</section>
                                <section ref={sourceRef} className="ps-source"><h4>来源原文</h4>{source ? (() => { const doc = run.sources.find(s => s.version_id === source.version_id); if (!doc) return null; return <><p>{doc.filename} · 第 {doc.version} 版 <a href={download(doc.version_id)}>下载原件</a></p><ol>{doc.text.split('\n').map((line, n) => <li key={n} className={n + 1 === source.line ? 'highlight' : ''}>{line || ' '}</li>)}</ol></>; })() : <p className="ps-empty">点击候选下方的来源，定位原文与行号。</p>}</section></div>
                                {run.output.questions.length > 0 && <div className="ps-questions"><strong>待补充</strong><ul>{run.output.questions.map(q => <li key={q}>{q}</li>)}</ul></div>}
                            </details>}
                            {run.state === 'review' && data.can_manage && <section className="ps-review-footer"><label>审核说明<textarea rows="2" placeholder="记录采纳、修订或驳回的原因" value={note} maxLength={1000} onChange={e => { setNote(e.target.value); setDirty(true); }} /></label><div><span>已选择 {Object.values(checked).filter(Boolean).length} 项；未选字段保持原值</span><div className="ps-actions">{button('驳回候选', () => setConfirm({ text: '确认驳回这次候选？询价内容不会改变。', action: () => submitReview('reject') }), false, !note.trim())}{button('确认并更新', () => submitReview('accept'), true, !note.trim() || !Object.values(checked).some(Boolean) || run.stale)}</div></div></section>}
                            {run.state === 'review' && !data.can_manage && <p className="ps-muted">你可以核对来源，确认写入由负责人或管理员完成。</p>}
                            {['queued', 'running', 'review', 'failed'].includes(run.state) && (data.can_manage || run.requested_by === data.actor_id) && <div className="ps-cancel-run">{button('取消本次处理', () => setConfirm({ text: '取消后保留本次记录，询价内容不会改变。', action: () => mutate(`/inquiries/${id}/runs/${run.id}/cancel`, {}, '本次处理已取消') }))}</div>}
                        </>}
                    </>}
                    {tab === 'history' && <div className="ps-history">{data.events.map(e => <article key={e.id}><div><strong>{e.label}</strong><span>{e.actor_name || '系统'} · {time(e.created_at)}</span></div>{e.detail.filename && <p>{e.detail.filename} · 第 {e.detail.version} 版</p>}{e.detail.note && <p>{e.detail.note}</p>}{e.detail.after && Object.entries(e.detail.after).filter(([key]) => FIELDS[key]).map(([key, val]) => <p key={key}>{FIELDS[key]}：{e.detail.before?.[key] || '未填写'} → {val || '未填写'}</p>)}</article>)}</div>}
                </div>
            </>}
        </main>
        {modal === 'quote' && <QuoteHandoff data={data} api={api} mutate={mutate} busy={busy} error={error} onClose={closeModal} onDirty={setDirty} onDone={result=>{dirtyRef.current=false;setDirty(false);setModal(null);location.assign(result.url);}}/>}
        {preview && <PrivateFilePreview file={preview} url={download(preview.id)} onClose={()=>setPreview(null)}/>}
        {['create', 'edit'].includes(modal) && <Modal title={modal === 'create' ? '新建询价' : '编辑询价'} onClose={closeModal}>{error && <p className="ps-error" role="alert">{error}</p>}<InquiryForm api={api} initial={modal === 'edit' ? editorRecord : {...BLANK,company_id:Number(params.get('company'))||null}} busy={busy} errors={errors} onSave={save} onClose={closeModal} onDirty={setDirty} /></Modal>}
        {modal === 'members' && <Modal title="指定协作者" onClose={closeModal}><p className="ps-muted">协作者可查看、上传资料和发起模拟提取；不能确认写入。</p><div className="ps-member-list">{users.filter(u => u.id !== record.owner_id).map(u => <label key={u.id}><input type="checkbox" checked={members.includes(u.id)} onChange={e => { setMembers(s => e.target.checked ? [...s, u.id] : s.filter(v => v !== u.id)); setDirty(true); }} />{u.name}</label>)}{users.length <= 1 && <p>当前没有其他可选账号，请先在用户管理中创建并分配角色。</p>}</div>{error && <p className="ps-error">{error}</p>}<footer>{button('取消', closeModal)}{button('保存协作者', async () => { const r = await mutate(`/inquiries/${id}/members`, { user_ids: members, revision: record.revision }, '协作者已更新', 'PUT'); if (r) setModal(null); }, true)}</footer></Modal>}
        {confirm && <Modal title="请确认" onClose={() => setConfirm(null)}><p>{confirm.text}</p><footer>{button('继续编辑', () => setConfirm(null))}{button('确认继续', () => { const action = confirm.action; setConfirm(null); action(); }, true)}</footer></Modal>}
    </div>;
}
