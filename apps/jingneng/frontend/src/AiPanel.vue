<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import Button from './components/UiButton.vue'
import AppIcon from './components/AppIcon.vue'
import StatusBadge from './components/StatusBadge.vue'
import EmptyState from './components/EmptyState.vue'
import DownloadButton from './components/DownloadButton.vue'
import { safeParse, fieldLabels, readable } from './utils'
import { ai, key, downloadURL } from './api'

const props = defineProps({ inquiry: { type: Object, required: true }, requestedRun: String, userName: Function, confirmAction: Function })
const emit = defineEmits(['changed', 'dirty', 'selected'])
const runs = ref([]), current = ref(null), selectedSources = ref([]), scenario = ref('normal')
const busy = ref(false), error = ref(''), notice = ref(''), reason = ref(''), source = ref(null)
const draft = reactive({}), included = reactive({})
const startKey = ref(key()), reviewKey = ref(key()), controlKey = ref(key())
const showSources=ref(false), loading=ref(true), sourceElement=ref(null), reasonInput=ref(null), mobilePanel=ref('candidates')
let timer, stopped = false, selectionToken = 0
const latest = computed(() => props.inquiry.documents.map(d => ({ ...d, file: d.versions.find(r => r.version_number === d.current_version) })))
const candidates = computed(() => current.value?.result?.candidates || [])
const pending = computed(() => current.value?.status === '待审核')
const outdated = computed(() => current.value?.stale || (current.value && current.value.inquiry_revision !== props.inquiry.revision))
const reviewable = computed(() => pending.value && current.value?.can_review && !outdated.value)
const chosen = computed(() => candidates.value.filter(c => included[c.field]))
const dirty = computed(() => pending.value && current.value?.can_review && (!!reason.value.trim() || chosen.value.length > 0 || candidates.value.some(c => draft[c.field] !== c.value)))
const receipt = computed(() => safeParse(current.value?.review?.changes_json))
const applied = computed(() => Object.entries(receipt.value.applied || {}).map(([field,value]) => ({ field, label:fieldLabels[field], before:readable(receipt.value.before?.[field]), after:readable(value) })))
watch(dirty, value => emit('dirty', !!value), { flush:'sync' })
watch(() => props.requestedRun, async name => { if(name && name !== current.value?.name)try{await select(name)}catch(e){error.value=e.message} })
const scenarioLabels = { normal: '正常提取', fail_once: '首次失败演练', unknown_once: '结果不确定演练' }
const eligible = (file) => file && /\.(txt|csv)$/i.test(file.filename) && file.file_size <= 200000
const stamp = (v) => v ? v.slice(0, 19).replace('T', ' ') : '—'

watch([selectedSources, scenario], () => { startKey.value = key() }, { deep: true })
watch([draft, included, reason], () => { reviewKey.value = key() }, { deep: true })
watch(() => props.inquiry.revision, () => { startKey.value = key(); if (!busy.value) refresh() })

async function select(name, initialize = true) {
  const token = ++selectionToken
  const data = await ai('detail', { name })
  if (stopped || token !== selectionToken) return
  const changed = current.value?.name !== data.name || JSON.stringify(current.value?.result) !== JSON.stringify(data.result)
  if(current.value && ['排队中','运行中'].includes(current.value.status) && !['排队中','运行中'].includes(data.status))notice.value=''
  current.value = data
  if (initialize || changed) {
    for (const k of Object.keys(draft)) delete draft[k]
    for (const k of Object.keys(included)) delete included[k]
    for (const row of data.result.candidates || []) { draft[row.field] = row.value; included[row.field] = false }
    reason.value = ''; source.value = data.sources[0] ? { ...data.sources[0], line:0 } : null; reviewKey.value = key(); controlKey.value = key()
  }
}
async function refresh() {
  try {
    runs.value = await ai('runs', { name: props.inquiry.name })
    if (current.value) await select(current.value.name, false)
    else if (runs.value.length) await select(runs.value.some(r => r.name === props.requestedRun) ? props.requestedRun : runs.value[0].name)
    else showSources.value = true
  } catch (e) { error.value = e.message }
  finally { loading.value = false }
}
async function mayDiscard() { return !dirty.value || await props.confirmAction('候选修订尚未提交，切换后将放弃修改。是否继续？') }
async function choose(name) { if (!await mayDiscard()) return; error.value = ''; try { await select(name); showSources.value=false; emit('selected',name) } catch(e) { error.value=e.message } }
async function changeRun(event){await choose(event.target.value);event.target.value=current.value?.name||''}
async function start() {
  if (busy.value || !await mayDiscard()) return
  busy.value = true; error.value = ''; notice.value = ''
  try {
    const result = await ai('start', { name: props.inquiry.name, expected_revision: props.inquiry.revision, revisions: selectedSources.value, scenario: scenario.value, request_id: startKey.value }, true)
    await select(result.name); await refresh(); showSources.value=false; emit('selected',result.name)
    notice.value = result.duplicate ? '相同输入已有运行，已打开原记录。' : '已排队，可以离开页面；运行记录会保留。'
  } catch (e) { error.value = e.message }
  finally { busy.value = false }
}
async function control(action) {
  if (busy.value) return
  if (action === 'cancel' && !await props.confirmAction('取消本次处理？原件和运行记录会保留。')) return
  busy.value = true; error.value = ''; notice.value = ''
  try {
    await ai('control', { name: current.value.name, action, request_id: controlKey.value }, true)
    controlKey.value = key(); await refresh(); emit('changed')
  } catch (e) { error.value = e.message }
  finally { busy.value = false }
}
async function review(decision) {
  if (busy.value) return
  if (!reason.value.trim()) { error.value = '请填写审核说明。'; reasonInput.value?.focus(); return }
  const changes = decision === 'accept' ? Object.fromEntries(candidates.value.filter(c => included[c.field]).map(c => [c.field, draft[c.field]])) : {}
  if (decision === 'accept' && !Object.keys(changes).length) { error.value = '请勾选要采纳的候选字段。'; return }
  busy.value = true; error.value = ''; notice.value = ''
  try {
    await ai('review', { name: current.value.name, expected_revision: props.inquiry.revision, decision, changes, reason: reason.value, request_id: reviewKey.value }, true)
    await refresh(); emit('dirty',false); emit('changed')
    notice.value = decision === 'accept' ? '所选字段已写入询价，审核人与修改前后值已留痕。' : '已驳回，本次候选没有写入询价。'
  } catch (e) { error.value = e.message }
  finally { busy.value = false }
}
async function viewSource(evidence) {
  const found=current.value.sources.find(s=>s.revision===evidence.source)
  if(!found)return
  source.value={...found,line:evidence.line};mobilePanel.value='source';await nextTick()
  const line=sourceElement.value?.querySelector('[data-line="'+evidence.line+'"]')
  if(line)sourceElement.value.scrollTop=Math.max(0,line.offsetTop-sourceElement.value.clientHeight/2)
}
function selectSource(name) { const found=current.value?.sources.find(s=>s.revision===name);if(found)source.value={...found,line:0} }
function sample() {
  const content = `DEMO 虚构${props.inquiry.business_type}资料，仅用于模拟流程验收\n客户名称：DEMO ${props.inquiry.business_type}客户\n期望交期：2026-12-20\n需求说明：${props.inquiry.business_type === '成套' ? '演示控制柜，规格与元件清单待技术确认。' : '演示钣金外壳，材质与表面处理待技术确认。'}\n`
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }))
  const a = document.createElement('a'); a.href = url; a.download = `DEMO-${props.inquiry.business_type}-模拟资料.txt`; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
async function poll() {
  if (stopped) return
  if (!busy.value && runs.value.some(r => ['排队中', '运行中'].includes(r.status))) await refresh()
  if (!stopped) timer = setTimeout(poll, 2000)
}
onMounted(async () => { await refresh(); poll() })
onUnmounted(() => { stopped = true; ++selectionToken; clearTimeout(timer); emit('dirty',false) })
</script>

<template>
  <section class="ai-panel">
    <div class="section-heading ai-heading"><div class="heading-inline"><h2>AI 辅助</h2><span class="mode-badge" title="固定标签模拟提取，尚未调用真实模型">模拟测试</span></div><div class="toolbar-actions"><select v-if="runs.length" :value="current?.name" aria-label="运行记录" :disabled="busy" @change="changeRun"><option v-for="run in runs" :key="run.name" :value="run.name">{{ stamp(run.creation).slice(5,16) }} · {{ run.status }}</option></select><Button icon="refresh" variant="ghost" aria-label="刷新 AI 状态" :disabled="busy" @click="refresh" /><Button v-if="inquiry.status==='协作中'" icon="plus" :variant="showSources?'secondary':'primary'" :disabled="busy" @click="showSources=!showSources">{{ showSources?'收起资料选择':'新建提取' }}</Button></div></div>
    <div v-if="error" class="message error" role="alert"><AppIcon name="warning" /><p>{{ error }}</p><button aria-label="关闭提示" @click="error=''">×</button></div>
    <div v-if="notice" class="message success" role="status"><AppIcon name="check" /><p>{{ notice }}</p><button aria-label="关闭提示" @click="notice=''">×</button></div>
    <div v-if="showSources" class="source-picker panel"><div class="section-heading"><div><h3>选择本次处理的资料</h3><p class="muted">当前支持 TXT / CSV，每份最多 200 KB。</p></div><Button icon="download" variant="ghost" @click="sample">示例资料</Button></div><div v-if="latest.length" class="source-options"><label v-for="doc in latest" :key="doc.name" :class="['source-option',{unavailable:!eligible(doc.file)}]"><input type="checkbox" v-model="selectedSources" :value="doc.file?.name" :disabled="busy||!eligible(doc.file)||(!selectedSources.includes(doc.file?.name)&&selectedSources.length>=5)"><AppIcon name="file" /><span><strong>{{ doc.title }}</strong><small>V{{ doc.current_version }} · {{ eligible(doc.file)?doc.file.filename:'此格式暂不支持提取' }}</small></span></label></div><p v-else class="muted">请先在资料页上传原件。</p><div class="source-picker-footer"><details class="subtle-details"><summary>演示工具</summary><label>处理场景<select v-model="scenario" :disabled="busy"><option value="normal">正常提取</option><option value="fail_once">首次失败演练</option><option value="unknown_once">结果不确定演练</option></select></label><p>固定标签模拟，不代表真实识别质量。</p></details><span class="grow"></span><span class="muted">已选 {{ selectedSources.length }} / 5</span><Button variant="primary" icon="sparkles" :loading="busy" :disabled="!selectedSources.length||inquiry.status!=='协作中'" @click="start">开始模拟提取</Button></div></div>
    <div v-if="loading" class="loading-inline" role="status"><span class="spinner"></span>读取处理记录…</div>
    <EmptyState v-else-if="!current&&!showSources" icon="sparkles" title="从资料整理需求" description="提取候选后，核对来源并确认更新。" />
    <template v-if="current">
      <div class="run-toolbar"><StatusBadge :value="current.status" /><span class="muted">{{ stamp(current.creation).slice(0,16) }}</span><span v-if="outdated&&!pending" class="muted">历史快照</span><span class="grow"></span><Button v-if="current.can_control&&['排队中','运行中','待审核','结果待核对'].includes(current.status)" variant="ghost" :disabled="busy" @click="control('cancel')">取消本次处理</Button></div>
      <div v-if="outdated&&pending" class="message warning"><AppIcon name="warning" /><p>资料或询价已更新。这份候选只能查看，请重新提取或驳回本次结果。</p></div>
      <div v-if="current.error_message" class="message error" role="alert"><AppIcon name="warning" /><p>{{ current.error_message }}</p><Button v-if="current.status==='失败'&&current.can_control&&!outdated&&current.attempt<3" :loading="busy" @click="control('retry')">重试</Button></div>
      <div v-if="['排队中','运行中'].includes(current.status)" class="processing-state" role="status"><span class="spinner"></span><h3>{{ current.status==='排队中'?'等待处理':'正在整理资料' }}</h3><p>结果会自动更新，你可以先处理其他工作。</p></div>
      <template v-else-if="candidates.length">
        <div class="mobile-review-switch segmented"><button :class="{selected:mobilePanel==='candidates'}" @click="mobilePanel='candidates'">{{ current.review?'审核结果':'候选字段' }}</button><button :class="{selected:mobilePanel==='source'}" @click="mobilePanel='source'">来源原文</button></div>
        <div class="ai-workspace" :class="['mobile-'+mobilePanel]">
          <section class="evidence-pane panel"><header class="pane-header"><div class="heading-inline"><AppIcon name="file" /><h3>来源原文</h3></div><select v-if="current.sources.length>1" :value="source?.revision" aria-label="来源文件" @change="selectSource($event.target.value)"><option v-for="s in current.sources" :key="s.revision" :value="s.revision">{{ s.filename }} · V{{ s.version }}</option></select><span v-else-if="source" class="muted">V{{ source.version }}</span></header><div v-if="source" class="source-file-bar"><span :title="source.filename">{{ source.filename }}</span><DownloadButton variant="ghost" kind="revision" :name="source.revision" label="下载" /></div><div v-if="source" ref="sourceElement" class="evidence-lines"><div v-for="(line,i) in source.text.split(/\r?\n/)" :key="i" :data-line="i+1" :class="['source-line',{highlighted:i+1===source.line}]"><span>{{ i+1 }}</span><pre>{{ line||' ' }}</pre></div></div><EmptyState v-else icon="file" title="选择候选来源查看原文" /></section>
          <section class="candidate-pane panel">
            <header class="pane-header"><h3>{{ current.review?'审核结果':'候选字段' }}</h3><span class="muted">{{ current.review?applied.length+' 项已更新':candidates.length+' 项' }}</span></header>
            <template v-if="current.review"><div class="review-receipt"><span :class="['receipt-symbol',{rejected:current.review.decision==='reject'}]"><AppIcon :name="current.review.decision==='accept'?'circleCheck':'archive'" /></span><h3>{{ current.review.decision==='accept'?'已更新 '+applied.length+' 个字段':'本次候选已驳回' }}</h3><p>{{ userName?.(current.review.reviewed_by)||current.review.reviewed_by }} · {{ stamp(current.review.creation).slice(0,16) }}</p><p class="receipt-reason">{{ current.review.reason }}</p></div><div v-for="row in applied" :key="row.field" class="receipt-change"><strong>{{ row.label }}</strong><div class="value-before">{{ row.before }}</div><AppIcon name="arrow" /><div class="value-after">{{ row.after }}</div></div><p class="receipt-note">{{ current.review.decision==='accept'?'其余字段未写入，本次审核已结束。':'询价内容未改变。' }}</p><details class="original-candidates"><summary>查看本次候选与来源</summary><div v-for="candidate in candidates" :key="candidate.field" class="readonly-candidate"><strong>{{ candidate.label }}</strong><p>{{ candidate.value }}</p><button v-for="(evidence,i) in candidate.evidence" :key="i" class="source-link" @click="viewSource(evidence)"><AppIcon name="link" />来源第 {{ evidence.line }} 行</button></div></details></template>
            <template v-else><div class="candidate-list"><article v-for="candidate in candidates" :key="candidate.field" :class="['candidate',{included:included[candidate.field]}]"><div class="candidate-label"><label><input v-if="pending&&current.can_review" type="checkbox" v-model="included[candidate.field]" :disabled="!reviewable||busy"><strong>{{ candidate.label }}</strong></label><span v-if="draft[candidate.field]!==candidate.value" class="edited-tag">已修订</span></div><div class="current-value"><span>当前</span><p>{{ inquiry[candidate.field]||'未填写' }}</p></div><label v-if="reviewable" class="candidate-input"><span class="sr-only">{{ candidate.label }}候选值</span><textarea v-if="candidate.field==='notes'" v-model="draft[candidate.field]" :aria-label="candidate.label+'候选值'" rows="3" maxlength="4000" :disabled="busy"></textarea><input v-else v-model="draft[candidate.field]" :type="candidate.field==='expected_date'?'date':'text'" :aria-label="candidate.label+'候选值'" :maxlength="candidate.field==='expected_date'?10:140" :disabled="busy"></label><p v-else class="readonly-value">{{ candidate.value }}</p><div class="evidence-links"><button v-for="(evidence,i) in candidate.evidence" :key="i" class="source-link" @click="viewSource(evidence)"><AppIcon name="link" />来源第 {{ evidence.line }} 行<span class="evidence-quote">{{ evidence.quote }}</span></button></div><small v-if="draft[candidate.field]!==candidate.value" class="muted">原候选：{{ candidate.value }}</small></article></div><div v-if="current.result.questions?.length" class="questions-box"><strong>需要补充核对</strong><ul><li v-for="question in current.result.questions" :key="question">{{ question }}</li></ul></div><p v-if="pending&&!current.can_review" class="read-only-note"><AppIcon name="shield" />由询价负责人确认更新。你可以查看候选与来源。</p></template>
          </section>
        </div>
      </template>
      <form v-if="pending&&current.can_review" class="review-bar" @submit.prevent="review('accept')"><label>审核说明<textarea ref="reasonInput" v-model="reason" :disabled="busy" maxlength="1000" rows="2" placeholder="填写核对依据或驳回原因" required></textarea></label><div class="review-actions"><div><strong>已选 {{ chosen.length }} 项</strong><small>{{ chosen.length?chosen.map(c=>c.label).join('、'):'未选择的字段保持原值' }}</small></div><Button :disabled="busy" @click="review('reject')">驳回本次候选</Button><Button type="submit" variant="primary" icon="check" :loading="busy" :disabled="!reviewable||!chosen.length">确认并更新 {{ chosen.length }} 项</Button></div></form>
      <details class="run-details"><summary>处理详情</summary><dl><div><dt>模式</dt><dd>模拟测试 · 未调用真实模型</dd></div><div><dt>处理次数</dt><dd>{{ current.attempt }}</dd></div><div><dt>原记录版本</dt><dd>{{ current.inquiry_revision }}</dd></div><div><dt>开始 / 结束</dt><dd>{{ stamp(current.started_at) }} / {{ stamp(current.finished_at) }}</dd></div></dl><p class="muted">运行编号：{{ current.name }}</p></details>
    </template>
  </section>
</template>
