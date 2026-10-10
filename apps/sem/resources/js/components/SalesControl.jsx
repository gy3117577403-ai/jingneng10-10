import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Check, FileCheck2, Send, Download, RefreshCw, ClipboardCheck} from 'lucide-react';
import {SurfaceDialog} from '../ui/WorkspaceKit';
import {confirmAction} from '../ui/confirmAction';

const STATES = {pending:'待核对',approved:'已确认',rejected:'已退回',withdrawn:'已撤回',superseded:'已被新版替代',working:'处理中',needs_info:'待补充',returned:'已退回',completed:'已完成',cancelled:'已撤回'};
const ACTIONS = {submit:'提交报价核对',approve:'确认报价版本',reject:'退回修改',withdraw:'撤回核对',send:'发起技术交接',accept:'接收交接',request_info:'要求补充',return:'退回交接',complete:'完成交接',cancel:'撤回交接'};
const date = value => value ? String(value).slice(0,16).replace('T',' ') : '未设置';
const money = (value,currency='CNY') => new Intl.NumberFormat('zh-CN',{style:'currency',currency}).format(Number(value)||0);
const number = value => new Intl.NumberFormat('zh-CN',{maximumFractionDigits:3}).format(Number(value)||0);
async function request(url, options={}) {
    const response = await fetch(url,{credentials:'same-origin',...options,headers:{Accept:'application/json',...options.headers}});
    let data;try {data = await response.json();} catch {throw new Error('服务暂时不可用，请稍后重试。');}
    if (!response.ok) {
        const message={401:'登录已过期，请重新登录。',419:'登录已过期，请重新登录。',403:'你没有执行此操作的权限。',404:'此记录不存在或你已没有访问权限。',429:'操作过于频繁，请稍后重试；本次填写已保留。'}[response.status];
        throw new Error(message || (response.status>=500?'服务暂时不可用，请稍后重试。':Object.values(data.errors||{}).flat().join('；') || data.message || '处理失败，请重试。'));
    }
    return data;
}

function Basis({snapshot, fileUrl, compact=false}) {
    if (!snapshot) return null;
    const record = snapshot.document || snapshot.order;
    return <div className="jn-control-basis">
        <div className="jn-control-facts"><span>客户<strong>{snapshot.relations?.companie?.label || snapshot.customer || '待补充'}</strong></span><span>参考编号<strong>{record.customer_reference || record.code}</strong></span><span>{snapshot.document?'报价有效期':'订单日期'}<strong>{record.validity_date || '未设置'}</strong></span>{snapshot.document&&<span>含税合计<strong>{money(snapshot.total,snapshot.currency)}</strong></span>}</div>
        {!compact&&<div className="jn-control-table"><table><thead><tr><th>品项</th><th>数量</th><th>单位</th>{snapshot.document&&<><th>单价</th><th>折扣</th></>}<th>交期</th></tr></thead><tbody>{snapshot.lines.map(line=><tr key={line.id}><td>{line.label || line.code}</td><td>{number(line.qty)}</td><td>{typeof line.unit==='object'?line.unit?.label:line.unit}</td>{snapshot.document&&<><td>{money(line.selling_price,snapshot.currency)}</td><td>{number(line.discount)}%</td></>}<td>{line.delivery_date || '未设置'}</td></tr>)}</tbody></table></div>}
        {snapshot.materials?.inquiry&&<details className="jn-control-requirements"><summary>需求说明 · {snapshot.materials.inquiry.kind==='cabinet'?'成套':'钣金'}</summary><p>{snapshot.materials.inquiry.requirements || '未填写需求说明'}</p><p>期望交期：{snapshot.materials.inquiry.expected_date || '待补充'}</p></details>}
        <div className="jn-control-files">{snapshot.materials?.files.map(file=><span key={file.id}>{fileUrl?<a href={fileUrl(file.id)}>{file.filename} · 第 {file.version} 版<Download size={13}/></a>:<span>{file.filename} · 第 {file.version} 版</span>}</span>)}{!snapshot.materials?.files.length&&<span className="jn-muted">本次没有关联原件，以已填写内容为依据。</span>}</div>
    </div>;
}

function ActionForm({mode, data, action, review, endpoint, onClose, onSuccess}) {
    const sending = action==='submit'||action==='send';
    const initialSnapshot = sending?data.current:mode==='quote'?review.snapshot:data.versions[0]?.snapshot;
    const [person,setPerson] = useState(String(action==='send' ? data.handoff?.receiver_id || '' : ''));
    const [due,setDue] = useState(data.handoff?.due_date || '');
    const [note,setNote] = useState('');
    const [confirmed,setConfirmed] = useState(false);
    const [files,setFiles] = useState(initialSnapshot?.materials?.files.map(f=>f.id)||[]);
    const [checklist,setChecklist] = useState((data.versions?.[0]?.snapshot?.checklist || ['品项、数量与交期已核对','本次交接资料及待补事项已核对','接收范围和后续负责人已明确']).join('\n'));
    const [checked,setChecked] = useState([]), [error,setError] = useState(''), [busy,setBusy] = useState(false);
    const lock=useRef(false), requestIdentity=useRef(null);
    const initialPerson=String(action==='send' ? data.handoff?.receiver_id || '' : '');
    const initialDue=data.handoff?.due_date || '';
    const initialChecklist=(data.versions?.[0]?.snapshot?.checklist || ['品项、数量与交期已核对','本次交接资料及待补事项已核对','接收范围和后续负责人已明确']).join('\n');
    const initialFiles=initialSnapshot?.materials?.files.map(f=>f.id)||[];
    const dirty=note.trim()||person!==initialPerson||due!==initialDue||confirmed||checked.length>0||checklist!==initialChecklist||JSON.stringify([...files].sort())!==JSON.stringify([...initialFiles].sort());
    async function close(){if(lock.current)return;if(!dirty||await confirmAction('本次填写尚未提交。离开将放弃这些输入。',{title:'关闭当前编辑',confirmLabel:'放弃并关闭',cancelLabel:'继续填写'}))onClose();}
    async function submit(event) {
        event.preventDefault();if(lock.current)return;
        let path,body;
        if(action==='submit'){path='/submit';body={fingerprint:data.fingerprint,reviewer_id:Number(person),version_ids:files,note,confirmed};}
        else if(action==='send'){path='/send';body={fingerprint:data.fingerprint,revision:data.handoff?.revision||0,receiver_id:Number(person),due_date:due,version_ids:files,checklist:checklist.split('\n').map(v=>v.trim()).filter(Boolean),note,confirmed};}
        else if(mode==='quote'){path=`/reviews/${review.id}/decision`;body={decision:action,note,confirmed};}
        else {path='/action';body={revision:data.handoff.revision,action,note,checked};}
        const signature=JSON.stringify(body);
        if(requestIdentity.current?.signature!==signature)requestIdentity.current={signature,key:crypto.randomUUID()};
        lock.current=true;setBusy(true);setError('');
        try{await request(endpoint+path,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-TOKEN':document.querySelector('meta[name="csrf-token"]')?.content||'','X-Request-ID':requestIdentity.current.key},body:signature});onSuccess(ACTIONS[action]+'成功');}
        catch(e){setError(e.message);}finally{lock.current=false;setBusy(false);}
    }
    const checks=initialSnapshot?.checklist||[];
    const disabled=busy||!note.trim()||(sending&&(!person||!confirmed))||(mode==='quote'&&!confirmed)||(action==='send'&&(!due||!checklist.trim()))||(action==='complete'&&checked.length!==checks.length);
    return <SurfaceDialog title={ACTIONS[action]} onClose={close} className="jn-control-dialog">
        <form onSubmit={submit}>
            <div className="jn-control-form-body">
                {error&&<div className="jn-inline-error" role="alert">{error}</div>}
                <Basis snapshot={initialSnapshot}/>
                {sending&&<div className="jn-control-form-grid"><label>{action==='submit'?'核对人':'接收人'}<select required value={person} onChange={e=>setPerson(e.target.value)}><option value="">请选择</option>{data.users.map(u=><option value={u.id} key={u.id}>{u.name}</option>)}</select></label>{action==='send'&&<label>期望完成日期<input type="date" required value={due} onChange={e=>setDue(e.target.value)}/></label>}</div>}
                {sending&&!!initialSnapshot?.materials.files.length&&<fieldset><legend>本次共享资料</legend>{initialSnapshot.materials.files.map(file=><label className="jn-control-check" key={file.id}><input type="checkbox" checked={files.includes(file.id)} onChange={e=>setFiles(v=>e.target.checked?[...v,file.id]:v.filter(id=>id!==file.id))}/>{file.filename} · 第 {file.version} 版</label>)}</fieldset>}
                {action==='send'&&<label>交接核对项<span className="jn-muted">每行一项，可按本次交接调整</span><textarea rows={3} maxLength={1900} required value={checklist} onChange={e=>setChecklist(e.target.value)}/></label>}
                {action==='complete'&&<fieldset><legend>逐项核对</legend>{checks.map((label,index)=><label className="jn-control-check" key={index}><input type="checkbox" checked={checked.includes(index)} onChange={e=>setChecked(v=>e.target.checked?[...v,index]:v.filter(i=>i!==index))}/>{label}</label>)}</fieldset>}
                <label>{sending?'提交说明':'处理说明'}<textarea rows={3} required maxLength={2000} placeholder={action==='request_info'?'写清缺少的资料和需要补充的内容':'说明本次核对结果、修改原因或交接要求'} value={note} onChange={e=>setNote(e.target.value)}/></label>
                {(sending||mode==='quote')&&<label className="jn-control-check"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>{sending?'已核对本次内容，并向指定人员共享所选资料':'已查看此版本内容，确认提交上述处理意见'}</label>}
                {action==='send'&&<p className="jn-muted">确认交接的是当前订单内容；报价依据保留转单时版本。交接完成不代表工程批准或生产放行。</p>}
            </div>
            <footer><button type="button" className="btn btn-default" onClick={close} disabled={busy}>取消</button><button className="btn btn-primary" disabled={disabled}>{busy?'正在提交…':ACTIONS[action]}</button></footer>
        </form>
    </SurfaceDialog>;
}

export default function SalesControl({mode,endpoint}) {
    const [data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[notice,setNotice]=useState(''),[form,setForm]=useState(null);
    const sequence=useRef(0), alive=useRef(true);
    const load=useCallback(async()=>{
        const seq=++sequence.current;setLoading(true);setError('');
        try{const next=await request(endpoint);if(alive.current&&seq===sequence.current){setData(next);return next;}}
        catch(e){if(alive.current&&seq===sequence.current){setError(e.message);setData(null);}}
        finally{if(alive.current&&seq===sequence.current)setLoading(false);}
    },[endpoint]);
    useEffect(()=>{alive.current=true;load();const refresh=()=>load();window.addEventListener('jn-lines-count',refresh);window.addEventListener('focus',refresh);return()=>{alive.current=false;sequence.current++;window.removeEventListener('jn-lines-count',refresh);window.removeEventListener('focus',refresh);};},[load]);
    async function open(action,review){const fresh=await load();if(fresh)setForm({action,review:fresh.reviews?.find(r=>r.id===review?.id),data:fresh});}
    const quote=mode==='quote', latest=quote?data?.reviews?.[0]:data?.handoff;
    const stale=quote?latest?.stale:data?.stale;
    const label=latest?(stale?'内容已更新，需重新核对':!quote&&latest.state==='pending'?'待接收':STATES[latest.state]):quote?'尚未提交核对':'尚未发起交接';
    return <section className="jn-control-card" aria-label={quote?'报价核对':'技术交接'}>
        <header><div className="jn-control-heading">{quote?<FileCheck2 size={20}/>:<ClipboardCheck size={20}/>}<strong>{quote?'报价核对':'技术交接'}</strong>{data&&<span className={`jn-status tone-${stale?'warning':latest?.state==='approved'||latest?.state==='completed'?'success':'info'}`}>{label}</span>}{latest&&<small>第 {latest.version} 版</small>}</div><div className="jn-control-actions">
            <button type="button" className="jn-icon-button" aria-label={quote?'刷新报价核对':'刷新技术交接'} disabled={loading} onClick={load}><RefreshCw size={16}/></button>
            {quote&&data?.can_submit&&(!latest||stale||!['pending','approved'].includes(latest.state))&&<button className="btn btn-sm btn-primary" disabled={loading} onClick={()=>open('submit')}><Send size={14}/>提交核对</button>}
            {!quote&&data?.can_send&&<button className="btn btn-sm btn-primary" disabled={loading} onClick={()=>open('send')}><Send size={14}/>{latest?'补充或重新交接':'发起交接'}</button>}
        </div></header>
        {error?<p className="jn-inline-error" role="alert">{error}<button className="btn btn-sm btn-default" onClick={load}>重新读取</button></p>:!data?<p className="jn-muted" role="status">正在读取最新记录…</p>:<>
            {notice&&<p className="jn-control-notice" role="status"><Check size={14}/>{notice}</p>}
            {quote&&latest?.state==='pending'&&<div className="jn-control-summary"><span>{latest.reviewer} · 等待核对本次报价</span><div>{latest.can_decide&&<><button className="btn btn-sm btn-primary" disabled={loading||stale} onClick={()=>open('approve',latest)}>核对并确认</button><button className="btn btn-sm btn-default" disabled={loading} onClick={()=>open('reject',latest)}>退回修改</button></>}{data.can_submit&&<button className="jn-text-button" disabled={loading} onClick={()=>open('withdraw',latest)}>撤回</button>}</div></div>}
            {!quote&&latest&&<div className="jn-control-summary"><span>{data.receiver || '接收人待核对'} · 期望完成 {latest.due_date}</span><div>{data.can_receive&&<>{latest.state==='pending'&&<button className="btn btn-sm btn-primary" disabled={loading||stale} onClick={()=>open('accept')}>接收交接</button>}{latest.state==='working'&&<button className="btn btn-sm btn-primary" disabled={loading||stale} onClick={()=>open('complete')}>核对并完成</button>}{['pending','working'].includes(latest.state)&&<><button className="btn btn-sm btn-default" disabled={loading} onClick={()=>open('request_info')}>要求补充</button><button className="jn-text-button" disabled={loading} onClick={()=>open('return')}>退回</button></>}</>}{data.can_send&&['pending','working','needs_info','returned'].includes(latest.state)&&<button className="jn-text-button" disabled={loading} onClick={()=>open('cancel')}>撤回</button>}</div></div>}
            {!latest&&<p className="jn-muted">{quote?'录入明细后，提交本次报价与资料版本供指定人员核对。':data.can_send?'将本次订单、资料和核对要求交给指定技术人员。':'此订单没有经过确认报价转单的记录，暂不能发起技术交接。'}</p>}
            {quote&&data.reviews.length>0&&<details className="jn-control-history"><summary>版本与处理记录 · {data.reviews.length} 条</summary>{data.reviews.map(r=><article key={r.id}><div className="jn-control-history-heading"><strong>第 {r.version} 版 · {STATES[r.state]}</strong><span>{date(r.created_at)} · {r.reviewer}</span><a href={r.pdf_url}><Download size={14}/>{r.state==='approved'?'下载确认文件':'下载提交时草稿'}</a></div><p>{r.note}</p>{r.decision_note&&<p className="jn-control-decision">处理意见：{r.decision_note}</p>}<details><summary>查看本版本内容与原件</summary><Basis snapshot={r.snapshot} fileUrl={id=>`${endpoint}/reviews/${r.id}/files/${id}`}/></details></article>)}</details>}
            {!quote&&data.versions.length>0&&<details className="jn-control-history" open><summary>交接内容 · {data.versions.length} 版</summary>{data.versions.map((v,index)=><article key={v.id}><div className="jn-control-history-heading"><strong>第 {v.version} 版{index===0?' · 当前交接':''}</strong><span>{date(v.created_at)}</span></div><p>{v.note}</p><details open={index===0}><summary>品项、资料与核对要求</summary><Basis snapshot={v.snapshot} fileUrl={id=>`${endpoint}/versions/${v.version}/files/${id}`}/><ul className="jn-control-checklist">{v.snapshot.checklist.map((c,i)=><li key={i}>{c}</li>)}</ul></details></article>)}</details>}
            {!!data.events.length&&<details className="jn-control-history"><summary>操作记录</summary><ol className="jn-control-events">{data.events.map(e=><li key={e.id}><strong>{e.label}</strong><span>{e.actor} · {date(e.created_at)}</span><p>{e.detail.note}</p></li>)}</ol></details>}
        </>}
        {form&&<ActionForm mode={mode} endpoint={endpoint} {...form} onClose={()=>setForm(null)} onSuccess={message=>{setForm(null);setNotice(message);load();}}/>}
    </section>;
}
