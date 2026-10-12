# 组织与成员 · 真实组件预览

JN-0019 的独立 React 预览。两个视图共用组织范围、搜索、详情和紧凑排版；使用虚构数据，不连接 8090 业务应用。

## 启动

使用 Node.js 22.12+ 和 npm：

```powershell
cd apps/ui-preview
npm ci
npm run dev
```

- 组织架构：<http://127.0.0.1:5181/?view=organization>
- 成员：<http://127.0.0.1:5181/?view=members>
- 只监听本机地址。5181 被占用时会明确失败，不自动改端口。
- `npm run test`、`npm run lint`、`npm run build` 分别运行逻辑测试、静态检查和含类型检查的构建。

## 体验路径

1. 点击组织卡片打开详情；卡片右侧的独立箭头展开、收起下级。
2. 打开“显示成员”，展示当前选中组织的直属任职成员；超过四人时提供完整成员列表入口。
3. 拖动画布、缩放、定位当前组织或适应视图。搜索组织会展开祖先并定位。
4. 切换到成员页，按姓名、岗位或编号搜索；筛选核对状态、账号状态和下级范围。
5. 点击一行查看资料、任职、账号；编辑后保存，刷新仍保留。未保存输入有离开提示。
6. 使用复选框选择成员并下载 CSV；勾选与打开详情互不干扰。
7. 新增组织或成员后立即查看结果。通过页面“更多 → 重置演示数据”恢复初始数据。

这些操作只改当前浏览器的专用 `localStorage` 数据，键为 `jingneng.organization-component-preview.v1`。无需登录，演示账号状态不对应真实账号或权限。

## 动态交互

按钮有悬停抬升、按压缩小和弹簧回弹；Base UI 标签页共用一个滑动指示块。目录选中背景跟随选择移动，箭头旋转，详情面板和页面切换具有进入、退出过渡。表格筛选与排序保留紧凑行高，行位置平滑调整。

组织卡片和共享连线使用同一份逐帧布局，360ms 内完成展开或收起；中途反向操作从当前帧继续。新增节点超出可见画布时平滑取景，结果已经可见时保留视口。缩放、定位和适应视图均有短过渡。系统开启 `prefers-reduced-motion` 时关闭位移类动效，CSS 动画与过渡也相应简化。

## 组件与来源

实际安装版本以 `package-lock.json` 为准，未用绘图代替组件：

| 内容 | 实际使用 |
| --- | --- |
| 按钮、输入、Tab、Sidebar、表格外观、选择器、菜单、复选框、开关、Dialog、Sheet、Popover、Avatar 等 | [shadcn/ui](https://ui.shadcn.com/docs/installation/vite)，官方 CLI 4.21.4，Base UI / Nova 模板 |
| 交互基础 | [Base UI](https://base-ui.com/) 1.9.0 |
| 表格筛选、排序、选择、分页、列显示 | [TanStack Table](https://tanstack.com/table/latest/docs/introduction) 8.21.3 |
| 画布、缩放和平移 | [React Flow](https://reactflow.dev/) 的 `reactflow` 11.11.4；节点与共享主干连线由本预览实现 |
| 按压、布局和面板动效 | [Motion for React](https://motion.dev/docs/react) 14.1.0；保留 Base UI 原控件语义和事件 |
| 图标 | [Lucide](https://lucide.dev/)；全页统一图标来源 |
| 字体 | Geist（西文）及系统中文字体；标题 18px，正文和主要控件 13px |

HeroUI、Ant Design、Aceternity、Magic UI 在本轮仅作为设计参考，没有安装，也不将相似外观标注成使用了其组件。shadcn 生成组件的许可见 [LICENSE.shadcn-ui.txt](LICENSE.shadcn-ui.txt)，其他依赖许可随 npm 包提供。

## 源码位置

- `src/components/ui/`：官方生成的组件，包含中文标签、按钮按压反馈与原生 Tab 指示块适配。
- `src/components/workspace/`：目录、架构图、成员表格和详情组合。
- `src/lib/organization.ts`：组织范围、任职去重、布局、单一主干路径与表单校验。
- `src/lib/layout-motion.ts` 与 `src/hooks/use-layout-motion.ts`：可中断的节点、连线同步布局动画。
- `src/data/demo.ts`：显式虚构演示资料和本地存储。
- `src/workspace.css`：统一密度、字体、颜色与响应式规则。
- `src/motion.css`：控件反馈、选中路径、过渡节奏和减少动态效果适配。

完整验收、边界和后续接入条件见 [预览说明](../../docs/ui-component-preview.md) 与 [JN-0019](../../docs/changes/JN-0019.md)。
