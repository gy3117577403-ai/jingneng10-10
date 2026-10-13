import React, {useEffect, useRef, useState} from 'react';
import {ArrowDown, ArrowUp, LockKeyhole, Plus, Search, Trash2} from 'lucide-react';
import {Button, SearchSelect} from '../../ui/shadcn/controls';
import {Field, ErrorBox, TYPES} from './kit';

export const SUBJECT_TYPES = {user:'指定人员', group:'工作组', organization:'组织直属成员', organization_tree:'组织及下级成员', everyone:'所有在用人员'};
export function subjectChoices(config, type) {
    if (type === 'everyone') return [];
    if (type === 'user') return config.users || [];
    if (type === 'group') return config.groups || [];
    return (config.organizations || []).map(unit => ({...unit, name: categoryPath(unit, config.organizations)}));
}
export function categoryPath(category, categories) {
    const names = [category.name], seen = new Set([category.id]);
    let parent = categories.find(item => Number(item.id) === Number(category.parent_id));
    while (parent && !seen.has(parent.id)) {names.unshift(parent.name); seen.add(parent.id); parent = categories.find(item => Number(item.id) === Number(parent.parent_id));}
    return names.join(' / ');
}
export function parentChoices(categories, id) {
    const excluded = new Set([Number(id)]);
    let changed = true;
    while (changed) {changed = false; for (const category of categories) if (category.parent_id && excluded.has(Number(category.parent_id)) && !excluded.has(Number(category.id))) {excluded.add(Number(category.id)); changed = true;}}
    return categories.filter(category => !excluded.has(Number(category.id)));
}

const ACTION_GROUPS = [
    ['查阅与维护', ['discover','view','create','edit','submit','review']],
    ['文件与归档', ['download','export','archive']],
    ['协作与查看申请', ['collaborate','request','access']],
];
const PRESETS = [
    ['查阅', ['discover','view']], ['录入维护', ['discover','view','create','edit','submit']],
    ['审核发布', ['discover','view','review']], ['参与协作', ['discover','view','collaborate']], ['清空', []],
];

export function RulesEditor({rules, onChange, config}) {
    const [entries, setEntries] = useState(() => {
        const rows = [];
        for (const rule of rules) {
            let row = rows.find(item => item.type === rule.principal_type && Number(item.id) === Number(rule.principal_id));
            if (!row) {row = {key:crypto.randomUUID(), type:rule.principal_type, id:rule.principal_id, permissions:{}}; rows.push(row);}
            row.permissions[rule.action] = rule.effect;
        }
        return rows;
    });
    function update(next) {setEntries(next); onChange(next.flatMap(row => Object.entries(row.permissions).filter(([,effect]) => effect).map(([action,effect]) => ({principal_type:row.type,principal_id:Number(row.id),action,effect}))));}
    function change(index, patch) {update(entries.map((row,i) => i === index ? {...row,...patch} : row));}
    return <div className="dc-rules dc-config-rules">
        <p className="dc-help">先选择人员、工作组或组织，再配置动作。未授权默认不开放，明确禁止优先；资料目录的位置不继承授权。</p>
        {!entries.length && <div className="dc-config-empty">尚未配置授权对象。保存空规则后，管理员也不会自动获得资料内容权限。</div>}
        {entries.map((row,index) => <fieldset key={row.key}>
            <legend>授权对象 {index+1}</legend>
            <div className="dc-rule-subject">
                <select aria-label={`授权对象${index+1}类型`} value={row.type} onChange={e => change(index,{type:e.target.value,id:0})}>{Object.entries(SUBJECT_TYPES).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
                {row.type !== 'everyone' && <SearchSelect label={`授权对象${index+1}名称`} value={String(row.id || '')} onValueChange={value => change(index,{id:Number(value)})} items={[{value:'',label:'请选择授权对象'}, ...subjectChoices(config,row.type).map(item => ({value:String(item.id),label:item.name}))]}/>}
                <Button type="button" variant="ghost" size="icon" aria-label={`移除授权对象${index+1}`} onClick={() => update(entries.filter((_,i) => i !== index))}><Trash2 size={15}/></Button>
            </div>
            <div className="dc-rule-presets dc-inline">{PRESETS.map(([label,actions]) => <Button type="button" variant="ghost" key={label} onClick={() => change(index,{permissions:Object.fromEntries(actions.map(action => [action,'allow']))})}>{label}</Button>)}</div>
            <p className="dc-help">快捷项替换本对象当前配置，保存后生效。已允许 {Object.values(row.permissions).filter(effect => effect === 'allow').length} 项 · 明确禁止 {Object.values(row.permissions).filter(effect => effect === 'deny').length} 项</p>
            {row.type.startsWith('organization') && <p className="dc-help">仅按组织中已关联的有效软件账号计算；添加组织授权不会创建账号。{row.type === 'organization' ? '不包含下级组织。' : '包含下级组织。'}</p>}
            {ACTION_GROUPS.map(([label,actions]) => <div className="dc-permission-section" key={label}><h4>{label}</h4><div className="dc-permission-grid">{actions.filter(action => config.actions[action]).map(action => <Field key={action} label={config.actions[action]}><select aria-label={`对象${index+1}：${config.actions[action]}`} value={row.permissions[action] || ''} onChange={e => change(index,{permissions:{...row.permissions,[action]:e.target.value}})}><option value="">未授权</option><option value="allow">允许</option><option value="deny">禁止</option></select></Field>)}</div></div>)}
        </fieldset>)}
        <Button type="button" onClick={() => update([...entries,{key:crypto.randomUUID(),type:'user',id:0,permissions:{}}])}><Plus size={15}/>添加授权对象</Button>
    </div>;
}

export function SchemaEditor({fields,onChange,lockedKeys=[]}) {
    function move(index, delta) {const next = [...fields]; [next[index],next[index+delta]] = [next[index+delta],next[index]]; onChange(next);}
    return <div className="dc-schema">
        <div className="dc-fixed-fields"><span><LockKeyhole size={13}/>编号 · 必填</span><span><LockKeyhole size={13}/>名称 · 必填</span><small>固定字段，无需重复添加</small></div>
        {!fields.length && <p className="dc-config-empty">可以先用编号和名称建立分类，再添加实际需要的业务字段。</p>}
        {fields.map((field,index) => <div className="dc-schema-row" key={field.key}>
            <input aria-label={`字段${index+1}名称`} placeholder="字段名称" value={field.label} required maxLength={50} onChange={e => onChange(fields.map((item,i) => i === index ? {...item,label:e.target.value} : item))}/>
            <select aria-label={`字段${index+1}类型`} value={field.type} disabled={lockedKeys.includes(field.key)} title={lockedKeys.includes(field.key) ? '此分类已有资料，原字段类型不能更改' : undefined} onChange={e => onChange(fields.map((item,i) => i === index ? {...item,type:e.target.value} : item))}>{Object.entries(TYPES).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
            <label className="dc-check"><input type="checkbox" checked={field.required} onChange={e => onChange(fields.map((item,i) => i === index ? {...item,required:e.target.checked} : item))}/>必填</label>
            <div className="dc-field-order"><Button type="button" size="icon" variant="ghost" disabled={index===0} aria-label={`上移字段${index+1}`} onClick={() => move(index,-1)}><ArrowUp size={14}/></Button><Button type="button" size="icon" variant="ghost" disabled={index===fields.length-1} aria-label={`下移字段${index+1}`} onClick={() => move(index,1)}><ArrowDown size={14}/></Button><Button type="button" size="icon" variant="ghost" disabled={lockedKeys.includes(field.key)} aria-label={`删除字段${index+1}`} title={lockedKeys.includes(field.key) ? '此分类已有资料，原字段不能删除' : '删除字段'} onClick={() => onChange(fields.filter((_,i) => i !== index))}><Trash2 size={14}/></Button></div>
            {field.type === 'select' && <input className="dc-options" aria-label={`字段${index+1}选项`} placeholder="例如：待核对，已核对" value={field.options.join('，')} onChange={e => onChange(fields.map((item,i) => i === index ? {...item,options:e.target.value.split(/[，,]/)} : item))}/>}
        </div>)}
        <Button type="button" disabled={fields.length>=30} onClick={() => onChange([...fields,{key:'field_'+crypto.randomUUID().slice(0,8),label:'',type:'text',required:false,options:[]}])}><Plus size={15}/>添加字段</Button>
        <p className="dc-help">支持调整顺序。已有资料的原字段只允许改名、调整必填或选项；不能删除或改变类型。历史版本保留原字段快照。</p>
    </div>;
}

export function PermissionPreview({api,config,categoryId,enabled,rules}) {
    const [userId,setUserId] = useState(''),[result,setResult] = useState(null),[error,setError] = useState(''),[busy,setBusy] = useState(false);
    const sequence = useRef(0), signature = JSON.stringify([categoryId,enabled,rules,userId]);
    useEffect(() => {sequence.current++; setResult(null); setError(''); setBusy(false);},[signature]);
    useEffect(() => () => {sequence.current++;},[]);
    async function preview() {
        const request = ++sequence.current; setBusy(true); setError(''); setResult(null);
        try {const value = await api.post('/catalog/preview',{category_id:categoryId,user_id:Number(userId),enabled,rules},crypto.randomUUID()); if (sequence.current === request) setResult(value);}
        catch (failure) {if (sequence.current === request) setError(failure.message);}
        finally {if (sequence.current === request) setBusy(false);}
    }
    return <section className="dc-permission-preview" aria-label="成员权限预览"><h3>检查一位成员的实际权限</h3><p className="dc-help">按当前未保存规则，合并该成员已有的工作组和组织身份计算；预览不会保存授权。</p>
        <div className="dc-inline"><SearchSelect label="权限预览成员" value={userId} onValueChange={setUserId} items={[{value:'',label:'选择软件账号'},...config.users.map(user => ({value:String(user.id),label:user.name}))]}/><Button type="button" disabled={!userId || busy} onClick={preview}>{busy?'正在核对…':'预览权限'}</Button></div><ErrorBox error={error}/>
        {result && <div className="dc-permission-result" role="status"><strong>{result.user.name} · 分类层面的操作资格</strong><div className="dc-permission-list">{result.permissions.map(permission => <div key={permission.action}><strong>{permission.label}</strong><span className={permission.allowed?'dc-allowed':'dc-muted'}>{permission.allowed?'允许':'不开放'}</span><small>{permission.reason}</small></div>)}</div><p className="dc-help">{result.note}</p></div>}
    </section>;
}

export function GroupMembers({config,value,onChange,original=[]}) {
    const [search,setSearch] = useState(''),[selectedOnly,setSelectedOnly] = useState(false);
    const selected = value.map(Number), before = original.map(Number);
    const added = selected.filter(id => !before.includes(id)), removed = before.filter(id => !selected.includes(id));
    const filtered = config.users.filter(user => user.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()) && (!selectedOnly || selected.includes(user.id)));
    return <><div className="dc-member-search"><Search size={15}/><input aria-label="搜索工作组成员" placeholder="查找软件账号" value={search} onChange={e=>setSearch(e.target.value)}/></div><div className="dc-inline"><strong>已选 {selected.length} 人</strong><label className="dc-check"><input type="checkbox" checked={selectedOnly} onChange={e=>setSelectedOnly(e.target.checked)}/>只看已选</label></div>
        <div className="dc-members dc-searchable-members">{filtered.map(user => <label key={user.id} className="dc-check"><input type="checkbox" checked={selected.includes(user.id)} onChange={e=>onChange(e.target.checked?[...selected,user.id]:selected.filter(id=>id!==user.id))}/>{user.name}</label>)}{!filtered.length&&<p className="dc-help">没有匹配的账号</p>}</div>
        {(added.length>0||removed.length>0)&&<p className="dc-notice">本次新增 {added.length} 人，移出 {removed.length} 人。保存后按新的工作组成员关系校验授权。</p>}
    </>;
}
