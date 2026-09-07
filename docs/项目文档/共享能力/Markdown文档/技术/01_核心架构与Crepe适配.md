---
covers:
  - packages/demo-ui/src/DocumentEditor.tsx
  - packages/demo-ui/src/DocumentEditor.test.tsx
  - packages/demo-ui/src/markdown/crepe-config.ts
  - packages/demo-ui/src/markdown/heading-style-toolbar.ts
  - packages/demo-ui/src/markdown/top-bar-overflow.ts
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

编辑器使用 Milkdown Crepe v7 创建实例，并启用 Cursor、ListItem、LinkTooltip、ImageBlock、BlockEdit、Placeholder、Toolbar、CodeMirror 和 Table 等 feature，覆盖标题、粗体/斜体/删除线、行内代码、代码块、有序/无序/任务列表、引用、表格、链接、图片、分隔线、选区工具条和块拖拽。

Latex 与 Crepe AI 明确关闭。标题菜单统一使用“正文、一级标题至六级标题”的中文名称。TopBar 仅在可编辑状态出现，标题下拉和工具溢出菜单属于编辑器交互层，不改变宿主接口。

## 三、TopBar 与布局适配

TopBar 需要相对 `.milkdown` 正文滚动容器吸顶。容器变窄时，超出宽度的工具按既有顺序收纳到“更多”菜单；容器恢复宽度后自动还原。适配器持续检查当前 `.top-bar-inner` 节点身份，Crepe 替换 TopBar DOM 后重新绑定，不能只保存一次性 Vue DOM 引用。

恢复菜单由 React 外层宿主承载，与 Crepe `.crepe` 滚动容器平级，并保持高于原生 TopBar 的层级。被收纳项使用 `hidden` 退出布局，主题样式不能用 `display` 覆盖该语义。

## 四、主题与滚动

`crepe-theme.css` 以 Crepe Frame 的正文背景、控件表面、弱表面、描边和交互色层级为基线，由宿主 token 推导明暗主题。表格边框、单元格选中、节点选中和图片选中继续使用 Crepe common 规则，只校准 `outline`、`primary` 和 `selected` token，不对 ProseMirror 选中节点做全局描边覆盖。

当宿主限制编辑器高度时，正文层承担纵向滚动，TopBar 保持可见；流式文档宿主可以关闭编辑器自身滚动，改由外层文档区滚动。

## 五、生命周期与依赖

- 组件创建时初始化 Crepe，并注册 Markdown 更新监听。
- `readOnly` 通过 Crepe 能力动态切换，不因状态切换重建实例。
- Crepe 完成异步创建并进入 `Created` 状态前，不执行依赖 `editorViewCtx` 的编辑器 action；初始化期间到达的受控内容更新会等待当前实例就绪后再同步，避免上下文尚未注入时读取编辑器状态。
- 组件卸载时销毁实例和监听，避免编辑状态与 DOM 引用泄漏。
- 自动聚焦必须在异步创建完成后确认实例仍是当前实例，再通过该实例的 `editorViewCtx` 聚焦。StrictMode 重挂载期间旧实例可能仍在异步销毁，同一宿主内短暂存在多个正文节点；不能查询宿主内第一个 `.ProseMirror` 来决定聚焦对象，否则旧节点销毁会使新编辑器丢失焦点。
- `@milkdown/crepe` 与 `@milkdown/kit` 是生产依赖；React 由宿主提供。
- TipTap、`prosemirror-markdown`、`@milkdown/react` 和 `@prosemirror-adapter/react` 不属于当前编辑器边界。

自动聚焦回归使用真实 Milkdown，覆盖普通挂载和 StrictMode 重挂载，等待旧实例清理后再断言正文唯一、可编辑且持有焦点；仅用模拟 `contenteditable` 的测试无法覆盖异步实例竞态。配置批注集成测试同时验证输入到 Markdown 更新、真实失焦保存退出的链路。

## 六、相关业务文档

- 宿主接入和保存职责见[宿主接入、保存边界与测试](./04_宿主接入、保存边界与测试.md)。
- 知识库文档视图见[文件侧边栏与文档视图](../../../创作端/09-知识库/技术/02_文件侧边栏.md)。
- 共享组件中的预览舞台和配置组件见[共享组件架构设计](../../../创作端/04-配置与预览/技术/05_共享组件架构设计.md)。
