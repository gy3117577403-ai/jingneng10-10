<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import { Button } from 'frappe-ui'
import { ai, key, downloadURL } from './api'

const props = defineProps({ inquiry: { type: Object, required: true } })
const emit = defineEmits(['changed'])
const runs = ref([]), current = ref(null), selectedSources = ref([]), scenario = ref('normal')
const busy = ref(false), error = ref(''), notice = ref(''), reason = ref(''), source = ref(null)
const draft = reactive({}), included = reactive({})
const startKey = ref(key()), reviewKey = ref(key()), controlKey = ref(key())
let timer, stopped = false, selectionToken = 0
const latest = computed(() => props.inquiry.documents.map(d => ({ ...d, file: d.versions.find(r => r.version_number === d.current_version) })))
const candidates = computed(() => current.value?.result?.candidates || [])
const pending = computed(() => current.value?.status === '待审核')
const outdated = computed(() => current.value?.stale || (current.value && current.value.inquiry_revision !== props.inquiry.revision))
const reviewable = computed(() => pending.value && current.value?.can_review && !outdated.value)
const labels = { customer_name: '客户名称', expected_date: '期望交期', notes: '需求说明' }
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
  current.value = data
  if (initialize || changed) {
    for (const k of Object.keys(draft)) delete draft[k]
    for (const k of Object.keys(included)) delete included[k]
    for (const row of data.result.candidates || []) { draft[row.field] = row.value; included[row.field] = false }
    reason.value = ''; source.value = null; reviewKey.value = key(); controlKey.value = key()
  }
}
async function refresh() {
  try {
    runs.value = await ai('runs', { name: props.inquiry.name })
    if (current.value) await select(current.value.name, false)
    else if (runs.value.length) await select(runs.value[0].name)
  } catch (e) { error.value = e.message }
}
async function choose(name) { error.value = ''; try { await select(name) } catch (e) { error.value = e.message } }
async function start() {
  if (busy.value) return
  busy.value = true; error.value = ''; notice.value = ''
  try {
    const result = await ai('start', { name: props.inquiry.name, expected_revision: props.inquiry.revision, revisions: selectedSources.value, scenario: scenario.value, request_id: startKey.value }, true)
    await select(result.name); await refresh()
    notice.value = result.duplicate ? '相同输入已有运行，已打开原记录。' : '已排队，可以离开页面；运行记录会保留。'
  } catch (e) { error.value = e.message }
  finally { busy.value = false }
}
async function control(action) {
  if (busy.value) return
  busy.value = true; error.value = ''; notice.value = ''
  try {
    await ai('control', { name: current.value.name, action, request_id: controlKey.value }, true)
    controlKey.value = key(); await refresh(); emit('changed')
  } catch (e) { error.value = e.message }
  finally { busy.value = false }
}
async function review(decision) {
  if (busy.value) return
  if (!reason.value.trim()) { error.value = '请填写审核说明，记录你的核对依据或驳回原因。'; return }
  const changes = decision === 'accept' ? Object.fromEntries(candidates.value.filter(c => included[c.field]).map(c => [c.field, draft[c.field]])) : {}
  if (decision === 'accept' && !Object.keys(changes).length) { error.value = '请勾选要采纳的候选字段。'; return }
  busy.value = true; error.value = ''; notice.value = ''
  try {
    await ai('review', { name: current.value.name, expected_revision: props.inquiry.revision, decision, changes, reason: reason.value, request_id: reviewKey.value }, true)
    await refresh(); emit('changed')
    notice.value = decision === 'accept' ? '所选字段已写入询价，审核人与修改前后值已留痕。' : '已驳回，本次候选没有写入询价。'
  } catch (e) { error.value = e.message }
  finally { busy.value = false }
}
function viewSource(evidence) {
  const found = current.value.sources.find(s => s.revision === evidence.source)
  if (found) source.value = { ...found, line: evidence.line }
}
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
onUnmounted(() => { stopped = true; ++selectionToken; clearTimeout(timer) })
</script>

<template>
  <section class="ai-panel">
    <div class="ai-banner"><span class="simulation-badge">模拟测试</span><div><strong>先核对来源，再决定是否写入</strong><p>固定标签提取 · 没有模型调用或费用 · 用于验证流程，不代表 AI 识别质量</p></div></div>
    <div v-if="error" class="notice error" role="alert">{{ error }} <button @click="refresh" :disabled="busy">刷新运行记录</button></div>
    <div v-if="notice" class="notice success" role="status">{{ notice }}</div>
    <div class="ai-layout">
      <aside class="ai-controls">
        <div class="panel">
          <h2>1. 选择资料</h2><p class="muted ai-help">先在“资料与版本”上传 UTF-8 TXT / CSV；每份不超过 200 KB。PDF、图片、Office 本批仅保存原件。</p>
          <button class="download-link" @click="sample">下载{{ inquiry.business_type }}虚构示例 TXT</button>
          <div class="ai-sources">
            <label v-for="document in latest" :key="document.name" :class="{ 'muted': !eligible(document.file) }">
              <input type="checkbox" v-model="selectedSources" :value="document.file?.name" :disabled="busy || !eligible(document.file) || inquiry.status !== '协作中'">
              <span><strong>{{ document.title }}</strong><small>V{{ document.current_version }} · {{ eligible(document.file) ? document.file.filename : '本批暂不解析此原件' }}</small></span>
            </label>
            <p v-if="!latest.length" class="muted">尚未上传资料。下载示例后，到“资料与版本”上传即可开始。</p>
          </div>
          <label class="ai-label">模拟场景<select v-model="scenario" :disabled="busy"><option v-for="(label, value) in scenarioLabels" :value="value" :key="value">{{ label }}</option></select></label>
          <Button theme="green" variant="solid" class="full-width" :loading="busy" :disabled="!selectedSources.length || inquiry.status !== '协作中'" @click="start">开始模拟提取</Button>
          <p class="muted ai-help">最多选择 5 份当前版本；相同输入会打开已有运行。</p>
        </div>
        <div class="panel ai-history"><div class="panel-heading"><h3>运行记录</h3><Button variant="ghost" :disabled="busy" @click="refresh">刷新</Button></div><button v-for="run in runs" :key="run.name" :disabled="busy" :class="['ai-run-link', { active: current?.name === run.name }]" @click="choose(run.name)"><strong>{{ run.status }} <span v-if="run.stale">· 旧快照</span></strong><small>{{ stamp(run.creation) }} · 第 {{ run.attempt }} 次</small><small>{{ scenarioLabels[run.scenario] }} · {{ run.name }}</small></button><p v-if="!runs.length" class="muted">提交后会显示每次运行的状态。</p></div>
      </aside>
      <div v-if="!current" class="panel ai-welcome"><span class="eyebrow">资料 → 候选 → 审核 → 留痕</span><h2>让每一次辅助都有依据</h2><p>本批提取客户名称、期望交期和需求说明。点击来源查看原文；负责人勾选、修改并填写审核说明后，所选字段才会进入询价。</p><div class="ai-example">客户名称：DEMO 示例客户<br>期望交期：2026-12-20<br>需求说明：演示需求，技术参数待确认。</div><p class="muted">未提供的内容保持缺失，冲突内容提示核对。模拟器不会理解图纸、生成报价或执行文件里的指令。</p></div>
      <article v-else class="panel ai-review">
        <header class="panel-heading"><div><span class="eyebrow">2. 核对与审核</span><h2>{{ current.status }} <span class="simulation-badge">模拟测试</span></h2><p class="muted ai-help">{{ current.name }} · 记录快照 r{{ current.inquiry_revision }} · 第 {{ current.attempt }} 次</p></div><Button v-if="current.can_control && ['排队中','运行中','待审核','结果待核对'].includes(current.status)" variant="outline" :disabled="busy" @click="control('cancel')">取消运行</Button></header>
        <div v-if="outdated && pending" class="notice error">询价或资料已更新。这份候选仅供查看，不能采纳；请重新选择当前版本并提取。</div>
        <div v-if="current.error_message" class="notice error">{{ current.error_message }}<small class="block">{{ current.error_code }}</small><Button v-if="current.status === '失败' && current.can_control && !outdated && current.attempt < 3" variant="outline" :disabled="busy" @click="control('retry')">重试同一任务</Button></div>
        <p v-if="['排队中','运行中'].includes(current.status)" class="loading" role="status">后台{{ current.status }}，页面会自动更新。关闭页面后仍可继续查看。</p>
        <div class="ai-candidate" v-for="candidate in candidates" :key="candidate.field">
          <label class="ai-check"><input type="checkbox" v-model="included[candidate.field]" :disabled="!reviewable || busy"><strong>{{ candidate.label }}</strong><span class="muted">勾选后采纳</span></label>
          <div class="ai-compare"><div><small>当前询价值</small><p>{{ inquiry[candidate.field] || '未填写' }}</p></div><label><small>候选值 / 人工修订</small><textarea v-model="draft[candidate.field]" :aria-label="candidate.label + '候选值'" :maxlength="candidate.field === 'notes' ? 4000 : candidate.field === 'expected_date' ? 10 : 140" :disabled="!reviewable || busy" rows="2"></textarea></label></div>
          <p class="ai-original" v-if="draft[candidate.field] !== candidate.value">原始候选：{{ candidate.value }}（你的修订会单独留痕）</p>
          <button v-for="(evidence, i) in candidate.evidence" :key="i" class="ai-evidence" @click="viewSource(evidence)"><span>来源 · 第 {{ evidence.line }} 行 ↗</span><q>{{ evidence.quote }}</q></button>
        </div>
        <div v-if="current.result.questions?.length" class="ai-questions"><h3>需要人工补充 / 核对</h3><ul><li v-for="question in current.result.questions" :key="question">{{ question }}</li></ul></div>
        <div v-if="source" class="ai-source-preview"><div class="panel-heading"><h3>来源原文 · V{{ source.version }}</h3><button @click="source = null" aria-label="关闭来源原文">×</button></div><p class="muted">{{ source.filename }} · {{ source.revision }}</p><code>SHA-256 {{ source.sha256 }}</code><div class="ai-source-lines"><div v-for="(line, i) in source.text.split(/\r?\n/)" :key="i" :class="{ highlighted: i + 1 === source.line }"><span>{{ i + 1 }}</span><pre>{{ line || ' ' }}</pre></div></div><a class="download-link" :href="downloadURL('revision', source.revision)">下载这一版原件</a></div>
        <div v-if="pending && current.can_review" class="ai-decision"><label class="ai-label">审核说明<textarea v-model="reason" :disabled="busy" maxlength="1000" rows="3" placeholder="记录核对依据、人工修改或驳回原因。"></textarea></label><div><Button theme="green" variant="solid" :disabled="!reviewable || busy || !candidates.length" @click="review('accept')">采纳所选并写入询价</Button><Button variant="outline" :disabled="busy" @click="review('reject')">驳回本次候选</Button></div></div>
        <p v-else-if="pending" class="muted ai-help">技术协作者可核对来源；正式采纳或驳回由询价负责人完成。</p>
        <div v-if="current.review" class="ai-review-receipt"><h3>3. 审核留痕</h3><p>{{ current.review.decision === 'accept' ? '已采纳所选字段' : '已驳回' }} · {{ current.review.reviewed_by }} · {{ stamp(current.review.creation) }}</p><p>{{ current.review.reason }}</p><details><summary>查看修改前后值</summary><pre>{{ JSON.stringify(JSON.parse(current.review.changes_json), null, 2) }}</pre></details></div>
        <details class="ai-meta"><summary>运行信息与来源快照</summary><dl><dt>模式 / 适配器</dt><dd>模拟测试 / {{ current.adapter_version }}</dd><dt>输出约定版本</dt><dd>{{ current.prompt_version }}</dd><dt>模型调用 / 费用</dt><dd>0 次 / ¥0（模拟，未计模型 token）</dd><dt>执行耗时</dt><dd>{{ current.elapsed_ms ?? '—' }} ms</dd><dt>开始 / 结束</dt><dd>{{ stamp(current.started_at) }} / {{ stamp(current.finished_at) }}</dd></dl><div v-for="item in current.input.sources" :key="item.revision"><p>{{ item.filename }} · V{{ item.version }}</p><code>{{ item.sha256 }}</code></div></details>
      </article>
    </div>
  </section>
</template>
