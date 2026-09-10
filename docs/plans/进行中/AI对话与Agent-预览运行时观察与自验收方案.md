---
covers:
  - packages/shared/src/contracts.ts
  - packages/shared/src/demo/iframe-template.ts
  - packages/demo-ui/src/iframe-types.ts
  - packages/demo-ui/src/iframe-template.ts
  - packages/demo-ui/src/PreviewPanel.tsx
  - packages/demo-ui/src/PrototypePagePreview.tsx
  - packages/ai-chat-shared/src/chat/services/stream-service.ts
  - packages/author-site/src/components/demo/useConsoleBuffer.ts
  - packages/author-site/src/app/demo/[id]/edit/page.tsx
  - packages/author-site/src/app/demo/[id]/edit/hooks/useWorkspaceAuthorityState.ts
  - packages/author-site/src/lib/preview-projection-tracker.ts
  - packages/shared/src/demo/preview-observation.ts
  - packages/shared/src/__tests__/preview-observation.test.ts
  - packages/shared/src/__tests__/preview-observation-replay.test.ts
  - packages/shared/src/__tests__/fixtures/preview-observation/*.json
  - packages/agent-client/src/client.ts
  - packages/demo-ui/src/preview-observation-registry.ts
  - packages/demo-ui/src/SinglePagePreview.tsx
  - packages/demo-ui/src/SinglePagePreview.test.tsx
  - packages/demo-ui/src/preview-stage-types.ts
  - packages/demo-ui/src/preview-observation-registry.test.ts
  - packages/demo-ui/package.json
  - packages/agent-service/src/session/preview-observation-broker.ts
  - packages/agent-service/src/backends/pi-tools/preview-observation-tool.ts
  - packages/agent-service/src/backends/pi-tools/screenshot-tool.ts
  - packages/agent-service/tests/preview-observation-broker.test.ts
  - packages/author-site/src/lib/preview-dependency-policy.ts
  - packages/author-site/src/lib/spine-camera-framing.ts
  - packages/author-site/src/lib/__tests__/spine-camera-framing.test.ts
  - packages/author-site/src/lib/__tests__/preview-runtime-policy.test.ts
  - packages/author-site/src/lib/__tests__/preview-runtime-artifacts.test.ts
  - packages/ai-chat-shared/src/chat/chat-messages.tsx
  - packages/ai-chat-shared/src/tool.tsx
  - packages/agent-service/src/routes/websocket.ts
  - packages/agent-service/src/routes/ws-event-router.ts
  - packages/agent-service/src/session
  - packages/agent-service/tests/unit/run-log-store-preview.test.ts
  - packages/agent-service/tests/unit/tool-hook-manager-preview.test.ts
  - packages/agent-service/src/backends/pi-tools
  - OPS/CLI/src/commands/diagnostics.ts
  - OPS/CLI/src/commands/diagnostics.test.ts
  - OPS/CLI/README.md
  - packages/screenshot-service/src
  - scripts/build-preview-runtime.mjs
  - test/创作端E2E回归测试/preview-observation-browser.spec.ts
  - test/创作端E2E回归测试/support/preview-observation-fixture.ts
---

# AI 对话与 Agent：预览运行时观察与自验收方案

> 状态：P0 基础实现、P1 evaluator/target resolution、RunSummary 脱敏证据摘要（含失败观察的 unavailable 终态）、单轮诊断指标、P2 Spine probe 最小闭环已实施；P1 浏览器验收集（OBS-105）已在真实 Broker Prototype/high-fidelity 用例中完成结构化事实与浏览器实测对照；P4 的 E2 载体决策、截图参数透传和 UI 证据标签已完成；OBS-502 已补齐持久脱敏 facts fixtures 与共享 evaluator replay runner；OBS-501 已补齐跨运行聚合工具。生产 standalone + 真实 Broker 小批量复跑已达到 Prototype/high-fidelity 各 3 次、共 `6 passed`，累计隔离样本为 70 个 Agent run、45 个 observation-bearing run、436 次终态 observation（335 observed、81 stale、20 unavailable、0 unsupported）；随后 commit→projection、编译失败、快速切页、高保真 runtime error、同项目同 Workspace 双标签独立 Session，以及截图服务不可用但 E1 观察仍可用场景均形成真实 Broker 通过证据，最新截图不可用用例为 `1 passed`。OBS-009 仅剩 sleeping 的真实浏览器矩阵与正式样本门槛，P3、OBS-402、OBS-501 正式门槛和 OBS-503 仍待实施。另修复 Prototype 观察注册导致的更新深度回归，并以稳定依赖、回调去重和真实夹具时序约束固化。
> 创建日期：2026-09-09
> 最近评审：2026-09-10
> 文档性质：AI 运行时观察、声明式技术自验证与视觉证据分层方案
> 当前结论：方案适合本项目，projection 真值、预览身份模型和普通单页观察闭环已落地。当前支持发起 Agent run 的浏览器连接中的活动单页、`prototype-html-css` / `high-fidelity-react` DOM 事实，以及 high-fidelity Spine 的受控 runtime probe；Canvas 保留的 sleeping runtime 会明确 fail-closed，不作为活动观察证据。截图工具可显式选择 screenshot-service 的 fast/strict E3 参考渲染，evidence kind 仅保留在 Agent 判断、工具详情和诊断数据中，不在普通聊天区渲染技术状态条。共享包已有不含用户正文的中心/溢出/图片失败/Spine/旧 revision facts fixtures 及 replay runner，可对统一 evaluator 做持久回放。画布深度探测、sandbox 深度探测、sketch、Lottie/Rive 扩展和当前画面像素捕获仍后置。

## 一、背景与问题

AI 已具备受管文件写入、配置契约校验、Workspace Mutation Authority durable receipt、静态运行时校验、控制台读取和可选截图能力。当前缺口不是执行权限不足，而是修改完成后的观察与举证能力不足：AI 容易把“文件已提交”“代码可编译”“当前没有控制台错误”误认为“用户目标已在预览中实现”。

一次动画居中任务暴露了典型问题：AI 修改了外层容器并声称动画已经居中，但实际偏移可能来自播放器内部相机、动画内容边界、Canvas 尺寸、资源状态或旧预览版本。只读取源码、容器矩形和控制台，无法区分“DOM 外框居中”和“实际绘制内容居中”。

独立 screenshot-service 也不天然等于用户正在看的画面：

- 它从 Workspace 文件重新构建页面，浏览器内临时交互状态可能不存在；
- 当前 `appState`、`routeParams`、滚动、宿主缩放和播放器时间点未必被复现；
- 它使用独立 Chromium、资源等待策略和采样时刻；
- `sandboxed-html` 还使用独立 BrowserContext 与离线安全策略；
- 编译、浏览器启动、资源稳定、PNG 编码、缓存和 Base64 回传不适合作为每次普通修改后的默认成本。

因此，本方案把用户当前预览实例建设为一个受控、可查询、可绑定 render identity 的运行时事实面；截图继续承担像素参考和离线渲染职责。

## 二、评审结论与设计原则

### 2.1 总体判断

“结构化原位观察默认、像素证据按需、独立参考渲染低频”的方向正确，能够复用现有预览、Authority、WebSocket、控制台和播放器能力，且比默认截图更低成本。

现方案实施时必须遵守以下原则：

1. **身份先于采集**：没有 project、workspace、connection、page、surface、preview instance、render generation 和 revision 的一致身份，不返回成功观察。
2. **持久事实与瞬时证据分离**：`committed` 是持久事实；`projected`、`observed` 和 assertion evidence 都是绑定具体 render identity 与时间点的瞬时证据，不组成永久单调状态机。
3. **观察发起连接，不猜“全局当前页面”**：只查询发起本次 Agent run 的 WebSocket 连接所注册的活动预览；多标签页不得按 session 随机选择。
4. **能力显式协商**：每种 runtime 返回 capability 列表；不支持的断言返回 `unsupported`，不伪装成失败或不确定。
5. **声明式、有界断言**：不允许任意 JavaScript、任意 selector 或表达式；近似算法必须标记 evidence precision，不能称为确定性像素证明。
6. **一个协议、一个评估器**：共享 observation envelope、运行时校验器和 assertion evaluator；runtime adapter 只采集事实，不各自演进断言语义。
7. **按需调用**：首版不在每次 commit 后自动采集。Agent 只有在任务需要运行效果证明时调用 `observePreview`。
8. **截图职责不混淆**：current-surface pixels 与 reference render 永远使用不同 evidence kind 和完成措辞。

### 2.2 术语

本方案不使用 L1/L2/L3 表示证据等级，避免与 AI 行为约束中的 L1-L5 权限、提示、上下文、记忆和确认层冲突。

| 术语                        | 含义                                                                  |
| --------------------------- | --------------------------------------------------------------------- |
| E1 `runtime-structure`      | 当前预览实例的 DOM、布局、资源、错误和播放器结构化事实                |
| E2 `current-surface-pixels` | 来自当前浏览器 compositor、严格裁剪到目标预览 surface 的像素证据      |
| E3 `reference-render`       | screenshot-service 在独立浏览器中重新渲染得到的参考图                 |
| render identity             | 唯一定位一次预览渲染的页面、实例、generation、revision 和宿主连接身份 |
| assertion evidence          | 某一 render identity、采样时间和精度下的断言结果                      |

### 2.3 非目标

- 不以 Agent 技术自验证替代用户的业务、审美和交互体验验收。
- 不允许 Agent 执行任意页面 JavaScript、任意 CSS selector 或读取任意全局变量。
- 不观察非活动页、其他标签页、其他 session 或其他项目。
- 不把完整 DOM、页面源码、用户输入或普通 observation 原文建设为长期日志。
- 不为 observation 放宽 `sandboxed-html` 的独立 origin、execution ticket、CSP 或 Permissions-Policy。
- 不在本方案内建设完整的跨浏览器视觉回归平台。

## 三、现状与可复用能力

当前具备的是“观察原语”，不是完整的 Agent 观察能力。

| 能力               | 当前事实                                                                                   | 复用边界                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| iframe 生命周期    | 已有 `READY`、`LOADED`、`COMPONENT_READY`、`RUNTIME_ERROR`、`RESIZE`                       | 部分事件带 preview request ID，但还没有统一 observation ID 和 render identity |
| DOM 节点信息       | iframe 和 `PrototypePagePreview` 都能读取 path、rect、样式、属性和源码位置                 | 现有函数服务视觉编辑，未形成稳定 observation adapter                          |
| 节点树/缩略布局    | 已有 `COLLECT_VISUAL_NODE_TREE` 和 `COLLECT_THUMBNAIL_LAYOUT`                              | 请求和响应缺少严格请求身份；不能直接作为 Agent 观察协议                       |
| 控制台链路         | author-site 已通过 WebSocket 向 agent-service 转发日志，`getConsoleLogs` 已可调用          | 当前按 session 聚合，没有 page、revision、request 身份                        |
| Authority receipt  | 已能证明 mutation durable commit                                                           | 不能证明浏览器已渲染或用户目标已满足                                          |
| projection 基础    | 有 surface 级 tracker、Authority ack contract 和 RunSummary                                | 当前 tracker 语义与调用链不足以证明 page/request 级真实投影，必须先修正       |
| Spine framing      | `SpinePlayer` 已使用 `skeletonObj.getBounds()` 计算相机并通过 canonical probe 暴露受限快照 | skeleton/painted bounds 仍不等于 compositor 像素边界                          |
| screenshot-service | 已支持独立 Chromium、缓存、批量和 fast/strict 产物                                         | 属于 E3 reference render，不证明当前用户 surface                              |

### 3.1 projection 前置缺口（已闭合）

P0 实施已将 `PreviewProjectionTracker` 拆为 `committedRevision` 与 `projectedRevision` 两条事实轴：`onCommitted()` 只推进 committed baseline 并失效受影响 surface，`ackPreview()` 只接受精确匹配当前 committed revision。高保真 iframe 与 Prototype 的 render callback 携带冻结的 `previewInstanceId`、`renderGeneration` 和 Authority revision，编辑页在真实内容加载后才向 Authority 发送 projection ack；过期 generation、旧 revision 或未提交 revision 不会覆盖当前 projected 状态。因此 observation 可以在 matching projection ack 之后作为指定 render identity 的瞬时证据，仍不等同于用户业务验收。

## 四、首版范围与 runtime 支持矩阵

### 4.1 已确定的首版边界

- 只支持 `active-single-page`。
- 只观察发起当前 Agent run 的连接，不跨标签页选择预览。
- observation 仅按需调用，不自动跟随每次 commit。
- 默认无 target 时返回页面摘要；不默认读取当前选区，不默认传输整棵节点树。
- target 首版支持稳定 node ID；源码位置查询返回候选列表，歧义时不得自动选择。
- 首版不提供 E2 current-surface pixel capture。
- 普通 observation 原文不持久化；长期诊断只保留脱敏摘要。

### 4.2 runtime 矩阵

| runtime               | P0/P1 支持                                                      | 后续方向                                                       |
| --------------------- | --------------------------------------------------------------- | -------------------------------------------------------------- |
| `prototype-html-css`  | 完整 E1 DOM/布局观察，使用 Shadow DOM adapter                   | 按指标扩展局部视觉事实                                         |
| `high-fidelity-react` | 完整 E1 DOM/布局观察，使用 iframe bridge；P2 已接入 Spine probe | 其他播放器按指标接入                                           |
| `sandboxed-html`      | 只返回宿主已知生命周期、iframe rect 和 `limited` capability     | P3 单独设计受控跨源 probe bridge，禁止放宽 origin/ticket 隔离  |
| `sketch-scene`        | 显式返回 `unsupported_runtime`                                  | P3 由 sketch runtime 提供原生 scene adapter，不伪装成 DOM 观察 |

画布中的当前选中页不属于首版。P3 若接入，必须复用相同协议和 evaluator，只新增 surface registry/坐标投影 adapter。

## 五、目标架构

```text
observePreview Agent tool
  → agent-service ObservationBroker
  → 发起本次 run 的 connection-scoped LivePreviewChannel
  → author-site PreviewObservationRegistry
  → 当前 active-single-page runtime adapter
  → PREVIEW_OBSERVATION_FACTS
  → ObservationBroker 校验身份、容量与 schema
  → 共享 assertion evaluator
  → Agent 小型结构化结果
```

### 5.1 分层职责

| 层                        | 职责                                                                           | 明确不做                                         |
| ------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------ |
| runtime adapter           | 在浏览器本地解析 target，采集 viewport、DOM、资源和 runtime probe 事实         | 不认识 Agent、session、Authority；不决定完成措辞 |
| author registry           | 注册当前页面/runtime/surface，冻结 render identity，路由 iframe/Prototype 请求 | 不保存长期 observation，不选择其他标签页         |
| LivePreviewChannel        | 把当前 Agent run 与具体 WebSocket connection 绑定，发送请求和接收响应          | 不以 session 猜测“当前连接”                      |
| ObservationBroker         | 管理 pending request、超时、断连、迟到响应、容量、权限和身份匹配               | 不读取跨项目任意页面，不回退旧缓存               |
| shared contract/evaluator | 定义 envelope、capability、状态轴、大小限制和纯断言语义                        | 不读取 DOM，不依赖 React/Next/Fastify            |
| Agent tool                | 提供一个稳定的 `observePreview` schema，压缩结果供模型消费                     | 不暴露任意 JS、任意 selector 或整页源码          |

### 5.2 协议来源

新增共享的 preview observation 模块，作为以下内容的唯一事实源：

- protocol/schema version；
- request、facts、result 和 capability 类型；
- runtime guards、脱敏规则和容量常量；
- assertion input/result 与纯 evaluator；
- evidence kind/precision 枚举。

`packages/demo-ui/src/iframe-template.ts`、`PrototypePagePreview` 和未来 sandbox/sketch adapter 只实现采集。`packages/shared/src/demo/iframe-template.ts` 当前由 screenshot-service 使用，必须明确保持 E3 reference-render 职责；若复用 observation collector，只能从共享事实源生成，禁止手工复制协议。

`@preview/sdk` 的播放器实现以 `packages/author-site/src/lib/preview-dependency-policy.ts` 为 canonical source。修改 probe 后必须运行 `pnpm build:preview-runtime`，同步 author/viewer 产物、manifest version 和 artifact contract tests，不直接编辑生成后的 vendor 文件。

## 六、身份与 projection 真值模型

### 6.1 两类身份分离

Authority projection ack 继续表示可持久化的 workspace surface 投影事实；preview observation 使用更细的短期 render identity。不要把 preview request ID、浏览器 connection ID 等易变字段全部塞进 durable Authority journal。

建议结构：

```ts
interface PreviewRenderIdentity {
  schemaVersion: 1;
  projectId: string;
  workspaceId: string;
  pageId: string;
  runtimeType: string;
  surface: "active-single-page";
  previewInstanceId: string;
  renderGeneration: number;
  revision: number;
  rootHash?: string;
}

interface ObservationTransportIdentity {
  observationId: string;
  runId: string;
  connectionId: string; // Broker 内部使用，不返回给模型
  requestedAt: number;
}
```

`previewRequestId` 可继续作为组件内部 generation 来源，但必须与 `previewInstanceId` 组合，不能在不同 iframe/页面实例间单独作为唯一身份。

### 6.2 render identity 冻结时机

1. Authority mutation 返回 committed receipt。
2. author-site 从对应 revision/rootHash snapshot 刷新页面资源。
3. 创建新的 `renderGeneration`，冻结 page/runtime/revision/rootHash。
4. 通过 `UPDATE_CODE` / `UPDATE_CONFIG` 或 Prototype adapter 把 generation 交给实际渲染实例。
5. 只有匹配 generation 的 `LOADED` / `COMPONENT_READY` 才能产生 projected evidence 和 Authority projection ack。
6. observation response 必须回显同一 render identity；Broker 与请求期望不一致时返回 `stale`。

### 6.3 多标签页与重连

- 每次 Agent run 固定一个 originating connection。
- connection 关闭时立即取消其 pending observations。
- 重连产生新 connection identity；旧响应一律丢弃。
- 同一 session 的另一个标签页不能接管正在运行的 observation。
- 浏览器页面隐藏、预览 sleeping、活动页面切换或 runtime 重建时，registry 主动让旧 preview instance 失效。

## 七、`observePreview` 工具契约

### 7.1 输入

```ts
interface ObservePreviewInput {
  pageId?: string;
  target?:
    | { nodeId: string }
    | { sourceFile: string; sourceLine?: number }
    | { selectedElement: true };
  detail?: "summary" | "layout" | "runtime" | "media";
  includeAncestors?: boolean;
  assertions?: PreviewAssertion[];
  timeoutMs?: number;
}
```

约束：

- `pageId` 省略时使用 originating connection 当前活动单页；显式 pageId 不是跨页读取授权，只有它恰好是活动页时才可观察。
- 默认无 target，返回页面摘要。`selectedElement` 必须显式请求，且只读取 registry 当前选区快照。
- 源码位置可能对应多个 DOM 节点；返回 `ambiguous` 与有限候选，不按 DOM 顺序猜测。
- `timeoutMs` 由服务端限制，建议默认 5 秒、最大 10 秒。

### 7.2 结果状态轴

```ts
interface PreviewObservationResult {
  availability: "observed" | "stale" | "unavailable" | "unsupported";
  readiness: "ready" | "partial" | "runtime-error";
  identity?: PreviewRenderIdentity;
  observedAt?: number;
  capabilities: PreviewObservationCapability[];
  targetResolution?: "resolved" | "not-found" | "ambiguous" | "unsupported";
  viewport?: PreviewViewportFacts;
  target?: PreviewObservedNode;
  ancestors?: PreviewObservedNode[];
  runtime?: PreviewRuntimeSummary;
  assertions: PreviewAssertionResult[];
  assertionStatus:
    | "not-requested"
    | "passed"
    | "failed"
    | "uncertain"
    | "unsupported";
  evidence: {
    kind: "runtime-structure" | "current-surface-pixels" | "reference-render";
    precision:
      | "layout"
      | "runtime-self-reported"
      | "painted-bounds"
      | "compositor"
      | "reference";
  };
  reasons?: string[];
}
```

状态规则：

- observation 没有 assertions 时只能是 `assertionStatus=not-requested`，不能叫 passed。
- transport unavailable、身份 stale、runtime error 和 assertion failed 分别表达，禁止压成一个 status。
- runtime 整体不支持 observation 时使用 `availability=unsupported`；单项能力不支持时保持 observed，并把对应 assertion 标为 unsupported。
- 多条 assertion 有通过也有失败时，整体为 failed，同时保留每条结果。
- assertion evidence 必须包含采样时间、实际值、期望值、容差、capability 和 precision。
- `painted-bounds-centered` 额外保留有限的 `containerRect`、`paintedBounds` 和 `skeletonBounds`，使 DOM 参照与播放器内容边界可并列审计；这些几何值仍不是 compositor 像素。
- E3 reference render 永远保持 `kind=reference-render`，不能映射为 current-surface pixel verified。

### 7.3 首版事实字段

页面摘要：

- viewport、DPR、scroll、设计视口和宿主缩放；
- document/body/root 的 client、scroll 和 bounding 尺寸；
- readyState、字体状态、目标相关图片状态；
- 当前 render generation 内的 runtime error/console error 数量；
- 横向/纵向溢出；
- runtimeType 和 capabilities。

目标节点：

- node ID、ID 稳定性、DOM path、源码候选和组件名；
- layout rect、client rects、transform 和 transform origin；
- display、visibility、opacity、position、z-index、overflow 和 clip-path；
- 截断后的文本、aria、脱敏 URL、图片 natural size；
- 相对 viewport 和父节点的中心偏移；
- 有限祖先裁剪链。

首版不默认采集整棵树，不把表单值、contenteditable 草稿或完整 URL query 送往 agent-service。

### 7.4 容量与隐私默认值

所有限制集中在共享常量中，后续只根据指标调整：

- request JSON：最大 16KB；
- response JSON：最大 64KB；
- target 候选：最多 8 个；
- ancestors：最多 12 层；
- 单节点文本：最多 256 字符；
- 单连接并发 observation：最多 4 个；
- 进程总 pending observation：最多 256 个；
- 默认超时 5 秒，最大 10 秒；
- 迟到响应不缓存、不复用；
- input/textarea/select 值、contenteditable 草稿、Cookie、storage、token、请求头和任意页面全局变量一律不采集；
- URL 去除凭证和 query 原文；如需身份只返回 origin/path 与 query hash；
- RunSummary 和长期诊断只保存 identity 摘要、assertion 类型/结果、耗时、大小和错误码。

## 八、声明式断言

### 8.1 P1 首批断言

- `exists`
- `visible`
- `centered`：相对 viewport、父节点或稳定 node ID，layout precision
- `inside`
- `no-horizontal-overflow`
- `size-range`
- `text-equals` / `text-contains`
- `image-loaded`
- `runtime-ready`
- `no-runtime-errors`

每条断言必须定义空节点、零尺寸、非有限数值、transform、滚动和容差的边界行为。`visible` 首版只表示布局与样式可见，不等于未被其它元素遮挡。

### 8.2 后置或近似断言

- `fully-visible`
- `not-clipped`
- `not-occluded`
- `animation-playing`
- `animation-name`
- `loop-enabled`
- 媒体 painted bounds 居中

有限 `elementsFromPoint()` 采样只能返回 `approximate`；持续动画使用短窗口多次采样并报告时间范围；不支持的 runtime probe 返回 unsupported。近似断言不能升级为 compositor precision。

### 8.3 evaluator 位置

浏览器 adapter 负责采集浏览器事实，agent-service 使用共享纯 evaluator 计算断言。这样可以避免不同 runtime 自行解释 `centered`、`visible` 等语义，也能用保存的脱敏 facts fixture 做稳定回放测试。客户端 facts 仍视为不可信输入，服务端必须执行 schema、数值范围、URL、文本和容量校验。

## 九、播放器与复杂绘制

### 9.1 probe registry

canonical `@preview/sdk` 已提供内部 probe registry，播放器挂载时注册、卸载时注销。registry 只提供受限 inspect snapshot，不暴露纹理、动画原始数据或用户资源正文。

同一 iframe realm 中的页面代码理论上可以伪造或干扰自报告数据，因此播放器 probe 的 evidence precision 必须是 `runtime-self-reported` 或 `painted-bounds`，并由宿主校验所有 bounds 均为有限值且落在合理 canvas/container 范围内。它不是安全边界，也不是 compositor 证明。

### 9.2 接入顺序

1. 先接 Spine：复用 skeleton bounds、camera、fit、alignment、track、loop 和 canvas 尺寸。
2. 用真实 observation 指标判断是否接 Lottie 和 Rive。
3. 普通 Canvas/WebGL 只暴露 CSS/backing-store 尺寸及调用方主动登记的 content bounds；无法推导内容时返回 unsupported/uncertain。

Lottie animation data 尺寸、Rive artboard 尺寸和 Spine skeleton bounds 都不能直接称为实际可见像素边界。完成措辞必须遵循对应 precision。

## 十、视觉证据分层

### 10.1 E1：runtime structure，默认

适用于存在性、布局、尺寸、溢出、图片加载、运行错误及已接入播放器的结构状态。普通修改后的 Agent 技术自验证默认使用 E1。

### 10.2 E2：current-surface pixels，独立研究门

只有来自当前浏览器 compositor，并能严格裁剪到预览 surface 的像素，才能标记为 E2。DOM 转 Canvas、SVG `foreignObject` 或独立 Puppeteer 都不能冒充 E2。

E2 不纳入首版承诺。OBS-401 ADR 的当前决策是暂不实现：现有 author-site/agent-service 没有能证明用户当前 compositor surface 的安全载体；浏览器扩展或桌面壳层若重启该方向，必须另行评估裁剪坐标、DPR/缩放、浏览器权限、用户可见提示和敏感 UI 泄露风险。

### 10.3 E3：reference render，保留

screenshot-service 继续用于：

- 无活动预览时的离线参考；
- 项目卡片和批量缩略图；
- 多 viewport 检查；
- 发布前严格参考渲染；
- 需要持久产物或跨会话比较的场景。

Agent `captureScreenshot` 当前透传 screenshot-service 已有的 fast/strict render mode，结果始终是 E3；region 语义只有在未来 E2 载体与 screenshot-service contract 同时成立后才能增加。

## 十一、完成措辞与 RunSummary

| 证据                       | Agent 可以声明                       | 不得声明               |
| -------------------------- | ------------------------------------ | ---------------------- |
| committed receipt          | 修改已提交                           | 预览已更新、效果已实现 |
| matching projection ack    | 指定 revision 已进入目标预览 surface | 用户目标已满足         |
| E1 observed，无 assertions | 已读取当前运行状态                   | 已自行验证通过         |
| E1 assertions passed       | 指定结构/布局条件已通过技术自验证    | 审美或像素效果已验收   |
| E2 compositor evidence     | 当前 surface 的对应像素证据已检查    | 用户业务验收已完成     |
| E3 reference render        | 独立参考渲染已检查                   | 这就是用户当前画面     |

RunSummary 不新增一个模糊的 `asserted: true`。它保存有界 evidence summary：render identity 摘要、观察时间、evidence kind/precision、断言类型与结果、stale/unavailable 原因。原始节点和像素不进入长期 run log。

用户继续保留业务、审美和交互体验的最终验收权。

## 十二、实施阶段与任务拆解

### P0：projection 真值与最小单页闭环

目标：在不依赖 screenshot-service 的情况下，让 Agent 对 originating connection 当前活动单页取得可信 E1 摘要。P0 不交付画布、深度 sandbox、sketch、播放器或像素能力。

- [x] **OBS-001 共享协议与容量边界**
      新增 preview observation contract、runtime guards、schema version、capability、identity、状态轴和集中容量常量。
      主要范围：`packages/shared/src/`、shared exports、contract tests。
      依赖：无。
      验收：畸形 identity、超大文本、非有限 rect、危险 URL 和超限 payload 均 fail closed。

- [x] **OBS-002 修正 projection tracker 语义**
      将 committed baseline 与真实 projected revision 分开；实际 render 完成后调用 Authority projection ack；ACK revision 来自冻结的 render identity，不再读取可能已变化的全局 ref。
      主要范围：`preview-projection-tracker.ts`、`useWorkspaceAuthorityState.ts`、编辑页和 shared contracts。
      依赖：OBS-001。
      验收：commit 后未渲染保持 pending；旧 render 完成不能 ACK 新 revision；RunSummary 只在真实匹配 ACK 后显示 applied。

- [x] **OBS-003 render identity 贯穿预览链路**
      为 high-fidelity iframe 和 Prototype adapter 建立 `previewInstanceId + renderGeneration + revision/rootHash`；生命周期响应回显 generation。
      主要范围：`iframe-types.ts`、`iframe-template.ts`、`PreviewPanel.tsx`、`PrototypePagePreview.tsx`、编辑页。
      依赖：OBS-001、OBS-002。
      验收：快速切页、重复编译、配置更新和 iframe 重建均不会让旧响应命中新实例。

- [x] **OBS-004 typed auxiliary WebSocket channel**
      在 `StreamService` 和 agent-service WebSocket 协议中增加类型化 preview registration/request/result 消息；console 转发改用正式方法，不再从 hook 通过 `any` 访问私有 `ws`。
      主要范围：`ai-chat-shared` StreamService、`useConsoleBuffer`、`websocket.ts`、`ws-event-router.ts`。
      依赖：OBS-001。
      验收：observation 与 console/Agent stream 可并行传输；消息有大小限制；协议错误不终止正常 Agent stream。

- [x] **OBS-005 connection-scoped PreviewObservationRegistry**
      author-site 注册当前活动单页及 runtime adapter，页面隐藏、切换、sleeping、卸载和重建时失效旧实例。
      主要范围：author-site 编辑页、demo-ui preview 组件。
      依赖：OBS-003、OBS-004。
      验收：同 session 两个标签页各自只响应自己发起的 run；非活动 pageId 返回 unavailable。

- [x] **OBS-006 有界 ObservationBroker**
      建立 pending request registry、originating connection 绑定、超时、AbortSignal、断连清理、迟到响应丢弃和进程容量淘汰。
      主要范围：`packages/agent-service/src/session/`、WebSocket route。
      依赖：OBS-004。
      验收：超时、断连、重连、重复 response、错误 connection 和错误 identity 都返回稳定错误且无 pending 泄漏。

- [x] **OBS-007 最小 runtime facts collector**
      为 Prototype 和 high-fidelity React 提供 page summary、单 target、有限 ancestors、图片状态、overflow 和 runtime error facts。默认不采集整树。
      主要范围：demo-ui runtime adapters。
      依赖：OBS-001、OBS-003、OBS-005。
      验收：表单值/contenteditable/完整 URL query 不出现在结果；sandbox 返回 limited，sketch 返回 unsupported。

- [x] **OBS-008 `observePreview` Agent 工具**
      注册单一工具，通过 Broker 请求当前连接；工具归入 workspace capability，但与 screenshot health 完全解耦。
      主要范围：agent-service `pi-tools`、PiAgent 工具依赖注入与 capability directory。
      依赖：OBS-006、OBS-007。
      验收：screenshot-service/Chromium 不可用时工具仍存在；无活动预览时快速返回 unavailable。

- [ ] **OBS-009 P0 集成验收**
      覆盖 commit→真实 projection→observe、旧 revision、快速切页、多标签页、sleeping、编译失败、runtime error 和截图服务不可用。
      依赖：OBS-001 至 OBS-008。
      验收：普通单页可以形成可信的 `committed + matching projected + observed` 证据链。

### P1：基础断言、完成措辞与诊断

目标：让 Agent 能对普通 DOM/SVG 布局目标完成有边界的技术自验证。

- [x] **OBS-101 共享 assertion evaluator**
      实现首批断言、容差、边界值、precision 和 unsupported 规则；使用脱敏 facts fixtures 回放。
      依赖：P0。
      验收：每种断言覆盖 transform、滚动、零尺寸、缺失 target 和非有限数值。

- [x] **OBS-102 target resolution**
      实现 node ID、显式 selected element 和 source location candidates；歧义时返回候选，不自动选择。
      依赖：OBS-007、OBS-101。
      验收：DOM path fallback 标记为 unstable；页面重渲染后不能把旧 unstable ID 当成稳定身份。

- [x] **OBS-103 RunSummary 与完成措辞**
      写入有界 evidence summary，更新 Agent system prompt 和前端展示；严格区分 committed/projected/observed/assertion passed/E3 reference。
      依赖：OBS-101。
      验收：无 assertions 不显示“验证通过”；reference screenshot 不显示“当前画面已验证”。

- [x] **OBS-104 诊断摘要与指标**
      记录 observation latency、payload bytes、stale/unavailable/timeout 率、assertion 类型和结果；不记录节点树、文本、URL 或输入值。
      依赖：P0。
      验收：诊断导出不包含 observation 原文，且可按 project/session/run/identity 摘要定位失败阶段。

- [x] **OBS-105 P1 浏览器验收集**
      覆盖中心、四角、滚动、transform、overflow、display/visibility/opacity、图片失败和运行时错误。
      依赖：OBS-101 至 OBS-104。
      验收：真实 Broker 浏览器用例已对中心、四角、滚动目标、transform、overflow ancestor、display/visibility/opacity、失败图片执行结构化结果与 `getBoundingClientRect()`/computed style 对照；high-fidelity runtime-error 用例确认错误事实与 `no-runtime-errors=failed`。首批证据均为 E1 runtime structure，不把近似渲染升级为确定规则。

### P2：Spine 与复杂绘制最小闭环

目标：解决“播放器外框正确但动画内容偏移”的首个高价值场景。

- [x] **OBS-201 canonical probe registry**
      在 `@preview/sdk` canonical source 建立 WeakMap/受限 snapshot registry，定义注册、注销、capability 和数据校验。
      依赖：P1。
      验收：组件卸载、热更新和页面切换无残留 probe；任意非有限/超界 bounds 被拒绝。

- [x] **OBS-202 Spine probe adapter**
      暴露 ready、animation、loop、track time、skeleton bounds、camera、fit/alignment、canvas CSS/backing-store 尺寸和投影后的 painted bounds。
      依赖：OBS-201。
      验收：不同 skeleton bounds、viewport 比例、fit/alignment 和动画帧下均返回带时间范围和 precision 的结果。

- [x] **OBS-203 媒体断言**
      增加 animation-playing/name/loop 和 painted-bounds centered，明确 runtime-self-reported/painted-bounds 精度。
      依赖：OBS-202。
      验收：无 probe 时返回 unsupported，不回退 DOM 外框并声称动画内容居中。

- [x] **OBS-204 runtime 产物同步与验收**
      运行 preview runtime 构建，同步 author/viewer artifact 与 manifest version，补 canonical extraction/artifact tests 和浏览器对照。
      依赖：OBS-201 至 OBS-203。
      验收：author、viewer、published runtime 使用同一 probe 行为；生成产物无手工漂移。

### P3：runtime 与 surface 扩展，按指标进入

- [ ] **OBS-301 active canvas page adapter**：为画布当前选中且真实活动的 iframe/Prototype 页建立 surface registry 和宿主坐标换算。
- [ ] **OBS-302 sandbox probe bridge**：在独立 origin/ticket 模型不变的前提下输出白名单 facts；无法安全实现时维持 limited。
- [ ] **OBS-303 sketch scene adapter**：直接观察 scene/document/renderer 状态，不通过 DOM 模拟。
- [ ] **OBS-304 Lottie probe**：仅在指标证明需求后接入 frame/loop/renderer/artboard facts。
- [ ] **OBS-305 Rive probe**：仅在指标证明需求后接入 artboard/state machine/fit/alignment facts。

每项必须独立验收，不能为了“统一支持”一次性扩张所有 runtime。

### P4：像素与截图职责收敛

- [x] **OBS-401 E2 载体 ADR**：评估浏览器扩展、桌面壳层或暂不实现；记录权限、裁剪、DPR、缩放、敏感 UI 和用户提示边界。
      决策：当前版本暂不实现 E2。现有 author-site/agent-service 链路没有能证明“用户正在看的 compositor surface”的安全载体；screenshot-service 只能生成 E3 reference render。浏览器扩展或桌面壳层若要接入，必须另立产品与安全评审，明确截图权限、surface/region 裁剪、DPR 与缩放、浏览器敏感 UI 排除、用户提示和数据留存；在该评审通过前不得用 DOM/Canvas 外框或独立 Chromium 输出冒充 E2。
- [ ] **OBS-402 current-surface crop identity**：只有 ADR 通过后实现 viewport/surface/region 与 render identity 绑定。
- [x] **OBS-403 captureScreenshot 参数收敛**：向 Agent 工具透传 screenshot-service 已有 fast/strict，按需增加 region；所有结果保持 E3。
      当前实现透传 `renderMode: fast|strict`，并让图片读取 URL 与结果 URL 带同一 `variant`；截图工具的结果和摘要明确声明 `reference-render`/E3。当前 screenshot-service 没有 region contract，因此不新增虚假的裁剪参数。
- [x] **OBS-404 UI 证据标签**：清晰区分 runtime structure、current-surface pixels 和 reference render。
      RunSummary 和工具结果展示使用 `E1 运行时结构`、`E2 当前画面像素`、`E3 参考渲染` 标签；没有对应 evidence kind 时不显示标签，不会把 E3 或 E1 升格为 E2。

### P5：数据驱动优化

- [ ] **OBS-501 指标复盘**：观察调用率、P50/P90、payload、timeout、stale、断言失败和修复成功率。已补齐诊断 CLI 对脱敏 `agent-run-logs` 的只读跨运行聚合（`previewObservations`，含 Agent run 分母、observation 调用率、P50/P90、状态/断言/evidence 分布和明确定义的技术修复成功率），但当前样本量不足，尚未完成正式复盘与扩展门槛决策。
- [x] **OBS-502 回放集**：在 `packages/shared/src/__tests__/fixtures/preview-observation/` 保留不含用户正文的中心、溢出、图片失败、Spine 和旧 revision facts fixtures；`preview-observation-replay.test.ts` 逐个经 schema guard、共享 evaluator 和 result envelope 回放，并显式检查旧 revision 只作为 stale 输入保留。
- [ ] **OBS-503 扩展决策**：只有指标证明必要时扩大整树、播放器、sandbox、canvas 或 E2 能力；在 OBS-501/502 完成前不扩张 runtime 或像素范围。

#### OBS-501/OBS-503 当前审计与最小后续采样方案（2026-09-10）

- **样本边界**：截至本次审计，仓库 `data/agent-run-logs` 在 2026-09-09 的历史窗口有 19 个 Agent run、0 次 `observePreview`；这些 run 发生在观察链路的真实浏览器验证前，只能作为调用率分母基线，不能解释为 observation 功能上线后的采用率。隔离临时 `DATA_DIR` 中当前保留 70 个 Agent run，其中 45 个 run 发起 observation，累计 436 次终态 observation；共享 facts fixtures/replay 只验证协议与 evaluator，不计入运行样本。
- **样本质量**：最新真实 Broker 生产 standalone 小批量（Prototype/high-fidelity 各 3 次，`6 passed`）与同一隔离账本聚合显示：436 次终态 observation 中 335 次 `observed`、81 次 `stale`、20 次 `unavailable`、0 次 `unsupported`；断言结果 156 passed/139 failed，timeout 0。延迟 P50/P90 为 10/27ms，payload P90 为 2309B；技术修复 eligible 20 次、成功 15 次。Prototype/high-fidelity 各累计 10 个 run，完整旧 revision/快速切页/多标签/sleeping/编译失败/截图不可用矩阵尚未覆盖，故仍不能代表完整跨 runtime 或 evidence kind。
- **结论**：样本已达到 100 次 observation 与两类 runtime 各 10 个 run 的数量下限，并新增真实 high-fidelity runtime-error 及 stale→最新注册重试证据；但 timeout/unsupported 均为 0，且失败类别与异常矩阵未按正式门槛采齐，尚不足以给出跨 runtime 的正式质量结论，也不足以证明扩大 runtime、整树或像素范围的必要性。OBS-503 保持“暂不扩展”的暂定决策；它不是“已证明无需扩展”，而是“没有足够需求/质量证据改变首版边界”。E2 仍受 OBS-401 ADR 独立约束。
- **建议进入门槛（提案）**：先收集至少 30 个 observation-bearing Agent runs、100 次终态 observation，并至少覆盖 `prototype-html-css` 与 `high-fidelity-react` 各 10 个 run；其中 stale、timeout/unavailable、unsupported、断言失败各至少 5 次（可在受控浏览器验收集中产生）。在这批样本上，身份/状态/耗时/payload 字段完整率应为 100%，敏感字段泄露为 0；再以 stale+timeout/unavailable 比例、断言失败率和 P90 latency 与首版基线比较。任何扩展还必须同时有明确产品需求；单靠 unsupported 计数不能自动放宽隔离或引入 E2。
- **最小采样操作**：在全新浏览器上下文和可复查的隔离 `DATA_DIR` 中执行 commit→projection→observe、无 mutation 观察、快速切页/旧 generation、断连或 sleeping、编译失败/runtime error、sandbox/sketch unsupported 等场景；每次确认脱敏 run log 产生终态摘要，再运行 `diagnostics:preview`/`diagnostics:export` 检查 `diagnostics.eventGapDetected`、`previewObservations` 分母/分位和敏感字段扫描。完成上述样本后再复盘 OBS-501，并决定 OBS-503 是否拆出具体的 P3 适配器。

## 十三、阶段依赖与建议提交顺序

```text
OBS-001
  ├─ OBS-002 ─ OBS-003 ─ OBS-005 ─ OBS-007 ─┐
  └─ OBS-004 ─ OBS-006 ──────────────────────┼─ OBS-008 ─ OBS-009
                                              └─ P1 assertions/summary
                                                   └─ P2 Spine
                                                        └─ P3 runtime expansion

P4 pixel evidence 独立于 P2/P3，以 ADR 为进入门槛。
```

建议按以下可评审提交拆分，避免一个 PR 同时修改所有层：

1. 共享 contract + projection truth 修复。
2. render identity + PreviewObservationRegistry。
3. typed WebSocket channel + ObservationBroker。
4. 最小 collectors + `observePreview` 工具。
5. assertion evaluator + RunSummary/措辞/诊断。
6. canonical probe registry + Spine。
7. 其余 runtime 或像素能力各自独立提交。

## 十四、验证命令

按阶段运行最小必要验证：

```bash
corepack pnpm check:contracts
corepack pnpm check:demo-ui
corepack pnpm check:ai-chat-shared
corepack pnpm check:agent
corepack pnpm check:author
```

修改 screenshot-service 时追加：

```bash
corepack pnpm check:screenshot
```

修改 canonical `@preview/sdk` 或播放器时追加：

```bash
corepack pnpm build:preview-runtime
corepack pnpm check:author
corepack pnpm check:viewer
```

浏览器验收必须使用全新浏览器上下文，至少覆盖：

本仓库提供一条 opt-in 的 Prototype/E1 定向 harness（真实编辑页、projection 和
connection-local registry，Agent socket 使用本地 transport double）：

```bash
E2E_PREVIEW_OBSERVATION=1 corepack pnpm exec playwright test \
  --config test/创作端E2E回归测试/playwright.config.ts \
  preview-observation-browser.spec.ts
```

该 harness 的 JSON 观察结果和截图写入 Playwright artifact；transport double 不等价于
真实 Agent Service/Broker，不能单独勾选 OBS-009。

同一用例支持 `E2E_PREVIEW_OBSERVATION_REAL=1` 的真实服务模式：在隔离 `DATA_DIR` 中启动
author-site/agent-service，并将 `PI_AGENT_PROVIDERS` 指向本地确定性 OpenAI-compatible
假模型（或在隔离 `system_configs.model_config.backendProviders` 中配置同一地址），再运行。
隔离 agent-service 还必须把 ledger/CORS 回指同一 author 端（并使用与
author 相同的内部 token），否则 `ConversationLedgerClient.startRun/commitTerminal`
会在等待后中止，浏览器结果只能作为环境失败，不能计入真实 Broker 验收：

```bash
# agent-service 启动环境（与 author 的 DATA_DIR、token 保持一致）
# local-internal-token 仅为本地示例；若 author 使用其它值，此处必须同步替换
PORT=4311 HOST=0.0.0.0 DATA_DIR=/tmp/preview-observation-e2e \
  CORS_ORIGINS=http://localhost:4310 \
  AUTHOR_SITE_URL=http://localhost:4310 \
  INTERNAL_API_TOKEN=local-internal-token \
  corepack pnpm exec tsx packages/agent-service/src/server.ts

# deterministic OpenAI-compatible fake model
PREVIEW_OBSERVATION_FAKE_LLM_LOG=1 \
  node test/创作端E2E回归测试/support/preview-observation-fake-llm.mjs

# author-site（须与上面的 agent-service 使用同一隔离 DATA_DIR）
DATA_DIR=/tmp/preview-observation-e2e \
  NEXT_DIST_DIR=.next-e2e \
  AGENT_SERVICE_URL=http://localhost:4311 \
  NEXT_PUBLIC_AGENT_SERVICE_URL=http://localhost:4311 \
  corepack pnpm exec node scripts/run-next-with-root-env.mjs dev --turbopack -p 4310 -H 0.0.0.0

# author-site 与假模型就绪后运行浏览器用例
E2E_PREVIEW_OBSERVATION=1 E2E_PREVIEW_OBSERVATION_REAL=1 \
  E2E_BASE_URL=http://localhost:4310 \
  E2E_PREVIEW_OBSERVATION_EDITOR_READY_TIMEOUT_MS=120000 \
  E2E_PREVIEW_OBSERVATION_REAL_RUN_TIMEOUT_MS=60000 \
  corepack pnpm exec playwright test \
  --config test/创作端E2E回归测试/playwright.config.ts \
  preview-observation-browser.spec.ts
```

假模型启动脚本为
`test/创作端E2E回归测试/support/preview-observation-fake-llm.mjs`（默认监听
`127.0.0.1:4409`，只返回固定工具调用，不记录请求 payload）；该真实模式目前证明
单页基本 Broker 链路和 high-fidelity runtime-error 早期观察/重试，仍不能替代下方完整矩阵。
开发服务首次编译较慢时可用 `E2E_PREVIEW_OBSERVATION_EDITOR_READY_TIMEOUT_MS` 和
`E2E_PREVIEW_OBSERVATION_REAL_RUN_TIMEOUT_MS` 调整页面就绪/Agent 终态等待；默认分别为
90 秒和 60 秒，超时仍按失败处理并保留 artifact。

- commit 后立即 observe，确认等待的是对应 render generation；
- 修改后快速切页，旧 response 不得命中；
- 同 session 两个标签页同时打开，只响应 originating connection；
- iframe sleeping、编译失败、runtime error、页面卸载和 WebSocket 重连；
- screenshot-service 不健康时 E1 工具仍可用；
- Prototype 与 high-fidelity React 返回同一 envelope，不要求内部采集实现相同；
- sandbox/sketch 首版返回明确 limited/unsupported；
- Spine 外框居中但 skeleton bounds 偏移时不得产生假阳性。

## 十五、风险与应对

| 风险                                  | 应对                                                                                      |
| ------------------------------------- | ----------------------------------------------------------------------------------------- |
| 旧页面/旧 revision 被误判通过         | identity-first、originating connection、preview instance + generation、Broker fail closed |
| 协议字段膨胀成“文本截图”              | 默认 page summary/单 target、64KB 上限、capability 和 detail 分级                         |
| 多 runtime 逻辑漂移                   | shared contract/evaluator，runtime 只实现 adapter                                         |
| probe 被同 realm 页面代码伪造         | 标记 self-reported precision、服务端校验 bounds、不能作为安全或 compositor 证明           |
| 持久状态与瞬时证据混淆                | evidence record 绑定 identity/observedAt，不保存单一 asserted 布尔值                      |
| 动画永不稳定                          | 有界时间窗口采样，返回 uncertain 和采样范围，不等待静止                                   |
| sandbox 为观察而降低隔离              | 不放宽 origin/ticket；安全 bridge 不成立时保持 limited                                    |
| current-surface capture 泄露编辑器 UI | E2 独立 ADR、严格 surface crop、权限与用户提示                                            |
| observation 阻塞 Agent stream         | auxiliary channel、并发/超时上限、AbortSignal 和断连清理                                  |

## 十六、文档同步要求

功能实现时同步更新：

- `docs/项目文档/创作端/04-配置与预览/技术/02_实时预览机制.md`：render identity、registry、runtime adapter 与 projection 真值。
- `docs/项目文档/创作端/04-配置与预览/技术/07_截图服务与预览快照机制.md`：E2/E3 边界与 reference render 语义。
- `docs/项目文档/创作端/05-AI对话/技术/03_AI行为约束机制.md`：observePreview、完成措辞和 RunSummary evidence summary。
- `docs/项目文档/独立Agent服务层/03-核心模块设计.md`：ObservationBroker、LivePreviewChannel 和工具依赖注入。
- 对应模块 `INDEX.md`。

修改 `docs/项目文档/` 时使用 `doc-maintainer` skill。若实施中形成新的稳定工程约定或常见陷阱，同步维护根 `AGENTS.md` 或 `packages/agent-service/AGENTS.md`。

## 十七、完成标准

P0/P1 完成必须同时满足：

- 普通活动单页在 screenshot-service 未启动时可以形成 `committed + matching projected + observed + assertion evidence` 闭环；
- observation 必须来自发起当前 Agent run 的连接和当前 preview instance；
- 任一 identity 字段不匹配时返回 stale/unavailable，不能使用旧缓存；
- Prototype 和 high-fidelity React 支持首批 E1 断言；sandbox/sketch 返回准确 capability，而不是假成功；
- Agent 不把 runtime validation、无控制台错误、projection applied 或 E3 reference render 单独表述为当前画面已验收；
- 无 assertions 的观察不显示“验证通过”；
- observation 原文、表单值、敏感 URL、页面源码和播放器资产不进入长期诊断；
- 请求超时、断连、页面切换和迟到响应不留下 pending request；
- 对应代码测试、浏览器验收和项目文档同步完成。

P2 完成额外要求：

- Spine 居中断言同时给出 DOM container rect 与 skeleton/painted bounds；
- 缺少 probe 时返回 unsupported，不能以 Canvas 外框代替动画内容；
- author、viewer 和 published preview runtime 使用同一 canonical probe 实现。

E2 不属于 P0-P2 完成条件；没有 current-surface pixel capture 不阻塞结构化自验证上线。

## 十八、进度记录

- 2026-09-09：完成现有预览、Agent 工具、projection、播放器和 screenshot-service 的初步核对，提出“结构化原位观察默认、当前画面像素按需、独立参考渲染低频”的方向。
- 2026-09-09：完成方案评审。确认方向适合项目，但发现 projection tracker 语义、Authority ACK 调用链、render identity、多标签页路由、状态轴混合、runtime 支持范围和协议多源等问题。
- 2026-09-09：按评审结果重构方案：身份与 projection 真值进入 P0；首版收敛到 originating connection 的活动单页；证据等级改为 E1/E2/E3；拆分 availability/readiness/assertion/evidence；将 canvas、sandbox 深度 probe、sketch、Lottie/Rive 和 compositor capture 后置；新增 OBS-001 至 OBS-503 任务清单与依赖。
- 2026-09-09：完成 OBS-001、OBS-002 与 OBS-101 的首批实现：新增共享 observation contract、容量/隐私 guards、E1 纯断言 evaluator；`PreviewProjectionTracker` 分离 committed/projected revision，拒绝旧或未提交 ACK；高保真预览 render callback 回传 instance/generation/revision，并由编辑页使用 Authority committed revision 发送真实 projection ack。
- 2026-09-10：完成 OBS-003 至 OBS-008 的最小实现：iframe 生命周期回显 preview instance/generation/revision；`AgentStream`/`StreamService` 与 agent-service WebSocket 增加 typed preview request/result 辅助帧；编辑页挂载 connection-local `PreviewObservationRegistry`，Prototype/high-fidelity collector 输出受限 E1 facts；服务端 `PreviewObservationBroker` 绑定 originating connection、超时/断连/容量和迟到响应；`observePreview` 通过 workspace capability directory 暴露。OBS-009 仍需覆盖真实 commit→projection→observe、快速切页、多标签页及运行错误集成验收。
- 2026-09-10：新增 Broker 单测覆盖错误 connection、断连清理和超时；各涉及包 typecheck 通过。浏览器级 OBS-009 尚未执行，仍需在全新上下文验证 originating connection、多标签页、快速切页、sleeping/编译失败与 screenshot-service 不可用时的 E1 行为。
- 2026-09-10：共享/registry 定向测试、demo-ui typecheck、author projection/hook 定向测试、agent-client/ai-chat-shared typecheck、contracts check 均通过；完整 demo-ui 测试仍有 3 个既有配置/编辑器布局失败，未命中本次观察改动。
- 2026-09-10：补强 OBS-006/OBS-007 边界：Broker 在已注册预览上逐字段校验响应 render identity，旧 generation 返回 `stale`，预览注销会取消 pending；registry 记录运行时错误并对 sandbox/sketch 明确返回 limited/unsupported。增加 originating connection 在 Agent 运行中保持不变的 manager 回归测试；OBS-009 仍待浏览器级 commit→projection→observe 验收。
- 2026-09-10：完成 OBS-102 最小 target resolution：node ID/selected element 保持显式受限入口，`data-source-file`/`data-source-line` 返回最多 8 个候选，歧义时不自动选择，并为无稳定 ID 的候选附带 `unstable` DOM path；共享 result envelope 回传候选列表。新增 registry 回归测试。
- 2026-09-10：将高保真 iframe 的 `renderGeneration` 与消息 `requestId` 解耦：代码、模块和配置更新各自推进 generation，父级只接受当前 instance/generation 的生命周期回调；iframe 配置更新会触发新的 render commit，避免旧配置响应覆盖新观察。
- 2026-09-10：ObservationBroker 增加 AbortSignal 取消和 capability 注册校验；`observePreview` 将 Agent tool 的取消信号贯穿到 pending request，响应/断连/卸载路径均清理计时器与监听器。
- 2026-09-10：完成 OBS-103/OBS-104：RunSummary 增加有界 `observations` 摘要，保留 identity、availability/readiness、断言类型与状态、evidence、延迟和 payload 字节数；前端仅对显式断言全部通过显示“技术自验证通过”，无 assertions 不升级措辞。Agent run log 对 `observePreview` 的输入、content、result 和 details 做脱敏，只保留可检索摘要，避免 DOM、文本、表单值和 URL 进入长期诊断。
- 2026-09-10：Prototype 单页渲染补齐 identity-bound `onContentLoaded` 回调，与 high-fidelity 共用 projection ACK 入口；配置/HTML 重渲染会推进 generation，避免原型页只能注册 observation 却无法形成 projection 证据链。
- 2026-09-10：在全新 Playwright 上下文完成一条真实 Agent→`observePreview`→originating connection→high-fidelity iframe 回路：测试项目 `proj_1787895065566_5wgvzx` 的 `video-demo_ab12` 返回 `availability=observed`、`readiness=ready`、`renderGeneration=9`、`revision=24`，`runtime-ready` 与 `no-runtime-errors` 均 `passed`，RunSummary 显示“技术自验证通过 1 项”；隔离 agent 的 run log 仅保留 identity/断言/耗时/大小摘要。该证据覆盖基本观察与措辞，但 commit→projection、旧 revision/快速切页、多标签页、sleeping/编译失败/runtime error 矩阵仍未完成，OBS-009 保持未勾选。
- 2026-09-10：首次在受限环境启动本地 author/agent 服务时，端口绑定与 tsx IPC 返回 `EPERM`；随后使用隔离临时 `DATA_DIR`、移走已确认失效的 Next 生成锁并以提权服务完成一条基本浏览器观察路径。完整 OBS-009 的 commit→projection、旧 revision/快速切页、多标签页、sleeping/编译失败/runtime error 矩阵及 OBS-105/P2+ 仍保持未完成。
- 2026-09-10：完成 P2 Spine 最小闭环（OBS-201 至 OBS-204）：canonical preview SDK 以 WeakMap + 窄桥接属性注册/注销有界 probe；Spine 输出动画状态、skeleton/camera/fit/alignment、Canvas 尺寸和 viewport-relative `paintedBounds`，共享 evaluator 增加 media 与 painted-bounds centered 断言，缺少 probe 时显式 `unsupported`。运行 `corepack pnpm build:preview-runtime` 后 author/viewer `preview-sdk.js` SHA-256 均为 `ad236d68b742c368756713bd225e45c8e18ab636e632918fd563c29120f79563`；preview runtime policy、artifact、Spine framing、shared observation、registry 定向测试及 `check:contracts` 通过。OBS-009/OBS-105 和 P3-P5 尚未完成，当前证据仍不等同于 compositor 像素或完整浏览器矩阵。
- 2026-09-10：完成 P4 的可独立落地部分（OBS-401、OBS-403、OBS-404）：ADR 记录当前不实现 E2 compositor 载体，避免把独立截图或 DOM/Canvas 外框误报为当前画面像素；`captureScreenshot` 透传 screenshot-service 已有 `renderMode=fast|strict`，读取和结果 URL 保持 variant 一致且继续标记 E3；RunSummary UI 增加 E1/E2/E3 证据标签。截图服务当前没有 region contract，OBS-402 继续等待未来 E2 载体评审。
- 2026-09-10：补齐 observation 注册的实际传输闭环：编辑页为已挂载 registry 提供 registration provider，StreamService/AgentStream 在连接建立、重连及返回有效 preview snapshot 前发送当前连接的 `preview_register`，Broker 首次响应也使用连接注册信息校验 render identity；同时允许 `media-probe`/`painted-bounds` canonical capabilities。客户端、Broker、shared observation 和 contracts 定向验证通过。
- 2026-09-10：完成无断言观察的 UI 语义收敛：RunSummary 对 `observed + not-requested` 显示“已观察”而不显示“验证通过”；E1/E2/E3 标签同时覆盖 RunSummary 与带 evidence details 的工具结果，截图结果明确显示 E3。
- 2026-09-10：修正 registry 同一 `previewInstanceId` 跨 render generation 重注册时的卸载竞态：旧注册回调现在必须匹配完整 render identity 才能清理当前注册，并新增回归测试；OBS-009/OBS-105 与 P3-P5 仍待后续验收或指标驱动进入。
- 2026-09-10：为 OBS-501 补充只读指标聚合：OPS CLI `diagnostics:*` 从脱敏 Agent run JSONL 汇总 observation 调用量、状态/断言/evidence 分布、延迟与载荷分位数、timeout/stale 计数和明确定义的技术修复成功率；新增 CLI 回放式测试。正式指标复盘仍等待足量真实运行样本，OBS-502 持久 facts fixture/replay runner 与 OBS-503 扩展决策保持未完成。
- 2026-09-10：完成 OBS-502：新增共享包持久脱敏 facts fixtures（居中、横向溢出、图片失败、Spine painted bounds、旧 revision）及 `preview-observation-replay.test.ts` 回放 runner；共享 observation/replay 测试当前 17 项并通过 shared typecheck。旧 revision fixture 保留其原始 revision，并在 replay 中与当前 revision 显式区分，未被提升为当前证据。
- 2026-09-10：浏览器复测发现 Prototype 观察接入会因每次 render 新建 `previewObservationContext`、原型 `content-loaded` 回调和高保真专用快照状态叠加而触发 React 最大更新深度；已将 `SinglePagePreview` 的 visibility region 投影稳定化、Prototype effect 依赖改为原始字段、编辑页 content-loaded 按页面/generation/revision 去重并跳过原型无关的快照状态更新。修复后隔离 4201/4210 拓扑下编辑页可正常加载并显示原型标题；评论参与者接口仍有隔离数据的 400 校验噪声。OBS-009 仍不勾选，完整 commit→projection、旧 revision、快速切页、多标签页及错误矩阵尚未形成一套可复查浏览器证据。
- 2026-09-10：最终定向验证通过：shared observation/replay 17 tests、Prototype/registry 23 tests、shared/demo-ui/author/ai-chat-shared/agent typecheck 与 `check:contracts` 均通过；完整 demo-ui 仍只有 3 个既有配置/编辑器布局失败，完整 agent/author suite 另有既有 model/image/session 与受限端口失败，均未命中 observation 定向测试。`git diff --check` 通过。
- 2026-09-10：补齐 sleeping runtime 的 fail-closed 语义：PreviewPanel 将 `activityState` 同步到 connection-local registry，保留作视觉兜底的 sleeping iframe 在 `observePreview` 中返回 `unavailable: preview-sleeping`，唤醒后恢复观察；新增 registry 回归测试并同步实时预览技术文档。OBS-009 的 sleeping 场景具备定向证据，但完整浏览器矩阵仍未完成。
- 2026-09-10：新增 opt-in 浏览器观察验收 harness：`preview-observation-browser.spec.ts` 通过真实编辑页、Prototype 投影、`AgentStream` 和 connection-local registry，使用本地 WebSocket transport double 逐项请求并保存 observation envelope；fixture 覆盖中心/四角、滚动祖先、transform、overflow ancestor、display/visibility/opacity、失败图片、源码定位歧义和非活动旧 pageId。该 double 只替代 Agent Service transport，不冒充真实 Broker；旧 revision、快速切页、多标签、sleeping、编译/runtime error 和 screenshot-service 不可用仍需真实服务矩阵补验。运行：`E2E_PREVIEW_OBSERVATION=1 corepack pnpm exec playwright test --config test/创作端E2E回归测试/playwright.config.ts preview-observation-browser.spec.ts`；本机因 Chromium Mach port/端口绑定 EPERM 未能执行，`--list`、Prettier 和定向 TypeScript 检查通过。
- 2026-09-10：完成 OBS-501/OBS-503 样本审计：仓库历史窗口 19 个 Agent run 无 observation，隔离真实浏览器仅 1 run/1 次 observation（high-fidelity E1、两条断言通过、20ms/1033B，未 commit/projection）；fixtures/replay 不计入真实运行样本。CLI 补齐 Agent run 分母、`observationRunCount`/`observationRate` 和 payload P90，并覆盖“无 observation run”回归测试。结论是样本不足，OBS-501 不勾选；OBS-503 暂不扩展仅作为暂定决策，后续至少采集 30 个 observation-bearing runs、100 次终态 observation 并覆盖失败状态后再正式复盘。
- 2026-09-10：补强 P1 evaluator 回放覆盖：共享测试新增滚动坐标、CSS transform、零尺寸、display/visibility/opacity 隐藏和图片加载失败场景，确认这些事实只影响有界断言结果，不放宽 selector/脚本入口；shared observation/replay 共 17 tests 通过。
- 2026-09-10：补强 P0 originating-connection 证据：Broker 新增同 session 双连接隔离回归，分别注册不同 preview instance 时，交叉 response 会被拒绝，只有各自连接与请求 ID 匹配才完成；Broker observation 测试共 11 项通过。
- 2026-09-10：修正失败观察的指标闭环：`ToolHookManager` 不再静默丢弃超时/断连等 `observePreview` 工具失败，而是写入固定脱敏的 `unavailable` RunSummary 摘要（不复制原始错误文本）；run log 同时只保留固定摘要/可选错误码。OPS CLI 对已发起但缺失终态的观察调用在 run 结束时补记 `missing-terminal`，避免跨运行指标只统计成功样本；新增 agent-service/CLI 回归测试，4 项定向测试与 CLI 9 项测试、CLI build 全部通过。该终态仍不改变 OBS-501 样本不足的结论。
- 2026-09-10：提权重跑 opt-in 浏览器 harness 时 Chromium 已成功启动，但现有 `http://localhost:4200` author 服务随后不可达，测试在登录页等待超时，global teardown 也因同一 `/login` 不可达失败；生成的失败截图/视频 artifact 仅作为环境证据，不计入浏览器验收。OBS-009/OBS-105 仍需在可用的 author/agent 服务拓扑下执行。
- 2026-09-10：补强 registry 卸载边界：即使注销回调尚未及时到达，已断开 DOM 根节点的观察也返回固定 `unavailable: preview-unmounted`；新增 demo-ui 定向回归后共 23 项通过。该边界仍不能替代真实页面卸载/重连浏览器矩阵。
- 2026-09-10：在隔离临时 `DATA_DIR`、author 4310、agent-service 4311 拓扑上成功执行 opt-in 浏览器 harness（1 passed）：真实登录、项目/页面提交、Prototype projection ack、当前 DOM/布局/transform/overflow/隐藏/失败图片/源码歧义与非活动 pageId 观察均通过，并用独立 `getBoundingClientRect()`/computed style 测量对照 observation envelope；registration 断开后改用历史记录，避免重连噪声误判。为适配当前 UI，harness 使用 contenteditable 的 `aria-placeholder` 和平台提交快捷键；中心夹具改为绝对定位以使居中断言代表真实几何。该用例仍只替代 Agent Service transport，不能单独勾选真实 Broker connection-scoped 的 OBS-009；服务端 Broker、旧 revision/快速切页、多标签和错误矩阵仍待真实服务验收。
- 2026-09-10：收尾复跑 shared observation/replay 17 项、Prototype/registry 23 项、agent-service Broker/脱敏日志 15 项和 OPS diagnostics 9 项定向测试，全部通过；harness/fixture/本方案 Markdown 的格式检查及 `git diff --check` 通过。该验证不改变真实 Broker 集成、完整浏览器矩阵和样本门槛的未完成状态。
- 2026-09-10：修正并在隔离临时 `DATA_DIR`、author 4310、agent-service 4311 与本地确定性 OpenAI-compatible 假模型上复跑真实模式 harness（1 passed）：真实编辑页/AgentStream 建立连接，Agent Service `observePreview` 通过真实 `PreviewObservationBroker` 请求 originating connection 的 iframe registry，RunSummary 返回 `availability=observed`、`readiness=ready`、当前 fixture `pageId`、四项 E1 断言均 `passed`，并确认真实 projection ACK 已到 revision 3。测试增加透明的 in-page WebSocket frame capture 与 connection-open 等待，假模型固定位于 `test/创作端E2E回归测试/support/preview-observation-fake-llm.mjs`，不记录用户 payload。该证据只覆盖单页基本真实链路；旧 revision/快速切页、多标签、sleeping/编译失败/runtime error、截图失败和完整 OBS-009/OBS-105 矩阵仍未完成，OBS-009 保持未勾选。
- 2026-09-10：真实 Broker harness 修正后的 transport-double 分支复跑通过（1 passed）；shared observation/replay 17 项、Prototype/registry 23 项、agent-service Broker/脱敏日志 15 项、OPS diagnostics 9 项（以 `node --import tsx --test` 绕过受限环境 tsx IPC）均通过，`check:contracts`、harness TypeScript 检查、Prettier 与 `git diff --check` 通过。OPS package 默认 `tsx --test` 在当前环境仍触发 IPC `EPERM`，不改变代码测试结论。
- 2026-09-10：将真实模式假模型扩展为 5 步观察序列（通过、隐藏元素断言失败、图片加载断言失败、源码定位歧义、旧 pageId 不可用），在统一隔离用户/模型配置与显式 4311 Agent URL 下真实 harness `1 passed`；`diagnostics preview --project` 验证该 run 保留 5 次 observation（4 observed、1 unavailable），观察摘要未复制原文或用户正文（run_start 的既有工作区路径仍只属于运行元数据）。期间发现并修复 CLI 以 `run_start.demoId`（页面 ID）过滤 project 时丢弃无 identity unavailable 的问题，改为从受限 `workingDir` 的 `projects/<projectId>` 段恢复项目身份并优先使用显式 `projectId`。该证据仍未覆盖 stale/timeout/unsupported、快速切页、多标签、sleeping/编译/runtime error 和截图服务不可用，OBS-009/OBS-105 继续保持未勾选。
- 2026-09-10：在上述真实 Broker 多观察修正后，transport-double 浏览器 harness 再次通过（`1 passed`），确认完整 DOM/布局/transform/overflow/隐藏/图片失败/源码歧义/非活动 pageId fixture 仍稳定；真实服务与 transport-double 两条路径均保留为 opt-in，不把测试 double 证据冒充生产 Broker 的完整场景覆盖。
- 2026-09-10：真实模式假模型新增无视觉变化的 `editFile` mutation，并在观察前保留投影窗口；隔离 author 4310/agent 4311/假模型复跑 `1 passed`。RunSummary 与 diagnostics 同时确认 `mutationCommitted=true`、`projectionStatus=applied`、revision 4，6 次终态 observation 中 5 次 observed、1 次非活动 pageId unavailable，技术修复成功率 eligible 1/1；首个观察若竞态落在旧 generation 会明确返回 `stale`，夹具随后要求重试后再判定通过。该证据仍未覆盖 timeout/unsupported、完整多标签/sleeping/编译/runtime error 和截图服务不可用矩阵，OBS-009/OBS-105 继续保持未勾选。
- 2026-09-10：在真实 mutation/projection 夹具变更后再次执行 transport-double 浏览器 harness，`1 passed`；该路径仍只作为 registry/断言对照，不替代真实 Broker 矩阵。
- 2026-09-10：真实 Broker harness 最终复跑 `1 passed`，新增断言确认 committed revision、applied projection revision 与重试 observation identity revision 三者一致；同一隔离 `DATA_DIR` 的 `diagnostics preview --since 24h` 复核为 19 个 Agent run、10 个 observation-bearing run、100 次终态 observation（85 observed、5 stale、10 unavailable、0 unsupported；P50/P90 latency 58/323ms；P90 payload 2309B），`eventGapDetected=false`。数量达到 100 次 observation 下限但 run/runtime 覆盖仍不足，正式样本门槛未达成；OBS-009/OBS-105、P3、OBS-402、OBS-501/503 继续保持未完成。
- 2026-09-10：修复 high-fidelity `RUNTIME_ERROR` 早于 `LOADED` 时的观察注册：PreviewPanel 以同一 render identity 注册 iframe 失败根节点、保留已有 runtime counters，编辑页把该 identity 转发给 originating AgentStream；新增 runtime-error 浏览器夹具。transport-double 分支 `2 passed`，真实 Broker 分支复跑 `1 passed`，RunSummary/tool update 均确认 `availability=observed`、`readiness=runtime-error`、`runtimeErrorCount>0` 且 `no-runtime-errors=failed`；同夹具首次旧 identity race 的 `stale` 结果保留为边界证据。OBS-009/OBS-105 完整矩阵、P3、OBS-402、OBS-501/503 仍未完成。
- 2026-09-10：runtime-error 真实验收后再次运行 `diagnostics preview --since 24h`：隔离样本为 23 个 Agent run、13 个 observation-bearing run、119 次终态 observation（101 observed、7 stale、11 unavailable、0 unsupported；`high-fidelity-react` 1 次、`prototype-html-css` 100 次；P50/P90 latency 58/325ms；P90 payload 2309B），`eventGapDetected=false`，SQLite 主账本可用但同时读取了 JSONL fallback/spool（诊断 CLI 已发出对应 warning）。数量下限已达成，但 run/runtime/失败类别覆盖仍不足，OBS-501 正式复盘与 OBS-503 扩展决策继续保持未完成。
- 2026-09-10：为 stale→retry 竞态补强 AgentStream：`observePreview` 返回 `stale` 且不带 identity 时，客户端从 connection-local handler 读取最新注册并在模型重试前发送 `preview_register`；真实 Broker high-fidelity 用例先得到旧 identity `stale`，有界重试随后得到 `observed/runtime-error`，用例通过。最终诊断复核为 28 个 Agent run、17 个 observation-bearing run、125 次终态 observation（103 observed、11 stale、11 unavailable、0 unsupported；`high-fidelity-react` 3 次、`prototype-html-css` 100 次；P50/P90 latency 66/323ms；P90 payload 2309B），`eventGapDetected=false`。这仍未满足 30 run 与各 runtime/失败类别分布门槛，OBS-501/503 保持未完成。
- 2026-09-10：stale re-registration 变更后再次执行完整 transport-double 浏览器 harness，Prototype 与 high-fidelity runtime-error 两个用例均通过（`2 passed`）；shared observation/replay 17 项、registry 12 项、Broker/脱敏日志 15 项定向测试、agent-client/demo-ui/author typecheck、Prettier 与 `git diff --check` 均通过。运行服务已停止，隔离 `DATA_DIR` 仅保留诊断样本供后续复盘。
- 2026-09-10：补强 registry runtime-error 回归断言：当 runtime/console error 计数存在时，E1 观察明确返回 `readiness=runtime-error`，`no-runtime-errors` 断言为 `failed`，且仍只保留计数摘要；`packages/demo-ui/src/preview-observation-registry.test.ts` 12 项通过。真实浏览器编译失败试验因开发服务页面/AI 延迟未形成可复查终态，不计入验收样本，相关实验代码已撤回。
- 2026-09-10：观察协议的 render identity 与请求 `pageId` 段改用共享 `workspace-path` Unicode 单路径段校验，source location 路径逐段拒绝 `.`/`..`、分隔符、控制字符和未配对代理项；新增 identity/input guard 回归断言，shared observation/replay 17 项、TypeScript、格式与 `git diff --check` 均通过。
- 2026-09-10：补齐 Broker 连接 ID 复用的重连边界：重复注册同一 connection ID 时先按旧连接关闭，立即结算 `connection-closed` 并清理 pending，再安装新注册；Broker 定向测试增至 12 项并通过，agent-service typecheck、格式和 `git diff --check` 通过。
- 2026-09-10：补强 shared facts 的反向安全校验：运行时返回的 source candidates 现在逐段复用相对路径规则，文本断言值拒绝控制字符；shared observation/replay 测试增至 18 项通过，并同步更新独立 Agent 服务层与实时预览技术文档。
- 2026-09-10：将相同的逐段 source path 约束前移到 demo-ui `nodeOf` collector，避免浏览器侧产生随后被服务端拒绝的 `./`、空段或其它不安全候选；registry 定向测试增至 13 项通过。
- 2026-09-10：在同一隔离 `author 4310 / agent 4311 / fake LLM 4409` 拓扑改用 `localhost` 再复跑真实模式浏览器矩阵；两个场景均因编辑页在等待窗口内未出现可验收标题/有效观测结果而失败，服务端仅形成项目、投影与会话请求，未形成新的可复查终态证据，不计入 OBS-009/OBS-105 通过项。现有真实 Broker 单页与 runtime-error 证据保持有效，完整矩阵仍待稳定的页面启动环境。
- 2026-09-10：为浏览器 harness 增加可配置的正数等待参数，默认将编辑页就绪窗口设为 90 秒、真实 Agent 终态窗口设为 60 秒，以隔离首次开发编译抖动；仍保持超时失败、artifact 留存和不把失败运行计入 OBS-009/OBS-105。
- 2026-09-10：修正隔离真实服务的启动前提并复跑真实 Broker 浏览器用例：agent-service 显式使用 `CORS_ORIGINS=http://localhost:4310`、`AUTHOR_SITE_URL=http://localhost:4310` 和与 author 相同的 `INTERNAL_API_TOKEN`，假模型监听 4409 且请求可复查。`commit→projection→observe` 通过 `1 passed`，真实 `editFile` mutation 后确认 committed/applied revision 与 originating connection 观察 identity 一致，并形成 17 次终态 observation；high-fidelity runtime-error 早于 `LOADED` 用例通过 `1 passed`，包含旧 identity `stale` 后有界重试到 `observed/runtime-error`、`no-runtime-errors=failed`。两项均为真实 PreviewObservationBroker 证据，但只覆盖 OBS-009 的两个直接场景；此前缺少 ledger 回指的失败运行明确排除，OBS-009 剩余跨连接/异常矩阵、P3、OBS-402、OBS-501/503 仍未完成。
- 2026-09-10：在真实 Broker Prototype 用例中补齐 P1 浏览器实测对照：中心、四角、滚动目标、transform、overflow ancestor、display/visibility/opacity 和失败图片均与当前页面 `getBoundingClientRect()`/computed style 对照，真实用例 `1 passed`；high-fidelity runtime-error 的既有真实 Broker `1 passed` 证据继续有效。OBS-105 的 P1 验收条件已满足并勾选；OBS-009 仍只完成 commit→projection→observe 与 runtime-error 两个直接场景，跨连接/旧 revision/快速切页/sleeping/编译失败/截图不可用矩阵继续待完成。
- 2026-09-10：为浏览器夹具 API 请求改用显式 `E2E_BASE_URL` 绝对 URL，并将真实模式假模型的 stale 重试扩展为最多 4 次、合并页面 WebSocket 与 in-page 捕获帧；这些改动只增强验收夹具的可复查性，不改变生产观察协议。后续一次复验受 author dev `/login` 404/不可达环境阻断，不计入 OBS-009/OBS-105 证据。
- 2026-09-10：复核最新真实 Broker 复验日志确认服务端已返回 `e2e-observe-2=stale`，但假模型夹具因只检查工具消息最外层而未触发重试，导致浏览器断言 `centerRetry` 为空；该失败属于验收夹具解析缺陷，不改变此前已通过的真实 Broker 直接场景。已将假模型的 stale 检测改为对有限深度的嵌套 `content/result/details` 做安全遍历，并停止残留临时服务；修复后需在稳定 author 启动环境再复跑，OBS-009 仍不勾选。
- 2026-09-10：发现用户态 author 已占用默认 `.next/dev/lock` 时，单纯换端口无法启动第二个隔离实例；Next 配置新增显式 `NEXT_DIST_DIR`（默认仍为 `.next`），并将隔离验收命令改为 `.next-e2e`，避免触碰正在运行的开发服务。该变更只改善并行验收隔离，不改变生产运行时语义。
- 2026-09-10：使用 `.next-e2e` 和临时 `preview_e2e` 用户再次启动隔离 author/agent/fake 服务；author 首次编译与截图/工作区依赖加载超过 2 分钟，浏览器用例在进入 Agent run 前于页面就绪阶段超时，未形成新的观察证据。该环境复验已中止并停止全部临时服务，不能替代已有真实 Broker 通过记录。
- 2026-09-10：按前述隔离方式改用 author Webpack 回退（独立 `NEXT_DIST_DIR=.next-e2e-webpack`）再做一次有界 Prototype 复验；路由与 API 冷编译仍出现 49 秒级请求和页面 `frame detached`，用例在进入 Agent run 前超时，未形成新的观察证据。Webpack/Turbopack 两条开发服务均已停止；该结果记录为环境启动不稳定，不改变既有真实 Broker 证据或 OBS-009 未完成状态。
- 2026-09-10：改用一次性生产 Webpack 构建 + standalone author（补齐 standalone 的 `.next/static`/`public` 资源，并按生产拓扑让浏览器连接 3201 agent-service）后，真实 Broker 浏览器矩阵两个用例均通过（`2 passed`，17.9s）：Prototype 的 `editFile→commit→projection→observe` 与布局/样式/图片/源码候选/非活动 pageId 观察，以及 high-fidelity `RUNTIME_ERROR` 早于 `LOADED`、旧 identity stale→重注册重试均形成可复查终态。对应 diagnostics 以 JSONL fallback 合并 SQLite：Prototype 1 run/17 observations（16 observed、1 unavailable、eventGap=false、technicalRepair 1/1），high-fidelity 1 observation-bearing run/5 observations（1 observed、4 stale，runtimeError 断言按预期 failed）；两项只补强 OBS-009 的直接场景，跨连接/快速切页/多标签/sleeping/编译失败/截图不可用矩阵与样本门槛仍未完成。
- 2026-09-10：在同一生产 standalone + 3201 agent-service + 4409 假模型拓扑执行 `--repeat-each=15`（Prototype/high-fidelity 各 15 次，共 30 次浏览器尝试）。结果为 `15 passed / 15 failed`；失败集中在投影 `applied` 时序、stale 后继续观察的工具调用身份、部分 high-fidelity runtime-error 结果未在夹具窗口内出现，不能作为通过样本。诊断账本聚合为 48 个 Agent run、32 个 observation-bearing run、352 次终态 observation：266 observed、70 stale、16 unavailable、0 unsupported，`eventGapDetected=false`，延迟 P50/P90 约 9/25ms，technicalRepair eligible 16 次中成功 11 次。该批次证明了足量终态数据的聚合路径，也暴露出完整浏览器矩阵的时序/夹具稳定性缺口；因此 OBS-009/OBS-501/OBS-503 继续不勾选，正式样本门槛仍需修复后重跑并覆盖 timeout/unsupported 与各 runtime。
- 2026-09-10：复核批量失败日志后确认验收夹具只对 `e2e-observe-2` 做 stale 重试，导致其它观察步骤的合法 identity race 被直接按失败断言；假模型现对 Prototype 任一步骤做最多 4 次重试，high-fidelity runtime-error 最多扩展到第 9 个观察 ID，浏览器断言读取对应 retry 结果。该修复只改变测试夹具的重试与取值策略，不放宽生产 Broker 的 stale/fail-closed 语义；修复后的真实批量尚未重跑，OBS-009/OBS-501 仍不勾选。
- 2026-09-10：生产 standalone 真实 Broker 小批量复跑先暴露两项夹具/拓扑问题：隔离 Agent 只配置 `local-fake/fake-model` 而 author 用户态持久选择 `jojo/deepseek-v4-flash`，以及 fake LLM runtime-error 分支残留未定义延迟变量；对应失败 run 仅作为诊断证据排除出通过样本。随后为隔离服务补充同名 jojo fake provider，修正假模型的嵌套 stale 结果解析和 runtime-error 有界 retry（不改变生产 Broker 语义），并在同一生产拓扑完成 Prototype/high-fidelity 各 3 次、共 `6 passed`（31.6s）。最新 `diagnostics preview --since 24h --data-dir /tmp/preview-observation-e2e-prod` 使用 SQLite 主账本并合并 JSONL fallback，`eventGapDetected=false`；聚合为 70 个 Agent run、45 个 observation-bearing run、436 次终态 observation，335 observed、81 stale、20 unavailable、0 unsupported，P50/P90 latency 10/27ms、payload P90 2309B、technicalRepair 15/20。该批次验证了修复后的真实链路和跨运行聚合，但 timeout/unsupported 仍为 0，且 runtime 各 10 run、完整旧 revision/快速切页/多标签/sleeping/编译失败/截图不可用矩阵尚未完成，OBS-009/OBS-501/OBS-503 继续不勾选。
- 2026-09-10：补充 OBS-009 编译失败边界夹具：向高保真页面写入明确无效源码，并断言编辑页无活动 preview 注册时观察应返回 `unavailable/no-active-preview`；新增浏览器用例并经 Playwright `--list` 确认三项 OBS-009/OBS-105 用例可加载。一次提权浏览器尝试已进入测试，但因临时 author/Workspace Authority 冷启动导致页面导航 `frame detached`/90 秒超时，未形成终态样本；该场景尚未在生产 standalone + real Broker 拓扑执行，不能替代 timeout、快速切页、多标签和 sleeping 的真实矩阵证据。
- 2026-09-10：补齐首版 runtime 矩阵的 fail-closed 注册边界：`SinglePagePreview` 为 sandboxed-html 注册宿主 wrapper（仅 `limited-host-facts` capability）并为 sketch-scene 注册显式 unsupported identity；不触碰 sandbox iframe 的独立 origin/ticket，也不伪装成 DOM 观察。新增单测覆盖页面切换与 revision 变化，demo-ui 21 项测试、typecheck 通过；P3 深度 probe adapter 仍不扩展。
- 2026-09-10：修正编译失败真实验收夹具：假模型现在识别 `compile-failure` 请求，仅执行一次 `observePreview`，真实 standalone author + Agent Service/Broker + Chromium 复跑 `1 passed`（4.6s），RunSummary/tool update 证明 `availability=unavailable`、`reasons=[no-active-preview]`。该证据补齐 OBS-009 的编译失败直接场景，但跨连接/快速切页/多标签/sleeping 与正式样本门槛仍未完成。
- 2026-09-10：在上述编译失败夹具之后复跑核心回归：demo-ui `SinglePagePreview`/registry 21 项、agent-service Broker/脱敏日志 16 项均通过，`git diff --check` 通过。当前代码与方案文档无冲突标记；未新增真实服务进程。OBS-009 仍不勾选，剩余仅为跨连接/快速切页/多标签/sleeping 的真实浏览器矩阵，以及 P3、OBS-402、OBS-501 正式复盘和 OBS-503 门槛决策。
- 2026-09-10：新增“快速切页”浏览器夹具：同一 originating connection 在旧页观察后切换到第二个 Prototype 页，要求旧 page identity 返回 `unavailable`、新活动页返回 `observed`；transport-double 与真实 Broker 均保留入口。静态 `node --check`、Prettier、Playwright `--list`（4 项）和 `git diff --check` 通过；本机实际 Chromium 运行再次被 macOS `MachPortRendezvousServer … Permission denied (1100)` 阻断，未将该次计入真实 OBS-009 样本。现有真实 standalone 直接场景证据不受影响。
- 2026-09-10：修正快速切页夹具的认证前置、旧页显式 `pageId` 和 fake model 分支，新增 E2E spec/fixture 的独立 TypeScript 严格检查并通过；提权浏览器复跑可启动 Chromium，但默认 4200 author 未连接可用 Agent Service 时页面写入返回 `WORKSPACE_AUTHORITY_NOT_READY`，因此该次仍不计入真实矩阵。真实复跑需要隔离 DATA_DIR 的 author + Agent Service 拓扑。
- 2026-09-10：按隔离 `DATA_DIR` + 生产 standalone author + Agent Service/Broker + 假模型拓扑复跑快速切页用例；author 构建成功、用户注册和两页 Authority mutation/projection 均完成，但浏览器在 `openFixtureEditor` 等待编辑页 `obs-center` 超时，未形成 Agent run/observation 终态。该失败属于 standalone 页面启动/编辑器就绪环境问题，不计入 OBS-009 通过样本；临时服务已停止，`.next-quick` 生成的 tsconfig include 也已清理。快速切页夹具仍保留 transport-double 与真实 Broker 入口，需在稳定编辑器启动环境复跑。
- 2026-09-10：针对上述超时又分别复核了旧 standalone 产物与当前源码 Webpack dev 拓扑：旧产物在编辑页触发 React `#185`（最大更新深度）且页面不可用；当前源码 dev 首次冷编译期间 `/demo/[id]/edit` 请求出现 `ERR_ABORTED/frame detached`，在进入 Agent run 前结束。两次均无新的 observation terminal，已停止 4310/3201 临时服务并清理 `.next-debug`；该证据指向页面启动/构建环境不稳定，不能归因于 PreviewObservationBroker，也不计入 OBS-009/OBS-501 样本。
- 2026-09-10：为降低预览重复加载回调在页面重渲染时造成的状态抖动，`useWorkspaceAuthorityState.ackPreview` 对相同 revision/status 改为幂等返回既有状态；新增 hook 回归后 13 项通过。该修正不改变 Authority ack 发送与诊断摘要，只避免重复 `setState` 放大潜在的编辑页更新深度；需在稳定 production standalone 上重新复核快速切页，不能把本地修正直接视为 OBS-009 通过证据。
- 2026-09-10：修正后复跑 author-site 类型检查、demo-ui observation/SinglePagePreview 定向测试（21 项）和 agent-service Broker/脱敏日志定向测试（16 项），全部通过；`git diff --check` 通过。OBS-009 仍保持未勾选，待稳定 production standalone 复跑快速切页及剩余异常/跨连接矩阵。
- 2026-09-10：生产 Webpack standalone 复跑快速切页夹具通过（`1 passed`，14.4s）。隔离构建使用自定义 `NEXT_DIST_DIR` 时，Next standalone 必须把静态资源复制到其内嵌 distDir（`.next-observation-build/static`），否则页面 HTML 可达但脚本 404；修正拓扑后真实 Broker 日志确认旧 page identity 返回 `unavailable/page-not-active`，切换后的新 page identity 返回 `observed/ready`，renderGeneration 从 2 推进到 4。夹具同时确认生产 AgentStream 的 `preview_observe_request` 由 AgentStream 内部消费，不保证被页面自注入 WebSocket 监听捕获，因此真实分支改为给首个观察一个有界 2 秒窗口，再以终态 tool frames 断言结果；该等待仅是夹具时序约束，不改变生产协议。该次快速切页证据可计入 OBS-009 直接场景，但跨连接/多标签/sleeping、正式样本门槛与 P3/P4/P5 仍未完成。
- 2026-09-10：补齐真实 Broker 多标签验收夹具：第二标签显式创建同一项目/同一 Workspace 的独立 Session（编辑页默认会复用活跃 Session），两标签保持打开但按 AgentManager 的串行语义顺序提交；每个 originating connection 的 own-before/own-after 均返回自身 pageId，显式 cross pageId 均 fail-closed 为 `unavailable/page-not-active`。真实 Chromium + standalone author + Agent Service/Broker 用例通过（`1 passed`，8.5s）；随后基线、编译失败、快速切页、多标签、runtime-error 复跑为 `4 passed`，基线一次因旧 projection ACK 时序未计入，fake provider 已将 mutation 后 projection 收敛窗口固定为 5 秒后单独复跑通过。该证据补齐 OBS-009 的快速切页/多标签/编译失败/runtime-error 直接场景，但 sleeping、截图服务不可用、timeout/unsupported 与正式样本门槛仍待完成；`screenshot-service` 已运行时基线仅断言 200/503，不能冒充不可用场景证据。
- 2026-09-10：补充未完成边界的定向回归证据：`@workbench/demo-ui` `preview-observation-registry.test.ts` 13 项确认 sleeping runtime 返回 `unavailable/preview-sleeping`，`@workbench/agent-service` `screenshot-tool.test.ts` 3 项确认 screenshot-service/Chromium 健康检查失败时不发起截图任务；这些是模块级 fail-closed 证据，仍不能替代 OBS-009 要求的真实浏览器 sleeping 与截图服务不可用矩阵，故任务清单和正式样本门槛保持未勾选。
- 2026-09-10：尝试在仅本机监听、合成 E2E 用户和不可达 `SCREENSHOT_SERVICE_URL` 的隔离拓扑执行新增截图不可用真实 Broker 用例；现有 standalone 产物在进入编辑页时触发 React `#185`，无法形成终态。随后用当前源码重建隔离 standalone：Webpack 构建在 Next/SWC minifier 阶段报 `_webpack.WebpackError is not a constructor`，Turbopack 在有界等待内未产出，均属于构建环境问题而非观察协议证据。临时 Agent/author/fake 服务已停止，新增用例保留为 opt-in，OBS-009 仍不勾选。
- 2026-09-10：使用当前源码一次性生产 Webpack standalone（`NEXT_DISABLE_SERVER_MINIFICATION=1` 仅用于规避本机 Next/SWC minifier 构建异常，默认配置不变），补齐内嵌 `.next-observation-build/static` 与 `public` 后，以隔离 `author 4310 + Agent Service/Broker 3201 + fake LLM 4409` 拓扑复跑截图服务不可用场景。`/api/screenshots/health` 确认返回 503，真实 Chromium/AgentStream/PreviewObservationBroker 用例 `1 passed`（18.6s）：Agent 未调用 `captureScreenshot`，仍通过 originating connection 完成 `observePreview`，RunSummary 保留 `observed`/可用性观察事实。临时服务已停止且 4310/3201/4409 均无监听；该证据补齐 OBS-009 截图不可用直接场景，但 sleeping 真实浏览器矩阵与正式样本门槛仍未完成，OBS-009/OBS-501/OBS-503 继续不勾选。
- 2026-09-10：根据普通用户反馈移除聊天区的 `RunSummaryStatus` 技术状态条，不再显示“已提交 N 项修改”“已观察”“观察已失效”或 `E1/E2/E3` 标签；`runSummary` 仍通过流协议保留给 Agent、诊断和审计使用，Agent 继续负责用自然语言向用户说明结果。更新 `ChatMessages` 回归断言与 AI 对话技术文档，未改变 Authority、Projection、Observation 或 RunSummary 数据契约。
- 2026-09-10：截图不可用场景后完成收尾验证：author hook 13 项、demo-ui `SinglePagePreview`/registry 21 项、agent-service Broker/脱敏日志/screenshot tool 19 项通过；夹具 `node --check`、严格 TypeScript、author-site typecheck、Prettier、`git diff --check` 均通过。一次性 standalone 产物已移至 `/tmp/preview-observation-build-success-20260910` 作为可恢复诊断留档，工作区不保留生成物。

## 十九、相关文档

- [实时预览机制](../../项目文档/创作端/04-配置与预览/技术/02_实时预览机制.md)
- [截图服务与预览快照机制](../../项目文档/创作端/04-配置与预览/技术/07_截图服务与预览快照机制.md)
- [截图服务性能优化方案](../../项目文档/创作端/04-配置与预览/技术/09_截图服务性能优化方案.md)
- [AI 行为约束机制](../../项目文档/创作端/05-AI对话/技术/03_AI行为约束机制.md)
- [独立 Agent 服务层核心模块设计](../../项目文档/独立Agent服务层/03-核心模块设计.md)
