import React, { useEffect, useRef, useState } from 'react';
import { SurfaceDialog } from '../../ui/WorkspaceKit';
import { readDraft, writeDraft, clearDraft } from '../../ui/sessionDraft';

export default function QuoteHandoff({ data, api, mutate, busy, error, onClose, onDirty, onDone }) {
    const {record, documents} = data, scope = `quote.${record.id}`;
    const initial = {revision:record.revision, note:'', confirmed:false, version_ids:documents.map(d=>d.versions[0].id), validity_date:'',
        companies_contacts_id:'', companies_addresses_id:'', accounting_payment_conditions_id:'', accounting_payment_methods_id:'', accounting_deliveries_id:''};
    const draft = useRef(readDraft(scope,record.revision));
    const [form,setForm] = useState(draft.current ? {...draft.current, confirmed:false} : initial), [options,setOptions]=useState(null), [loadError,setLoadError]=useState('');
    useEffect(()=>{if(draft.current)onDirty(true);let active=true;api(`/inquiries/${record.id}/quote-options`).then(result=>{if(active)setOptions(result);}).catch(e=>{if(active)setLoadError(e.message);});return()=>{active=false;};},[]);
    const set=(key,value)=>setForm(current=>{const next={...current,[key]:value};writeDraft(scope,record.revision,next);onDirty(true);return next;});
    const select=(key,label,list)=><label>{label}<select required value={form[key]} onChange={e=>set(key,e.target.value)}><option value="">请选择</option>{(list||[]).map(x=><option key={x.id} value={x.id}>{x.label}</option>)}</select></label>;
    async function submit(e){e.preventDefault();const result=await mutate(`/inquiries/${record.id}/quote`,form,'报价草稿已准备');if(result){clearDraft(scope);onDone(result);}}
    return <SurfaceDialog title="确认依据并生成报价草稿" onClose={()=>!busy&&onClose()} className="ps-modal jn-form-dialog jn-handoff-dialog">
        {(error||loadError)&&<p className="ps-error" role="alert">{error||loadError}</p>}
        {!options&&!loadError?<p role="status">正在读取客户与报价配置…</p>:options&&<form onSubmit={submit}>
            {draft.current&&<p className="jn-draft-note">已恢复本标签页草稿，请重新确认报价依据。</p>}
            <div className="jn-handoff-heading"><span className="ps-kind">{record.kind==='cabinet'?'成套':'钣金'}</span><strong>{record.title}</strong><span>{options.company?.label||'尚未关联客户'}</span></div>
            {!options.company?<p className="ps-warning">请先关闭窗口，在“编辑信息”中关联客户档案。</p>:<>
                <div className="ps-form-grid">
                    {select('companies_contacts_id','客户联系人',options.contacts)}{select('companies_addresses_id','客户地址',options.addresses)}
                    {select('accounting_payment_conditions_id','付款条件',options.conditions)}{select('accounting_payment_methods_id','付款方式',options.methods)}
                    {select('accounting_deliveries_id','交付方式',options.deliveries)}<label>报价有效期<input type="date" value={form.validity_date} onChange={e=>set('validity_date',e.target.value)}/></label>
                </div>
                {(!options.contacts.length||!options.addresses.length)&&<p className="ps-warning">客户资料不完整。<a href={options.company.url} target="_blank" rel="noreferrer">打开客户档案补充</a>，保存后重新打开本窗口。</p>}
            </>}
            <details className="jn-source-summary" open><summary>本次报价依据 · 询价第 {record.revision} 版</summary><p className="ps-prewrap">{record.requirements||'请先填写需求说明。'}</p><p>期望交期：{record.expected_date||'待补充'}</p>
                <div className="ps-file-choices">{documents.map(d=>{const v=d.versions[0];return <label key={d.id}><input type="checkbox" checked={form.version_ids.includes(v.id)} onChange={e=>set('version_ids',e.target.checked?[...form.version_ids,v.id]:form.version_ids.filter(id=>id!==v.id))}/>{v.filename}<span className="ps-muted">第 {v.version} 版</span></label>;})}</div>
                {!documents.length&&<small>本次以手工填写的需求为依据，尚无关联原件。</small>}
            </details>
            <label>确认说明<textarea required maxLength={1000} rows="2" placeholder="说明已核对的需求及仍待补充的内容" value={form.note} onChange={e=>set('note',e.target.value)}/></label>
            <label className="jn-confirm-check"><input type="checkbox" checked={form.confirmed} onChange={e=>set('confirmed',e.target.checked)}/>已核对本次需求与所选资料，作为报价草稿依据</label>
            <p className="ps-muted">下一步在报价中添加明细与价格。本次不会发送报价或批准工程图纸。</p>
            <footer><button type="button" disabled={busy} onClick={onClose}>返回询价</button><button className="ps-primary" disabled={busy||!form.confirmed||!form.note.trim()||!options.company||!record.requirements}>{busy?'正在生成…':'生成并打开草稿'}</button></footer>
        </form>}
    </SurfaceDialog>;
}
