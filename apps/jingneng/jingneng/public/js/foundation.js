"use strict";
const el = (id) => document.getElementById(id);
const csrf = document.querySelector('meta[name="csrf-token"]').content;
async function call(method, args = {}, post = false) {
  const url = `/api/method/${method}` + (post ? "" : `?${new URLSearchParams(args)}`);
  const response = await fetch(url, {method: post ? "POST" : "GET", credentials: "same-origin",
    headers: {"Content-Type": "application/json", "X-Frappe-CSRF-Token": csrf},
    ...(post ? {body: JSON.stringify(args)} : {})});
  if (response.status === 401 || response.status === 403) {
    throw new Error("会话已失效或没有权限，请重新登录。");
  }
  if (!response.ok) throw new Error(`请求未完成（${response.status}），请稍后重试。`);
  return (await response.json()).message;
}
function node(tag, className, text) {const n = document.createElement(tag); n.className = className; n.textContent = text; return n;}
async function refresh() {
  el("refresh").disabled = true;
  try {
    const data = await call("jingneng.api.runtime.state");
    el("services").replaceChildren();
    const services = [["应用与数据库", data.checks.database, "Frappe + MariaDB"], ["缓存服务", data.checks.cache, "会话与临时数据"], ["任务队列", data.checks.queue, "等待后台处理的任务"], ["AI 模型", false, "本批次未配置"]];
    for (const [label, online, detail] of services) {
      const panel = node("div", "service", "");
      panel.append(node("span", "label", label), node("strong", online ? "" : "offline", online ? "连接正常" : label === "AI 模型" ? "尚未接入" : "连接异常"), node("small", "", detail));
      el("services").append(panel);
    }
    el("cases").replaceChildren();
    for (const item of data.cases) {
      const card = node("a", "case", ""); card.href = `/app/jn-demo-case/${encodeURIComponent(item.name)}`;
      card.append(node("div", "type", `${item.business_type} / DEMO`), node("h3", "", item.title), node("p", "", item.description));
      const bottom = node("div", "case-bottom", ""); bottom.append(node("span", "", item.name), node("span", "", "查看已保存记录 →")); card.append(bottom); el("cases").append(card);
    }
    el("departments").replaceChildren(...data.departments.map((d) => node("span", "department", d.department_name)));
    el("department-count").textContent = `${data.departments.length} 个部门`;
    el("versions").textContent = `应用 ${data.app_version} · Frappe ${data.frappe_version}`;
    const ready = Object.values(data.checks).every(Boolean);
    el("notice").className = ready ? "notice" : "notice error";
    el("notice").textContent = ready ? `基础服务连接正常。已读取 ${data.cases.length} 条演示记录；业务流程与 AI 能力将在后续批次建设。` : "部分服务连接异常，请检查运行日志。";
  } catch (error) {el("notice").className = "notice error"; el("notice").textContent = error.message;}
  finally {el("refresh").disabled = false;}
}
el("refresh").addEventListener("click", refresh);
el("probe").addEventListener("click", async () => {
  el("probe").disabled = true; el("probe-result").textContent = "正在提交后台检查…";
  try {
    const task = await call("jingneng.api.runtime.start_probe", {}, true);
    for (let attempt = 0; attempt < 20; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      const result = await call("jingneng.api.runtime.probe_result", {token: task.token});
      if (result.status === "completed") {el("probe-result").textContent = "检查通过：任务已由后台进程实际处理。"; return;}
    }
    throw new Error("检查超时，尚未确认后台任务完成。请查看 worker 日志后重试。");
  } catch (error) {el("probe-result").textContent = error.message;}
  finally {el("probe").disabled = false;}
});
el("logout").addEventListener("click", async () => {
  try {await call("logout", {}, true); window.location.assign("/login?redirect-to=/foundation");}
  catch (error) {el("notice").textContent = error.message;}
});
refresh();
