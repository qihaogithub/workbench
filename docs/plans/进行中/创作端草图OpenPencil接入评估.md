# 创作端草图 OpenPencil 接入评估

## 当前结论

OpenPencil 可以作为创作端草图能力的候选核心，但不适合作为 `sketch-react` 的普通组件级替换直接塞进现有 React 页面。

更稳妥的方向是先做 OpenPencil 接入 spike：用 OpenPencil 负责高阶绘图编辑体验，用 workbench 继续负责项目、页面、配置、版本、截图、发布和 Agent 工作流。spike 成功后，再决定是新增 `openpencil-design` 页面运行时，还是把现有 `sketch-scene` 迁移为 OpenPencil-backed runtime。

推荐判断：

- 如果目标是“接近 OpenPencil/Figma 的编辑体验”，不要继续把现有 SVG/DOM 草图 SDK 硬补成完整编辑器。
- 如果目标只是“轻量线框、配置绑定、稳定截图和 AI patch”，现有 `SketchSceneDocument + sketch-core + sketch-react` 仍然更轻、更可控。
- 如果要正式采用 OpenPencil，应把它当成一个新的编辑内核和文档模型接入，而不是只替换画布渲染层。

## 本地文档

OpenPencil 文档已镜像到：

- [OpenPencil 文档本地镜像](../../external/openpencil/README.md)
- [官方目录 llms.txt](../../external/openpencil/llms.txt)
- [完整合订本 llms-full.txt](../../external/openpencil/llms-full.txt)
- [逐页 Markdown](../../external/openpencil/pages/)

本次镜像来自 `https://openpencil.dev/llms.txt` 和 `https://openpencil.dev/llms-full.txt`，共下载 117 个页面，失败 0 个。后续阅读优先使用 `llms.txt` 导航，全文检索优先使用 `llms-full.txt`。

## 关键文档阅读结论

### SDK 嵌入

相关文档：

- [SDK Getting Started](../../external/openpencil/pages/programmable/sdk/getting-started.md)
- [SDK Architecture](../../external/openpencil/pages/programmable/sdk/architecture.md)
- [Custom Editor Shell](../../external/openpencil/pages/programmable/sdk/guides/custom-editor-shell.md)
- [Property Panels](../../external/openpencil/pages/programmable/sdk/guides/property-panels.md)
- [Navigation Panels](../../external/openpencil/pages/programmable/sdk/guides/navigation-panels.md)

OpenPencil SDK 分三层：

| 层级 | 作用 | 对本项目的含义 |
| :--- | :--- | :--- |
| `@open-pencil/core` | framework-agnostic editor engine | 可以作为真正编辑内核研究，不能假设它自动适配 React UI |
| `@open-pencil/vue` | Vue composables + headless primitives | 官方完整 SDK 壳在 Vue 层，React/Next 接入需要 Vue island、iframe 或重新封装 |
| app shell | styling、routing、file flows、product UX | 创作端仍负责项目会话、保存、配置、截图、发布和 AI 入口 |

SDK 明确支持自定义编辑器壳：中间 canvas、左侧页面/图层、右侧属性、toolbar/menu 由 composables 和 headless primitives 驱动。这和创作端“三栏/单页编辑”目标匹配。

### 画布与交互

相关文档：

- [useCanvas](../../external/openpencil/pages/programmable/sdk/api/composables/use-canvas.md)
- [useCanvasInput](../../external/openpencil/pages/programmable/sdk/api/composables/use-canvas-input.md)
- [useEditorCommands](../../external/openpencil/pages/programmable/sdk/api/composables/use-editor-commands.md)

OpenPencil 的画布链路已经覆盖当前自研 SDK 最薄弱的部分：

- CanvasKit 初始化、surface、render scheduling、resize、ruler、drawing buffer。
- selection、dragging、resize、rotation、panning、pen/draw、text editing、hit testing。
- undo/redo、duplicate、group、component、auto layout、visibility、lock、z-order、zoom 等命令层。

这类能力不是在 `sketch-react` 上补几个手柄能追平的，差异在编辑器内核。

### 数据模型与格式

相关文档：

- [Node Types](../../external/openpencil/pages/reference/node-types.md)
- [Scene Graph](../../external/openpencil/pages/reference/scene-graph.md)
- [File Format](../../external/openpencil/pages/reference/file-format.md)
- [Architecture](../../external/openpencil/pages/guide/architecture.md)
- [Tech Stack](../../external/openpencil/pages/guide/tech-stack.md)

OpenPencil 使用 Figma/Kiwi 风格模型：

- flat `Map<string, Node>` scene graph，节点通过 GUID 和 `parentIndex` 维护树关系。
- Engine `NodeType` 覆盖 frame、group、rectangle、text、line、vector、boolean operation、component、instance、section 等 18 类。
- CanvasKit WASM 渲染，Yoga WASM 做 auto-layout。
- `.fig` 是 ZIP + Kiwi binary + Zstd/deflate + blob 数据；支持 `.fig` 读写和 PNG/JPG/WEBP/SVG/JSX 导出。

这比当前 `SketchSceneDocument` 更接近设计工具，而不是轻量页面草图 JSON。采用 OpenPencil 后，应避免把高级能力反向压扁到现有 `SketchSceneNode`，否则会丢失 auto-layout、组件、变量、富文本、矢量、布尔运算等核心价值。

### 自动化与 AI

相关文档：

- [CLI Reference](../../external/openpencil/pages/reference/cli.md)
- [Inspecting Files](../../external/openpencil/pages/programmable/cli/inspecting.md)
- [Exporting](../../external/openpencil/pages/programmable/cli/exporting.md)
- [Scripting](../../external/openpencil/pages/programmable/cli/scripting.md)
- [JSX Renderer](../../external/openpencil/pages/programmable/jsx-renderer.md)
- [MCP Server](../../external/openpencil/pages/programmable/mcp-server.md)
- [AI Chat](../../external/openpencil/pages/programmable/ai-chat.md)

OpenPencil 的自动化能力很适合替代我们原计划自研的草图 Agent patch 层：

- CLI 支持 info/tree/find/node/pages/export/dom/eval/analyze。
- `openpencil eval` 提供接近 Figma Plugin API 的 `figma` global，可批量创建、查询和修改节点。
- JSX renderer 可用 `<Frame><Text>` 这类紧凑语法生成设计，并可导出 JSX/Tailwind。
- MCP 暴露 90 个工具，覆盖 read/create/modify/structure/vector/export/variables/analyze/diff/navigation。

如果接入 OpenPencil，Agent 不应继续主要使用现有 `patchSketchScene` 思路，而应优先走 OpenPencil 的 JSX renderer、CLI/eval 或 core tool registry，再由本项目加上权限、项目上下文和版本保存。

### 协作能力

相关文档：

- [Collaboration](../../external/openpencil/pages/programmable/collaboration.md)
- [Roadmap](../../external/openpencil/pages/development/roadmap.md)

OpenPencil 自带 P2P WebRTC + Yjs 协作，但这和本项目现有创作端会话、资源历史、自动保存和服务端诊断不是同一套系统。首版不建议直接启用 OpenPencil 协作；应先以文件保存/版本为边界接入。对象级协作可以等 OpenPencil 文档模型成为项目事实后再评估。

## 当前项目约束

现有草图页事实：

- `SketchSceneDocument` 是当前草图页权威 JSON 协议。
- `@workbench/sketch-core` 负责校验、patch、binding、几何、命中测试、视觉 hash 和 SVG/HTML 只读渲染。
- `@workbench/sketch-react` 负责 React 受控编辑组件。
- author-site 默认暂停开放草图入口，由 `NEXT_PUBLIC_SKETCH_SCENE_AUTHORING_ENABLED` 控制。
- screenshot-service、viewer-site、project-core、project-cli、agent-service 已围绕 `sketch-core` 保留底层链路。

这意味着 OpenPencil 接入不能只考虑“编辑器能不能显示”，还必须回答：

- 页面目录里保存什么文件。
- 截图服务如何确定性渲染。
- viewer-site 如何只读展示。
- Agent 如何读写并回滚。
- 配置项如何绑定到文本、颜色、图片、显示状态和变量。
- 现有 `sketch-scene` 数据如何迁移或兼容。

## 可选接入方案

### 方案 A：新增 OpenPencil-backed 页面运行时

新增一个独立页面类型，例如 `openpencil-design`。页面目录保存 OpenPencil 文档源文件和本项目 metadata：

| 文件 | 作用 |
| :--- | :--- |
| `openpencil.fig` 或等价二进制源文件 | OpenPencil/Figma-compatible 权威文档 |
| `openpencil.meta.json` | 来源、版本、编辑器设置、导出缓存信息 |
| `config.schema.json` | 本项目配置项 |
| `openpencil.bindings.json` | 本项目配置字段到 OpenPencil node/property/variable 的映射 |
| `preview.svg` / `thumbnail.png` | 可选缓存，由截图/导出链路生成 |

优点：

- 最大化保留 OpenPencil 能力。
- 不把 Figma 级文档模型压进 `SketchSceneDocument`。
- 可以和现有草图页并存，降低迁移风险。

缺点：

- project-core、viewer、screenshot、CLI、Agent 都要新增 runtime 分支。
- 需要处理二进制文件保存、版本 diff 和资源历史展示。
- 现有草图页不能自动获得 OpenPencil 编辑能力，需要迁移入口。

这是正式采用时的推荐方向。

### 方案 B：OpenPencil 作为 `sketch-scene` 的编辑内核

保留 `sketch.scene.json` 作为项目权威格式，编辑时把它转换成 OpenPencil document，保存时再转换回 `SketchSceneDocument`。

优点：

- 对现有 project-core/screenshot/viewer 改动较小。
- 能复用当前配置绑定、Agent patch 和 JSON 版本链路。

缺点：

- OpenPencil 的组件、auto-layout、富文本、变量、布尔、矢量等高级能力会大量丢失或难以回写。
- 用户体验越接近 OpenPencil，保存回 `SketchSceneDocument` 的损耗越明显。
- 长期会变成双模型同步问题，容易让编辑器和发布预览不一致。

只适合作为迁移/导入工具，不建议作为长期主方案。

### 方案 C：只用 `@open-pencil/core`，自写 React 壳

在 React/Next 中直接封装 `@open-pencil/core` 和 canvas API，绕开 Vue SDK。

优点：

- 和 author-site 技术栈一致。
- 不需要 iframe 或 Vue island。

缺点：

- 官方 headless primitives、属性面板、导航面板和 composables 大量在 Vue SDK。
- 等于重新实现一套 React SDK，初期成本高，容易踩内部 API 稳定性问题。

不建议作为第一阶段。可以等 OpenPencil core API 使用边界清楚后，再局部封装。

### 方案 D：Vue island / iframe 编辑器

新增一个内部 OpenPencil editor app，使用 `@open-pencil/vue` 官方 SDK；author-site 在编辑态通过 iframe 或 Web Component 挂载，并用 postMessage / typed bridge 交换文档、selection、save、export、dirty state。

优点：

- 最大化复用官方 SDK。
- 与 React/Next 解耦，SSR 和 WASM 风险更可控。
- 可以独立跑 playground/spike，不污染 author-site 主 bundle。

缺点：

- 需要设计跨边界通信协议。
- 需要处理 iframe 焦点、快捷键、主题、资源 URL 和 auth/session。
- 首次加载 CanvasKit WASM 成本高。

这是 spike 阶段的推荐实现方式。

## 推荐实施路径

### Phase 0：依赖与最小运行 spike

目标：证明 OpenPencil SDK 能在本仓库开发环境中启动并绘制可交互画布。

建议动作：

- 新建临时 workspace 包或 `packages/openpencil-spike`，不要直接改 author-site。
- 安装 `@open-pencil/core@0.13.2`、`@open-pencil/vue@0.13.2`、`vue`、`canvaskit-wasm`。
- 用 Vite/Vue 起一个最小 editor shell：`createEditor`、`provideEditor`、`CanvasRoot`、`CanvasSurface`、`ToolbarRoot`、`LayerTreeRoot`。
- 验证矩形、文本、拖拽、缩放、选择、撤销、导出截图。
- 记录 bundle 大小、WASM 加载路径、浏览器控制台错误和冷启动时间。

验收：

- `corepack pnpm --filter <spike-package> typecheck`
- 浏览器能看到 CanvasKit 画布且基础交互可用。
- 能导出 PNG 或 SVG 作为截图服务可消费的候选产物。

### Phase 1：文件保存与导出链路

目标：证明 OpenPencil 文档能纳入项目页面目录。

建议动作：

- 评估保存 `.fig` 二进制文件作为权威源，或寻找 OpenPencil core 的稳定 JSON/pen 序列化 API。
- 在 spike 中实现 `loadDocument` / `saveDocument` bridge。
- 生成 `thumbnail.png` 或 `preview.svg`，并和项目截图服务的输入尺寸对齐。
- 验证保存、关闭、重新打开后节点树和视觉输出一致。

验收：

- 一个项目页面目录可以持久化 OpenPencil 文档。
- 重新打开后编辑状态不依赖内存。
- 导出结果可被 viewer 或 screenshot-service 独立读取。

### Phase 2：author-site 宿主 bridge

目标：把 OpenPencil editor app 嵌入创作端单页编辑体验，但仍保持功能开关关闭。

建议动作：

- 设计 host/editor bridge 事件：
  - `load-document`
  - `document-changed`
  - `selection-changed`
  - `request-save`
  - `export-preview`
  - `dirty-state`
  - `error`
- author-site 负责页面元数据、保存按钮、版本、截图失效。
- OpenPencil app 只负责设计文档编辑和导出。
- 先用内部路由或 feature flag 验证，不开放普通用户入口。

验收：

- 创作端能加载 OpenPencil 页面。
- 修改后保存进入项目文件系统。
- 保存后截图失效和预览刷新能触发。

### Phase 3：Agent 与配置绑定

目标：证明 AI 可读写 OpenPencil 文档，并能绑定本项目配置。

建议动作：

- 优先验证 `@open-pencil/cli` / core tool registry，而不是直接接入 MCP 到生产 Agent。
- 用 JSX renderer 创建一个页面草图，再导出 PNG/SVG/JSX。
- 设计 `config.schema.json` 到 OpenPencil 的映射：
  - 颜色优先映射 OpenPencil variables。
  - 文本、图片、显示状态若 OpenPencil 变量覆盖不足，写入本项目 `openpencil.bindings.json`。
  - 渲染/导出前由 adapter 把 configData 应用到目标 node/property。
- 保留安全边界：Agent 只能改当前项目目录下的文档，所有写入进入版本/诊断链路。

验收：

- Agent 可创建/修改一个 OpenPencil 页面并生成可视导出。
- 配置项至少覆盖文本、颜色、图片、显示状态。
- 失败返回结构化诊断，而不是整文件盲写。

### Phase 4：运行时决策

目标：决定是否正式采用。

采纳条件：

- OpenPencil editor 的交互体验明显优于当前 `sketch-react`，且稳定可控。
- 文档保存、预览、截图、viewer、版本和 Agent 至少跑通一条端到端链路。
- 能明确处理现有 `sketch-scene`：保留轻量模式、提供迁移、或并存。
- Bundle/WASM 加载、SSR、浏览器兼容、截图服务运行成本可接受。

不采纳条件：

- SDK 无法在本仓库稳定安装或运行。
- CanvasKit/WASM 在 Next/Vite/截图服务中加载成本或兼容性不可接受。
- 文档模型无法可靠持久化到项目目录。
- 关键能力必须依赖 OpenPencil 桌面 app 或人工本地状态，不能纳入创作端服务链路。

## 主要风险

| 风险 | 影响 | 建议处理 |
| :--- | :--- | :--- |
| Vue SDK 与 React author-site 技术栈不一致 | 直接组件集成成本高 | spike 阶段采用 iframe/Vue island |
| CanvasKit WASM 体积和加载路径 | 首屏慢、Next/截图服务资源路径复杂 | 独立 bundle，延迟加载，记录冷启动和缓存行为 |
| `.fig` 二进制持久化 | 版本 diff、资源历史、文件 API 需要适配 | 新 runtime 分支，不强塞进 `sketch.scene.json` |
| 配置绑定不是 OpenPencil 原生业务模型 | 本项目配置预览可能和编辑器变量系统不完全一致 | 用 OpenPencil variables + 本项目 binding sidecar 双层映射 |
| OpenPencil 高级能力回写到旧草图协议会损耗 | 用户保存后能力消失或预览不一致 | 不建议长期采用方案 B |
| 协作模型不一致 | Yjs/WebRTC 与本项目协同保存冲突 | 首版禁用 OpenPencil 协作，仅文件级保存 |
| 截图服务确定性 | CanvasKit/browser/WASM 输出与现有 SVG/HTML 不同 | 先用导出产物缓存，后续再评估服务端渲染 |
| SDK 成熟度 | Roadmap 仍列出嵌入示例、Figma fidelity 和工具/API parity 改进 | 限定 spike 验收，不在未验证前替换生产链路 |

## 和现有草图 SDK 的关系

建议短期保留现有 `sketch-core/sketch-react`：

- 继续作为轻量草图和旧数据兼容层。
- 不再投入“追平 OpenPencil/Figma 级编辑器”的大规模自研。
- 后续如果 OpenPencil 采纳成功，提供 `SketchSceneDocument -> OpenPencil document` 的一次性迁移或导入工具。
- 对于只需要稳定 JSON、配置绑定、简单截图的场景，仍可保留 `sketch-scene`。

长期可形成两类页面：

| 类型 | 定位 | 权威数据 |
| :--- | :--- | :--- |
| `sketch-scene` | 轻量线框、兼容旧草图、低成本配置绑定 | `sketch.scene.json` |
| `openpencil-design` | 高阶设计编辑、Figma 级绘图、AI 设计自动化 | OpenPencil `.fig` 或等价文档 |

如果产品上不想暴露两类页面，可以在用户入口只叫“草图页”，内部按文档能力选择 runtime。

## 下一步建议

下一步不要直接重构现有草图 SDK。建议开一个独立实施任务：

> 完成 OpenPencil editor spike：本仓库新增隔离 playground，使用 `@open-pencil/core` 和 `@open-pencil/vue` 启动 CanvasKit 编辑器，验证基础交互、保存/重开、PNG/SVG 导出、author-site iframe bridge、配置绑定最小映射和 Agent JSX 写入，输出是否正式采用的验收报告。

这个 spike 通过后，再修改 `docs/项目文档/` 和页面运行时事实；未通过前，当前项目文档中 `sketch-scene` 的暂停边界仍然成立。

## 2026-07-05 Spike 实施记录

### 已落地

- 新增 `@workbench/openpencil-spike`，使用 Vite + Vue + `@open-pencil/core@0.13.2` + `@open-pencil/vue@0.13.2` + `canvaskit-wasm`，默认端口 `3410`。
- 根目录新增脚本：
  - `corepack pnpm dev:openpencil-spike`
  - `corepack pnpm check:openpencil-spike`
- author-site 新增 `NEXT_PUBLIC_OPENPENCIL_SKETCH_SPIKE_ENABLED` 和 `NEXT_PUBLIC_OPENPENCIL_SPIKE_EDITOR_URL`。默认不启用；启用后，仅在单页面预览模式、当前页为 `sketch-scene`、用户点击“编辑草图”进入编辑态时，用 iframe 挂载 OpenPencil spike。
- 新增 `OpenPencilSpikeFrame` bridge，宿主向 iframe 发送当前单页 `pageId`、`pageName`、`SketchSceneDocument`、`configData` 和 `previewSize`。
- OpenPencil island 收到单页 payload 后，只针对该页面初始化示例 frame/text/card，并将状态回传为 `ready` / `loaded` / `dirty-state`。
- iframe 内自带 OpenPencil toolbar、page/layer panel、selection inspector，不再打开外侧 `SketchPropertyPanel`。

### 验证结果

- `corepack pnpm check:openpencil-spike`：通过。
- `corepack pnpm --filter @workbench/author-site typecheck`：通过。
- `corepack pnpm --filter @workbench/openpencil-spike build`：通过。
- Playwright 临时浏览器检查 `http://127.0.0.1:3410/`：页面有 1 个 canvas，toolbar/page/layer UI 可见，无 `pageerror`。
- Playwright 模拟宿主 `postMessage`：payload 传入 `pageId=demo_page_1`、`pageName=测试草图页`、`previewSize=390x844` 后，bridge 状态变为 `loaded`，页面尺寸显示 `390 x 844`，selection 显示选中的 OpenPencil frame。
- 本地 author-site 使用 `NEXT_PUBLIC_OPENPENCIL_SKETCH_SPIKE_ENABLED=true NEXT_PUBLIC_OPENPENCIL_SPIKE_EDITOR_URL=http://127.0.0.1:3410 corepack pnpm dev:author` 启动成功；`/login` 返回 200。

### 当前限制

- 还没有实现 `SketchSceneDocument -> OpenPencil document` 的真实转换；当前只在 OpenPencil 画布内 seed 一个示例单页 frame。
- OpenPencil 编辑结果还没有回写到 `sketch.scene.json` 或新的 OpenPencil 文档文件；`dirty-state` 只证明 bridge 能感知编辑状态。
- 截图服务、viewer-site、project-core、版本历史和 Agent 工具尚未接入 OpenPencil 文档模型。
- OpenPencil npm dist 中 worker 引用仍指向 `.ts`，但发布产物实际是 `.js`；spike 的 Vite config 已通过 alias 映射 `export-worker.ts` 和 `kiwi/fig/parse/worker.ts` 到同目录 `.js`。正式接入前需要继续关注上游包修复或保留这类 bundler shim。
- 生产包主 chunk 约 1.36 MB minified，Vite 输出 chunk size warning；正式接入应保持 iframe/island 延迟加载，不进入 author-site 主 bundle。

### 下一阶段

优先补两件事：

1. 设计并实现最小 `SketchSceneDocument -> OpenPencil scene` 转换，只覆盖矩形、圆形、线条、箭头、文本、图片和 page size。
2. 决定权威保存格式：若采用 OpenPencil 作为高阶编辑器，应倾向新增 OpenPencil-backed runtime，而不是把高级 OpenPencil 文档强行压回现有 `SketchSceneDocument`。
