<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { Button } from 'frappe-ui'
import { api, key, downloadURL } from './api'
import AiPanel from './AiPanel.vue'
import './ai.css'

const boot = ref(null), rows = ref([]), total = ref(0), page = ref(1), tasks = ref([])
const view = ref('inquiries'), selected = ref(null), tab = ref('overview')
const loading = ref(true), busy = ref(false), error = ref(''), notice = ref('')
const q = ref(''), business = ref(''), status = ref('协作中')
const modal = ref(null), dialog = ref(null), formError = ref(''), form = reactive({})
const requestKey = ref(''), selectedFile = ref(null), preview = ref(null)
let listToken = 0, detailToken = 0, searchTimer, noticeTimer
const user = computed(() => boot.value?.user)
const people = computed(() => boot.value?.people || [])
const userName = (id) => people.value.find(p => p.name === id)?.full_name || (id === 'Administrator' ? '管理员' : id || '未指定')
const department = (id) => boot.value?.departments.find(p => p.name === id)?.department_name || id
const stamp = (value) => value ? value.slice(0, 16).replace('T', ' ') : '—'
const isOpen = computed(() => selected.value?.status === '协作中')
const myPending = computed(() => tasks.value.filter(t => t.status === '待处理').length)
const remaining = computed(() => selected.value?.tasks.filter(t => t.status !== '已完成').length || 0)
const modalTitle = computed(() => ({ create: '新建询价', edit: '编辑询价', upload: form.document ? '上传新版本' : '上传资料', task: '分派问题任务', reply: '提交任务回复', return: '退回补充', hold: '挂起任务', archive: isOpen.value ? '归档询价' : '恢复协作', preview: '原件预览' }[modal.value] || ''))

function showNotice(message) { notice.value = message; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => notice.value = '', 6500) }
async function loadList() {
  const token = ++listToken
  loading.value = true
  try {
    const data = await api('inquiries', { q: q.value, business_type: business.value, status: status.value, page: page.value })
    if (token === listToken) { rows.value = data.rows; total.value = data.total }
  } catch (e) { if (token === listToken) error.value = e.message }
  finally { if (token === listToken) loading.value = false }
}
async function loadTasks() { tasks.value = await api('my_tasks') }
async function loadDetail(name) {
  const token = ++detailToken
  loading.value = true; error.value = ''
  try { const data = await api('detail', { name }); if (token === detailToken) selected.value = data }
  catch (e) { if (token === detailToken) { selected.value = null; error.value = e.message } }
  finally { if (token === detailToken) loading.value = false }
}
async function route() {
  if (!boot.value) return
  const path = location.hash.slice(1)
  error.value = ''
  if (path.startsWith('/inquiry/')) { view.value = 'detail'; tab.value = 'overview'; await loadDetail(decodeURIComponent(path.slice(9))) }
  else {
    ++detailToken; selected.value = null
    view.value = path === '/tasks' ? 'tasks' : 'inquiries'
    loading.value = true
    try { if (view.value === 'tasks') await loadTasks(); else await loadList() }
    catch (e) { error.value = e.message }
    finally { loading.value = false }
  }
}
function navigate(path) { if (location.hash === '#' + path) route(); else location.hash = path }
function search() { clearTimeout(searchTimer); searchTimer = setTimeout(() => { page.value = 1; loadList() }, 250) }
function filter(value) { business.value = value; page.value = 1; loadList() }
async function refresh() {
  error.value = ''
  if (view.value === 'detail' && selected.value) await loadDetail(selected.value.name)
  else await route()
  await loadTasks().catch(e => error.value = e.message)
}
async function openModal(type, values = {}) {
  formError.value = ''; preview.value = null; selectedFile.value = null
  Object.keys(form).forEach(k => delete form[k])
  Object.assign(form, values)
  requestKey.value = key(); modal.value = type
  await nextTick(); dialog.value.showModal()
}
function closeModal() { if (!busy.value) { dialog.value?.close(); modal.value = null; formError.value = '' } }
function editInquiry(create = false) {
  const source = selected.value
  const data = create ? { title: '', business_type: business.value || '成套', customer_name: '', department: 'SALES', collaborator: 'tech.demo@example.invalid', expected_date: '', notes: '', items: [{ product_name: '', quantity: 1, unit: '台', specification: '' }] }
    : Object.fromEntries(['title', 'business_type', 'customer_name', 'department', 'collaborator', 'expected_date', 'notes', 'items'].map(k => [k, JSON.parse(JSON.stringify(source[k] ?? ''))]))
  openModal(create ? 'create' : 'edit', { data, expected_revision: source?.revision })
}
function upload(document) { openModal('upload', { document: document?.name || '', title: document?.title || '', change_note: '', expected_revision: selected.value.revision }) }
function chooseFile(event) { selectedFile.value = event.target.files?.[0]; if (!form.title && selectedFile.value) form.title = selectedFile.value.name }
function taskModal() { openModal('task', { title: '', description: '', assigned_to: selected.value.collaborator || selected.value.responsible, expected_revision: selected.value.revision }) }
function actionModal(task, action) { openModal(action, { task_name: task.name, task_title: task.title, reply: '', expected_revision: selected.value.revision }) }
async function viewRevision(revision) {
  await openModal('preview', { revision })
  try { preview.value = await api('preview', { name: revision.name }) } catch (e) { formError.value = e.message }
}
async function submit() {
  if (busy.value) return
  busy.value = true; formError.value = ''
  const type = modal.value
  try {
    const common = { name: selected.value?.name, expected_revision: form.expected_revision, request_id: requestKey.value }
    let result
    if (type === 'create') result = await api('create_inquiry', { data: form.data, request_id: requestKey.value }, true)
    else if (type === 'edit') result = await api('update_inquiry', { ...common, data: form.data }, true)
    else if (type === 'upload') {
      if (!selectedFile.value) throw new Error('请选择要上传的原件。')
      const body = new FormData()
      for (const [k, v] of Object.entries({ ...common, document: form.document, title: form.title, change_note: form.change_note })) body.append(k, v ?? '')
      body.append('file', selectedFile.value)
      result = await api('upload', body, true)
    } else if (type === 'task') result = await api('create_task', { ...common, title: form.title, description: form.description, assigned_to: form.assigned_to }, true)
    else if (type === 'archive') result = await api('change_status', { ...common, status: isOpen.value ? '已归档' : '协作中' }, true)
    else result = await api('task_action', { ...common, task_name: form.task_name, action: type, reply: form.reply }, true)
    busy.value = false; closeModal()
    if (type === 'create') navigate('/inquiry/' + result.name)
    else await loadDetail(common.name)
    await loadTasks()
    showNotice(type === 'upload' && result.duplicate ? '内容与当前版本相同，已保留原版本。' : '已保存，操作记录同步更新。')
  } catch (e) { formError.value = e.message }
  finally { busy.value = false }
}
async function taskAction(task, action) {
  if (busy.value) return
  busy.value = true; error.value = ''
  const name = selected.value.name
  try { await api('task_action', { name, expected_revision: selected.value.revision, task_name: task.name, action, reply: '', request_id: key() }, true); await loadDetail(name); await loadTasks(); showNotice('任务状态已保存。') }
  catch (e) { error.value = e.message }
  finally { busy.value = false }
}
async function exportBundle() {
  busy.value = true; error.value = ''
  const name = selected.value.name
  try { await api('export_bundle', { name, expected_revision: selected.value.revision, request_id: key() }, true); await loadDetail(name); tab.value = 'exports'; showNotice('资料包已生成，包含记录快照、各版原件与校验清单。请点击下载资料包。') }
  catch (e) { error.value = e.message }
  finally { busy.value = false }
}
async function logout() {
  await fetch('/api/method/logout', { method: 'POST', credentials: 'same-origin', headers: { 'X-Frappe-CSRF-Token': document.querySelector('meta[name="csrf-token"]').content } })
  location.href = '/login?redirect-to=/workbench'
}
onMounted(async () => {
  try { boot.value = await api('bootstrap'); await loadTasks(); await route() }
  catch (e) { error.value = e.message; loading.value = false }
  window.addEventListener('hashchange', route)
})
onUnmounted(() => { window.removeEventListener('hashchange', route); clearTimeout(searchTimer); clearTimeout(noticeTimer) })
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <a class="brand" href="#/inquiries"><span class="brand-mark">京</span><span>京能协作<small>制造协作 · AI 辅助</small></span></a>
      <div class="nav-caption">工作空间</div>
      <nav aria-label="主导航">
        <a href="#/inquiries" :class="['nav-link', { active: view !== 'tasks' }]"><span class="nav-icon">▤</span>询价工作台</a>
        <a href="#/tasks" :class="['nav-link', { active: view === 'tasks' }]"><span class="nav-icon">☑</span>我的待办<span class="nav-count">{{ myPending }}</span></a>
        <a class="nav-link" href="/foundation"><span class="nav-icon">◈</span>基础环境</a>
      </nav>
      <div class="sidebar-bottom"><span class="environment-dot"></span> 本机演示环境<p>全部示例为虚构资料<br>AI 模拟测试 · 无模型调用</p></div>
      <div class="sidebar-user" v-if="boot"><span class="avatar">{{ boot.full_name?.slice(0, 1) }}</span><div><strong>{{ boot.full_name }}</strong><small>{{ boot.can_create ? '询价发起与确认' : '技术协作与回复' }}</small></div><button class="logout" @click="logout" title="退出登录" aria-label="退出登录">↪</button></div>
    </aside>
    <main class="main">
      <header class="topbar"><span>京能协作 <span class="divider">/</span> {{ view === 'detail' ? '询价详情' : view === 'tasks' ? '我的待办' : '询价工作台' }}</span><span class="demo-label">DEMO · 演示资料</span><button class="mobile-logout" @click="logout">退出登录</button></header>
      <div v-if="notice" class="notice success" role="status">{{ notice }}</div>
      <div v-if="error" class="notice error" role="alert">{{ error }} <button @click="refresh" :disabled="busy">重新读取</button></div>

      <template v-if="view === 'inquiries'">
        <section class="page-heading"><div><span class="eyebrow">协作从一笔需求开始</span><h1>询价工作台</h1><p>把需求、资料与协作放在同一笔业务中。</p></div><Button v-if="boot?.can_create" theme="green" variant="solid" size="lg" @click="editInquiry(true)">＋ 新建询价</Button></section>
        <section class="list-panel">
          <div class="list-toolbar"><div class="segmented" aria-label="业务类型"><button v-for="kind in ['', '成套', '钣金']" :key="kind" :class="{ selected: business === kind }" @click="filter(kind)">{{ kind || '全部询价' }}</button></div><div class="search-tools"><label class="search-field"><span>⌕</span><input v-model="q" @input="search" placeholder="搜索名称、客户或编号" aria-label="搜索询价"></label><select v-model="status" aria-label="询价状态" @change="page = 1; loadList()"><option>协作中</option><option>已归档</option><option value="">全部状态</option></select><Button variant="outline" @click="refresh">刷新</Button></div></div>
          <div class="table-scroll"><table class="inquiry-table"><thead><tr><th>询价 / 客户</th><th>业务类型</th><th>负责人 / 技术协作</th><th>期望交期</th><th>状态</th><th>最近更新</th></tr></thead><tbody><tr v-for="row in rows" :key="row.name"><td><button class="record-link" @click="navigate('/inquiry/' + row.name)">{{ row.title }}</button><div class="row-subtitle">{{ row.customer_name }} <span>·</span> {{ row.name }}</div></td><td><span :class="['type-tag', row.business_type === '钣金' ? 'metal' : '']">{{ row.business_type }}</span></td><td>{{ userName(row.responsible) }}<small class="block muted">{{ userName(row.collaborator) }}</small></td><td>{{ row.expected_date || '待补充' }}</td><td><span class="status-tag" :class="{ quiet: row.status === '已归档' }">{{ row.status }}</span></td><td class="muted">{{ stamp(row.modified) }}<small class="block">记录版本 {{ row.revision }}</small></td></tr></tbody></table></div>
          <div v-if="!rows.length && !loading" class="empty"><span class="empty-icon">▤</span><h3>这里还没有匹配的询价</h3><p>调整筛选条件，或新建一笔成套 / 钣金询价。</p></div>
          <div v-if="loading" class="loading" role="status">正在读取询价…</div>
          <div class="list-footer"><span>当前筛选 {{ total }} 笔 · 仅显示你有权访问的记录</span><div><Button variant="ghost" :disabled="page <= 1 || loading" @click="page--; loadList()">上一页</Button><span>{{ page }}</span><Button variant="ghost" :disabled="page * 20 >= total || loading" @click="page++; loadList()">下一页</Button></div></div>
        </section>
        <div class="workflow-note"><span>协作路径</span><p>登记需求 <i>→</i> 保存资料版本 <i>→</i> 分派与回复 <i>→</i> 人工确认 <i>→</i> 导出资料包</p></div>
      </template>

      <template v-else-if="view === 'tasks'">
        <section class="page-heading"><div><span class="eyebrow">明确责任，保留结论</span><h1>我的待办</h1><p>这里汇总分派给你的未完成任务，等待确认的回复也会保留。</p></div><Button variant="outline" @click="refresh">刷新待办</Button></section>
        <section class="list-panel task-inbox"><button v-for="task in tasks" :key="task.name" class="inbox-row" @click="navigate('/inquiry/' + task.inquiry)"><span class="task-symbol">☑</span><span><strong>{{ task.title }}</strong><small>{{ task.inquiry }} · {{ stamp(task.creation) }}</small></span><span class="status-tag">{{ task.status }}</span><span>→</span></button><div v-if="!tasks.length && !loading" class="empty"><h3>目前没有分派给你的未完成任务</h3><p>新任务会在这里出现；也可以进入询价查看所有协作记录。</p></div></section>
      </template>

      <template v-else-if="selected">
        <button class="back-link" @click="navigate('/inquiries')" :disabled="busy">← 返回询价工作台</button>
        <section class="detail-heading"><div><div class="detail-kicker"><span class="type-tag" :class="{ metal: selected.business_type === '钣金' }">{{ selected.business_type }}</span><span>{{ selected.name }}</span><span>记录版本 {{ selected.revision }}</span></div><h1>{{ selected.title }}</h1><p>{{ selected.customer_name }} <span class="divider">·</span> {{ userName(selected.responsible) }} 负责 <span class="divider">·</span> <span class="status-tag">{{ selected.status }}</span></p></div><div class="header-actions"><Button v-if="selected.can_edit && isOpen" variant="outline" :disabled="busy" @click="editInquiry()">编辑询价</Button><Button theme="green" variant="solid" :loading="busy" @click="exportBundle">导出资料包</Button><Button v-if="selected.can_edit" variant="ghost" :disabled="busy" @click="openModal('archive', { expected_revision: selected.revision })">{{ isOpen ? '归档' : '恢复协作' }}</Button></div></section>
        <div class="tabs" role="tablist" aria-label="询价内容"><button v-for="t in [['overview','需求概览'],['documents','资料与版本'],['tasks','协作任务'],['ai','AI 辅助'],['activities','操作记录'],['exports','导出包']]" :key="t[0]" role="tab" :aria-selected="tab === t[0]" :class="{ active: tab === t[0] }" @click="tab = t[0]">{{ t[1] }}<span v-if="t[0] === 'documents'">{{ selected.documents.length }}</span><span v-if="t[0] === 'tasks'">{{ selected.tasks.length }}</span></button></div>
        <div v-if="loading" class="loading" role="status">正在同步最新记录…</div>
        <section v-if="tab === 'overview'" class="overview-grid"><div class="panel"><div class="panel-heading"><h2>基本需求</h2><span class="muted">真实字段可后补</span></div><dl class="info-grid"><div><dt>客户名称</dt><dd>{{ selected.customer_name }}</dd></div><div><dt>期望交期</dt><dd>{{ selected.expected_date || '待补充' }}</dd></div><div><dt>负责部门</dt><dd>{{ department(selected.department) }}</dd></div><div><dt>技术协作者</dt><dd>{{ userName(selected.collaborator) }}</dd></div></dl><div class="note-block"><h3>需求说明</h3><p>{{ selected.notes || '暂未填写需求说明。' }}</p></div><h3 class="product-heading">产品明细 <span>{{ selected.items.length }} 项</span></h3><div class="table-scroll"><table class="products"><thead><tr><th>产品名称</th><th>数量 / 单位</th><th>规格说明</th></tr></thead><tbody><tr v-for="item in selected.items" :key="item.line_id"><td>{{ item.product_name }}</td><td>{{ item.quantity }} {{ item.unit }}</td><td>{{ item.specification || '待补充' }}</td></tr></tbody></table></div></div><aside class="detail-aside"><div class="panel"><span class="eyebrow">当前协作</span><h2>{{ remaining }} <small>项未完成任务</small></h2><p class="muted">已回复的任务需要负责人确认，关闭页面后状态仍会保留。</p><Button variant="outline" class="full-width" @click="tab = 'tasks'">查看协作任务 →</Button></div><div class="soft-note"><strong>访问范围</strong><p>负责人、已指定的技术协作者与管理员可以查看本笔询价及其原件。</p></div><div class="soft-note"><strong>AI 辅助 · 模拟测试</strong><p>从原件提取候选，核对来源后由负责人确认写入。</p><Button variant="ghost" @click="tab = 'ai'">打开 AI 辅助 →</Button></div></aside></section>

        <section v-if="tab === 'documents'"><div class="section-tools"><div><h2>资料与版本</h2><p>每个版本保留原件，更新资料时不覆盖旧版。</p></div><Button v-if="isOpen" theme="green" variant="solid" :disabled="busy" @click="upload()">＋ 上传资料</Button></div><div v-if="!selected.documents.length" class="panel empty"><span class="empty-icon">▧</span><h3>把这笔询价的原件放在这里</h3><p>单个文件上限 10 MB。支持 PDF、文本、Office、图片和 DXF 原件保存。</p></div><article class="panel document-card" v-for="document in selected.documents" :key="document.name"><header><div><h3>{{ document.title }}</h3><small class="muted">{{ document.name }} · 当前第 {{ document.current_version }} 版</small></div><Button v-if="isOpen" variant="outline" :disabled="busy" @click="upload(document)">上传新版本</Button></header><div class="version-row" v-for="version in document.versions" :key="version.name"><span class="version-number" :class="{ current: version.version_number === document.current_version }">V{{ version.version_number }}</span><div class="version-info"><strong>{{ version.filename }}</strong><small>{{ userName(version.uploaded_by) }} · {{ stamp(version.creation) }} · {{ (version.file_size / 1024).toFixed(1) }} KB</small><p v-if="version.change_note">{{ version.change_note }}</p><code :title="version.sha256">SHA-256 {{ version.sha256.slice(0, 16) }}…</code></div><div class="version-actions"><Button v-if="/\.(txt|csv)$/i.test(version.filename)" variant="ghost" @click="viewRevision(version)">预览</Button><a class="download-link" :href="downloadURL('revision', version.name)">下载原件</a></div></div></article></section>

        <section v-if="tab === 'tasks'"><div class="section-tools"><div><h2>协作任务</h2><p>分派、回复、确认和退回都有独立记录。</p></div><Button v-if="selected.can_edit && isOpen" theme="green" variant="solid" :disabled="busy" @click="taskModal">＋ 分派任务</Button></div><div v-if="!selected.tasks.length" class="panel empty"><h3>暂时没有协作任务</h3><p>负责人可以把缺项、问题或待确认事项分派给协作者。</p></div><article v-for="task in selected.tasks" :key="task.name" class="panel task-card"><header><div><span class="status-tag" :class="{ quiet: task.status === '已完成' }">{{ task.status }}</span><h3>{{ task.title }}</h3><small class="muted">处理人：{{ userName(task.assigned_to) }} · {{ task.name }}</small></div></header><p class="preserve">{{ task.description }}</p><div v-if="task.reply" class="reply-block"><strong>最近回复</strong><p>{{ task.reply }}</p></div><footer v-if="isOpen"><Button v-if="task.status === '待处理' && (task.assigned_to === user || user === 'Administrator')" theme="green" variant="solid" :disabled="busy" @click="actionModal(task, 'reply')">回复任务</Button><template v-if="selected.can_edit"><Button v-if="task.status === '待确认'" theme="green" variant="solid" :disabled="busy" @click="taskAction(task, 'confirm')">确认完成</Button><Button v-if="task.status === '待确认'" variant="outline" :disabled="busy" @click="actionModal(task, 'return')">退回补充</Button><Button v-if="['待处理','待确认'].includes(task.status)" variant="ghost" :disabled="busy" @click="actionModal(task, 'hold')">挂起</Button><Button v-if="task.status === '已挂起'" variant="outline" :disabled="busy" @click="taskAction(task, 'resume')">恢复任务</Button></template><span v-if="task.status === '待确认' && !selected.can_edit" class="muted">等待询价负责人确认</span></footer></article></section>

        <AiPanel v-if="tab === 'ai'" :key="selected.name" :inquiry="selected" @changed="refresh" />
        <section v-if="tab === 'activities'" class="panel timeline"><h2>操作记录</h2><article v-for="item in selected.activities" :key="item.name"><span class="timeline-dot"></span><div><strong>{{ item.summary }}</strong><p>{{ userName(item.actor) }} · {{ stamp(item.creation) }}</p><details v-if="item.details_json && item.details_json !== '{}'"><summary>查看变化详情</summary><pre>{{ JSON.stringify(JSON.parse(item.details_json), null, 2) }}</pre></details></div></article></section>
        <section v-if="tab === 'exports'" class="panel"><div class="panel-heading"><div><h2>已生成的资料包</h2><p class="muted">每份包对应导出时的记录快照，包含所有资料版本、任务和操作记录。</p></div></div><div v-if="!selected.exports.length" class="empty"><h3>还没有导出包</h3><p>点击右上角“导出资料包”生成可下载的 ZIP。</p></div><div v-for="item in selected.exports" :key="item.name" class="export-row"><span class="file-symbol">ZIP</span><div><strong>记录版本 {{ item.inquiry_revision }} · 资料包</strong><small>{{ stamp(item.creation) }} · {{ userName(item.requested_by) }}</small><code>{{ item.sha256.slice(0, 20) }}…</code></div><a class="download-link" :href="downloadURL('export', item.name)">下载资料包</a></div></section>
      </template>
      <div v-else-if="loading" class="loading" role="status">正在读取工作台…</div>
      <footer class="page-footer"><span>京能协作 · 资料与受控辅助</span><span>F2 / JN-0004 · {{ boot?.version }}</span></footer>
    </main>

    <dialog ref="dialog" class="modal" :class="{ wide: ['create','edit'].includes(modal) }" @cancel.prevent="closeModal" @click="event => event.target === dialog && closeModal()">
      <form @submit.prevent="submit" v-if="modal"><header class="modal-header"><div><span class="eyebrow">{{ modal === 'create' ? '建立一笔可追溯的需求' : '京能协作' }}</span><h2>{{ modalTitle }}</h2></div><button type="button" class="close-modal" aria-label="关闭窗口" @click="closeModal" :disabled="busy">×</button></header>
        <div class="modal-body"><div v-if="formError" class="notice error" role="alert">{{ formError }}</div>
          <template v-if="['create','edit'].includes(modal)"><div class="form-grid"><label>询价名称<input v-model="form.data.title" required maxlength="140" autofocus placeholder="例如：DEMO 某项目配电柜询价"></label><label>客户名称<input v-model="form.data.customer_name" required maxlength="140" placeholder="填写演示客户名称"></label><label>业务类型<select v-model="form.data.business_type"><option>成套</option><option>钣金</option></select></label><label>期望交期<input type="date" v-model="form.data.expected_date"></label><label>负责部门<select v-model="form.data.department"><option v-for="dep in boot.departments" :key="dep.name" :value="dep.name">{{ dep.department_name }}</option></select></label><label>技术协作者<select v-model="form.data.collaborator"><option value="">暂不指定（仅负责人可见）</option><option v-for="person in people.filter(p => p.name !== user)" :key="person.name" :value="person.name">{{ person.full_name }}</option></select></label></div><label class="form-section">需求说明<textarea v-model="form.data.notes" rows="3" maxlength="6000" placeholder="先记录已知需求，真实字段可逐步补充。"></textarea></label><div class="form-section"><div class="panel-heading"><h3>产品明细</h3><Button variant="ghost" @click="form.data.items.push({ product_name: '', quantity: 1, unit: '台', specification: '' })" :disabled="form.data.items.length >= 100">＋ 添加产品行</Button></div><div v-for="(item, index) in form.data.items" :key="item.line_id || index" class="item-editor"><label>产品名称<input v-model="item.product_name" required maxlength="140"></label><label>数量<input type="number" min="0.001" max="100000000" step="0.001" v-model.number="item.quantity" required></label><label>单位<input v-model="item.unit" required maxlength="20"></label><button type="button" class="remove-line" :disabled="form.data.items.length === 1" :aria-label="'移除产品行 ' + (index + 1)" @click="form.data.items.splice(index, 1)">×</button><label class="specification">规格说明<input v-model="item.specification" maxlength="2000" placeholder="可选，先填写已知尺寸、材质或其他说明"></label></div></div></template>
          <template v-else-if="modal === 'upload'"><label>资料名称<input v-model="form.title" required maxlength="140" :readonly="!!form.document"></label><label class="file-picker">选择原件<input type="file" required @change="chooseFile" accept=".pdf,.txt,.csv,.xlsx,.docx,.png,.jpg,.jpeg,.dxf"><small>单个不超过 10 MB；新版本保留原先各版文件。</small></label><label>版本说明<textarea v-model="form.change_note" rows="3" maxlength="1000" placeholder="例如：补充尺寸或修订数量"></textarea></label></template>
          <template v-else-if="modal === 'task'"><label>任务标题<input v-model="form.title" required maxlength="140" autofocus placeholder="例如：请补充安装尺寸"></label><label>处理人<select v-model="form.assigned_to"><option :value="selected.responsible">{{ userName(selected.responsible) }}</option><option v-if="selected.collaborator" :value="selected.collaborator">{{ userName(selected.collaborator) }}</option></select></label><label>任务说明<textarea v-model="form.description" rows="5" maxlength="4000" placeholder="说明需要核对的问题和期待的回复。"></textarea></label></template>
          <template v-else-if="['reply','return','hold'].includes(modal)"><p class="modal-context">{{ form.task_title }}</p><label>{{ modal === 'reply' ? '处理回复' : '原因说明' }}<textarea v-model="form.reply" rows="6" required maxlength="4000" autofocus></textarea></label></template>
          <template v-else-if="modal === 'archive'"><p>归档保留询价、文件、任务和历史记录。存在未完成任务时不能归档，归档后可恢复协作。</p><p class="modal-context">{{ selected.title }}</p></template>
          <template v-else-if="modal === 'preview'"><p class="modal-context">{{ form.revision.filename }} · V{{ form.revision.version_number }}</p><pre class="file-preview" v-if="preview?.supported">{{ preview.text }}</pre><p v-else-if="preview">暂不支持此文件的文本预览，请下载原件查看。</p><p v-else>正在读取原件…</p><p v-if="preview?.truncated" class="muted">预览显示前 200 KB，完整内容请下载原件。</p><a class="download-link" :href="downloadURL('revision', form.revision.name)">下载这一版原件</a></template>
        </div><footer class="modal-footer"><span class="muted" v-if="['create','edit'].includes(modal)">仅用于虚构演示，不代表正式业务规则。</span><Button variant="outline" :disabled="busy" @click="closeModal">{{ modal === 'preview' ? '关闭' : '取消' }}</Button><Button v-if="modal !== 'preview'" type="submit" theme="green" variant="solid" :loading="busy">{{ modal === 'create' ? '创建询价' : modal === 'upload' ? '保存资料版本' : modal === 'task' ? '创建任务' : modal === 'archive' ? '确认操作' : '保存并提交' }}</Button></footer>
      </form>
    </dialog>
  </div>
</template>
