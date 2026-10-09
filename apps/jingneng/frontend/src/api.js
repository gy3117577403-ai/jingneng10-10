const prefix = '/api/method/jingneng.api.workbench.'

export async function api(method, data = {}, write = false, namespace = prefix) {
  const options = { credentials: 'same-origin', headers: { Accept: 'application/json' } }
  let url = namespace + method
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
export const ai = (method, data = {}, write = false) => api(method, data, write, '/api/method/jingneng.api.ai.')

export function uploadFile(body, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', prefix + 'upload')
    xhr.withCredentials = true
    xhr.timeout = 120000
    xhr.setRequestHeader('X-Frappe-CSRF-Token', document.querySelector('meta[name="csrf-token"]').content)
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100)) }
    xhr.onload = () => {
      let result = {}; try { result = JSON.parse(xhr.responseText) } catch {}
      if (xhr.status >= 200 && xhr.status < 300) return resolve(result.message)
      let message = '上传未完成，请检查文件后重试。'
      try { message = JSON.parse(JSON.parse(result._server_messages)[0]).message || message } catch {}
      const error = new Error(String(message).replace(/<[^>]*>/g, '')); error.status = xhr.status; reject(error)
    }
    xhr.onerror = xhr.ontimeout = () => reject(new Error('连接中断，上传结果尚未确认。保留此窗口重试，或重新读取资料核对。'))
    xhr.send(body)
  })
}
export async function downloadFile(kind, name) {
  const response = await fetch(downloadURL(kind, name), { credentials: 'same-origin' })
  if (!response.ok) throw new Error(response.status === 403 ? '当前账号无法下载这份文件，请重新登录或核对访问权限。' : '下载未完成，请稍后重试。')
  const blob = await response.blob()
  const header = response.headers.get('Content-Disposition') || ''
  let filename = kind === 'export' ? '询价资料包.zip' : '原件'
  const encoded = header.match(/filename\*=UTF-8''([^;]+)/i), plain = header.match(/filename="?([^";]+)"?/i)
  try { if (encoded) filename = decodeURIComponent(encoded[1]); else if (plain) filename = plain[1] } catch {}
  const url = URL.createObjectURL(blob), a = document.createElement('a')
  a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000)
}
