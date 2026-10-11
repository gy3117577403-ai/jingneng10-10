import React,{useEffect,useMemo,useRef,useState} from 'react';
import {ArrowUp,BookOpen,ChevronLeft,ChevronRight,History,Plus,RefreshCw,SlidersHorizontal,Square,ThumbsDown,ThumbsUp,Archive,RotateCcw,ArrowUpRight} from 'lucide-react';
import {confirmAction} from '../../ui/confirmAction';
import {ErrorBox,when,EditDialog,Field} from './kit';
import '../../../css/data-assistant.css';

const labels={queued:'等待处理',processing:'正在处理',ready:'已完成',no_sources:'未找到来源',insufficient_evidence:'依据不足',failed:'处理失败',cancelled:'已取消',restricted:'来源已不可用'};
export function SourceAnswer({run,onOpen,onAction,busy}){
    const sources=new Map((run.sources||[]).map(s=>[s.id,s]));
    return <article className="da-turn" aria-label={`问题：${run.question}`}>
        <div className="da-question"><p>{run.question}</p><small>{when(run.created_at)}</small></div>
        <div className="da-answer-head"><BookOpen size={16}/><strong>{run.mode==='openai'?'AI 解读 · ChatGPT 套餐':run.mode==='demo'?'模拟测试 · 未调用模型':'原文摘录 · 未使用 AI'}</strong><span role="status">{labels[run.state]}</span></div>
        {['queued','processing'].includes(run.state)&&<div className="da-processing"><span className="da-pulse"/>{run.mode==='openai'?'正在核对来源并生成解读…':'正在核对权限并整理来源…'}<button className="dc-text-button" disabled={busy} onClick={()=>onAction(run,'cancel')}><Square size={12}/>取消</button></div>}
        {run.state==='ready'&&<>
            <div className="da-passages">{run.answer?.paragraphs?.map((p,i)=><div key={i}><blockquote>{p.text}</blockquote><div className="da-citations">{p.citations.map((c,j)=>{const s=sources.get(c.source_id);return s?<button key={j} onClick={()=>onOpen(run,s)} title={c.quote}><span>{c.source_id.replace('S','')}</span>{s.title} · 第{s.version}版 · {s.location}<ArrowUpRight size={13}/></button>:null;})}</div></div>)}</div>
            {run.sources.some(s=>s.historical)&&<p className="da-note">部分来源已有更新版本。这里保留查询时的版本，使用前请核对。</p>}
            {run.retrieval?.limited&&<p className="da-note">已列出本次匹配的前八条来源，可补充关键词或分类缩小范围。</p>}
            <div className="da-feedback"><span>这次资料查找是否有帮助？</span><button aria-label="有帮助" aria-pressed={run.feedback==='helpful'} disabled={busy} onClick={()=>onAction(run,'helpful')}><ThumbsUp size={14}/></button><button aria-label="反馈问题" aria-pressed={run.feedback==='incorrect'} disabled={busy} onClick={()=>onAction(run,'incorrect')}><ThumbsDown size={14}/></button>{run.feedback&&<small>反馈已保存</small>}</div>
        </>}
        {run.state==='no_sources'&&<div className="da-state"><strong>没有找到可引用的资料</strong><p>尝试在查询设置中填写更具体的关键词，或确认资料已发布、正文已处理完成。本次不会补写无来源的答案。</p></div>}
        {run.state==='insufficient_evidence'&&<div className="da-state"><strong>现有资料不足以回答这个问题</strong><p>AI 没有补写无依据的结论。请补充资料，或缩小问题和关键词范围后重新提问。</p></div>}
        {run.mode==='openai'&&run.provider?.attempts?.length>0&&<details className="da-scope"><summary>模型与用量</summary><p>{run.provider.model} · ChatGPT 套餐 · 已记录 {run.provider.attempts.length} 次处理</p>{run.provider.attempts.map((a,i)=><p key={i}>第 {i+1} 次：{Number.isInteger(a.usage?.total_tokens)?`输入 ${a.usage.input_tokens??'—'}，输出 ${a.usage.output_tokens??'—'}，共 ${a.usage.total_tokens} 个词元`:'服务未返回完整用量，不能据此认定未计费'}</p>)}<p>词元数量不等于积分扣除数。实际额度请以 ChatGPT 用量设置为准。</p></details>}
        {run.state==='restricted'&&<div className="da-state"><strong>来源权限或内容状态已变化</strong><p>当前回答及引用已隐藏。请重新提问，按现在的权限查找资料。</p></div>}
        {['failed','cancelled'].includes(run.state)&&<div className="da-state"><p>{run.error||'本次查询已取消，原始资料未被修改。'}</p><button className="btn btn-default" disabled={busy} onClick={()=>onAction(run,'retry')}><RotateCcw size={14}/>重新查询</button></div>}
        {run.retrieval?.incomplete_files>0&&<p className="da-note">已检查范围内有附件尚未完整提取正文，结果可能不完整。</p>}
        {run.retrieval?.terms?.length>0&&<details className="da-scope"><summary>本次检索范围</summary><p>关键词：{run.retrieval.terms.join('、')} · {run.include_history?'包含历史发布版':'当前发布版'}</p><p>每个问题独立检索。摘录不代表 AI 理解、完整制度说明或业务审批结论。</p></details>}
    </article>;
}

export default function DataAssistant({api,categories,onOpen,active=true,sourceOpen=false}){
    const [id,setId]=useState(()=>Number(new URLSearchParams(location.search).get('conversation'))||null);
    const [list,setList]=useState(null),[detail,setDetail]=useState(null),[page,setPage]=useState(1),[archived,setArchived]=useState(false),[refresh,setRefresh]=useState(0),[error,setError]=useState(''),[loading,setLoading]=useState(false);
    const [question,setQuestion]=useState(''),[keywords,setKeywords]=useState(''),[category,setCategory]=useState(''),[includeHistory,setIncludeHistory]=useState(false),[mode,setMode]=useState('excerpt'),[settings,setSettings]=useState(false),[busy,setBusy]=useState(false),[feedback,setFeedback]=useState(null);
    const [historyOpen,setHistoryOpen]=useState(false);
    const scroll=useRef(null),lastShown=useRef(null);
    const requestLock=useRef(false),receipt=useRef(null),input=useRef(null),generation=useRef(0),selection=useRef(id);selection.current=id;
    const pending=detail?.runs.some(r=>['queued','processing'].includes(r.state));
    const caps=detail?.capabilities||list?.capabilities;
    const connection=caps?.connection;
    const canSend=question.trim()&&!busy&&!pending&&!detail?.conversation.archived&&(!id||detail)&&(!detail||detail.runs.length<50)&&(mode!=='openai'||caps?.openai);
    useEffect(()=>{if(!active||id)return;const timer=setInterval(()=>setRefresh(n=>n+1),15000);return()=>clearInterval(timer);},[active,id]);
    useEffect(()=>{if(!active)return;const abort=new AbortController();api.get(`/assistant?${new URLSearchParams({page,archived:archived?'1':'0'})}`,abort.signal).then(d=>{setList(d);if(d.page!==page)setPage(d.page);}).catch(e=>{if(!abort.signal.aborted){setError(e.message);setList(null);}});return()=>abort.abort();},[api,page,archived,refresh,active]);
    useEffect(()=>{
        if(!id){setDetail(null);setLoading(false);return;}if(!active)return;
        let stopped=false,controller=null,timer=null;
        async function load(clear=false){
            if(stopped)return;controller?.abort();controller=new AbortController();const current=++generation.current;
            if(clear){setDetail(null);setLoading(true);}
            try{const d=await api.get(`/assistant/conversations/${id}`,controller.signal);if(stopped||generation.current!==current)return;setDetail(d);setError('');clearTimeout(timer);timer=setTimeout(()=>load(),d.runs.some(r=>['queued','processing'].includes(r.state))?1400:15000);}
            catch(e){if(stopped||generation.current!==current||controller.signal.aborted)return;setError(e.message);setDetail(null);}
            finally{if(!stopped&&generation.current===current)setLoading(false);}
        }
        const focus=()=>load(true);const visibility=()=>{if(document.hidden){controller?.abort();clearTimeout(timer);generation.current++;setDetail(null);}else load(true);};
        load(true);window.addEventListener('focus',focus);document.addEventListener('visibilitychange',visibility);
        return()=>{stopped=true;controller?.abort();clearTimeout(timer);generation.current++;window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',visibility);};
    },[api,id,refresh,active]);
    useEffect(()=>{const last=detail?.runs.at(-1);if(!last)return;const key=`${id}:${last.id}:${last.state}`;if(lastShown.current!==key){scroll.current?.scrollTo?.({top:scroll.current.lastElementChild?.offsetTop||0});lastShown.current=key;}},[id,detail]);
    async function post(path,data){
        if(requestLock.current)return null;requestLock.current=true;setBusy(true);setError('');
        const signature=JSON.stringify([path,data]);if(receipt.current?.signature!==signature)receipt.current={signature,key:crypto.randomUUID()};
        try{const result=await api.post(path,data,receipt.current.key);receipt.current=null;return result;}
        catch(e){setError(e.message);return null;}finally{requestLock.current=false;setBusy(false);}
    }
    function select(value){setId(value);setHistoryOpen(false);setDetail(null);const url=new URL(location.href);if(value)url.searchParams.set('conversation',String(value));else url.searchParams.delete('conversation');history.replaceState(null,'',url);}
    async function navigate(value){if(busy)return;if(question.trim()&&!await confirmAction('切换会话将清除尚未提交的问题。',{title:'切换会话',confirmLabel:'切换'}))return;setQuestion('');setError('');select(value);input.current?.focus();}
    async function submit(e){e.preventDefault();if(!canSend)return;const result=await post('/assistant/ask',{conversation_id:id,question:question.trim(),keywords:keywords.trim(),category_id:category?Number(category):null,include_history:includeHistory,mode,demo_ack:mode==='demo'});if(result){setQuestion('');select(result.id);setRefresh(n=>n+1);}}
    async function action(run,kind){
        if(kind==='incorrect'){setFeedback(run);return;}
        if(kind==='retry'&&run.mode==='openai'&&!await confirmAction('重新查询会发起新的模型请求，可能产生新的套餐用量。',{title:'重新进行 AI 解读',confirmLabel:'重新查询'}))return;
        const result=await post(`/assistant/items/${run.id}/${kind==='helpful'?'feedback':kind}`,kind==='helpful'?{feedback:'helpful',note:''}:{});if(result)setRefresh(n=>n+1);
    }
    async function connectionAction(action){
        if(action==='disconnect'&&!await confirmAction('将停止当前 AI 查询并清除本机授权。之后使用需要重新授权。',{title:'断开 ChatGPT',confirmLabel:'断开'}))return;
        const result=await post('/assistant/connection',{action});if(result)setRefresh(n=>n+1);
    }
    async function archive(){if(!id||busy)return;const restoring=detail?.conversation.archived;if(!restoring&&!await confirmAction('归档后会话会保留，尚未结束的查询会取消。',{title:'归档会话',confirmLabel:'归档'}))return;const result=await post(`/assistant/items/${id}/${restoring?'restore':'archive'}`,{});if(result){select(null);setRefresh(n=>n+1);}}
    async function source(run,s){
        const selected=selection.current;setError('');
        try{const d=await api.get(`/assistant/conversations/${selected}`);if(selection.current!==selected)return;setDetail(d);const fresh=d.runs.find(r=>r.id===run.id)?.sources.find(x=>x.id===s.id);
            if(!fresh){setError('来源已不可用，请重新查询。');return;}onOpen({id:fresh.record_id,version:fresh.version_id,file:fresh.file_id,page:fresh.page,row:fresh.row,source:fresh.location});}
        catch(e){setDetail(null);setError(e.message);}
    }
    const examples=useMemo(()=>['现场核对有哪些要求？','设备点检需要记录什么？'],[]);
    return <section className={`da-workspace ${historyOpen?'history-open':''} ${sourceOpen?'with-source':''}`}>
        {historyOpen&&<aside className="da-history"><div className="da-history-top"><strong><History size={16}/>我的会话</strong><button className="dc-icon" aria-label="新建会话" onClick={()=>navigate(null)} disabled={busy}><Plus size={18}/></button></div><label className="dc-check"><input type="checkbox" checked={archived} onChange={e=>{setArchived(e.target.checked);setPage(1);}}/>已归档</label>
            <nav aria-label="资料助手会话">{list?.items.map(c=><button key={c.id} className={id===c.id?'is-selected':''} onClick={()=>navigate(c.id)} aria-current={id===c.id?'page':undefined}><strong>{c.title}</strong><small>{when(c.updated_at)}</small></button>)}</nav>
            {list&&!list.items.length&&<p className="da-history-empty">{archived?'暂无归档会话':'查询会保存在这里，仅你本人可见。'}</p>}
            {list?.pages>1&&<div className="dc-pagination"><button className="dc-icon" aria-label="上一页会话" disabled={page<=1} onClick={()=>setPage(p=>p-1)}><ChevronLeft size={16}/></button><span>{page} / {list.pages}</span><button className="dc-icon" aria-label="下一页会话" disabled={page>=list.pages} onClick={()=>setPage(p=>p+1)}><ChevronRight size={16}/></button></div>}
        </aside>}
        <div className="da-main"><header className="da-heading"><div className="da-heading-title"><button className="dc-icon" aria-label={historyOpen?'收起会话记录':'查看会话记录'} aria-expanded={historyOpen} title="我的会话" onClick={()=>setHistoryOpen(v=>!v)}><History size={19}/></button><div><h3>{detail?.conversation.title||'资料助手'}</h3><span>从授权资料中查找依据</span></div></div><div className="dc-inline"><button type="button" className="da-model-state" aria-label="查看模型连接" onClick={()=>setSettings(v=>!v)}>{mode==='openai'?'AI 解读':'原文摘录'}</button><button className="dc-icon" aria-label="新建查询" title="新建查询" onClick={()=>navigate(null)} disabled={busy}><Plus size={18}/></button>{id&&<><button className="dc-icon" aria-label="刷新会话" onClick={()=>setRefresh(n=>n+1)}><RefreshCw size={16}/></button>{detail&&<button className="dc-icon" aria-label={detail.conversation.archived?'恢复会话':'归档会话'} onClick={archive} disabled={busy}>{detail.conversation.archived?<RotateCcw size={17}/>:<Archive size={17}/>}</button>}</>}</div></header>
            <ErrorBox error={error}/>
            <div className="da-conversation" ref={scroll} aria-busy={loading}>{loading?<p className="da-state" role="status">正在读取会话并核对权限…</p>:detail?detail.runs.map(r=><SourceAnswer key={r.id} run={r} onOpen={source} onAction={action} busy={busy||Boolean(detail.conversation.archived)}/>):!id?<div className="da-welcome"><BookOpen size={26}/><h3>从公司资料里，找到可核对的依据</h3><p>输入问题或关键词，查看依据与对应版本。可选择原文摘录，或用已连接的 AI 解读资料。</p><div>{examples.map(text=><button key={text} onClick={()=>{setQuestion(text);input.current?.focus();}}>{text}<ArrowUpRight size={14}/></button>)}</div></div>:null}</div>
            {detail?.conversation.archived?<p className="da-archived">会话已归档，恢复后可以继续查询。</p>:<form className="da-composer" onSubmit={submit}>
                {settings&&<div className="da-settings"><Field label="检索关键词" hint="可选，多项用空格分隔；未填写时从本次问题提取。"><input maxLength={200} value={keywords} onChange={e=>setKeywords(e.target.value)} placeholder="例如：现场核对 密封情况"/></Field><Field label="资料分类"><select value={category} onChange={e=>setCategory(e.target.value)}><option value="">全部授权分类</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><Field label="查询方式"><select value={mode} onChange={e=>setMode(e.target.value)}><option value="excerpt">原文摘录（不使用 AI）</option>{caps?.demo&&<option value="demo">模拟测试（未调用模型）</option>}<option value="openai" disabled={!caps?.openai}>AI 解读（ChatGPT 套餐）</option></select></Field><label className="dc-check"><input type="checkbox" checked={includeHistory} onChange={e=>setIncludeHistory(e.target.checked)}/>包含历史发布版本</label></div>}
                {settings&&connection&&<div className="da-connection"><div><strong>ChatGPT 套餐</strong><span>{connection.account}{connection.model?' · '+connection.model:''}</span></div><p role="status">{connection.message}</p><div className="da-connection-actions"><button type="button" className="dc-text-button" onClick={()=>setRefresh(n=>n+1)} disabled={busy}>刷新状态</button>{['error','reauthorize','paused'].includes(connection.status)&&<button type="button" className="dc-text-button" onClick={()=>connectionAction('check')} disabled={busy}>重新检查连接</button>}{connection.status==='paused'?<button type="button" className="dc-text-button" onClick={()=>connectionAction('enable')} disabled={busy}>恢复 AI 解读</button>:connection.available&&<button type="button" className="dc-text-button" onClick={()=>connectionAction('pause')} disabled={busy}>暂停 AI 解读</button>}{connection.connection_url&&<a href={connection.connection_url} target="_blank" rel="noreferrer">管理授权 ↗</a>}<a href="https://chatgpt.com/settings/usage" target="_blank" rel="noreferrer">查看套餐用量 ↗</a>{!['disconnected','disconnecting','offline'].includes(connection.status)&&<button type="button" className="dc-text-button" onClick={()=>connectionAction('disconnect')} disabled={busy}>断开连接</button>}</div></div>}
                {mode==='openai'&&<p className="da-model-note">{caps?.openai?'将问题与有权查看的来源片段发送给 OpenAI，使用当前账号的 ChatGPT 套餐。回答供核对，不替代业务审批。':'套餐连接当前不可用，请检查查询设置。问题已保留，可恢复连接或改选原文摘录。'}</p>}
                {mode==='demo'&&<p className="da-demo-banner">模拟测试：使用固定规则验证回答和引用流程，不代表真实 AI 推理。</p>}
                <label className="da-input-label" htmlFor="da-question">问题或关键词</label><textarea id="da-question" ref={input} disabled={busy} value={question} onChange={e=>setQuestion(e.target.value)} maxLength={1000} rows={2} placeholder="查找条款、设备编号或需要核对的内容…" onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();e.currentTarget.form.requestSubmit();}}}/>
                <div className="da-composer-bottom"><button type="button" className="dc-text-button" aria-expanded={settings} onClick={()=>setSettings(v=>!v)}><SlidersHorizontal size={15}/>查询设置{includeHistory?' · 含历史版本':''}</button><span>{pending?'正在处理上一个问题':detail?.runs.length>=50?'本会话已满，请新建会话':'每次独立检索 · Ctrl / ⌘ + Enter 发送'}</span><button type="submit" className="da-send" disabled={!canSend} aria-label="发送问题"><ArrowUp size={19}/></button></div>
            </form>}
        </div>
        {feedback&&<EditDialog title="反馈资料查找问题" initial={{note:feedback.feedback_note||''}} label="提交反馈" onClose={()=>setFeedback(null)} onSave={async value=>{const result=await post(`/assistant/items/${feedback.id}/feedback`,{feedback:'incorrect',note:value.note});if(!result)throw new Error('反馈未提交，请重试。');setRefresh(n=>n+1);}}>{(value,set)=><Field label="问题说明"><textarea rows={4} maxLength={1000} value={value.note} onChange={e=>set({note:e.target.value})} placeholder="例如：来源不相关、版本不合适、需要补充资料"/></Field>}</EditDialog>}
    </section>;
}
