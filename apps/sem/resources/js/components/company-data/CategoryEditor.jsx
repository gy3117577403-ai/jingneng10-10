import React, {useRef, useState} from 'react';
import {ArrowLeft, ArrowRight, Check, ClipboardList} from 'lucide-react';
import {Segments, SurfaceDialog} from '../../ui/WorkspaceKit';
import {Button, SearchSelect} from '../../ui/shadcn/controls';
import {confirmAction} from '../../ui/confirmAction';
import {ErrorBox, Field, ValuesEditor} from './kit';
import {categoryPath, parentChoices, PermissionPreview, RulesEditor, SchemaEditor, SUBJECT_TYPES, subjectChoices} from './ConfigurationEditors';

const STEPS = [['basic','基本信息'],['fields','台账字段'],['permissions','成员权限'],['review','核对并保存']];
export function categoryIssue(value) {
    if (!value.name.trim()) return {step:'basic',message:'请填写分类名称。'};
    if (!Number.isInteger(value.position) || value.position < 0 || value.position > 10000) return {step:'basic',message:'排序请输入0至10000之间的整数。'};
    const labels = new Set(['编号','名称']);
    for (const [index,field] of value.fields.entries()) {
        const label = field.label.trim();
        if (!label || labels.has(label)) return {step:'fields',message:`第${index+1}个字段需要填写不重复的名称，且不能使用“编号”“名称”。`};
        labels.add(label);
        if (field.type === 'select' && (!field.options.length || field.options.some(option => !option.trim()) || new Set(field.options.map(option=>option.trim())).size !== field.options.length)) return {step:'fields',message:`“${label}”需要填写不为空且不重复的选项。`};
    }
    const seen = new Set();
    for (const rule of value.rules) {
        if (rule.principal_type !== 'everyone' && !Number(rule.principal_id)) return {step:'permissions',message:'有授权规则尚未选择人员、工作组或组织，请补齐授权对象。'};
        const key = `${rule.principal_type}:${rule.principal_id}:${rule.action}`;
        if (seen.has(key)) return {step:'permissions',message:'同一对象的同一操作重复配置，请合并或移除重复授权对象。'};
        seen.add(key);
    }
    return null;
}

export default function CategoryEditor({api,config,editor,onClose,onSave}) {
    const initial = editor.value;
    const [value,setValue] = useState(initial),[step,setStep] = useState('basic'),[error,setError] = useState(''),[busy,setBusy] = useState(false),[preview,setPreview] = useState({});
    const lock = useRef(false), closing = useRef(false), nameInput = useRef(null), body = useRef(null);
    const dirty = JSON.stringify(value) !== JSON.stringify(initial), index = STEPS.findIndex(([key])=>key===step);
    const lockedKeys = initial.record_count > 0 ? initial.fields.map(field=>field.key) : [];
    const schemaChanged = JSON.stringify(value.fields) !== JSON.stringify(initial.fields);
    async function close() {
        if(lock.current || closing.current)return;
        closing.current=true;
        if(!dirty || await confirmAction('分类配置尚未保存，关闭后将放弃本次修改。',{title:'放弃分类配置',confirmLabel:'放弃修改'}))onClose();
        else closing.current=false;
    }
    function go(next) {setStep(next); setError(''); if(body.current)body.current.scrollTop=0;}
    function next() {
        const issue = categoryIssue(value);
        if (issue && STEPS.findIndex(([key])=>key===issue.step) <= index) {go(issue.step);setError(issue.message);return;}
        go(STEPS[index+1][0]);
    }
    async function save(event) {
        event.preventDefault(); if(lock.current)return;
        if(step!=='review'){next();return;}
        const issue = categoryIssue(value); if(issue){go(issue.step);setError(issue.message);return;}
        lock.current=true;setBusy(true);setError('');
        try {await onSave(value);onClose();} catch(failure) {setError(failure.message);} finally {lock.current=false;setBusy(false);}
    }
    const groups = [...new Set(value.rules.map(rule=>`${rule.principal_type}:${rule.principal_id}`))].map(key=>{
        const rules = value.rules.filter(rule=>`${rule.principal_type}:${rule.principal_id}`===key), first=rules[0];
        return {key,name:first.principal_type==='everyone'?'所有在用人员':subjectChoices(config,first.principal_type).find(item=>Number(item.id)===Number(first.principal_id))?.name||'尚未选择对象',type:SUBJECT_TYPES[first.principal_type],rules};
    });
    return <SurfaceDialog title={editor.id?'配置分类':'新建资料分类'} onClose={close} initialFocus={nameInput} className="dc-dialog dc-wide dc-category-editor">
        <form onSubmit={save} noValidate>
            <div className="dc-config-steps"><Segments value={step} onChange={go} items={STEPS} label="分类配置步骤"/></div>
            <div className="dc-dialog-body" ref={body}><ErrorBox error={error}/>
                <div hidden={step!=='basic'} role="tabpanel" aria-label="基本信息">
                    <p className="dc-help">一个分类存放同类资料，使用相同的字段和默认权限。目录层级用于整理资料，不代表企业部门隶属。</p>
                    <Field label="分类名称 *"><input ref={nameInput} required maxLength={80} value={value.name} placeholder="例如：设备台账" onChange={e=>setValue({...value,name:e.target.value})}/></Field>
                    <Field label="上级资料目录"><SearchSelect label="上级资料目录" value={String(value.parent_id||'')} onValueChange={id=>setValue({...value,parent_id:Number(id)||null})} items={[{value:'',label:'顶层目录'},...parentChoices(config.categories,editor.id).map(category=>({value:String(category.id),label:categoryPath(category,config.categories)}))]}/></Field>
                    <Field label="分类说明"><textarea rows={3} maxLength={2000} value={value.description||''} placeholder="说明此分类用于什么，以及由谁维护" onChange={e=>setValue({...value,description:e.target.value})}/></Field>
                    <div className="dc-form-grid"><Field label="排序"><input type="number" min="0" max="10000" value={value.position} onChange={e=>setValue({...value,position:Number(e.target.value)})}/></Field><label className="dc-check"><input type="checkbox" checked={value.enabled} onChange={e=>setValue({...value,enabled:e.target.checked})}/>启用分类</label></div>
                    {!value.enabled&&<p className="dc-notice">停用后，该分类的资料操作将不可用；下级分类不会自动停用。</p>}
                </div>
                <div hidden={step!=='fields'} role="tabpanel" aria-label="台账字段">
                    <p className="dc-help">先定义需要填写的信息，再查看录入效果。字段顺序会用于新资料表单和台账列表。</p>
                    <SchemaEditor fields={value.fields} lockedKeys={lockedKeys} onChange={fields=>setValue({...value,fields})}/>
                    {initial.record_count>0&&<p className="dc-notice">此分类已有 {initial.record_count} 条资料（含归档）。保存字段变化后，旧草稿需要重新修订；历史版本保持原样。</p>}
                    <details className="dc-field-preview"><summary><ClipboardList size={16}/>预览录入表单</summary><p className="dc-help">仅预览填写效果，不保存为资料。</p><div className="dc-form-grid"><Field label="编号 *"><input placeholder="填写唯一编号"/></Field><Field label="名称 *"><input placeholder="填写资料名称"/></Field></div><ValuesEditor fields={value.fields.map(field=>({...field,label:field.label||'未命名字段'}))} values={preview} onChange={setPreview}/></details>
                </div>
                <div hidden={step!=='permissions'} role="tabpanel" aria-label="成员权限">
                    <RulesEditor rules={value.rules} onChange={rules=>setValue({...value,rules})} config={config}/>
                    <PermissionPreview api={api} config={config} categoryId={editor.id} enabled={value.enabled} rules={value.rules}/>
                </div>
                <div hidden={step!=='review'} role="tabpanel" aria-label="核对并保存" className="dc-config-review">
                    <h3>{value.name||'未命名分类'}</h3><p>{value.parent_id?categoryPath(config.categories.find(item=>Number(item.id)===Number(value.parent_id)),config.categories):'顶层目录'} · {value.enabled?'启用':'停用'}</p>
                    <h3>台账字段</h3><p>固定字段：编号、名称。自定义字段 {value.fields.length} 个，其中必填 {value.fields.filter(field=>field.required).length} 个。</p><div className="dc-review-fields">{value.fields.map(field=><span key={field.key}>{field.label}{field.required?' *':''}</span>)}</div>
                    {schemaChanged&&initial.record_count>0&&<p className="dc-notice">这次字段变化会要求旧草稿重新修订，审核中的旧字段版本不能直接发布。</p>}
                    <h3>默认授权 · {groups.length} 个对象</h3>
                    {!groups.length&&<p className="dc-notice">尚未授权。分类可以先保存，之后配置有权限的维护人、审核人和协作者。</p>}
                    {groups.map(group=><article className="dc-review-rule" key={group.key}><strong>{group.name}</strong><small>{group.type}</small><p>允许：{group.rules.filter(rule=>rule.effect==='allow').map(rule=>config.actions[rule.action]).join('、')||'无'}</p>{group.rules.some(rule=>rule.effect==='deny')&&<p>明确禁止：{group.rules.filter(rule=>rule.effect==='deny').map(rule=>config.actions[rule.action]).join('、')}</p>}</article>)}
                    <p className="dc-help">保存后，继承本分类的资料按新规则校验。使用独立权限的资料保留自己的规则。审核需要另一位具有审核权限的人员，协作任务不会自动给对方授权。</p>
                </div>
            </div>
            <footer><span className="dc-config-progress">第 {index+1} / {STEPS.length} 步</span><Button type="button" onClick={close} disabled={busy}>取消</Button>{index>0&&<Button type="button" disabled={busy} onClick={()=>go(STEPS[index-1][0])}><ArrowLeft size={14}/>上一步</Button>}{step==='review'?<Button key="save-category" variant="primary" type="submit" disabled={busy}><Check size={15}/>{busy?'正在保存…':'保存分类'}</Button>:<Button key="next-step" variant="primary" type="button" onClick={event=>{event.preventDefault();next();}}>下一步<ArrowRight size={14}/></Button>}</footer>
        </form>
    </SurfaceDialog>;
}
