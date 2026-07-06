# 创作端草图绘图 SDK 方案

## 当前状态

SDK 抽离已完成，创作端接入已暂停。2026-07-05 已完成草图绘图能力 SDK 化、独立 playground、服务端/工具消费迁移、项目文档同步和验证收口；同日因 SDK 仍需较长独立开发周期，author-site 默认下线草图页入口与创作端 AI 暴露面，待 SDK 验收完成后再重新接入创作端。

完成后的当前事实：

- 新增 `@workbench/sketch-core`，作为 `SketchSceneDocument` 协议、校验、patch reducer、binding、几何、命中测试、视觉 hash 和 SVG/HTML 只读渲染权威实现。
- 新增 `@workbench/sketch-react`，提供受控 `SketchPagePreview`、`SketchPageEditor`、selection/history/editor hooks 和只读 `sketch-react/preview` 子入口。
- 新增 `@workbench/sketch-playground`，默认 3400 端口，支持 fixtures、scene/config JSON 调试、完整编辑器和 20/50/100 nodes 性能基线。
- `packages/shared/src/demo/sketch-scene.ts` 与 `packages/demo-ui/src/SketchPagePreview.tsx` 保留兼容 re-export，避免旧导入一次性断裂。
- screenshot-service、viewer-site、project-core 和 project-cli 保留或间接使用 `sketch-core` 协议能力；agent-service 的草图工具实现保留，但默认不注册给创作端 AI。
- author-site 默认不展示新建草图页入口，API 拒绝创建/切换到草图页，AI 工作区上下文过滤草图页。

本文档保留在 `docs/plans/进行中/` 作为本次目标模式验收记录；后续如需归档，可压缩移动到 `docs/plans/已完成/`。

## 目标模式执行说明

新对话开始时，可直接把目标设为：**按 `docs/plans/进行中/创作端草图绘图SDK方案.md` 完整实现草图绘图 SDK：抽出 `sketch-core`、`sketch-react` 和独立 playground，补齐绘图/选择/编辑/撤销重做/配置绑定能力，把 author-site 改为 SDK adapter，并通过单元、组件、浏览器和全仓验证。**

执行规则：

- 先用 CodeGraph 定位 `SketchSceneDocument`、`SketchPagePreview`、`SketchPageEditor`、author-site 草图接入、screenshot-service 和 viewer-site 当前调用点，再动代码。
- 不把 author-site 的项目、会话、版本、发布、AI 工具逻辑塞进 SDK；SDK 只负责 scene 协议、渲染、编辑交互和可测试的绘图状态机。
- 保持 `SketchSceneDocument` 是长期权威数据协议；不能把 Moveable、Selecto、Fabric、Konva 或其他交互库的私有 JSON 作为存储格式。
- 新增 workspace 包时同步根 `package.json`、`pnpm-workspace.yaml`、TS 配置、包导出、测试脚本和全仓验证脚本。
- 每完成一个阶段，更新本文档任务清单、验证状态和剩余风险；不要把过程流水写入长期项目文档。
- 代码行为形成当前事实后，再用 `doc-maintainer` 同步 `docs/项目文档/` 对应模块文档。
- 不回滚或格式化与本任务无关的用户改动；如果 `data/` 有运行时脏文件，只区分并报告，不作为 SDK 交付内容。

## 当前结论

草图页底层协议已经具备第三类页面运行时雏形，绘图功能也已从 `packages/demo-ui/src/SketchPagePreview.tsx` 单组件实现迁移为 SDK。考虑到 SDK 仍需独立打磨，创作端当前按“暂停接入”处理：`demo-ui` 保留兼容入口，实际绘图、编辑状态机和只读预览来自 `sketch-react`，协议与渲染来自 `sketch-core`，但 author-site 和创作端 AI 默认不暴露草图能力。

当前可拆边界已经存在：

| 层级 | 当前位置 | 适合 SDK 化的原因 |
| :--- | :--- | :--- |
| scene 协议 | `packages/sketch-core/src/index.ts` | 纯数据、校验、patch、binding、几何、SVG/HTML 渲染，无 author-site 依赖 |
| React 预览/编辑 | `packages/sketch-react/src/index.tsx`、`packages/sketch-react/src/preview.tsx` | 输入是 `scene/configData/previewSize`，输出是 `onSceneChange` / `onSelectionChange`，保持受控组件 |
| 创作端 adapter | `packages/author-site/src/app/demo/[id]/edit/page.tsx` | 负责 session 保存、截图刷新、页面切换和配置面板，不应进入 SDK |
| 服务端消费 | `packages/screenshot-service`、`viewer-site` | 只读渲染消费 scene，不需要编辑器依赖 |

本次落地不是“把草图页搬到另一个包”，而是建立了可独立开发和测试的绘图内核，让创作端只做宿主适配。

## 产品目标

SDK 化后，用户仍感知为创作端草图页能力升级：

- 草图页可在创作端单页面预览中直接绘制、选择、拖拽、缩放、旋转、编辑文本和样式。
- 草图工具可在独立 playground 中快速开发和回归，不依赖登录、项目、会话、AI 服务或截图服务。
- 同一份 scene 在 SDK playground、author-site、viewer-site 和 screenshot-service 中渲染一致。
- 配置项绑定仍使用 `config.schema.json` + scene node bindings，配置变更能驱动只读预览和编辑态显示。
- 未来钢笔、吸附、对象级协同、AI patch 可围绕 SDK 状态机增量建设，而不是继续扩大 author-site 页面组件。

## 不做范围

首版 SDK 不解决以下问题：

- 不实现 author-site 项目管理、保存版本、发布、截图队列或 AI 会话。
- 不做完整 Figma 替代品，不实现多人实时对象级 CRDT 的最终形态。
- 不引入大型白板产品作为权威存储模型。
- 不要求 playground 具备创作端全部布局和导航。
- 不改现有草图页文件协议，除非迁移脚本和兼容读取同时完成。

## SDK 架构

### 包结构

建议新增三个 workspace 包：

| 包 | 类型 | 职责 |
| :--- | :--- | :--- |
| `@workbench/sketch-core` | 纯 TypeScript | scene 类型、校验、patch reducer、binding、几何计算、命中测试、SVG/HTML 只读渲染 |
| `@workbench/sketch-react` | React 组件库 | `SketchPagePreview`、`SketchPageEditor`、工具栏、选择框、属性面板、快捷键、撤销重做 |
| `@workbench/sketch-playground` | 独立开发应用 | fixtures、调试面板、视觉回归页面、性能基线页面、SDK 手工验收入口 |

`packages/shared` 可继续导出兼容入口，但新代码应优先从 `sketch-core` 引入。迁移期间保留旧导出，避免一次性打断 screenshot-service、viewer-site 和 agent-service。

### 依赖边界

| 包 | 允许依赖 | 禁止依赖 |
| :--- | :--- | :--- |
| `sketch-core` | TypeScript 标准能力、轻量纯函数工具 | React、DOM-only API、author-site、demo-ui、project-core、浏览器全局状态 |
| `sketch-react` | React、`sketch-core`、lucide-react、必要的交互库 | author-site API、session、project-core、screenshot-service |
| `sketch-playground` | `sketch-react`、`sketch-core`、测试 fixtures | 项目真实 `data/` 写入、登录态、发布和 AI 服务 |
| author-site adapter | `sketch-react`、项目 API、截图 hook | 复制 SDK 内部 reducer 或另写一套绘图逻辑 |

### 公共 API

SDK 对外暴露的稳定 API 至少包括：

```ts
type SketchSceneDocument = {
  version: number;
  pageSize: { width: number; height: number };
  nodes: SketchSceneNode[];
  assets?: SketchSceneAsset[];
  bindings?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

function parseSketchSceneDocument(input: unknown): SketchSceneDocument | null;
function validateSketchSceneDocument(input: unknown): SketchSceneValidationResult;
function applySketchScenePatchOperations(
  scene: SketchSceneDocument,
  operations: SketchScenePatchOperation[],
): SketchSceneDocument;
function applySketchScenePatchOperationsWithResult(
  scene: SketchSceneDocument,
  operations: SketchScenePatchOperation[],
): SketchScenePatchResult;
function renderSketchSceneToSvgMarkup(
  scene: SketchSceneDocument,
  configData?: Record<string, unknown>,
): string;
```

React 组件 API 以受控方式为主：

```tsx
<SketchPageEditor
  scene={scene}
  configData={configData}
  previewSize={{ width: 390, height: 640 }}
  mode="edit"
  onSceneChange={setScene}
  onSelectionChange={setSelection}
/>
```

author-site 只负责把 `onSceneChange` 接到 session 保存、截图 invalidation 和页面状态，不直接操作编辑器内部 store。

## 功能目标

### 绘图与对象编辑

首版 SDK 必须覆盖：

- 选择、单选、多选、框选。
- 拖拽、缩放、旋转。
- 对齐、分布、层级调整。
- 矩形、圆形、线条、箭头、文本、图片、便签、按钮、输入框、卡片占位。
- 复制、粘贴、删除、锁定、隐藏。
- 撤销、重做，且每一步是 scene patch，可被测试和审计。
- 对象属性编辑：位置、尺寸、填充、描边、圆角、透明度、文本内容、字号、字重、文字颜色、文字对齐。
- 键盘快捷键：删除、复制粘贴、撤销重做、方向键微调、Shift 等比例缩放。

### 配置绑定

SDK 必须支持：

- 文本、图片、颜色、显示状态和简单枚举绑定。
- 绑定信息写入 node `bindings`，不写入对象名称或自由文本。
- `configData` 改变时，只读预览和编辑态同步反映。
- 编辑器属性面板能展示“该属性已绑定字段”，并允许移除绑定。
- SDK 不直接改 `config.schema.json`；它只通过回调向宿主报告绑定请求。author-site 负责更新 schema。

### 渲染一致性

必须保证：

- `sketch-core` 的 SVG/HTML 渲染是 screenshot-service 和 viewer-site 的共同只读渲染来源。
- `sketch-react` 编辑态使用同一套 scene 解析、binding 和几何规则。
- playground 中的 fixture 与 author-site 中同一 scene 渲染结果一致。
- hash source 只包含影响视觉输出的字段，避免无关 metadata 触发截图重建。

### 独立 playground

playground 至少提供：

- fixture 列表：基础卡片、营销页线框、表单页、图片页、长页面、配置绑定页。
- 左侧 scene JSON 编辑器或调试面板。
- 中间编辑器画布。
- 右侧属性面板和当前 selection 信息。
- 顶部导入/导出 scene、重置 fixture、复制 JSON。
- 性能页面：20/50/100 nodes 渲染、编辑态挂载、连续 patch。
- 视觉回归入口：固定尺寸截图或 DOM snapshot。

playground 可以是内部开发工具，不需要产品化导航。

## 与现有系统的集成策略

### author-site

迁移目标：

- `packages/author-site/src/app/demo/[id]/edit/page.tsx` 只引入 `SketchPagePreview` / `SketchPageEditor`。
- 保留当前页面顶部“编辑/预览/保存”体验。
- `pageSketchMap` 仍由 author-site 维护，但 scene 更新来自 SDK `onSceneChange`。
- 保存时继续写入 `sketch.scene.json` 和 `sketch.meta.json`。
- 切页、刷新、保存、截图 invalidation 行为与当前草图页保持一致。

### demo-ui

迁移目标：

- 从 `packages/demo-ui/src/SketchPagePreview.tsx` 移除实际实现，改为 re-export 或薄 wrapper。
- `CanvasPageItem` 使用 SDK 只读预览，不复制 scene 渲染逻辑。
- 保持现有 `CanvasPageData` 类型兼容。

### shared / screenshot / viewer

迁移目标：

- `packages/shared/src/demo/sketch-scene.ts` 的核心能力迁移或 re-export 到 `sketch-core`。
- screenshot-service 从 `sketch-core` 读取 `buildSketchScenePreviewDocumentHtml` 和 hash helper。
- viewer-site 从 `sketch-react` 或 `sketch-core` 使用只读渲染，不能引入编辑器 bundle。

### agent-service / CLI

迁移目标：

- 草图 AI 工具调用 `sketch-core` patch/validation，不自己维护 patch 规则。
- CLI `page update-sketch` 和 runtime validation 走同一套 `sketch-core` 校验。
- 工具返回的 diagnostics 复用 core validation issue 格式。

## 分阶段计划

### Phase 0：现状梳理与抽包准备

- [x] 用 CodeGraph 梳理草图相关调用点：shared、demo-ui、author-site、screenshot-service、viewer-site、agent-service、project-core、project-cli。
- [x] 建立迁移清单，标记每个调用点迁移到 `sketch-core` 或 `sketch-react` 后的目标导入路径。
- [x] 确认 workspace 包命名、构建方式、测试方式和导出协议。
- [x] 确认 playground 端口，避免与 `3200/3201/3202/3300` 冲突。

阶段完成定义：可以清楚说明每个旧调用点迁移后归属，不存在“先抽出来再说”的模糊范围。

### Phase 1：建立 `sketch-core`

- [x] 新增 `packages/sketch-core`。
- [x] 迁移或复制后替换 `SketchSceneDocument`、node 类型、asset 类型、binding 类型、patch operation 类型。
- [x] 实现 scene parse、validate、normalize、clone、hash source。
- [x] 实现 patch reducer：add/update/remove/reorder/group/ungroup/lock/visibility/binding。
- [x] 实现几何工具：坐标转换、bounds、hit test、selection bounds、resize/rotate transform。
- [x] 实现只读 SVG/HTML renderer。
- [x] 保留 `packages/shared` 兼容 re-export，避免旧包立即断裂。
- [x] 补单元测试：合法 scene、非法 scene、patch 成功/失败、binding、renderer snapshot、hash 稳定性。

阶段完成定义：不依赖 React 和 author-site，`sketch-core` 可以独立通过类型检查和单元测试。

### Phase 2：建立 `sketch-react`

- [x] 新增 `packages/sketch-react`。
- [x] 把 `SketchPagePreview` 改为消费 `sketch-core` renderer 的只读组件。
- [x] 把 `SketchPageEditor` 拆成状态机、画布层、工具栏、选择控制框、属性面板。
- [x] 引入或实现选择/框选/变换交互。若使用 Moveable/Selecto，必须只作为交互层，不进入 scene 存储。
- [x] 支持多选、拖拽、缩放、旋转、层级、删除、复制粘贴、撤销重做。
- [x] 支持基础绘图工具和对象属性编辑。
- [x] 提供 hooks：`useSketchEditorState`、`useSketchHistory`、`useSketchSelection`。
- [x] 补组件测试：添加节点、选择节点、拖拽更新、属性更新、撤销重做、binding 展示。

阶段完成定义：`sketch-react` 能在测试环境中独立编辑 scene，并只通过 `onSceneChange` 输出结果。

### Phase 3：建立独立 playground

- [x] 新增 `packages/sketch-playground`。
- [x] 配置独立 dev/build/test 脚本。
- [x] 建立 fixtures：基础卡片、营销页线框、表单页、图片页、长页面、配置绑定页。
- [x] 实现 fixture 切换、导入导出、JSON 查看、配置数据调试。
- [x] 增加 Playwright 用例：打开 playground、选择 fixture、添加对象、拖拽、修改文本、撤销重做、导出 scene。
- [x] 增加性能脚本：20/50/100 nodes 只读渲染和编辑态 patch 基线。

阶段完成定义：开发者无需启动 author-site，即可完整测试草图绘图能力。

### Phase 4：迁移创作端接入

- [x] `demo-ui` 改为消费 `sketch-react`。
- [x] author-site 单页草图预览改为 SDK 组件 adapter。
- [x] 保留现有草图页创建、保存、刷新恢复、截图 invalidation 行为。
- [x] 画布工作台继续只展示截图或只读草图，不挂载编辑器。
- [x] 更新 E2E：创建草图页、进入编辑、绘制对象、保存、刷新恢复、画布展示。
- [x] 确保现有 `sketch-page-regression.spec.ts` 继续通过。

阶段完成定义：用户在创作端的草图页体验不回退，代码实现已迁移到 SDK。

### Phase 5：迁移服务端与工具消费

- [x] screenshot-service 使用 `sketch-core` renderer/hash。
- [x] viewer-site 使用 `sketch-core` 或只读 `sketch-react` 入口，不能打入编辑器 bundle。
- [x] agent-service 草图工具使用 `sketch-core` patch/validate。
- [x] project-core runtime validation 使用 `sketch-core`。
- [x] project-cli 测试覆盖新导入路径和 update-sketch。

阶段完成定义：所有非编辑消费方都使用同一 core 协议和 renderer，没有重复草图逻辑。

### Phase 6：文档、验证与收口

- [x] 更新本文档进度和验证状态。
- [x] 用 `doc-maintainer` 更新 `docs/项目文档/`：Demo 管理、配置与预览、AI 对话、CLI 或新增 SDK 技术说明。
- [x] 跑完整验证矩阵。
- [x] 清理旧 re-export 或标记兼容层保留期限。
- [x] 明确后续增强项：钢笔锚点、吸附、复杂组件库、对象级 CRDT。

阶段完成定义：SDK 化成为项目当前事实，目标模式任务可归档或压缩为完成摘要。

## 验证矩阵

| 范围 | 命令/验证 | 必须覆盖 |
| :--- | :--- | :--- |
| sketch-core | `corepack pnpm --filter @workbench/sketch-core test` | scene validation、patch、binding、renderer、hash |
| sketch-react | `corepack pnpm --filter @workbench/sketch-react test` | 组件渲染、选择、编辑、撤销重做 |
| sketch-playground | `corepack pnpm --filter @workbench/sketch-playground test` 和 Playwright | fixture 切换、绘图、拖拽、导出、性能页 |
| author-site | `corepack pnpm check:author` | 草图页编辑 adapter、保存、配置联动、文件树 |
| project-core | `corepack pnpm check:project-core` | runtime validation、版本恢复、scene 文件协议 |
| project-cli | `corepack pnpm check:project-cli` | update-sketch、create sketch、switch-runtime |
| screenshot-service | `corepack pnpm check:screenshot` | sketch snapshot input、hash、静态 HTML 渲染 |
| viewer-site | `corepack pnpm check:viewer` | 只读草图页不引入编辑器 bundle |
| agent-service | `corepack pnpm check:agent` | read/patch/create/bind/convert 工具使用 core 校验 |
| 全仓 | `corepack pnpm check:all` | 包导出、类型、跨包导入一致性 |
| 创作端 E2E | `corepack pnpm test:e2e -- sketch-page-regression.spec.ts` | 创建草图页、编辑、保存、刷新恢复 |
| playground E2E | 新增命令 | 不依赖 author-site 的 SDK 独立绘图验证 |
| 性能基线 | 新增脚本 | 20/50/100 nodes 只读渲染、编辑态 patch、首屏挂载 |

如果某项无法运行，必须在本文档“验证状态”记录原因、替代验证和剩余风险。

## 完成定义

只有同时满足以下条件，才能把任务从 `docs/plans/进行中/` 移出：

- `sketch-core`、`sketch-react`、`sketch-playground` 三个包存在并纳入 workspace。
- 现有草图页创作端能力迁移到 SDK 后不回退。
- playground 可独立完成绘图、选择、编辑、撤销重做和 scene 导入导出。
- screenshot-service、viewer-site、agent-service、project-core、project-cli 都使用同一 core 协议能力。
- 配置绑定在只读预览、编辑态、截图和 viewer 中表现一致。
- 新增和既有测试全部通过，至少包括 `check:all`、草图创作端 E2E、playground E2E 和 SDK 单元/组件测试。
- `docs/项目文档/` 已同步当前事实。
- 本文档更新为完成态，或压缩归档到 `docs/plans/已完成/`。

## 待办

- [x] Phase 0：现状梳理与抽包准备。
- [x] Phase 1：建立 `sketch-core`。
- [x] Phase 2：建立 `sketch-react`。
- [x] Phase 3：建立独立 playground。
- [x] Phase 4：迁移创作端接入。
- [x] Phase 5：迁移服务端与工具消费。
- [x] Phase 6：文档、验证与收口。

## 验证状态

已通过。

| 验证 | 结果 |
| :--- | :--- |
| `corepack pnpm check:sketch-core` | 通过，覆盖 scene validation、patch、binding、renderer、hash、geometry、group/ungroup |
| `corepack pnpm check:sketch-react` | 通过，覆盖只读渲染、受控编辑输出、撤销重做 |
| `corepack pnpm check:sketch-playground` | 通过 |
| `corepack pnpm test:e2e:sketch-playground` | 通过，验证 fixture 切换、添加对象、修改文本、导出 scene JSON 和性能入口 |
| `corepack pnpm test:e2e -- sketch-page-regression.spec.ts` | 通过，验证创作端创建草图页、进入编辑、添加文本并保存 |
| `corepack pnpm check:all` | 通过，覆盖新增 SDK 包、project-core、project-cli、agent-service、screenshot-service、author-site、viewer-site 等全仓检查 |

说明：创作端 E2E 首次运行曾卡在已有本地 dev server 的 `/login` navigation，未进入草图流程；确认 `/login` 可访问后重跑通过。

## 风险

已收敛风险：

- 只读 renderer 已统一到 `sketch-core`；viewer 使用 `sketch-react/preview` 只读入口，screenshot-service 直接使用 `sketch-core` HTML/hash。
- 编辑器状态机保持在 SDK 内，author-site 只处理保存、截图 invalidation 和页面状态。
- 未引入大型白板库，存储格式仍是项目自有 `SketchSceneDocument`。
- 新增包均已声明 exports、types、测试脚本并纳入 `check:all`。

后续增强项：

- 钢笔锚点和复杂路径编辑。
- 吸附、智能参考线和更完整的等比例缩放体验。
- 更丰富的组件占位库。
- 对象级 CRDT 和多人实时协同。
- 更细的视觉回归截图基线。
