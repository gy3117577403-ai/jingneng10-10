import { ref, reactive, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { api, key, uploadFile } from './api'
import { safeParse, changeRows } from './utils'

const tabs = ['overview','documents','tasks','ai','activities','exports']
export function useWorkspace() {
  const boot=ref(null), selected=ref(null), rows=ref([]), total=ref(0), loading=ref(true), error=ref(''), notice=ref('')
  const view=ref('inquiries'), tab=ref('overview'), target=ref(''), busy=ref(false), childDirty=ref(false)
  const filters=reactive({q:'',business_type:'',status:'协作中',sort:'updated',scope:'all',page:1})
  const inbox=ref({rows:[],counts:{all:0,reply:0,confirm:0,ai:0,held:0},total:0}), inboxKind=ref('all'), inboxPage=ref(1)
  const recent=ref([]), density=ref('compact'), collapsed=ref(false), mobileNav=ref(false)
  const columns=reactive({business:true,people:true,date:true,status:true,updated:true})
  const modal=ref(null), dialog=ref(null), form=reactive({}), formError=ref(''), discardPrompt=ref(false), conflict=ref(null)
  const confirmation=ref(''),confirmDialog=ref(null)
  let resolveConfirmation,confirmFocus
  const file=ref(null), uploadProgress=ref(0), originalForm=ref(''), requestKey=ref(key())
  let listToken=0, detailToken=0, inboxToken=0, searchTimer, noticeTimer, lastHash='', listHash='/inquiries', listScroll=0, focusBefore=null, booted=false
  const user=computed(()=>boot.value?.user)
  const isOpen=computed(()=>selected.value?.status==='协作中')
  const people=computed(()=>boot.value?.people || [])
  const userName=id=>selected.value?.people?.[id] || people.value.find(p=>p.name===id)?.full_name || (id==='Administrator'?'管理员':id || '未指定')
  const department=id=>boot.value?.departments.find(d=>d.name===id)?.department_name || id
  const formDirty=computed(()=>!!modal.value && (JSON.stringify(form)!==originalForm.value || !!file.value))
  const storageKey=()=>`jn.ui.v1.${user.value}`
  const modalTitle=computed(()=>({create:'新建询价',edit:'编辑询价',upload:form.document?'上传新版本':'上传资料',task:'分派任务',reply:'回复任务',return:'退回补充',hold:'挂起任务',archive:isOpen.value?'归档询价':'恢复协作'}[modal.value]||''))
  const conflictRows=computed(()=>conflict.value && form.data ? changeRows(form.data,conflict.value) : [])
  const remaining=computed(()=>selected.value?.tasks.filter(t=>t.status!=='已完成').length||0)
  function notify(message) { notice.value=message; clearTimeout(noticeTimer); noticeTimer=setTimeout(()=>notice.value='',5500) }
  function persist() { if(!booted)return; try{localStorage.setItem(storageKey(),JSON.stringify({density:density.value,collapsed:collapsed.value,columns,listHash}))}catch{} }
  watch([density,collapsed,columns],persist,{deep:true})
  watch(form,()=>{ if(!busy.value)requestKey.value=key() },{deep:true,flush:'sync'})
  function routeURL() { const params=new URLSearchParams(); for(const [k,v]of Object.entries(filters))if((v!==''||k==='status') && !(k==='page' && v===1))params.set(k,v); return '/inquiries?'+params }
  async function ask(message){
    if(resolveConfirmation)return false
    confirmFocus=document.activeElement;confirmation.value=message
    const answer=new Promise(resolve=>resolveConfirmation=resolve)
    await nextTick();confirmDialog.value.showModal();confirmDialog.value.querySelector('button')?.focus()
    return answer
  }
  function answerConfirmation(answer){confirmDialog.value?.close();confirmation.value='';const resolve=resolveConfirmation;resolveConfirmation=null;resolve?.(answer);nextTick(()=>confirmFocus?.isConnected&&confirmFocus.focus())}
  async function navigate(path, replace=false) {
    if(childDirty.value && !await ask('候选的选择或修订尚未提交。离开后将放弃这些修改，是否继续？'))return
    childDirty.value=false; mobileNav.value=false
    if(replace){ history.replaceState(null,'','#'+path); route() }
    else if(location.hash==='#'+path)route(); else location.hash=path
  }
  function changeTab(next, item='') { navigate(`/inquiry/${encodeURIComponent(selected.value.name)}?tab=${next}${item?'&target='+encodeURIComponent(item):''}`) }
  function openInquiry(name, next='overview', item='') { navigate(`/inquiry/${encodeURIComponent(name)}?tab=${next}${item?'&target='+encodeURIComponent(item):''}`) }
  function backToList(){navigate(listHash)}
  async function loadList() {
    const token=++listToken; loading.value=true; error.value=''
    try { const data=await api('inquiries',filters); if(token!==listToken)return; rows.value=data.rows;total.value=data.total }
    catch(e){if(token===listToken)error.value=e.message}finally{if(token===listToken)loading.value=false}
  }
  async function loadInbox(visible=false) {
    const token=++inboxToken;if(visible)loading.value=true
    try{const data=await api('work_items',{kind:inboxKind.value,page:inboxPage.value});if(token===inboxToken)inbox.value=data}
    finally{if(visible && token===inboxToken)loading.value=false}
  }
  async function loadDetail(name) {
    const token=++detailToken;loading.value=true
    try{const data=await api('detail',{name});if(token===detailToken)selected.value=data}
    catch(e){if(token===detailToken){selected.value=null;error.value=e.message}}finally{if(token===detailToken)loading.value=false}
  }
  async function route() {
    if(!boot.value)return
    const next=location.hash.slice(1)||'/inquiries'
    if(childDirty.value && next!==lastHash){if(!await ask('候选修订尚未提交，是否放弃并离开？')){history.replaceState(null,'','#'+lastHash);return}childDirty.value=false}
    lastHash=next; const [path,query='']=next.split('?');const p=new URLSearchParams(query);error.value='';mobileNav.value=false
    if(path.startsWith('/inquiry/')){
      const name=decodeURIComponent(path.slice(9));const changed=selected.value?.name!==name
      view.value='detail';tab.value=tabs.includes(p.get('tab'))?p.get('tab'):'overview';target.value=p.get('target')||''
      if(changed){selected.value=null;await loadDetail(name)}
    }else{
      ++detailToken;selected.value=null;target.value='';view.value=path==='/tasks'?'tasks':'inquiries'
      if(view.value==='tasks'){
        inboxKind.value=['all','reply','confirm','ai','held'].includes(p.get('kind'))?p.get('kind'):'all';inboxPage.value=Math.max(1,Number(p.get('page'))||1)
        try{await loadInbox(true);recent.value=(await api('inquiries',{status:'协作中'})).rows.slice(0,5)}catch(e){error.value=e.message}
      }else{
        Object.assign(filters,{q:p.get('q')||'',business_type:p.get('business_type')||'',status:p.has('status')?p.get('status'):'协作中',sort:p.get('sort')||'updated',scope:p.get('scope')||'all',page:Math.max(1,Number(p.get('page'))||1)})
        listHash=next;persist();await loadList()
      }
    }
    await nextTick();const area=document.querySelector('[data-scroll-area]');if(area)area.scrollTop=view.value==='inquiries'?listScroll:0
    if(target.value && tab.value==='tasks')await nextTick(()=>document.getElementById('task-'+target.value)?.scrollIntoView({block:'center',behavior:'auto'}))
    document.title=(view.value==='detail'?selected.value?.title||'询价详情':view.value==='tasks'?'我的工作':'询价协作')+' · 京能'
  }
  function applyFilters(){filters.page=1;listScroll=0;listHash=routeURL();persist();history.replaceState(null,'','#'+listHash);lastHash=listHash;loadList()}
  function search(){clearTimeout(searchTimer);searchTimer=setTimeout(applyFilters,250)}
  function listPage(page){filters.page=page;listScroll=0;listHash=routeURL();navigate(listHash)}
  function chooseInbox(kind,page=1){navigate(`/tasks?kind=${kind}&page=${page}`)}
  function storeScroll(event){if(view.value==='inquiries')listScroll=event.target.scrollTop}
  async function refresh(){error.value='';try{if(view.value==='detail' && selected.value)await loadDetail(selected.value.name);else if(view.value==='inquiries')await loadList();else await loadInbox(true);if(view.value!=='tasks')await loadInbox()}catch(e){error.value=e.message}}
  async function openModal(type,values={}){
    focusBefore=document.activeElement;formError.value='';file.value=null;uploadProgress.value=0;conflict.value=null;discardPrompt.value=false
    for(const k of Object.keys(form))delete form[k];Object.assign(form,values);originalForm.value=JSON.stringify(form);requestKey.value=key();modal.value=type
    await nextTick();dialog.value.showModal();dialog.value.querySelector('.modal-body input:not([type=file]),.modal-body textarea,.modal-body select,.modal-footer button')?.focus()
  }
  function closeModal(force=false){if(busy.value)return;if(!force && formDirty.value){discardPrompt.value=true;return}dialog.value?.close();modal.value=null;formError.value='';conflict.value=null;discardPrompt.value=false;nextTick(()=>focusBefore?.isConnected&&focusBefore.focus())}
  function editInquiry(create=false){const source=selected.value;const data=create?{title:'',business_type:filters.business_type||'成套',customer_name:'',department:'SALES',collaborator:people.value.find(p=>p.name!==user.value)?.name||'',expected_date:'',notes:'',items:[{product_name:'',quantity:1,unit:'台',specification:''}]}:Object.fromEntries(['title','business_type','customer_name','department','collaborator','expected_date','notes','items'].map(k=>[k,JSON.parse(JSON.stringify(source[k]??''))]));openModal(create?'create':'edit',{data,expected_revision:source?.revision})}
  function upload(document){openModal('upload',{document:document?.name||'',title:document?.title||'',change_note:'',expected_revision:selected.value.revision})}
  function chooseFile(value){const chosen=value?.target?.files?.[0]||value;if(!chosen)return;if(chosen.size>10*1024*1024||!chosen.size){formError.value='文件不能为空且单个不超过 10 MB。';file.value=null;return}file.value=chosen;formError.value='';requestKey.value=key();if(!form.title)form.title=chosen.name}
  function taskModal(){openModal('task',{title:'',description:'',assigned_to:selected.value.collaborator||selected.value.responsible,expected_revision:selected.value.revision})}
  function actionModal(task,action){openModal(action,{task_name:task.name,task_title:task.title,reply:'',expected_revision:selected.value.revision})}
  async function inspectConflict(){try{conflict.value=await api('detail',{name:selected.value.name})}catch(e){formError.value=e.message}}
  async function retryConflict(){form.expected_revision=conflict.value.revision;selected.value=conflict.value;conflict.value=null;requestKey.value=key();await submit()}
  async function submit(){
    if(busy.value)return;busy.value=true;formError.value='';const type=modal.value;const name=selected.value?.name;let result
    try{
      const common={name,expected_revision:form.expected_revision,request_id:requestKey.value}
      if(type==='create')result=await api('create_inquiry',{data:form.data,request_id:requestKey.value},true)
      else if(type==='edit')result=await api('update_inquiry',{...common,data:form.data},true)
      else if(type==='upload'){
        if(!file.value)throw new Error('请选择要上传的原件。')
        const body=new FormData();for(const[k,v]of Object.entries({...common,document:form.document,title:form.title,change_note:form.change_note}))body.append(k,v??'');body.append('file',file.value)
        result=await uploadFile(body,value=>uploadProgress.value=value)
      }else if(type==='task')result=await api('create_task',{...common,title:form.title,description:form.description,assigned_to:form.assigned_to},true)
      else if(type==='archive')result=await api('change_status',{...common,status:isOpen.value?'已归档':'协作中'},true)
      else result=await api('task_action',{...common,task_name:form.task_name,action:type,reply:form.reply},true)
    }catch(e){formError.value=e.message;if(e.status===409)await inspectConflict();return}finally{busy.value=false}
    closeModal(true);notify(type==='upload'?(result.duplicate?'文件内容未变化，继续保留当前版本。':`资料已保存为第 ${result.version} 版。`):type==='reply'?'回复已提交，等待负责人确认。':type==='task'?'任务已分派。':'已保存。')
    if(type==='create')openInquiry(result.name)
    else{await loadDetail(name);if(type==='task')changeTab('tasks',result.name)}
    await loadInbox().catch(()=>{})
  }
  async function taskAction(task,action){if(busy.value)return;busy.value=true;error.value='';try{await api('task_action',{name:selected.value.name,expected_revision:selected.value.revision,task_name:task.name,action,reply:'',request_id:key()},true);notify(action==='confirm'?'任务已确认完成。':'任务已恢复。');await loadDetail(selected.value.name);await loadInbox()}catch(e){error.value=e.message}finally{busy.value=false}}
  const exportKey=ref(key())
  async function exportBundle(){if(busy.value)return;busy.value=true;error.value='';try{await api('export_bundle',{name:selected.value.name,expected_revision:selected.value.revision,request_id:exportKey.value},true);exportKey.value=key();await loadDetail(selected.value.name);changeTab('exports');notify('资料包已生成，可以下载。')}catch(e){error.value=e.message}finally{busy.value=false}}
  watch(()=>selected.value?.revision,()=>exportKey.value=key())
  async function logout(){if(formDirty.value||childDirty.value){if(!await ask('仍有未提交的修改，确定退出登录？'))return}await fetch('/api/method/logout',{method:'POST',credentials:'same-origin',headers:{'X-Frappe-CSRF-Token':document.querySelector('meta[name="csrf-token"]').content}});childDirty.value=false;location.href='/signin'}
  function beforeUnload(e){if(formDirty.value||childDirty.value){e.preventDefault();e.returnValue=''}}
  function shortcuts(e){if((e.ctrlKey||e.metaKey)&&e.key==='k'){e.preventDefault();if(modal.value)return;const input=document.getElementById('inquiry-search');if(input)input.focus();else{navigate(listHash);setTimeout(()=>document.getElementById('inquiry-search')?.focus(),250)}}}
  onMounted(async()=>{
    try{boot.value=await api('bootstrap');let prefs={};try{prefs=safeParse(localStorage.getItem(storageKey()))}catch{}density.value=prefs.density==='comfortable'?'comfortable':'compact';collapsed.value=!!prefs.collapsed;for(const k of Object.keys(columns))if(typeof prefs.columns?.[k]==='boolean')columns[k]=prefs.columns[k];listHash=typeof prefs.listHash==='string'&&prefs.listHash.startsWith('/inquiries')?prefs.listHash:'/inquiries';booted=true;await loadInbox().catch(()=>{});await route()}
    catch(e){error.value=e.message;loading.value=false}
    window.addEventListener('hashchange',route);window.addEventListener('beforeunload',beforeUnload);window.addEventListener('keydown',shortcuts)
  })
  onUnmounted(()=>{window.removeEventListener('hashchange',route);window.removeEventListener('beforeunload',beforeUnload);window.removeEventListener('keydown',shortcuts);clearTimeout(searchTimer);clearTimeout(noticeTimer);++listToken;++detailToken;++inboxToken})
  return {boot,selected,rows,total,loading,error,notice,view,tab,target,busy,childDirty,filters,inbox,inboxKind,inboxPage,recent,density,collapsed,mobileNav,columns,modal,dialog,form,formError,discardPrompt,conflict,file,uploadProgress,formDirty,modalTitle,conflictRows,user,isOpen,people,remaining,userName,department,notify,navigate,changeTab,openInquiry,backToList,applyFilters,search,listPage,chooseInbox,storeScroll,refresh,openModal,closeModal,editInquiry,upload,chooseFile,taskModal,actionModal,retryConflict,submit,taskAction,exportBundle,logout,confirmation,confirmDialog,ask,answerConfirmation}
}
