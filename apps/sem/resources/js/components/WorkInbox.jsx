import React, { useEffect, useRef, useState } from 'react';
import { Inbox, Search, RotateCw, Star, ArrowUpRight, FileText, Clock3, CheckCheck, ChevronLeft, ChevronRight, Maximize2, Minimize2 } from 'lucide-react';
import { Segments, SurfaceDialog, readPreference, savePreference } from '../ui/WorkspaceKit';
import useMediaQuery from './table/useMediaQuery';

const SCOPES=[['mine','我负责的'],['all','可见事项'],['requested','我发起的处理']];
const TYPES={presales:'售前核对',quote_review:'报价核对',technical_handoff:'技术交接',data_review:'资料审核',data_access:'查看申请',data_task:'资料协作',quote:'报价',order:'订单',invoice:'发票',lead:'线索'};
const when=value=>value?String(value).slice(0,16).replace('T',' '):'未设置';
const preferences=()=>{const p=readPreference('inbox',{});return p&&typeof p==='object'?p:{};};
function readStars(){const v=readPreference('inbox.stars',[]);return Array.isArray(v)?v.filter(x=>typeof x==='string'):[];}

function TaskDetail({item, onClose, finalFocus, starred, toggleStar}) {
    const mobile=useMediaQuery('(max-width: 760px)');
    const [detail,setDetail]=useState(null),[error,setError]=useState(''),[tab,setTab]=useState('info'),[expanded,setExpanded]=useState(false),[attempt,setAttempt]=useState(0);
    const [width,setWidth]=useState(()=>Math.min(680,Math.max(420,Number(readPreference('inbox.panelWidth',480))||480)));
    useEffect(()=>{
        if(!item.detail_url)return;
        const abort=new AbortController();setDetail(null);setError('');
        fetch(item.detail_url,{credentials:'same-origin',headers:{Accept:'application/json'},signal:abort.signal}).then(async r=>{if(!r.ok)throw new Error(r.status===404?'事项不存在或访问权限已变化。':'详情暂时无法读取，请重试。');return r.json();}).then(data=>{if(!abort.signal.aborted)setDetail(data);}).catch(e=>{if(!abort.signal.aborted)setError(e.message);});
        return ()=>abort.abort();
    },[item.key,attempt]);
    const run=detail?.runs.find(r=>r.id===item.run_id);
    const href=new URL(item.url,location.origin);href.searchParams.set('return','inbox');
    return <SurfaceDialog title="事项详情" onClose={onClose} className={`jn-task-panel ${expanded?'is-expanded':''}`} finalFocus={finalFocus} modal={mobile}>
        <div className="jn-task-resize" style={{'--panel-width':`${width}px`}}>
            <div className="jn-task-subhead"><span className="jn-type-label"><FileText size={15}/>{item.source_label}</span><div><button className="jn-icon-button" type="button" aria-label={starred?'取消关注':'关注事项'} aria-pressed={starred} onClick={toggleStar}><Star size={17} fill={starred?'currentColor':'none'}/></button><button className="jn-icon-button jn-detail-expand" type="button" aria-label={expanded?'恢复面板宽度':'展开详情面板'} onClick={()=>setExpanded(v=>!v)}>{expanded?<Minimize2 size={17}/>:<Maximize2 size={17}/>}</button></div></div>
            <div className="jn-task-intro"><h2>{item.title}</h2><p>{item.company || '客户待补充'} · {item.code}</p><span className={`jn-status tone-${item.tone}`}>{item.state}</span></div>
            {item.detail_url&&<Segments value={tab} onChange={setTab} label="事项详情视图" items={[['info','任务'],['files','资料'],['history','记录']]}/>}
            <div className="jn-task-body">
                {error?<div className="jn-inline-error" role="alert">{error}<button className="btn btn-sm btn-default" onClick={()=>setAttempt(v=>v+1)}>重试</button></div>:<>
                    {tab==='info'&&<><dl className="jn-task-properties"><div><dt>负责人</dt><dd>{item.owner}</dd></div><div><dt>{item.source==='lead'?'收到日期':'业务日期'}</dt><dd>{when(item.date)}</dd></div>{item.kind&&<div><dt>业务类型</dt><dd>{item.kind}</dd></div>}</dl><section className="jn-next-action"><span>下一步</span><strong>{item.action}</strong><p>{item.reason}</p></section>
                        {run&&<div className="jn-run-summary"><span className="ps-simulation">模拟测试</span><p>第 {run.id} 次处理 · {when(run.created_at)}</p><p>{run.stale&&run.state==='review'?'候选已过期，需要重新提取。':`${Object.keys(run.output?.candidates||{}).length} 项候选 · ${run.sources.length} 份来源`}</p><p>{run.review?'已有人工作出核对结论。':'后台运行结束后，仍需人工核对确认。'}</p></div>}
                        {item.detail_url&&!detail&&<p role="status" className="jn-muted">正在读取最新处理记录…</p>}
                    </>}
                    {tab==='files'&&(!detail?<p role="status">正在读取资料…</p>:detail.documents.length?<div className="jn-task-files">{detail.documents.map(d=><a key={d.id} href={`${item.detail_url}/versions/${d.versions[0].id}/download`}><FileText size={19}/><span><strong>{d.name}</strong><small>第 {d.versions[0].version} 版 · {(d.versions[0].size/1024).toFixed(1)} KB</small></span><ArrowUpRight size={15}/></a>)}</div>:<p className="jn-muted">还没有上传资料。</p>)}
                    {tab==='history'&&(!detail?<p role="status">正在读取记录…</p>:<ol className="jn-event-list">{detail.events.map(e=><li key={e.id}><span/><div><strong>{e.label}</strong><small>{e.actor_name||'系统'} · {when(e.created_at)}</small>{e.detail.note&&<p>{e.detail.note}</p>}</div></li>)}{!detail.events.length&&<li>暂无记录。</li>}</ol>)}
                </>}
            </div>
            <footer className="jn-task-footer"><label className="jn-width-control">面板宽度<input aria-label="详情面板宽度" type="range" min="420" max="680" step="20" value={width} onChange={e=>{setWidth(Number(e.target.value));savePreference('inbox.panelWidth',Number(e.target.value));}}/></label><a className={`btn btn-primary ${error?'disabled':''}`} aria-disabled={!!error} href={error?undefined:href.href}>{item.action}<ArrowUpRight size={16}/></a></footer>
        </div>
    </SurfaceDialog>;
}

export default function WorkInbox({endpoint}) {
    const prefs=preferences();
    const [scope,setScope]=useState(SCOPES.some(([v])=>v===prefs.scope)?prefs.scope:'mine'),[query,setQuery]=useState(typeof prefs.query==='string'?prefs.query:''),[type,setType]=useState(TYPES[prefs.type]?prefs.type:''),[watching,setWatching]=useState(!!prefs.watching);
    const [stars,setStars]=useState(readStars),[data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[refresh,setRefresh]=useState(0),[selected,setSelected]=useState(null),[page,setPage]=useState(1);
    const triggerRef=useRef(null),listRef=useRef(null),restoreScroll=useRef(Number(prefs.scroll)||0);
    useEffect(()=>{savePreference('inbox',{scope,query,type,watching,scroll:listRef.current?.scrollTop||0});setPage(1);},[scope,query,type,watching]);
    useEffect(()=>{
        if(!endpoint){setLoading(false);setError('当前页面没有可用的事项入口。');return;}
        const abort=new AbortController();setLoading(true);setError('');
        const timer=setTimeout(async()=>{
            try{const u=new URL(endpoint,location.origin);u.searchParams.set('scope',scope);if(query.trim())u.searchParams.set('q',query.trim());const r=await fetch(u,{credentials:'same-origin',headers:{Accept:'application/json'},signal:abort.signal});
                if(!r.ok)throw new Error([401,419].includes(r.status)?'登录已过期，请重新登录后继续。':'事项暂时无法读取，请重试。');const result=await r.json();if(!abort.signal.aborted)setData(result);
            }catch(e){if(!abort.signal.aborted){setError(e.message);setData(null);}}finally{if(!abort.signal.aborted)setLoading(false);}
        },query.trim()?200:0);
        return()=>{clearTimeout(timer);abort.abort();};
    },[scope,query,refresh,endpoint]);
    useEffect(()=>{if(data&&listRef.current&&restoreScroll.current){listRef.current.scrollTop=restoreScroll.current;restoreScroll.current=0;}},[data]);
    useEffect(()=>{const focus=()=>setRefresh(v=>v+1);window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus);},[]);
    const rows=(data?.items||[]).filter(i=>(!type||i.source===type)&&(!watching||stars.includes(i.key)));
    const maxPage=Math.max(1,Math.ceil(rows.length/25)),currentPage=Math.min(page,maxPage),visible=rows.slice((currentPage-1)*25,currentPage*25);
    const selectedItem=data?.items.find(i=>i.key===selected);
    function star(key){const next=stars.includes(key)?stars.filter(v=>v!==key):[...stars,key].slice(-200);setStars(next);savePreference('inbox.stars',next);}
    function open(item,event){triggerRef.current=event.currentTarget;setSelected(item.key);}
    const reset=()=>{setQuery('');setType('');setWatching(false);};
    return <div className="jn-inbox">
        <div className="jn-inbox-toolbar"><Segments value={scope} onChange={v=>{setScope(v);setSelected(null);}} items={SCOPES} label="事项范围"/><div className="jn-inbox-actions"><button className={`jn-text-button ${watching?'active':''}`} aria-pressed={watching} onClick={()=>setWatching(v=>!v)}><Star size={15}/>关注</button><button className="jn-icon-button" aria-label="刷新事项" onClick={()=>setRefresh(v=>v+1)} disabled={loading}><RotateCw size={16} className={loading?'jn-spin':''}/></button></div></div>
        <div className="jn-inbox-search"><label className="jn-search-box"><Search size={17}/><input type="search" maxLength={160} aria-label="搜索事项" value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索事项、客户或编号"/></label><label><span className="sr-only">事项类型</span><select aria-label="事项类型" value={type} onChange={e=>setType(e.target.value)}><option value="">所有类型</option>{(data?.sources||[]).map(s=><option key={s.key} value={s.key}>{s.label}（{s.total}）</option>)}</select></label></div>
        <div className="jn-inbox-summary"><span>{loading?'正在更新事项…':error?'读取未完成':`${rows.length} 项${watching?'已关注':''}事项`}</span><span>{scope==='all'?'仅展示有权访问的事项':scope==='requested'?'展示你发起的未结束处理':'按当前需要你处理的事项归集'}{watching?' · 关注保存在本机':''}</span></div>
        <div className="jn-work-list" ref={listRef} aria-busy={loading} onScroll={e=>savePreference('inbox',{scope,query,type,watching,scroll:e.currentTarget.scrollTop})}>
            {error?<div className="jn-empty" role="alert"><Inbox size={30}/><strong>{error}</strong><button className="btn btn-default" onClick={()=>setRefresh(v=>v+1)}>重新读取</button></div>
                :loading&&!data?<div className="jn-loading-rows" role="status" aria-label="正在读取事项">{[1,2,3,4].map(i=><div key={i}><span/><span/></div>)}</div>
                :!visible.length&&!loading?<div className="jn-empty"><CheckCheck size={30}/><strong>{query||type||watching?'没有匹配的事项':'当前没有待处理事项'}</strong><p>{query||type||watching?'调整筛选，或查看其他事项范围。':'可以继续查看询价资料，或切换到工作概览。'}</p>{(query||type||watching)&&<button className="btn btn-default" onClick={reset}>清除筛选</button>}</div>
                :visible.map(item=><article key={item.key} className={`jn-work-row ${selected===item.key?'is-selected':''}`}><button className="jn-work-open" onClick={e=>open(item,e)} aria-label={`查看事项：${item.title}`}><span className={`jn-work-icon tone-${item.tone}`}><FileText size={18}/></span><span className="jn-work-description"><strong>{item.title}</strong><small>{item.source_label} · {item.company||'客户待补充'} · {item.code}</small></span><span className="jn-work-meta"><span className={`jn-status tone-${item.tone}`}>{item.state}</span><small>{item.owner}{item.date&&` · ${item.date}`}</small></span><ChevronRight className="jn-row-arrow" size={16}/></button><button type="button" className="jn-icon-button jn-row-star" aria-label={`${stars.includes(item.key)?'取消关注':'关注'}：${item.title}`} aria-pressed={stars.includes(item.key)} onClick={()=>star(item.key)}><Star size={15} fill={stars.includes(item.key)?'currentColor':'none'}/></button></article>)}
        </div>
        {data&&data.total>data.items.length&&<p className="jn-limit-note">共有 {data.total} 项。每类展示前 {data.limit_per_source} 项，请用关键词查找，或进入对应模块查看完整记录。</p>}
        {rows.length>25&&<div className="jn-inbox-pagination"><span>第 {currentPage} / {maxPage} 页</span><button className="jn-icon-button" disabled={currentPage===1} aria-label="上一页事项" onClick={()=>{setPage(p=>p-1);listRef.current.scrollTop=0;}}><ChevronLeft size={17}/></button><button className="jn-icon-button" disabled={currentPage===maxPage} aria-label="下一页事项" onClick={()=>{setPage(p=>p+1);listRef.current.scrollTop=0;}}><ChevronRight size={17}/></button></div>}
        <div className="jn-inbox-footnote"><Clock3 size={14}/><span>状态来自原业务记录，处理结果在对应业务中确认。</span></div>
        {selectedItem&&<TaskDetail key={selectedItem.key} item={selectedItem} onClose={()=>setSelected(null)} finalFocus={triggerRef} starred={stars.includes(selectedItem.key)} toggleStar={()=>star(selectedItem.key)}/>}
    </div>;
}
