# 界面组件与参考记录（接续至 JN-0020）

核对日期：2026-10-13。版本以 `apps/sem/package-lock.json` 锁定安装结果为准。

## 实际采用

| 依赖 | 锁定版本 | 本次用途 | 许可副本 |
| --- | --- | --- | --- |
| `@base-ui/react` | 1.9.0 | 查找、资料预览、表单及事项详情的弹窗行为、键盘焦点与关闭 | [MIT](../infra/ui/licenses/base-ui.txt) |
| `motion` | 14.1.0 | 分段选择指示器与短促内容过渡，尊重减少动态效果设置 | [MIT](../infra/ui/licenses/motion.txt) |
| `lucide-react` | 1.55.0 | 新导航、工作列表及上下文工具的 SVG 图标 | [ISC 及包内附带声明](../infra/ui/licenses/lucide-react.txt) |
| `pdfjs-dist` | 6.4.299 | 私有 PDF 按页渲染、翻页与缩放，按需加载 | [Apache-2.0](../infra/ui/licenses/pdfjs.txt) |

许可文件直接复制自实际安装包，不删除其附带声明。构建继续使用既有 React、Blade、Bootstrap/AdminLTE；没有引入另一套全局样式重置。只按需引入组件和图标，不加载字体 CDN。

PDF.js 的 worker、字符映射、标准字体、ICC 与解码资源在构建时随应用打包，保留包内各资源许可证；不把私有 PDF 送到外部阅读服务。采用自带阅读器是因为实际内嵌浏览器的原生 PDF iframe 不能渲染。扫描件仍是图像预览，只有文档自带文本才提供“本页文字”，不构成 OCR 或工程图理解。参考 [PDF.js 示例](https://mozilla.github.io/pdf.js/examples/) 与 [API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html)。

## 参考与适配

- [Designeer Visuals](https://www.designeer.xyz/visuals) 与 [Components](https://www.designeer.xyz/components) 用于筛选参考，目录收录不是对全部素材的统一授权。
- [Base UI Dialog](https://base-ui.com/react/components/dialog)：桌面非模态侧栏与模态窗口采用其实际组件。焦点初始位置、恢复位置、背景可交互范围按当前页面分别设置。
- [Motion 文档](https://motion.dev/docs/react-accessibility)：动画服从用户减少动态效果的设置；实际后台状态来自接口，不用动画充当处理结果。
- [Lucide React](https://lucide.dev/guide/react)：新增图标保持一致线条、尺寸，关键操作保留中文文字或中文无障碍名称。
- [shadcn Sidebar](https://ui.shadcn.com/docs/components/base/sidebar)、[Motion Primitives](https://motion-primitives.com/docs)、[Prompt Kit](https://www.prompt-kit.com/)：借鉴导航组合、内容连续性、来源与步骤表达；本批没有复制这些组件源码或安装其整套代码。

未引入 NumberFlow、Paper Shaders、外部 3D 模型、付费模板或展示素材。任务页面的层次来自边框、阴影与短促切换，不增加持续播放的装饰背景。日后采用具体素材时单独核对其来源和授权。

## JN-0020 的实际组件取用

JN-0010时的“仅参考shadcn”描述属于当时状态。JN-0019在独立预览中使用shadcn/ui Base UI registry组件，JN-0020将Button、Select、Switch、Dropdown Menu组合适配到实际应用，代码在 `apps/sem/resources/js/ui/shadcn/controls.jsx`，保留相邻的 [shadcn MIT许可](../apps/sem/resources/js/ui/shadcn/LICENSE.shadcn-ui.txt)。采用CSS作用域和应用已有依赖，不引入全局Tailwind重置或替换业务状态管理。参考 [Base UI Button](https://ui.shadcn.com/docs/components/base/button)。

实际运行关系：Base UI负责键盘、焦点、弹出层和选择语义；Motion负责短促按压与组织布局过渡；Lucide用于新控件图标；原React Flow继续承担画布缩放和平移，连接路径与紧凑树布局由应用实现。依赖版本继续锁定，未为外观增加重复React组件运行时。

用户提供的其他库按用途评估：参考 [HeroUI Button](https://heroui.com/en/docs/react/components/button) 的悬停/按压/禁用状态和 [Ant Design Table](https://ant.design/components/table/) 的信息密度；查看 [Aceternity组件目录](https://ui.aceternity.com/components) 后，本批不采用持续展示装饰；Magic UI本批未复制组件或安装依赖。不能把参考、适配源码和安装包混为同一件事。后续新增需求仍逐项判断现成组件是否适合当前功能，不机械混合五套视觉主题。

用户提供的 [UI设计文章](https://x.com/longhaiqwe123/status/2106216781174251724) 用于复核文字权重、主次操作、组间距离、基线、状态语义、边框与留白；实际验收以应用界面和可操作流程为准。
