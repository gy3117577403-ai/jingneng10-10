(() => {
  const form = document.getElementById('signin-form'), button = document.getElementById('signin-submit')
  const password = document.getElementById('password'), error = document.getElementById('signin-error')
  const progress = document.getElementById('signin-progress')
  document.getElementById('show-password').addEventListener('change', event => { password.type = event.target.checked ? 'text' : 'password' })
  form.addEventListener('submit', async event => {
    event.preventDefault()
    if (button.disabled) return
    button.disabled = true; button.textContent = '正在登录…'; error.hidden = true; progress.hidden = false
    try {
      const response = await fetch('/api/method/login', { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Frappe-CSRF-Token': document.querySelector('meta[name="csrf-token"]').content },
        body: new URLSearchParams({ usr: document.getElementById('account').value.trim(), pwd: password.value }) })
      if (!response.ok) throw new Error(response.status === 429 ? '尝试次数较多，请稍后再试。' : '账号或密码不正确，请检查后重试。')
      const result = await response.json()
      if (result.message !== 'Logged In') throw new Error('登录尚未完成，请联系管理员核对登录方式。')
      const desired = new URLSearchParams(location.search).get('redirect-to') || '/workbench'
      const target = new URL(desired, location.origin)
      location.href = target.origin === location.origin && target.pathname === '/workbench' ? target.pathname + target.search + (target.hash || (location.hash.startsWith('#/') ? location.hash : '')) : '/workbench'
    } catch (e) { error.textContent = e instanceof TypeError ? '无法连接服务，请检查网络后重试。' : e.message; error.hidden = false; password.focus() }
    finally { button.disabled = false; button.textContent = '登录'; progress.hidden = true }
  })
})()
