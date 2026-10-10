import React, {useId, useRef, useState} from 'react';
import {SurfaceDialog} from '../../ui/WorkspaceKit';
import {confirmAction} from '../../ui/confirmAction';

export const STATES={draft:'草稿',pending:'待审核',published:'已发布',rejected:'已退回',withdrawn:'已撤回',superseded:'历史草稿',open:'待接收',accepted:'处理中',blocked:'待补充',completed:'已完成',cancelled:'已取消',approved:'已批准',revoked:'已撤销',expired:'已过期',preview:'待确认',committed:'已导入',undone:'已撤销导入'};
export const TYPES={text:'短文本',multiline:'长文本',number:'数字',date:'日期',select:'选项',boolean:'是或否'};
export const when=v=>v?String(v).slice(0,16).replace('T',' '):'—';
export const show=v=>v===true?'是':v===false?'否':v===null||v===undefined||v===''?'—':String(v);
export function Badge({state}){return <span className={`dc-badge is-${state}`}>{STATES[state]||state}</span>;}
export function ErrorBox({error}){return error?<div className="dc-error" role="alert">{error}</div>:null;}
export function Field({label,children,hint}){const id=useId();return <div className="dc-field"><label htmlFor={id}>{label}</label>{React.isValidElement(children)?React.cloneElement(children,{id}):children}{hint&&<small>{hint}</small>}</div>;}
export function ValuesEditor({fields,values,onChange}){return <div className="dc-form-grid">{fields.map(f=>{const props={value:values[f.key]??'',required:f.required,onChange:e=>onChange({...values,[f.key]:f.type==='boolean'?(e.target.value===''?null:e.target.value==='true'):e.target.value})};return <Field key={f.key} label={`${f.label}${f.required?' *':''}`}>{f.type==='select'?<select {...props}><option value="">请选择</option>{f.options.map(o=><option key={o}>{o}</option>)}</select>:f.type==='boolean'?<select {...props}><option value="">请选择</option><option value="true">是</option><option value="false">否</option></select>:f.type==='multiline'?<textarea {...props} rows={3} maxLength={5000}/>:<input {...props} type={f.type==='date'?'date':'text'} inputMode={f.type==='number'?'decimal':undefined} maxLength={500}/>}</Field>;})}</div>;}

export function makeApi(endpoint){
    const base=endpoint.replace(/\/$/,'');
    return {base, async get(path,signal){return request(base+path,{signal});}, async post(path,data,key){
        const form=data instanceof FormData;
        if(form)data.set('request_key',key);
        return request(base+path,{method:'POST',headers:form?{}:{'Content-Type':'application/json'},body:form?data:JSON.stringify({...data,request_key:key})});
    }};
}
async function request(url,options={}){
    let response;
    try{response=await fetch(url,{credentials:'same-origin',...options,headers:{Accept:'application/json','X-CSRF-TOKEN':document.querySelector('meta[name="csrf-token"]')?.content||'',...options.headers}});}
    catch(error){if(error.name==='AbortError')throw error;throw new Error('无法连接服务，请检查网络后重试，填写内容已保留。');}
    const json=await response.json().catch(()=>null);
    if(!response.ok){const messages={401:'登录已过期，请重新登录。',419:'登录已过期，请重新登录后继续。',403:'权限已变化，当前不能执行此操作。',404:'内容不存在或已经不可用，请刷新后重试。',422:'填写内容不符合要求，请检查后重试。',429:'操作较频繁，请稍后重试，输入内容已保留。'};
        const message=json?.errors?Object.values(json.errors).flat().join('；'):json?.message||'';
        throw new Error(response.status>=500?'服务暂时不可用，请稍后重试。':/[\u3400-\u9fff]/.test(message)?message:messages[response.status]||'请求未完成，请刷新后重试。');}
    return json;
}

export function useWrite(api){
    const lock=useRef(false),receipt=useRef(null);const [busy,setBusy]=useState(false),[error,setError]=useState('');
    async function write(path,data){
        if(lock.current)return null;lock.current=true;setBusy(true);setError('');
        const signature=JSON.stringify([path,data instanceof FormData?[...data.entries()].filter(([k])=>k!=='request_key').map(([k,v])=>[k,v instanceof File?[v.name,v.size,v.lastModified]:v]):data]);
        if(receipt.current?.signature!==signature)receipt.current={signature,key:crypto.randomUUID()};
        try{return await api.post(path,data,receipt.current.key);}catch(e){setError(e.message);return null;}finally{lock.current=false;setBusy(false);}
    }
    return {write,busy,error,setError};
}

export function EditDialog({title,initial,children,onSave,onClose,label='保存',wide=false}){
    const [value,setValue]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState('');const lock=useRef(false);
    const dirty=JSON.stringify(value)!==JSON.stringify(initial);
    async function close(){if(lock.current)return;if(!dirty||await confirmAction('尚有未保存内容，关闭后将放弃本次填写。',{title:'放弃修改',confirmLabel:'放弃修改'}))onClose();}
    return <SurfaceDialog title={title} onClose={close} className={`dc-dialog ${wide?'dc-wide':''}`}><form onSubmit={async e=>{e.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await onSave(value);onClose();}catch(e){setError(e.message);}finally{lock.current=false;setBusy(false);}}}>
        <div className="dc-dialog-body"><ErrorBox error={error}/>{children(value,setValue)}</div><footer><button type="button" className="btn btn-default" onClick={close} disabled={busy}>取消</button><button className="btn btn-primary" disabled={busy}>{busy?'正在保存…':label}</button></footer>
    </form></SurfaceDialog>;
}

export function stableSubmit(api){let last;return async(path,data)=>{const s=JSON.stringify([path,data]);if(last?.s!==s)last={s,key:crypto.randomUUID()};return api.post(path,data,last.key);};}
