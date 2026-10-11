# 资料助手的本机 ChatGPT 套餐连接

属于 JN-0017，接续公司资料助手。此实现限定为 Windows 本机、一个已明确绑定的软件账号；不是全公司共用个人套餐的服务。常规 API Key 仍是另一条未启用路线。代码测试与应用内真实验收见 [更新记录](changes/JN-0017.md)，不能仅以连接成功判断应用已启用。

## 数据流与权限

用户在公司资料助手选择“AI 解读（ChatGPT 套餐）”，提交本次问题。Laravel 继续按当前账号、资料分类、已发布版本及借阅期限检索，最多八个来源、每个正文片段最多四千字。没有来源则直接结束，不调用模型。查询默认仍是原文摘录。

Windows 连接进程主动请求本机 8090 的签名接口领取任务。接口用独立随机密钥、精确请求正文、路径、时间戳和单次随机数鉴权，只能领取绑定账号自己的问题。该密钥不是 OpenAI 令牌。模型只接收问题、标题、版本号、位置、正文片段与引用编号；不接收数据库权限、内部文件路径、以前的聊天或业务写入工具。ERP 容器和浏览器没有 OAuth 令牌。

模型使用官方 Responses 接口及当前授权可用模型，固定 `store:false`、`stream:true`。先确认完整结束事件，再验证每段来源编号与逐字引用；依据不足允许明确拒答，不拼凑回答。引用校验能检出虚构来源与引文，不保证每个推断正确，需要人工核对。显示版本化原文入口，遵守既有阅读和下载权限。

连接每 2.5 秒更新状态；任务期间每 1.5 秒复核取消、归档、账号和来源权限，传输失败也停止生成。提交结果和历史读取继续鉴权。权限撤销后隐藏整个相关回答、引用和检索摘要。已经发送或交付的内容不能远程收回。取消或超时不证明无用量。

## 首次绑定与运行

先确认软件账号的内部用户编号，不能根据邮箱或管理员角色推断。仅在本机执行：

```powershell
# 安装固定依赖；授权沿用先前已经注册并保存的连接
npm --prefix scripts/chatgpt-plan-check ci --ignore-scripts
node scripts/chatgpt-plan-check/server.mjs --setup-owner <用户编号>

# 更新应用（更新前先完成数据库与文件的配套备份）
python scripts/sem.py start

# 单独启动本机连接，默认不加入系统开机启动
powershell -NoProfile -File scripts/sem_assistant_bridge.ps1 -Action Start
powershell -NoProfile -File scripts/sem_assistant_bridge.ps1 -Action Status
```

绑定保存在忽略目录 `.local/sem/assistant-bridge/`，软件只读挂载。重复设置同一账号不更换密钥，尝试换成其他账号会拒绝；不要手工把同一个人的套餐共享给不同员工。`binding.json` 的模型须在该授权返回的可见模型目录中，默认 `gpt-6-luna`；不在目录则停止，不擅自改成更贵的模型。

授权仍在 `.local/sem/chatgpt-plan-check/connection.dpapi`，通过 Windows 当前用户保护；注册与 host ID 保留。旧的独立验证工具与 ERP 连接使用同一进程锁，不能并行运行。`--erp` 模式保持运行，授权回调后不发送虚构测试题；普通 `npm start` 仍是三十分钟的独立验证程序。

查询设置展示账户遮罩、模型、状态、管理授权和官方用量链接。仅绑定账号看得到这份连接。暂停会取消正在进行的 AI 查询，恢复不会自动重发；“重新检查连接”只检查授权与模型目录。断开尝试官方撤销，再清除本机令牌，保留注册映射；远端撤销未确认时明确提示到官方设置断开。管理授权打开只监听 `127.0.0.1` 的本机页面，OAuth 与敏感确认由用户完成。

停止进程：`powershell -NoProfile -File scripts/sem_assistant_bridge.ps1 -Action Stop`。它保留套餐授权；软件中断开连接或 ChatGPT 设置中的撤销才会结束可续期会话。若连接离线，不能声称点击断开就已在 OpenAI 撤销。

## 刷新、错误与用量

接近到期时用原注册的 refresh token 串行刷新，验证返回的身份与 scope 后原子保存最新轮换令牌。暂时网络错误不清除原授权；明确无效的刷新令牌清除后要求重新授权。使用官方文档的协议实现，不依赖非商业 DevKit。

每次模型调用最多等待九十秒，无自动推理重试。后端失联超过三分钟使不确定任务失败，由用户决定是否重试；结果交付可以按同一执行凭证去重重试，不能因此重复推理。额度错误停止新调用，用户处理后可重新检查。不会偷偷改用模拟、另一个模型或普通 API 计费。

`provider_meta` 按执行次数保留模型与官方返回的输入、输出和总词元；已取消的迟到结果可补记用量，但不能恢复回答。没有完整用量时标为未知，不能记为零。词元不是套餐积分换算；实际额度和应用限制以 [ChatGPT 用量设置](https://chatgpt.com/settings/usage) 为准。输入/响应大小和时间限制也不是官方费用上限。

## 运行边界与验收

数据库新增连接状态表及回答元数据；数据库和附件仍须配套备份。授权文件受 Windows 用户保护，不能把加密文件直接复制到另一台电脑当作可用登录。恢复演练不应启动真实连接或调用模型。CI 只使用虚构来源、签名和令牌夹具。

需要分别通过：离线协议/刷新/存储测试；账号隔离、签名与防重放；权限撤销、取消和迟到结果；真实应用请求与原文定位；没有依据的拒答和提示注入干扰。最终运行验收按更新记录如实登记。企业长期服务、多用户各自授权与正式部署资格仍需后续确定。

官方依据：[账号与会话](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions)、[模型与推理](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)、[错误恢复](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery)。
