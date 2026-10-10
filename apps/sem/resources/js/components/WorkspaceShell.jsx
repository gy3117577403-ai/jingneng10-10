import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Search, Star, Inbox, LayoutGrid, PanelLeftClose, PanelLeftOpen, ChevronDown, ChevronRight, ArrowUpRight, SlidersHorizontal, Folder, Factory, ShoppingBag, ShieldCheck, ChartNoAxesCombined, Settings2, Users, FileText, House, ClipboardList, Package, Wrench, CalendarDays, Truck, Wallet, Contact, BriefcaseBusiness } from 'lucide-react';
import { SurfaceDialog, readPreference, savePreference } from '../ui/WorkspaceKit';
import { navigationModel, currentModule, pathOf } from '../ui/navigationModel';

const GROUP_ICONS = {'协作与资料':Folder,'销售与客户':Users,'计划与制造':Factory,'采购与仓储':ShoppingBag,'质量与交付':ShieldCheck,'经营与管理':ChartNoAxesCombined,'设置与工具':Settings2};
const iconFor = title => GROUP_ICONS[title] || FileText;
const MODULE_ICONS={'售前询价':ClipboardList,'公司':Contact,'潜在客户':Users,'商机':BriefcaseBusiness,'报价':FileText,'订单':ShoppingBag,'计划':CalendarDays,'方法':Settings2,'设备维护':Wrench,'产品':Package,'采购':ShoppingBag,'送货单':Truck,'质量':ShieldCheck,'发票':Wallet,'时间管理':CalendarDays,'会计':Wallet,'人力资源':Users,'报表':ChartNoAxesCombined};
function storedFavorites() { const value = readPreference('nav.favorites', []); return Array.isArray(value) ? value.filter(v => typeof v === 'string').slice(0,12) : []; }

export default function WorkspaceShell({ menu, searchUrl, homeUrl, sidebarHost, viewsHost }) {
    const {groups,items} = useMemo(() => navigationModel(menu), [menu]);
    const [, refreshLocation] = useState(0);
    const active = currentModule(groups), currentPath = pathOf(location.href);
    const [groupName, setGroupName] = useState(active?.group.title || readPreference('nav.group',groups[0]?.title));
    const [collapsed,setCollapsed] = useState(!!readPreference('nav.collapsed',false));
    const [favorites,setFavorites] = useState(storedFavorites), [panel,setPanel] = useState(null), [query,setQuery] = useState('');
    const [business,setBusiness] = useState([]), [busy,setBusy] = useState(false), [error,setError] = useState(''), [selected,setSelected] = useState(0), [onlyFavorites,setOnlyFavorites] = useState(false);
    const [density,setDensity] = useState(document.body.dataset.density || 'compact');
    const inputRef = useRef(), resultsRef = useRef(), triggerRef = useRef(null);
    const group = groups.find(g => g.title === groupName) || groups[0];
    const stars = items.filter(i => favorites.includes(i.href));
    const foundPages = items.filter(i => (!onlyFavorites || favorites.includes(i.href)) && query.trim().toLowerCase().split(/\s+/).every(q => `${i.title} ${i.trail}`.toLowerCase().includes(q)));
    const shown = [...foundPages, ...(!onlyFavorites ? business : [])];
    const open = (mode, event) => { triggerRef.current = event?.target?.closest?.('button,a') || document.activeElement; setQuery('');setBusiness([]);setError('');setOnlyFavorites(false);setSelected(0);setPanel(mode); };
    useEffect(() => {
        document.body.classList.add('jn-nav-ready');document.body.classList.remove('sidebar-collapse');
        document.querySelectorAll('.main-sidebar .nav-sidebar').forEach(nav=>nav.closest('nav')?.setAttribute('aria-hidden','true'));
        const update=()=>refreshLocation(v=>v+1);window.addEventListener('jn-view-change',update);
        return()=>window.removeEventListener('jn-view-change',update);
    },[]);
    useEffect(() => { savePreference('nav.group', groupName); }, [groupName]);
    useEffect(() => { document.body.classList.toggle('jn-nav-collapsed',collapsed);savePreference('nav.collapsed',collapsed); }, [collapsed]);
    useEffect(() => {
        const click = e => {
            if (e.target.closest('[data-jn-command-open], [data-jn-catalog-open], [data-wem-launcher-open]')) {e.preventDefault();e.stopImmediatePropagation();open('catalog',e);}
            if (e.target.closest('[data-widget="pushmenu"]')) {e.preventDefault();e.stopImmediatePropagation();if(window.matchMedia('(max-width: 991px)').matches)open('catalog',e);else setCollapsed(v=>!v);}
        };
        const key = e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==='k') {e.preventDefault();open('catalog',e);} };
        document.addEventListener('click',click,true);document.addEventListener('keydown',key);
        return () => {document.removeEventListener('click',click,true);document.removeEventListener('keydown',key);};
    },[]);
    useEffect(() => {
        setSelected(0);setBusiness([]);setError('');
        if (!panel || !query.trim() || onlyFavorites) {setBusy(false);return;}
        const abort = new AbortController();setBusy(true);
        const timer = setTimeout(async () => {
            try { const url = new URL(searchUrl,location.origin);url.searchParams.set('q',query.trim());const r=await fetch(url,{credentials:'same-origin',headers:{Accept:'application/json'},signal:abort.signal});
                if(!r.ok)throw new Error([401,419].includes(r.status)?'登录已过期，请重新登录。':'业务查找暂时不可用，页面导航仍可使用。');
                const data=await r.json();if(!abort.signal.aborted)setBusiness(data.items.map(i=>({...i,trail:i.section,business:true})));
            }catch(e){if(!abort.signal.aborted)setError(e.message);}finally{if(!abort.signal.aborted)setBusy(false);}
        },240);
        return ()=>{abort.abort();clearTimeout(timer);};
    },[query,panel,onlyFavorites,searchUrl]);
    function toggle(item) { const next=favorites.includes(item.href)?favorites.filter(v=>v!==item.href):[...favorites,item.href].slice(-12);setFavorites(next);savePreference('nav.favorites',next); }
    function chooseGroup(title) {setGroupName(title);setPanel(null);}
    const navLink = (href,title,Icon,selected=false) => <a className={`jn-nav-link ${selected?'is-current':''}`} href={href} aria-current={selected?'page':undefined} title={collapsed?title:undefined}><Icon size={18}/><span>{title}</span></a>;
    return <>
        {sidebarHost && createPortal(<div className="jn-navigation">
            <button type="button" className="jn-area-switch" onClick={e=>open('groups',e)} title={collapsed?'切换工作领域':undefined}><span className="jn-area-mark"><Factory size={19}/></span><span><small>工作领域</small><strong>{group?.title || '我的工作'}</strong></span><ChevronDown size={14}/></button>
            <nav aria-label="我的工作" className="jn-nav-fixed">
                {navLink(`${homeUrl}?view=today`,'待我处理',Inbox,(currentPath==='/dashboard'||currentPath==='/home')&&new URLSearchParams(location.search).get('view')!=='overview')}
                {navLink(`${homeUrl}?view=overview`,'工作概览',House,(currentPath==='/dashboard'||currentPath==='/home')&&new URLSearchParams(location.search).get('view')==='overview')}
                <button className="jn-nav-link" type="button" onClick={e=>{open('catalog',e);setOnlyFavorites(true);}} title={collapsed?'收藏':undefined}><Star size={18}/><span>收藏</span>{stars.length>0&&<b>{stars.length}</b>}</button>
            </nav>
            {stars.length>0 && !collapsed && <nav className="jn-nav-favorites" aria-label="固定收藏">{stars.slice(0,5).map(i=><a key={i.href} href={i.href} title={i.trail}><span className="jn-nav-dot"/>{i.title}</a>)}</nav>}
            <div className="jn-nav-section-label">{group?.title}</div>
            <nav className="jn-nav-modules" aria-label="当前领域模块">{group?.modules.map(m=><React.Fragment key={m.title}>{navLink(m.pages[0].href,m.title,MODULE_ICONS[m.title] || iconFor(group.title),active?.module.title===m.title)}</React.Fragment>)}</nav>
            <div className="jn-nav-bottom"><button type="button" className="jn-nav-link" onClick={e=>open('catalog',e)} title={collapsed?'全部功能':undefined}><LayoutGrid size={18}/><span>全部功能</span><kbd>Ctrl K</kbd></button>
                <button type="button" className="jn-nav-link" onClick={()=>setCollapsed(v=>!v)} aria-label={collapsed?'展开导航':'收起导航'}>{collapsed?<PanelLeftOpen size={18}/>:<PanelLeftClose size={18}/>}<span>收起导航</span></button></div>
        </div>,sidebarHost)}
        {viewsHost && active?.module.pages.length>1 && createPortal(<nav className="jn-module-views" aria-label={`${active.module.title}页面视图`}><span>{active.module.title}</span>{active.module.pages.map(page=><a key={page.href} href={page.href} className={pathOf(page.href)===currentPath?'is-current':''} aria-current={pathOf(page.href)===currentPath?'page':undefined}>{page.title==='查看全部'?'概览':page.title}{Number(page.label)>0&&<b>{page.label}</b>}</a>)}</nav>,viewsHost)}
        {panel && <SurfaceDialog title={panel==='groups'?'切换工作领域':'查找与前往'} onClose={()=>setPanel(null)} className="jn-catalog" initialFocus={panel==='catalog'?inputRef:undefined} finalFocus={triggerRef}>
            {panel==='groups'?<div className="jn-area-options">{groups.map(g=>{const Icon=iconFor(g.title);return <button key={g.title} type="button" onClick={()=>chooseGroup(g.title)} aria-pressed={g.title===group?.title}><Icon size={21}/><span><strong>{g.title}</strong><small>{g.modules.map(m=>m.title).join(' · ')}</small></span><ChevronRight size={16}/></button>;})}</div>:<>
                <label className="jn-search-box"><Search size={18}/><input ref={inputRef} aria-label="查找页面与业务" type="search" maxLength={160} value={query} onChange={e=>setQuery(e.target.value)} placeholder="查找功能、询价、订单或售前文件名" onKeyDown={e=>{
                    if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();const next=Math.max(0,Math.min(shown.length-1,selected+(e.key==='ArrowDown'?1:-1)));setSelected(next);resultsRef.current?.querySelectorAll('.jn-catalog-result>a')[next]?.scrollIntoView({block:'nearest'});}
                    if(e.key==='Enter'&&shown[selected]){e.preventDefault();resultsRef.current?.querySelectorAll('.jn-catalog-result>a')[selected]?.click();}
                }}/></label>
                <div className="jn-catalog-filters"><button type="button" className={!onlyFavorites?'active':''} onClick={()=>setOnlyFavorites(false)}>全部功能</button><button type="button" className={onlyFavorites?'active':''} onClick={()=>setOnlyFavorites(true)}>我的收藏</button><span>{busy?'正在查找业务…':query?'文件按名称查找':'输入名称可查找业务记录'}</span></div>
                {error&&<p className="jn-inline-error" role="alert">{error}</p>}
                <div ref={resultsRef} className="jn-catalog-results" aria-label="查找结果">
                    {shown.map((item,i)=><div key={`${item.href}-${i}`} className={`jn-catalog-result ${selected===i?'is-selected':''}`}><a href={item.href} target={item.target||'_self'} rel={item.target==='_blank'?'noopener noreferrer':undefined}><span className="jn-result-icon">{item.business?<FileText size={17}/>:<LayoutGrid size={17}/>}</span><span><strong>{item.title}</strong><small>{item.trail||'我的工作'}</small></span><ArrowUpRight size={15}/></a>{!item.business&&<button type="button" className="jn-icon-button" onClick={()=>toggle(item)} aria-label={`${favorites.includes(item.href)?'取消收藏':'收藏'}${item.title}`} aria-pressed={favorites.includes(item.href)}><Star size={16} fill={favorites.includes(item.href)?'currentColor':'none'}/></button>}</div>)}
                    {!shown.length&&!busy&&<div className="jn-empty"><Search size={26}/><strong>{onlyFavorites?'还没有匹配的收藏':'没有找到匹配结果'}</strong><p>{onlyFavorites?'在全部功能中点星标，固定常用入口。':'调整关键词后再试。'}</p></div>}
                </div>
                <footer className="jn-catalog-footer"><span>↑ ↓ 选择 · 回车打开 · Esc 关闭</span><button type="button" onClick={()=>{const next=density==='compact'?'comfortable':'compact';setDensity(next);document.body.dataset.density=next;try{localStorage.setItem('jn.density',next);}catch{}}}><SlidersHorizontal size={14}/>{density==='compact'?'紧凑':'舒适'}</button></footer>
            </>}
        </SurfaceDialog>}
    </>;
}

export function mountWorkspaceShell() {
    const root = document.getElementById('jn-workspace-shell'); if(!root)return;
    const sidebar = document.querySelector('.main-sidebar .sidebar');
    const sidebarHost = document.createElement('div'); sidebarHost.id='jn-navigation';sidebar?.prepend(sidebarHost);
    const viewsHost = document.createElement('div');viewsHost.id='jn-module-views-host';document.querySelector('.content-wrapper')?.prepend(viewsHost);
    const menu = JSON.parse(root.dataset.menu || '[]');
    createRoot(root).render(<WorkspaceShell menu={menu} searchUrl={root.dataset.search} homeUrl={root.dataset.home} sidebarHost={sidebar?sidebarHost:null} viewsHost={viewsHost}/>);
}
