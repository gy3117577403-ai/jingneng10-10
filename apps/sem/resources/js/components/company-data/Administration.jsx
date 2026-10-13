import React,{useEffect,useMemo,useState} from 'react';
import {Plus,FolderCog,Users,ShieldCheck,Search,ArrowRight} from 'lucide-react';
import {Segments} from '../../ui/WorkspaceKit';
import {Button} from '../../ui/shadcn/controls';
import {EditDialog,Field,ErrorBox,stableSubmit,when} from './kit';
import {categoryPath,GroupMembers,subjectChoices} from './ConfigurationEditors';
import CategoryEditor from './CategoryEditor';
export {RulesEditor,SchemaEditor} from './ConfigurationEditors';
const subjects=subjectChoices;

export default function Administration({api,onChanged,onOpenCategory}) {
    const [config,setConfig]=useState(null),[error,setError]=useState(''),[editor,setEditor]=useState(null),[tab,setTab]=useState('category'),[search,setSearch]=useState(''),[saved,setSaved]=useState(null);
    const submit=useMemo(()=>stableSubmit(api),[api]);
    const load=()=>api.get('/configuration').then(result=>{setConfig(result);setError('');}).catch(failure=>{setConfig(null);setError(failure.message);});
    useEffect(()=>{const abort=new AbortController();api.get('/configuration',abort.signal).then(result=>{if(!abort.signal.aborted)setConfig(result);}).catch(failure=>{if(!abort.signal.aborted)setError(failure.message);});return()=>abort.abort();},[api]);
    function category(item) {setEditor({kind:'category',id:item?.id||0,value:item?{...item,enabled:!!item.enabled,rules:config.rules.filter(rule=>rule.scope_type==='category'&&rule.scope_id===item.id)}:{name:'',description:'',parent_id:null,position:0,enabled:true,fields:[],rules:[],record_count:0}});}
    const items=(config?.[tab==='category'?'categories':'groups']||[]).filter(item=>(tab==='category'?categoryPath(item,config.categories):item.name).toLocaleLowerCase().includes(search.toLocaleLowerCase()));
    return <section className="dc-admin dc-configuration">
        <div className="dc-toolbar"><Segments value={tab} onChange={value=>{setTab(value);setSearch('');}} label="资料配置类型" items={[["category","分类与字段"],["group","协作工作组"]]}/>{config&&<Button variant="primary" onClick={()=>tab==='category'?category(null):setEditor({kind:'group',id:0,value:{name:'',members:[]}})}><Plus size={15}/>{tab==='category'?'新建分类':'新建工作组'}</Button>}</div>
        <p className="dc-help dc-config-intro"><ShieldCheck size={15}/>分类决定资料如何整理和填写；权限决定谁能查阅、维护与协作。工作组用于授权，组织隶属仍在“组织与成员”中维护。</p>
        <div className="dc-config-search"><Search size={16}/><input aria-label={tab==='category'?'搜索分类配置':'搜索工作组'} placeholder={tab==='category'?'按分类或上级目录查找':'按工作组名称查找'} value={search} onChange={event=>setSearch(event.target.value)}/><span>{items.length}项</span></div>
        <ErrorBox error={error}/>
        {saved&&<div className="dc-config-saved" role="status"><span>已保存“{saved.name}”的分类配置</span>{onOpenCategory&&<Button variant="ghost" onClick={()=>onOpenCategory(saved.id)}>进入该分类<ArrowRight size={14}/></Button>}</div>}
        {!config&&!error?<p className="dc-empty">正在读取配置…</p>:config&&<div className="dc-list">{items.map(item=><button key={item.id} className="dc-admin-row" onClick={()=>tab==='category'?category(item):setEditor({kind:'group',id:item.id,value:item})}>
            <span>{tab==='category'?<FolderCog size={18}/>:<Users size={18}/>}<span><strong>{item.name}</strong>{tab==='category'&&<small>{item.parent_id?categoryPath(item,config.categories):'顶层目录'}</small>}</span></span>
            <span className="dc-admin-summary">{tab==='category'?<><span>{item.enabled?'使用中':'已停用'} · {item.fields.length}个字段 · {item.record_count||0}条资料</span><small>{config.rules.some(rule=>rule.scope_type==='category'&&rule.scope_id===item.id)?'已配置默认权限':'尚未授权'}</small></>:<><span>{item.members.length}位成员</span><small>被{new Set(config.rules.filter(rule=>rule.principal_type==='group'&&Number(rule.principal_id)===item.id).map(rule=>`${rule.scope_type}:${rule.scope_id}`)).size}处规则引用</small></>}</span>
        </button>)}{!items.length&&<div className="dc-empty">{search?'没有匹配结果，请调整关键词。':`尚未建立${tab==='category'?'分类':'工作组'}，可以从右上角新增。`}</div>}</div>}
        {config?.events?.length>0&&<details className="dc-config-history"><summary>配置变更记录</summary>{config.events.map(e=><article key={e.id}><strong>{e.label} · {e.detail.configuration?.name||'单条资料'}</strong><small>{e.actor} · {when(e.created_at)}</small>{e.detail.configuration?.members&&<p>成员：{e.detail.configuration.members.map(id=>config.users.find(u=>u.id===Number(id))?.name||'已停用人员').join('、')||'无'}</p>}{e.detail.configuration?.fields&&<p>字段：{e.detail.configuration.fields.map(f=>f.label).join('、')||'仅编号与名称'}</p>}{e.detail.configuration?.rules&&<details><summary>查看当次授权结果</summary>{e.detail.configuration.rules.map((r,i)=><p key={i}>{r.principal_type==='everyone'?'所有在用人员':subjects(config,r.principal_type).find(u=>u.id===Number(r.principal_id))?.name||'已停用对象'} · {config.actions[r.action]} · {r.effect==='allow'?'允许':'禁止'}</p>)}{!e.detail.configuration.rules.length&&<p>无单独授权规则</p>}</details>}</article>)}</details>}
        {editor?.kind==='category'&&<CategoryEditor api={api} config={config} editor={editor} onClose={()=>setEditor(null)} onSave={async value=>{const result=await submit(`/catalog/category/${editor.id}`,value);await load();setSaved({id:result.id,name:value.name});onChanged();}}/>}
        {editor?.kind==='group'&&<EditDialog title="协作工作组" initial={editor.value} onClose={()=>setEditor(null)} onSave={async value=>{await submit(`/catalog/group/${editor.id}`,value);await load();onChanged();}}>{(value,set)=><><Field label="工作组名称 *"><input value={value.name} required maxLength={80} onChange={event=>set({...value,name:event.target.value})}/></Field><fieldset><legend>工作组成员（软件账号）</legend><GroupMembers config={config} value={value.members} original={editor.value.members} onChange={members=>set({...value,members})}/></fieldset><p className="dc-help">加入工作组不会创建账号。成员获得的资料权限由该工作组被引用的授权规则决定，明确禁止仍然优先。</p></>}</EditDialog>}
    </section>;
}
