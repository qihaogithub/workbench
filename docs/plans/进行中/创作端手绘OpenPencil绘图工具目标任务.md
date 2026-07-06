# 创作端手绘 OpenPencil 绘图工具目标任务

## 当前状态

OpenPencil 接入已经完成了编辑器岛、统一 scene 导入导出、保存与冲突恢复等基础链路，但还没有形成真正可用的绘图编辑器。当前最重要的工作不是继续命名清理或发布灰度，而是把 OpenPencil 手绘编辑补成完整绘图工具：每一种可见工具都必须能在画布中创建和编辑对象，必须有对应属性栏设置，必须出现在图层列表中，并且能保存、重开、切换 SDK 后保持一致。

本文档用于新窗口目标模式执行。接手后不要再把本任务理解成 spike 收尾；目标是交付可作为创作端默认手绘编辑器候选的 OpenPencil 绘图能力。

## 已完成摘要

以下内容已经打通，只作为后续实现的基础，不再重复投入：

- `@workbench/sketch-openpencil-editor` 已作为独立 SDK 方向包存在，提供 iframe app、adapter facade 和构建产物。
- 创作端可以在单页手绘编辑态通过 feature flag 挂载 OpenPencil iframe，并通过统一 host adapter 收发 `load-document`、`ui-state`、`dirty-state`、`command` 等消息。
- `SketchSceneDocument` 仍是当前权威存储协议；OpenPencil 私有 graph 不直接进入项目存储。
- OpenPencil 已能导入/导出已有 scene，并覆盖 group、image、path、bindings、metadata、assets、复杂文本 `textStyleRuns` 的基本 round-trip。
- 显式保存已接入可验证 patch、patch-only 服务端回放、诊断事件、资源版本 patch 摘要和全量草稿 fallback 标记。
- 协同冲突已具备 409 提示、加载最新、自动合并摘要、逐条跳过、逐字段覆盖和手工处理参考面板。
- 已有项目级和用户级手绘编辑引擎偏好，支持 native 与 OpenPencil 双 SDK 切换。
- 图片代理、CanvasKit/font 资源错误态和资源探测已有第一段能力。
- `check:sketch-openpencil`、`test:e2e:openpencil-spike`、`test:e2e:openpencil-author` 等验证入口已有基础覆盖。

## 当前根因

当前界面看起来像编辑器，但绘图能力弱，根因是接入层只接了渲染、导入导出和保存，没有完整接入 OpenPencil 的画布输入与产品工具层。

关键现状：

- `packages/sketch-openpencil-editor/src/OpenPencilSpikeApp.vue` 里当前使用 `CanvasRoot` 和自定义 `ManualCanvasSurface`，后者只是设置 `canvasRef`，没有接入 `useCanvasInput()`。
- 工具栏只是遍历 `EDITOR_TOOLS` 并调用 `editor.setTool(tool.key)`；这只改变 active tool，不等于完成产品级绘图工具。
- `packages/shared/src/openpencil-adapter.ts` 的 host command 目前只覆盖选择、节点属性更新、复制、删除、编组、撤销、重做和定位选区，不覆盖创建节点、插入图片、图层重排、可见性、锁定、对齐、布尔运算等绘图编辑命令。
- OpenPencil 官方文档明确 `@open-pencil/vue` 是 headless SDK。它提供 `CanvasRoot`、`CanvasSurface`、`useCanvasInput()`、`LayerTreeRoot`、`PropertyListRoot`、`usePosition()`、`useAppearance()`、`useTypography()`、`useFillControls()`、`useStrokeControls()`、`useEffectsControls()` 等 composables/primitives，但产品界面和持久化映射需要本项目实现。

因此下一阶段必须先补绘图闭环，而不是继续围绕保存链路或命名做优化。

## 目标

把 OpenPencil 手绘编辑器补齐为完整绘图工具，满足以下验收定义：

- 每一个暴露给用户的工具都能通过画布交互创建或编辑对象。
- 每一种工具创建出的对象都能进入统一 `SketchSceneDocument` 或明确补充后的统一协议。
- 每一种对象都有完整属性栏：通用属性、几何、外观、文本、图片、路径/矢量、布局或特有属性，按对象类型显示。
- 图层列表完整可用：树形层级、选择同步、重命名、显隐、锁定、拖拽重排、多选、分组/解组。
- 所有工具创建和属性修改都能触发 dirty-state，生成可验证 patch；无法生成 patch 时必须明确 fallback。
- 保存后重开、OpenPencil/native 双 SDK 切换、版本历史和协同冲突恢复仍然成立。
- 浏览器 E2E 覆盖每一种工具的创建、属性修改、图层行为、保存重开。

## 非目标

- 不做 `SketchSceneDocument` 或 `runtimeType: "sketch-scene"` 的大规模命名迁移。
- 不删除 native 自研手绘 SDK；它仍是协议基线和 fallback。
- 不把 OpenPencil 私有 graph JSON 直接作为项目存储格式。
- 不把无法持久化、无法导出、无法回归验证的 OpenPencil 工具先暴露给普通用户。
- 不继续扩展保存/冲突链路，除非绘图工具新增的数据结构需要它们配套支持。

## 实施原则

- 先接 OpenPencil 官方输入层：优先使用 `CanvasSurface`、`useCanvasInput()`、`useTextEdit()`、`useCanvasDrop()` 等 SDK 能力，而不是继续手写空壳 canvas。
- 先做可持久化工具，再做扩展工具。每个工具上线前必须确认它能映射到统一 scene 协议。
- 工具、属性栏、图层列表三者同时推进。只做工具按钮或只做属性输入都不算完成。
- 属性栏优先复用 OpenPencil composables；只有涉及 Workbench 协议、配置绑定、图片代理或 host 命令时才写适配层。
- 图层列表可以继续由创作端 host 渲染，但必须由 OpenPencil iframe 输出完整 layer tree 状态和命令能力；如果使用 OpenPencil `LayerTreeRoot`，仍要保证 host 抽屉与保存协议一致。
- 每次新增对象类型或属性字段，都要同步检查 `SketchSceneDocument`、OpenPencil import/export、patch diff、服务端 patch 回放、只读渲染和 native SDK 兼容策略。

## 任务清单

### 阶段 1：画布输入接入

- [ ] 用 OpenPencil 官方 `CanvasSurface` 或等价实现替换当前 `ManualCanvasSurface`。
- [ ] 在 OpenPencil iframe 内接入 `useCanvasInput()`，确保选择、拖拽、resize、rotate、pan、draw、pen、text edit 事件进入 editor。
- [ ] 保留当前 `CanvasRoot` 渲染、资源错误态和 dirty-state 监听，不破坏保存链路。
- [ ] 验证 Move、Hand、Rectangle、Frame、Text、Pen 至少有真实画布响应，而不是只切换 active tool。
- [ ] 补 E2E：点击/拖拽画布能创建矩形、文本、路径，并能选中、移动、保存。

### 阶段 2：工具体系补齐

工具栏不再直接裸露 `EDITOR_TOOLS`。应建立 Workbench 手绘工具定义，包含显示、快捷键、所属 flyout、可持久化类型、默认属性、属性栏 schema 和 E2E fixture。

首批必须覆盖：

- [ ] Move/Select：点选、多选、框选、移动、resize、rotate、nudge、duplicate、delete、z-order。
- [ ] Hand：平移、滚轮/触控板缩放、zoom to fit、zoom to selection。
- [ ] Rectangle：创建、fill、stroke、radius、opacity、geometry、rotation。
- [ ] Ellipse：创建、fill、stroke、opacity、geometry、rotation。
- [ ] Line：创建、stroke、strokeWidth、cap、dash、geometry、rotation。
- [ ] Arrow：创建、stroke、strokeWidth、arrow cap、dash、geometry、rotation。
- [ ] Text：创建、直接编辑、文本选区、font family、font size、weight、italic、underline、strikethrough、color、align、line-height、letter-spacing、`textStyleRuns`。
- [ ] Image：本地插入、URL 插入、图片代理 hydrate、src/alt、fit/crop 或当前可支持的 scale mode、geometry。
- [ ] Pen/Path：点击点、拖拽贝塞尔、闭合路径、Escape 提交 open path、fill、stroke、矢量点编辑、导入导出 `path`/`points` 或协议扩展。
- [ ] Sticky/Button/Input/Card：如果继续作为手绘快捷工具暴露，必须支持创建、文本、fill、stroke、radius、typography、bindings。

扩展工具需要先做协议决策，再暴露：

- [ ] Frame/Section：确认是否扩展 `SketchSceneDocument` 支持容器语义、clip、auto-layout、section；否则不要作为普通用户工具暴露。
- [ ] Polygon/Star：确认协议新增字段，例如 sides、innerRadius；补只读渲染、import/export、属性栏和 E2E 后再暴露。
- [ ] Component/Instance/Boolean operation/Auto layout：只在统一协议、保存、native fallback 和只读渲染都有方案后进入本任务范围。

### 阶段 3：完整属性栏

属性栏按对象类型显示，不再只覆盖少量基础字段。每个字段都必须能写入 OpenPencil 节点，并能导出到统一 scene 或协议扩展字段。

通用属性：

- [ ] 名称、可见、锁定、x、y、width、height、rotation、opacity。
- [ ] z-order 操作：bring forward/backward、bring to front、send to back。
- [ ] 配置绑定：保留当前节点级 bindings，并明确哪些对象类型支持。

外观属性：

- [ ] Fill：solid color；若支持 gradient/image fill，必须先补协议和只读渲染。
- [ ] Stroke：color、width、alignment、cap、join、dash pattern；线/箭头/path 要覆盖 open path 语义。
- [ ] Radius：统一 radius 与独立四角 radius；如果协议不支持独立四角，先补协议或不显示独立控制。
- [ ] Effects：drop shadow、inner shadow、layer blur、background blur、foreground blur；只有协议、渲染和导出都支持后才暴露。

文本属性：

- [ ] 文本内容、font family、font size、font weight、italic、underline、strikethrough、color、align、line height、letter spacing。
- [ ] 文本框选区优先，选区不存在时应用整段。
- [ ] 保持 `textStyleRuns` import/export、只读 SVG 渲染和 native SDK 兼容。

图片属性：

- [ ] src、alt、图片上传或 URL 输入、代理加载状态、失败提示。
- [ ] image fill/fit/crop 能力如果暴露，必须能持久化。

矢量/路径属性：

- [ ] path data、points/vector network、closed/open、fill、stroke、cap、join、dash。
- [ ] 节点编辑状态必须能 dirty、undo/redo、保存重开。

容器/布局属性：

- [ ] group/frame/container 的 children、clip、padding、gap、layout mode 等字段只在协议和渲染支持后暴露。

### 阶段 4：图层列表

图层列表必须从“调试状态列表”升级为编辑器核心能力。

- [ ] 树形展示完整层级：page frame、group、container、普通节点、文本 label 的过滤策略要明确。
- [ ] 选择同步：点击图层选中画布对象，画布选择同步高亮图层。
- [ ] 多选：支持 shift/meta 组合选择或等价交互。
- [ ] 展开/折叠：group/container 可展开，状态保持在当前编辑会话。
- [ ] 重命名：双击或输入框重命名，写入 OpenPencil 节点并导出 scene。
- [ ] 可见性：眼睛开关，写入 `visible` 并参与画布渲染和导出。
- [ ] 锁定：锁定后不可在画布移动/编辑，但仍可在图层列表中选择和解锁。
- [ ] 拖拽重排：同级重排、跨 group/container 移动；必须触发 patch reorder。
- [ ] 分组/解组：与工具栏、快捷键和右键菜单保持同一命令源。
- [ ] 空状态和错误态：无节点、加载失败、只读/不可编辑状态下显示合理。

### 阶段 5：协议与持久化补齐

- [ ] 为每个新增工具/属性列出当前 `SketchSceneDocument` 是否可表达。
- [ ] 不可表达的字段必须先做协议扩展方案，包含 native SDK fallback、只读渲染、project-core 校验、AI 工具和 CLI 影响。
- [ ] OpenPencil import/export 必须双向覆盖新增字段。
- [ ] dirty-state patch diff 必须覆盖新增字段，服务端 patch 回放必须校验。
- [ ] 保存后创建资源版本时，patch 摘要继续只记录安全摘要，不写 scene 或 operations 内容。
- [ ] 与协同冲突恢复兼容：新增字段要能在同字段冲突摘要中显示基线/最新/本次值。

### 阶段 6：验证与文档同步

- [ ] `corepack pnpm check:sketch-openpencil`
- [ ] `corepack pnpm test:e2e:openpencil-spike`
- [ ] `corepack pnpm --filter @workbench/author-site typecheck`
- [ ] 涉及创作端 host 属性栏或图层抽屉时运行 `corepack pnpm check:author`
- [ ] 涉及真实创作端保存、切换 SDK 或协同时运行 `corepack pnpm test:e2e:openpencil-author`
- [ ] 新增或扩展协议时运行 `corepack pnpm check:sketch-core`、`corepack pnpm --filter @workbench/sketch-react typecheck`、`corepack pnpm check:project-core`
- [ ] 行为稳定后更新 `docs/项目文档/` 中手绘页面/诊断/协议相关长期事实；修改项目文档时使用 `doc-maintainer` 技能。

## 验收矩阵

每一种工具至少满足以下矩阵，缺一项就不能标记完成：

| 工具/对象 | 创建 | 选择/移动 | 属性栏 | 图层列表 | 保存重开 | native 切换 | E2E |
|---|---|---|---|---|---|---|---|
| Select/Move | - | 待做 | 待做 | 待做 | 待做 | 待做 | 待做 |
| Hand/Zoom | - | 待做 | - | - | - | - | 待做 |
| Rectangle | 待做 | 待做 | 待做 | 待做 | 待做 | 待做 | 待做 |
| Ellipse | 待做 | 待做 | 待做 | 待做 | 待做 | 待做 | 待做 |
| Line | 待做 | 待做 | 待做 | 待做 | 待做 | 待做 | 待做 |
| Arrow | 待做 | 待做 | 待做 | 待做 | 待做 | 待做 | 待做 |
| Text | 待做 | 待做 | 待做 | 待做 | 待做 | 待做 | 待做 |
| Image | 待做 | 待做 | 待做 | 待做 | 待做 | 待做 | 待做 |
| Pen/Path | 待做 | 待做 | 待做 | 待做 | 待做 | 待做 | 待做 |
| Sticky/Button/Input/Card | 待做 | 待做 | 待做 | 待做 | 待做 | 待做 | 待做 |
| Frame/Section | 待协议决策 | 待协议决策 | 待协议决策 | 待协议决策 | 待协议决策 | 待协议决策 | 待协议决策 |
| Polygon/Star | 待协议决策 | 待协议决策 | 待协议决策 | 待协议决策 | 待协议决策 | 待协议决策 | 待协议决策 |

## 关键文件

- `packages/sketch-openpencil-editor/src/OpenPencilSpikeApp.vue`：OpenPencil iframe app，目前是主要改造入口。
- `packages/sketch-openpencil-editor/src/adapter.ts`：OpenPencil 包 adapter facade。
- `packages/shared/src/openpencil-adapter.ts`：host/iframe postMessage 契约，需要扩展绘图和图层命令。
- `packages/author-site/src/app/demo/[id]/edit/components/OpenPencilSpikeFrame.tsx`：创作端 host iframe、属性栏、图层抽屉、保存状态入口。
- `packages/sketch-core/`：统一 scene 协议、校验、patch、只读渲染。
- `packages/sketch-react/`：native 手绘 SDK，作为协议和能力对照。
- `test/openpencil-spike/` 与 `test/创作端E2E回归测试/openpencil-author.playwright.config.ts`：浏览器回归入口。
- `docs/external/openpencil/`：本地 OpenPencil 官方文档镜像，优先参考 SDK、绘图、钢笔、图层、选择、文本、节点类型文档。

## 当前风险

- OpenPencil 是 headless SDK，不会自动提供完整产品 UI；如果只接 `CanvasRoot`，会继续出现“按钮存在但画不起来”的状态。
- 当前统一协议比 OpenPencil scene graph 小。完整工具会逼出协议扩展，尤其是 polygon/star、frame/section、gradient、effects、auto-layout、vector network 等能力。
- 属性栏如果直接操作 OpenPencil 私有字段但导出时丢失，会造成用户保存后重开丢配置。所有字段必须先确认持久化路径。
- 图层列表如果只展示 host 缓存，不走 OpenPencil 真实树和命令，会与画布选择、拖拽重排、分组和保存顺序漂移。
- native SDK 仍是 fallback。新增工具或属性如果 native 不能读取，必须提供只读渲染或降级策略。
- E2E 必须覆盖真实浏览器画布交互；仅靠单元测试不能证明绘图工具可用。

## 新窗口接手顺序

1. 先修画布输入：接入 `CanvasSurface`/`useCanvasInput()`，让现有工具真正响应鼠标。
2. 再建立 Workbench 工具定义和工具栏，不要继续裸用 `EDITOR_TOOLS`。
3. 选一个最小工具闭环做穿透：Rectangle 创建 -> 属性栏 -> 图层列表 -> 保存重开 -> E2E。
4. 按工具矩阵逐个补齐 Ellipse、Line、Arrow、Text、Image、Pen/Path。
5. 每新增一类对象或属性，先确认统一协议和 native fallback，再暴露 UI。
6. 最后补图层拖拽重排、完整属性栏列表、双 SDK 切换和协同冲突回归。
