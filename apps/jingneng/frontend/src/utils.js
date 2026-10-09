export const fieldLabels = { title:'询价名称', customer_name:'客户名称', business_type:'业务类型', department:'负责部门',
  responsible:'负责人', collaborator:'技术协作者', expected_date:'期望交期', notes:'需求说明', items:'产品明细',
  status:'状态', reply:'回复', assigned_to:'处理人', version:'版本', filename:'文件名称', change_note:'版本说明',
  description:'任务说明', reason:'审核说明', note:'处理说明' }
export const stamp = (value, short = false) => value ? value.slice(short ? 5 : 0, 16).replace('T',' ') : '—'
export const fileSize = value => value >= 1024 * 1024 ? (value / 1024 / 1024).toFixed(1) + ' MB' : Math.max(0.1,value / 1024).toFixed(1) + ' KB'
export const safeParse = (value, fallback = {}) => { try { return JSON.parse(value) ?? fallback } catch { return fallback } }
export function readable(value) {
  if (value === null || value === undefined || value === '') return '未填写'
  if (Array.isArray(value)) return value.map(v => v.product_name ? `${v.product_name} · ${v.quantity} ${v.unit}${v.specification ? ' · ' + v.specification : ''}` : String(v)).join('\n')
  if (typeof value === 'object') return Object.entries(value).filter(([k]) => fieldLabels[k]).map(([k,v]) => `${fieldLabels[k]}：${readable(v)}`).join('\n') || '已记录'
  return String(value)
}
export function changeRows(before = {}, after = {}) {
  return Object.keys(fieldLabels).filter(k => k in after && JSON.stringify(before[k] ?? '') !== JSON.stringify(after[k] ?? ''))
    .map(k => ({ field:k, label:fieldLabels[k], before:readable(before[k]), after:readable(after[k]) }))
}
export function activityRows(json) {
  const d = safeParse(json)
  if (d.changes) return changeRows(d.changes.before, d.changes.after)
  if (d.before && d.after) return changeRows(d.before,d.after)
  return Object.entries(d).filter(([key]) => fieldLabels[key]).map(([key,value]) => ({ field:key, label:fieldLabels[key], after:readable(value) }))
}
