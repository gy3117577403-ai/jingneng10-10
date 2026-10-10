import React,{useEffect,useState} from 'react';
import {Search,FileSearch,ArrowUpRight,ChevronLeft,ChevronRight} from 'lucide-react';
import {ErrorBox} from './kit';

export function Highlight({text,query}){
    if(!query)return text;
    const escaped=query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    return String(text).split(new RegExp(`(${escaped})`,'ig')).map((part,i)=>part.toLocaleLowerCase()===query.toLocaleLowerCase()?<mark key={i}>{part}</mark>:part);
}
export default function DocumentSearch({api,categories,onOpen,refresh}){
    const [q,setQ]=useState(''),[category,setCategory]=useState(''),[history,setHistory]=useState(false),[page,setPage]=useState(1),[result,setResult]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
    useEffect(()=>setPage(1),[q,category,history]);
    useEffect(()=>{const abort=new AbortController();setBusy(true);setResult(null);setError('');const timer=setTimeout(()=>api.get(`/search?${new URLSearchParams({q,category,history:history?'1':'0',page})}`,abort.signal).then(d=>{setResult(d);if(d.page!==page)setPage(d.page);}).catch(e=>{if(!abort.signal.aborted)setError(e.message);}).finally(()=>{if(!abort.signal.aborted)setBusy(false);}),220);return()=>{abort.abort();clearTimeout(timer);};},[api,q,category,history,page,refresh]);
    return <section className="dc-search-panel"><div className="dc-toolbar"><div className="dc-search"><Search size={17}/><input aria-label="搜索附件正文" placeholder="输入要查找的文字、设备编号或条款" maxLength={200} value={q} onChange={e=>setQ(e.target.value)}/></div><div className="dc-inline"><select aria-label="正文搜索分类" value={category} onChange={e=>setCategory(e.target.value)}><option value="">全部授权分类</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><label className="dc-check"><input type="checkbox" checked={history} onChange={e=>setHistory(e.target.checked)}/>包含历史发布版</label></div></div>
        <div className="dc-list-meta"><span className="dc-muted">{history?'搜索有权查看的当前及历史发布版本':'默认搜索当前发布版本 · 草稿不参与检索'}</span>{result&&q.trim()&&<span className="dc-muted">{result.limited?'显示前':''}{result.total}条来源片段</span>}</div><ErrorBox error={error}/>
        {busy?<p className="dc-empty" role="status">正在查找授权资料…</p>:!q.trim()?<div className="dc-empty"><FileSearch size={28}/><h3>找到原文，再做判断</h3><p>搜索附件正文和台账字段。每条结果保留文件、版本与所在位置。</p></div>:result&&!result.items.length?<div className="dc-empty"><FileSearch size={28}/><h3>未找到可见来源</h3><p>尝试更短的关键词，或检查资料是否已经发布、正文是否处理完成。</p></div>:<div className="dc-search-results">{result?.items.map((s,i)=><button key={`${s.version_id}:${s.chunk_id||'fields'}:${i}`} className="dc-source-result" onClick={()=>onOpen({id:s.record_id,version:s.version_id,file:s.file_id,page:s.page,row:s.row,query:q,source:s.location})}><div className="dc-source-heading"><strong>{s.title}</strong><ArrowUpRight size={16}/></div><div className="dc-source-meta"><span>{s.category}</span><span>版本 {s.version}{s.historical?' · 历史版':''}</span><span>{s.filename||'结构化记录'} · {s.location}</span></div><p><Highlight text={s.snippet} query={q}/></p></button>)}</div>}
        {result?.incomplete_files>0&&q.trim()&&<p className="dc-search-note">本次已检查范围内至少有 {result.incomplete_files} 份附件未完整提取正文。扫描件、未支持格式和未处理文件中的文字不会被自动识别。</p>}
        {result?.limited&&<p className="dc-search-note">结果较多，请补充关键词或选择分类以缩小范围。</p>}
        {result?.pages>1&&<div className="dc-pagination"><span>第{result.page}页，共{result.pages}页</span><button className="dc-icon" aria-label="上一页搜索结果" disabled={page<=1} onClick={()=>setPage(p=>p-1)}><ChevronLeft size={18}/></button><button className="dc-icon" aria-label="下一页搜索结果" disabled={page>=result.pages} onClick={()=>setPage(p=>p+1)}><ChevronRight size={18}/></button></div>}
    </section>;
}
