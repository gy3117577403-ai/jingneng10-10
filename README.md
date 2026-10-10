# 京能制造协作与 AI 辅助项目

项目目标是为定制制造企业建立可持续迭代的协作软件与 AI 辅助能力。

**当前建设：JN-0007 ΣEM 完整开源应用独立试跑。源码、运行环境、中文界面与打印和成套/钣金虚构案例已落地，实际验收及交付状态见 [JN-0007](docs/changes/JN-0007.md)。原 JN-0005 工作台保留在 8088；新环境使用 8090，两边没有数据同步。**

## 启动本机演示

新 ΣEM 环境：

```bash
python scripts/sem.py start
```

打开 [ΣEM 示范系统](http://127.0.0.1:8090)，账号 `admin@jingneng.demo`，随机密码在 `.local/sem/credentials.txt`。完整使用、验收、停止、备份和换电脑说明见 [ΣEM 运行说明](docs/sem.md)。应用包含标准报价、订单、工艺、采购、库存、车间、质量、交付等上游模块；商业排料、真实 AI、国内税务和企业岗位权限仍需后续配置或适配。

原 Frappe 工作台：

准备 Git、Python 3.10+ 和可用的 Docker Linux 容器环境，在本仓库根目录运行：

```bash
python scripts/dev.py doctor
python scripts/dev.py start
```

打开 [询价工作台](http://127.0.0.1:8088/workbench)，用本机自动生成的 `.local/demo-credentials.txt` 登录。首次启动需要下载依赖并构建镜像。密码、数据库及附件均不进入 Git。

销售账号可以建单、分派任务和确认；技术账号在指定记录中上传版本并回复。操作说明和权限见 [工作台说明](docs/workbench.md)，模拟完整路径见 [AI 候选审核](docs/ai-review.md)。[基础环境页](http://127.0.0.1:8088/foundation) 保留服务与队列检查。启动、停止和备份见 [运行说明](docs/runtime.md)，实际验收见 [JN-0004](docs/changes/JN-0004.md)、[JN-0003](docs/changes/JN-0003.md) 与 [JN-0002](docs/changes/JN-0002.md)。

本分支已完成 JN-0005 工作区 UI 重设计：紧凑导航、待办、来源核对、文件预览、中文登录与交互状态。设计规范见 [工作区设计](docs/ui-workspace.md)，实现与实际验证见 [JN-0005](docs/changes/JN-0005.md)。

JN-0006 的 [开源适配评估](docs/architecture/open-source-fit.md) 与 [最小验证方案](docs/architecture/next-validation.md) 保留为历史研究。随后用户选择优先完整运行 ΣEM，实施记入 JN-0007；ERPNext 与 SheetNest 仍未安装。

## 从这里继续

1. 阅读 [AGENTS.md](AGENTS.md)，遵守项目接续与更新规则。
2. 阅读 [当前方向与进度](docs/project-context.md)，区分已确认范围、建议方案和未完成事项。
3. 阅读 [版本与备份约定](docs/versioning.md)，再查看 [更新记录](docs/changes/)。
4. 开始工作前获取远端状态，确认是否已有同一事项的分支和编号。

指定仓库：<https://github.com/gy3117577403-ai/jingneng10-10>。

## 一项工作如何追踪

每项工作使用一个编号，例如 `JN-0001`，并关联一个更新记录、相关分支和一组提交。后续补充与修复沿用该编号，直到这项工作结束；新的独立任务使用新编号。

```text
JN-0001 → docs/changes/JN-0001.md → chore(JN-0001): ... → Git 提交历史
```

更新记录解释改动与验证；Git 保存具体代码历史；远端是否同步由实际提交号比对确认。不能只看到记录里写了“完成”就假定已经推送、发布或部署。

## 仓库检查

需要 Git 和 Python 3.10 或更新版本；无需安装第三方 Python 包。

```bash
python scripts/check_history.py
```

GitHub Actions 执行版本记录检查、原 Frappe 运行环境检查和 ΣEM 独立检查。ΣEM 检查覆盖中文目录、模板、前后端回归、HTTP 演示流程、重启与恢复。Frappe 检查在独立 Linux 环境构建并启动原演示站点，覆盖 F0 登录/后台任务和 F1 双业务类型、越权拦截、文件版本、任务流转、重复/并发写入、实际 ZIP 与重启持久化，以及 F2 候选审核、来源、并发确认和失去队列投递后的恢复。另覆盖工作区计数/分页、邮箱并发登录、资源缓存版本和无效密码拦截。检查结果以对应提交的 Actions 为准，它们不替代后续真实业务验收。

## 资料与备份

本仓库目前公开。仅存放可公开的源码、配置模板和经过整理的开发文档。真实客户资料、内部方案原件、凭据、数据库及上传文件在仓库外或被忽略的位置单独保存。

克隆仓库能够恢复已经推送的 Git 内容，不能恢复未提交文件、内部原件、数据库、完整聊天或聊天附件。具体恢复要求见 [版本与备份约定](docs/versioning.md)。
