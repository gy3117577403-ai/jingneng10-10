# ChatGPT 套餐最小验证

独立的 Windows 本机验证程序，属于 JN-0017。按 OpenAI 公布的 OAuth / OIDC 与套餐调用接口自行实现，未引入 Sign in with ChatGPT DevKit 的非商业许可代码、字体或品牌资产。唯一 npm 运行依赖是 MIT 许可的 `jose`，用于标准 JWT 签名验证。

这不是已接入 ERP 的正式 Provider。它只验证当前授权账号能否通过 ChatGPT 套餐完成一次虚构资料问答。是否可用由官方授权与实际响应决定，不把普通 API Key 的余额状态当作套餐状态，也不以登录成功替代推理完成。

## 运行

需要 Windows、Node.js 22.12 以上和 Windows PowerShell。

```powershell
cd scripts/chatgpt-plan-check
npm ci --ignore-scripts
npm test
npm start
```

打开终端打印的本机 URL，点击“通过 ChatGPT 继续”，在官方页面选择账号并授予套餐调用权限。回调完成后程序会查询此连接可用的模型，优先选择返回目录中的 `gpt-6-luna`，否则选择含 `mini` 的型号或目录首项，发送一条固定虚构资料；不发送企业资料，不连接运行中的 ERP 数据库，不读取普通 API Key 或 Codex 登录凭据。

如果普通登录后跳到了 ChatGPT 首页，回到本机页面点击“继续本次应用授权”；有效期内复用原请求的 state、PKCE 和注册入口，不另起并行授权。授权已经成功而模型测试失败时，页面提供“使用已有授权验证”，无需再次登录。重启后可恢复本机加密保存的有效授权。每次手动验证只发送一次模型请求，遇到失败不自动重试。

授权待确认时间为 10 分钟，程序会在启动 30 分钟后结束。关闭终端可结束前台进程。令牌由 Windows DPAPI CurrentUser 加密，保存在仓库忽略目录 `.local/sem/chatgpt-plan-check/connection.dpapi`；目录 ACL 限制为当前 Windows 用户，密钥、刷新令牌和 ID Token 不进入网页状态或日志。该加密文件不能直接当作跨电脑可用的登录备份。

不含凭据的当前回执保存在 `.local/acceptance/chatgpt-plan-check/latest.json`，状态变更追加到同目录 `history.ndjson`，包括是否授权、使用的模型、是否收到 `response.completed`、虚构资料答案、引用检查和 API 返回的 token 用量。此用量不是套餐百分比或额外积分的兑换证明。官方用量管理入口为 https://chatgpt.com/settings/usage 。是否允许动用额外额度由用户在官方授权/用量设置中控制。

## 边界

- 监听仅限 `127.0.0.1`，拒绝其他 Host；操作要求同源、进程会话与 CSRF 校验。回调独立校验随机 state、有效期、注册身份与 PKCE。
- ID Token 必须通过官方 JWKS 的签名、issuer、audience、有效期、nonce 与既有账号身份校验。另行检查实际授予的套餐 scope。
- 已发放的客户端注册会保留，后续登录沿用相同 client ID 和 host ID。不会读取、复制或复用 Codex 内部登录缓存。
- 响应必须完整结束且固定来源引用有效，流中途失败不能视为成功；网络及用量错误不自动重试，不退回普通 API 计费。
- 缺少响应类型标头时仍按严格事件协议解析；结束事件没有重复全文时，只有收到 `response.completed` 后才使用已累积的文本片段。空响应、错误事件、中断和无效引用均不能通过。
- 这是单进程、单账号连接的验证程序，没有实现多用户账户管理、常驻刷新任务或 ERP 接入。过期连接通过官方页面重新授权；正式服务还需单独设计令牌轮换、取消、用量限额和账户隔离。
- 此路线当前不支持 `max_output_tokens`；程序使用短固定请求、无外部工具、响应大小与时限约束，但这些不等于官方计费上限。实际企业部署资格和收费/远程托管场景需依官方准入另行核实。

## 验证状态

2026-10-12 已在本机完成官方授权、签名与 scope 核验、模型目录查询、`gpt-6-luna` 的完整虚构资料回答和引用检查，浏览器显示“验证通过”。这是单次本机链路的验收，不等于 ERP 内的权限、长期运行或企业部署验收。

本机离线测试 12 项通过，包含真实 Windows DPAPI 往返与损坏拒绝测试。新增 Windows CI 使用虚构令牌与本地签名夹具，不获取真实授权、不发送模型请求。

## 官方协议依据

- https://developers.openai.com/siwc/token-sharing-open-source/sign-in
- https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference
- https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions
- https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations

已核对官方开发包固定提交 `0a36fefeb913055c8c7a1a29b63d82b96b2e841a` 的许可：企业用途不在其非商业许可范围内。本程序不依赖或再分发该开发包。
