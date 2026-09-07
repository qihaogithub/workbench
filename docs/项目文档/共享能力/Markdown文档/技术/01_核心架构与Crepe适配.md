---
covers:
  - packages/demo-ui/src/DocumentEditor.tsx
  - packages/demo-ui/src/DocumentEditor.test.tsx
  - packages/demo-ui/src/markdown/crepe-config.ts
  - packages/demo-ui/src/markdown/heading-style-toolbar.ts
  - packages/demo-ui/src/markdown/document-block-edit.ts
  - packages/demo-ui/src/markdown/document-block-menu.ts
  - packages/demo-ui/src/markdown/document-heading-menu.ts
  - packages/demo-ui/src/markdown/document-heading-picker.ts
  - packages/demo-ui/src/markdown/document-heading-command.ts
  - packages/demo-ui/src/markdown/document-heading-command.test.ts
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

编辑器使用 Milkdown Crepe v7 创建实例，并启用 Cursor、ListItem、LinkTooltip、ImageBlock、Placeholder、CodeMirror 和 Table 等基础 feature，覆盖标题、粗体/斜体/删除线、行内代码、代码块、有序/无序/任务列表、引用、表格、链接、图片、分隔线和块拖拽。Crepe 原生 `Toolbar` 与 `BlockEdit` 关闭后，由 `Crepe.addFeature()` 安装 `documentSelectionToolbar` 与 `documentBlockEdit` 两个本地 feature；块操作通过公开的 `BlockProvider` 工作；选区工具栏由 ProseMirror plugin 与文档选区/焦点事件管理显示和关闭，共享定位器单独管理坐标，不再同时使用 `TooltipProvider`。块菜单不再与 `SlashProvider` 共同写坐标，避免两个定位器互相覆盖。

Latex 与 Crepe AI 明确关闭。标题样式由 `heading-style-toolbar` 共享数据模块提供。TopBar 保留原生格式工具栏，通过公开 `buildTopBar` 注册本地标题按钮，由 `documentHeadingMenu` feature 管理当前标题标签和下拉生命周期；标题菜单与块菜单复用分组菜单组件、主题与定位器，前者转换当前段落，后者插入新块。标题 feature 仅维护自己注册的标记元素，不查找/隐藏原生选择器、不复制控件或转发合成事件、不用 DOM 观察器注入菜单。

## 三、TopBar 与布局适配

两个标题入口统一使用 `DocumentHeadingPicker`，不再创建原生 select；Picker 复用 `DocumentBlockMenu` 的绘制和键盘机制，独立标题变体使用 216px 首选宽度、280px 最大高度与主题令牌。菜单项支持选中勾选、禁用和原因，标题菜单只包含正文与标题组。打开时保存文档与选区快照，操作前再次校验；与选区工具栏作为同一组浮层处理焦点和外部点击，Escape 优先关闭子菜单。

`document-heading-command` 是两个入口的唯一转换实现。先收集选区涉及的段落并拒绝不支持结构；列表转换通过公开 `liftListItem` 逐层提升，在私有事务中累积结构步骤并校正有序尾段起始编号，再设定标题类型、映射原选区。完整校验成功后只派发一次事务，保证无部分提交且一次撤销恢复。行内格式通过节点内容保留；不可用选项由同一转换函数预检。测试包含有序/任务/嵌套列表、混合样式、Markdown 往返、两个入口的单次撤销及失效菜单目标。

TopBar 相对 `.milkdown` 正文滚动容器吸顶，正文从 TopBar 下方开始布局。选区工具栏与块菜单统一挂载到当前 `DocumentEditor` 的独立 overlay root，由 `DocumentOverlayPositioner` 以当前 `EditorView` 的矩形为锚点。Floating UI 提供滚动/尺寸监听与裁剪祖先、视口的边界测量；本地纯策略是最终坐标和候选方向的唯一决策者。选区使用独立的 `chooseSelectionToolbarPosition` 策略，上方优先、下方翻转，只保护选区和 TopBar，不将整篇正文作为障碍物。实际编辑器作为边界，浮层 root 只负责坐标换算；窄栏根据边界宽度收起低频按钮并重新测量换行高度。无相邻空间时使用 `docked` 停靠到可见顶部、TopBar 下方，此退路允许与跨视口选区交叠。Escape/外部点击记住已关闭的选区，普通事务不重新打开；新选区或重新点击正文可以再次激活。块菜单只允许从当前块下方、右侧或左侧出现，当前块首行矩形是不可覆盖区域。

块操作入口只有一个可聚焦的 32px 手柄，图标约 16px。点击或 `Enter`/`Space` 打开独立中文插入菜单；原生 `mousedown`、`dragstart`、`dragend` 仍由公开 `BlockProvider` 处理拖拽，不隐藏加号、不转发事件、不合成 `PointerEvent`。打开只记录块元素、文档快照与顶层块结束位置，不派发正文事务；关闭不需要删除临时空段。选定结构节点后才以单次事务插入，文档快照失效则关闭菜单。上传/引用选定后继续使用宿主回调，文件选择器本身的取消不等同于菜单取消。列表块的手柄锚定 `.label-wrapper`，普通块锚定首行矩形；正文沟槽、列表标记列和文字间距由主题 token 统一控制。批注简版编辑器不安装块手柄 feature，继续保持紧凑输入。

菜单横向边界取编辑器与裁剪祖先、浏览器视口的交集；内滚动编辑器的纵向也取该交集，`scrollable=false` 的流式宿主纵向使用外层可视滚动区，不能使用长文档完整高度或空文档短卡片高度冒充视口。定位前先测量首选尺寸，再按候选空间缩小，最后写入尺寸约束和坐标；低于最小可操作尺寸或锚点移出可视区域时隐藏。标题菜单横向锚定按钮，纵向从 TopBar 最后一行下方展开，避免换行时遮住第二排操作。菜单使用不透明 surface、描边和阴影，顶部导航是实际分组 Tab，下方只渲染当前分组并在内部滚动；最大高度由 `--document-editor-block-menu-max-height` 统一控制。分组规则见[需求文档](../Markdown编辑器_需求文档.md)。普通选区事务不重置 Tab；斜杠菜单锚定当前光标且不抢输入焦点，编辑器键盘事件交给菜单处理，Escape 或外部点击关闭，内容变化后才允许重新触发。

**浮层可见性按用途区分：块菜单保护触发块，选区工具栏允许覆盖邻近正文并提供停靠退路。** 定位器必须绑定当前编辑器 root 与 `EditorView`，不能跨实例查询全局 DOM；空间不足时缩小、滚动或隐藏，不能把 `z-index`、`transform` 或 DOM 观察器当作掩盖碰撞的手段。

## 四、主题与滚动

`crepe-theme.css` 以 Crepe Frame 的正文背景、控件表面、弱表面、描边和交互色层级为基线，由宿主 token 推导明暗主题。表格边框、单元格选中、节点选中和图片选中继续使用 Crepe common 规则，只校准 `outline`、`primary` 和 `selected` token，不对 ProseMirror 选中节点做全局描边覆盖。

当宿主限制编辑器高度时，正文层承担纵向滚动，TopBar 保持可见；流式文档宿主可以关闭编辑器自身滚动，改由外层文档区滚动。

## 五、生命周期与依赖

- 组件创建时初始化 Crepe，并注册 Markdown 更新监听。
- `readOnly` 通过 Crepe 能力动态切换，不因状态切换重建实例。
- 组件卸载时销毁实例和监听，避免编辑状态与 DOM 引用泄漏。
- `DocumentEditor` 根据资源身份为内部实例设置 React key，身份变化时隔离旧 DOM、历史、菜单和异步回调；同文档 value 更新保持原有差异同步。身份契约见[宿主接入](./04_宿主接入、保存边界与测试.md)。上传完成时校验发起上传的 Crepe 仍是当前实例，禁止写入后来切换的文档。
- 自动聚焦必须在异步创建完成后确认实例仍是当前实例，再通过该实例的 `editorViewCtx` 聚焦。StrictMode 重挂载期间旧实例可能仍在异步销毁，同一宿主内短暂存在多个正文节点；不能查询宿主内第一个 `.ProseMirror` 来决定聚焦对象，否则旧节点销毁会使新编辑器丢失焦点。
- `@milkdown/crepe`、`@milkdown/kit` 与 `@floating-ui/dom` 是生产依赖；React 由宿主提供。
- TipTap、`prosemirror-markdown`、`@milkdown/react` 和 `@prosemirror-adapter/react` 不属于当前编辑器边界。

自动聚焦回归使用真实 Milkdown，覆盖普通挂载和 StrictMode 重挂载，等待旧实例清理后再断言正文唯一、可编辑且持有焦点；仅用模拟 `contenteditable` 的测试无法覆盖异步实例竞态。配置批注集成测试同时验证输入到 Markdown 更新、真实失焦保存退出的链路。

## 六、相关业务文档

- 宿主接入和保存职责见[宿主接入、保存边界与测试](./04_宿主接入、保存边界与测试.md)。
- 知识库文档视图见[文件侧边栏与文档视图](../../../创作端/09-知识库/技术/02_文件侧边栏.md)。
- 共享组件中的预览舞台和配置组件见[共享组件架构设计](../../../创作端/04-配置与预览/技术/05_共享组件架构设计.md)。
