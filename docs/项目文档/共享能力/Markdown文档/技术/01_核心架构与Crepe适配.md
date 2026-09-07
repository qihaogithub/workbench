---
covers:
  - packages/demo-ui/src/DocumentEditor.tsx
  - packages/demo-ui/src/DocumentEditor.test.tsx
  - packages/demo-ui/src/markdown/crepe-config.ts
  - packages/demo-ui/src/markdown/heading-style-toolbar.ts
  - packages/demo-ui/src/markdown/document-block-edit.ts
  - packages/demo-ui/src/markdown/document-block-menu.ts
  - packages/demo-ui/src/markdown/document-overlay-positioning.ts
  - packages/demo-ui/src/markdown/document-selection-toolbar.ts
  - packages/demo-ui/src/markdown/crepe-theme.css
  - packages/demo-ui/src/markdown/crepe-theme.test.ts
  - packages/demo-ui/src/index.ts
  - packages/demo-ui/src/types.ts
  - packages/demo-ui/src/RichTextEditor.tsx
  - package.json
  - patches/@milkdown__components@7.22.0.patch
---

# Markdown 编辑器核心架构与 Crepe 适配

## 一、架构边界

`DocumentEditor` 是 `@workbench/demo-ui` 的共享编辑器入口。它接收正文、编辑状态和宿主回调，不读取项目路径、Session、Workspace 或权限信息。`RichTextEditor` 是面向既有表单入口的薄包装，不维护第二套编辑器实现。

宿主负责数据加载、权限、文档身份、保存和导航；共享编辑器负责 Markdown 编辑、编辑器状态、通用工具栏和渲染结构。

## 二、Crepe 实例与功能

编辑器使用 Milkdown Crepe v7 创建实例，并启用 Cursor、ListItem、LinkTooltip、ImageBlock、Placeholder、CodeMirror 和 Table 等基础 feature，覆盖标题、粗体/斜体/删除线、行内代码、代码块、有序/无序/任务列表、引用、表格、链接、图片、分隔线和块拖拽。Crepe 原生 `Toolbar` 与 `BlockEdit` 关闭后，由 `Crepe.addFeature()` 安装 `documentSelectionToolbar` 与 `documentBlockEdit` 两个本地 feature；它们通过公开的 `TooltipProvider`、`BlockProvider` 和 ProseMirror plugin 生命周期工作。块菜单不再与 `SlashProvider` 共同写坐标，避免两个定位器互相覆盖。

Latex 与 Crepe AI 明确关闭。标题菜单统一使用“正文、一级标题至六级标题”的中文名称。TopBar 仅在可编辑状态出现，标题下拉由原生 Crepe TopBar 管理，并在窄容器中自然换行；编辑器不再隐藏原生控件、复制控件或转发合成事件。标题样式选项由共享的纯数据模块提供，不通过 DOM 观察器注入。

## 三、TopBar 与布局适配

TopBar 相对 `.milkdown` 正文滚动容器吸顶，正文从 TopBar 下方开始布局。选区工具栏与块菜单统一挂载到当前 `DocumentEditor` 的独立 overlay root，由 `DocumentOverlayPositioner` 以当前 `EditorView` 的矩形为锚点，并由 Floating UI 负责滚动、窗口变化、翻转和可用尺寸更新。选区候选顺序为 `bottom-start → top-start → right-start → left-start`，TopBar 下方保留 8px 安全间距；当前选区属于不可覆盖区域，没有安全位置时直接隐藏。块菜单只允许从当前块下方、右侧或左侧出现，当前块矩形是不可覆盖区域。

块操作入口只有一个可聚焦的 32px 手柄，图标约 16px。点击或 `Enter`/`Space` 打开独立中文插入菜单；原生 `mousedown`、`dragstart`、`dragend` 仍由公开 `BlockProvider` 处理拖拽，不隐藏加号、不转发事件、不合成 `PointerEvent`。菜单打开时保存当前块元素作为稳定锚点，插入的临时空段只承担 ProseMirror 命令上下文，关闭时按位置和空段条件清理。列表块的手柄锚定 `.label-wrapper`，普通块锚定首行矩形；正文沟槽、列表标记列和文字间距由主题 token 统一控制。批注简版编辑器不安装块手柄 feature，继续保持紧凑输入。

块菜单由单一 `DocumentOverlayPositioner` 写入坐标，边界绑定当前编辑器实例而不是全屏 overlay；Floating UI 只负责滚动、翻转和可用尺寸测量，最终候选仍必须避开当前块。菜单使用不透明 surface、描边和阴影，顶部导航是实际分组 Tab，下方只渲染当前分组并在内部滚动；最大高度由 `--document-editor-block-menu-max-height` 统一控制，并继续受编辑器可用高度约束。H1-H3 保留在“文本”，H4-H6 与上传能力收进“更多”，配置项引用和项目/页面/文档引用保持独立分组。

**编辑可见性红线：任何选区工具栏、块菜单、TopBar 下拉或编辑器辅助浮层都不得遮挡当前正在编辑的正文。** 定位器必须绑定当前编辑器 root 与 `EditorView`，不能跨实例查询全局 DOM；空间不足时缩小、滚动或隐藏，不能把 `z-index`、`transform` 或 DOM 观察器当作掩盖碰撞的手段。

## 四、主题与滚动

`crepe-theme.css` 以 Crepe Frame 的正文背景、控件表面、弱表面、描边和交互色层级为基线，由宿主 token 推导明暗主题。表格边框、单元格选中、节点选中和图片选中继续使用 Crepe common 规则，只校准 `outline`、`primary` 和 `selected` token，不对 ProseMirror 选中节点做全局描边覆盖。

当宿主限制编辑器高度时，正文层承担纵向滚动，TopBar 保持可见；流式文档宿主可以关闭编辑器自身滚动，改由外层文档区滚动。

## 五、生命周期与依赖

- 组件创建时初始化 Crepe，并注册 Markdown 更新监听。
- `readOnly` 通过 Crepe 能力动态切换，不因状态切换重建实例。
- 组件卸载时销毁实例和监听，避免编辑状态与 DOM 引用泄漏。
- 自动聚焦必须在异步创建完成后确认实例仍是当前实例，再通过该实例的 `editorViewCtx` 聚焦。StrictMode 重挂载期间旧实例可能仍在异步销毁，同一宿主内短暂存在多个正文节点；不能查询宿主内第一个 `.ProseMirror` 来决定聚焦对象，否则旧节点销毁会使新编辑器丢失焦点。
- `@milkdown/crepe`、`@milkdown/kit` 与 `@floating-ui/dom` 是生产依赖；React 由宿主提供。
- TipTap、`prosemirror-markdown`、`@milkdown/react` 和 `@prosemirror-adapter/react` 不属于当前编辑器边界。

自动聚焦回归使用真实 Milkdown，覆盖普通挂载和 StrictMode 重挂载，等待旧实例清理后再断言正文唯一、可编辑且持有焦点；仅用模拟 `contenteditable` 的测试无法覆盖异步实例竞态。配置批注集成测试同时验证输入到 Markdown 更新、真实失焦保存退出的链路。

## 六、相关业务文档

- 宿主接入和保存职责见[宿主接入、保存边界与测试](./04_宿主接入、保存边界与测试.md)。
- 知识库文档视图见[文件侧边栏与文档视图](../../../创作端/09-知识库/技术/02_文件侧边栏.md)。
- 共享组件中的预览舞台和配置组件见[共享组件架构设计](../../../创作端/04-配置与预览/技术/05_共享组件架构设计.md)。
