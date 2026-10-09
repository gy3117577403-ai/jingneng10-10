const prefix = '/api/method/jingneng.api.workbench.'

export async function api(method, data = {}, write = false) {
  const options = { credentials: 'same-origin', headers: { Accept: 'application/json' } }
  let url = prefix + method
  if (write) {
    options.method = 'POST'
    options.headers['X-Frappe-CSRF-Token'] = document.querySelector('meta[name="csrf-token"]').content
    if (data instanceof FormData) options.body = data
    else { options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(data) }
  } else url += '?' + new URLSearchParams(data)
  let response
  try { response = await fetch(url, options) }
  catch { throw new Error('网络连接中断，结果尚未确认。请保留当前输入，恢复连接后重试或刷新核对。') }
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    let message = response.status === 403 ? '当前账号没有执行此操作的权限。' : '操作未完成，请检查输入或刷新重试。'
    try { message = JSON.parse(JSON.parse(result._server_messages)[0]).message || message } catch {}
    const error = new Error(String(message).replace(/<[^>]*>/g, ''))
    error.status = response.status
    throw error
  }
  return result.message
}

export const downloadURL = (kind, name) => prefix + 'download?' + new URLSearchParams({ kind, name })
export const key = () => crypto.randomUUID()
