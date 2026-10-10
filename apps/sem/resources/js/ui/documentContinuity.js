import { readDraft, writeDraft, clearDraft } from './sessionDraft';

export function bindDocumentContinuity(root=document) {
    root.querySelectorAll('form[data-jn-continuity-form]').forEach(form=>{
        const scope=`document.${new URL(form.action,location.href).pathname}`, revision=form.dataset.jnRevision;
        const fields=()=>[...form.elements].filter(el=>el.name&&!el.name.startsWith('_')&&!['file','hidden','password','submit','button'].includes(el.type));
        const values=()=>fields().map(el=>({name:el.name,type:el.type,value:el.type==='checkbox'||el.type==='radio'?el.checked:el.value}));
        const status=document.createElement('span');status.className='jn-form-feedback';status.setAttribute('role','status');
        (form.querySelector('.card-footer')||form).prepend(status);
        let saving=false;
        const draft=readDraft(scope,revision);
        if(draft){
            status.textContent='发现本标签页未提交的草稿。';
            const restore=document.createElement('button');restore.type='button';restore.textContent='恢复草稿';restore.className='btn btn-sm btn-outline-primary';
            restore.addEventListener('click',()=>{for(const item of draft){const el=fields().find(x=>x.name===item.name&&x.type===item.type);if(!el)continue;if(['checkbox','radio'].includes(el.type))el.checked=item.value;else {el.value=item.value;if(el.tagName==='SELECT'&&window.jQuery)window.jQuery(el).trigger('change.select2');}}status.textContent='草稿已恢复，请核对后保存。';form.dispatchEvent(new Event('input',{bubbles:true}));});status.append(restore);
        }
        const remember=()=>{const saved=writeDraft(scope,revision,values());form.dataset.jnDraftSaved=String(saved);status.textContent=saved?'修改已保存在本标签页，尚未提交。':'暂时无法保存草稿，请保持页面打开。';};
        form.addEventListener('input',remember);form.addEventListener('change',remember);
        form.addEventListener('submit',async event=>{
            event.preventDefault();if(saving)return;saving=true;
            const body=new FormData(form);const buttons=[...form.querySelectorAll('[type=submit]')];buttons.forEach(x=>x.disabled=true);
            status.setAttribute('role','status');status.textContent='正在保存…';
            try{
                const response=await fetch(form.action,{method:'POST',body,headers:{Accept:'application/json'},credentials:'same-origin'});
                if(!response.ok){const result=await response.json().catch(()=>({}));const details=Object.values(result.errors||{}).flat().join('；');throw new Error(response.status===409?'记录已被更新，当前输入已保留。请另开页面核对最新记录后再修改。':details||([401,419].includes(response.status)?'登录状态过期，请重新登录后再试。':'保存失败，输入已保留，请重试。'));}
                if(!response.redirected)throw new Error('未取得保存回执，输入已保留，请核对后重试。');
                const destination=new URL(response.url);if(/\/login\/?$/.test(destination.pathname))throw new Error('登录状态过期，输入已保留。');
                clearDraft(scope);status.textContent='已保存';location.assign(response.url+location.hash);
            }catch(error){status.setAttribute('role','alert');status.textContent=error.message;form.dispatchEvent(new Event('input',{bubbles:true}));status.textContent=error.message;}
            finally{saving=false;buttons.forEach(x=>x.disabled=false);}
        });
    });
}
