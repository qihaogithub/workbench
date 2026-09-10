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
  - packages/author-site/src/lib/preview-dependency-policy.ts
  - packages/agent-service/src/routes/websocket.ts
  - packages/agent-service/src/routes/ws-event-router.ts
  - packages/agent-service/src/session
  - packages/agent-service/src/backends/pi-tools
  - packages/screenshot-service/src
  - scripts/build-preview-runtime.mjs
---

# AI 对话与 Agent：预览运行时观察与自验收方案

> 状态：方案评审完成，待分阶段实施
> 创建日期：2026-09-09
> 最近评审：2026-09-09
> 文档性质：AI 运行时观察、声明式技术自验证与视觉证据分层方案
> 当前结论：方案适合本项目，但必须先修正 projection 真值和预览身份模型，再建设最小观察闭环。首版只支持发起当前 Agent run 的浏览器连接中的活动单页，以及 `prototype-html-css` / `high-fidelity-react` 两类 DOM 可观测 runtime；画布、sandbox 深度探测、sketch、播放器扩展和当前画面像素捕获均后置。

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

| 术语 | 含义 |
| --- | --- |
| E1 `runtime-structure` | 当前预览实例的 DOM、布局、资源、错误和播放器结构化事实 |
| E2 `current-surface-pixels` | 来自当前浏览器 compositor、严格裁剪到目标预览 surface 的像素证据 |
| E3 `reference-render` | screenshot-service 在独立浏览器中重新渲染得到的参考图 |
| render identity | 唯一定位一次预览渲染的页面、实例、generation、revision 和宿主连接身份 |
| assertion evidence | 某一 render identity、采样时间和精度下的断言结果 |

### 2.3 非目标

- 不以 Agent 技术自验证替代用户的业务、审美和交互体验验收。
- 不允许 Agent 执行任意页面 JavaScript、任意 CSS selector 或读取任意全局变量。
- 不观察非活动页、其他标签页、其他 session 或其他项目。
- 不把完整 DOM、页面源码、用户输入或普通 observation 原文建设为长期日志。
- 不为 observation 放宽 `sandboxed-html` 的独立 origin、execution ticket、CSP 或 Permissions-Policy。
- 不在本方案内建设完整的跨浏览器视觉回归平台。

## 三、现状与可复用能力

当前具备的是“观察原语”，不是完整的 Agent 观察能力。

| 能力 | 当前事实 | 复用边界 |
| --- | --- | --- |
| iframe 生命周期 | 已有 `READY`、`LOADED`、`COMPONENT_READY`、`RUNTIME_ERROR`、`RESIZE` | 部分事件带 preview request ID，但还没有统一 observation ID 和 render identity |
| DOM 节点信息 | iframe 和 `PrototypePagePreview` 都能读取 path、rect、样式、属性和源码位置 | 现有函数服务视觉编辑，未形成稳定 observation adapter |
| 节点树/缩略布局 | 已有 `COLLECT_VISUAL_NODE_TREE` 和 `COLLECT_THUMBNAIL_LAYOUT` | 请求和响应缺少严格请求身份；不能直接作为 Agent 观察协议 |
| 控制台链路 | author-site 已通过 WebSocket 向 agent-service 转发日志，`getConsoleLogs` 已可调用 | 当前按 session 聚合，没有 page、revision、request 身份 |
| Authority receipt | 已能证明 mutation durable commit | 不能证明浏览器已渲染或用户目标已满足 |
| projection 基础 | 有 surface 级 tracker、Authority ack contract 和 RunSummary | 当前 tracker 语义与调用链不足以证明 page/request 级真实投影，必须先修正 |
| Spine framing | `SpinePlayer` 已使用 `skeletonObj.getBounds()` 计算相机 | 尚未暴露 probe；骨骼边界也不等于 compositor 像素边界 |
| screenshot-service | 已支持独立 Chromium、缓存、批量和 fast/strict 产物 | 属于 E3 reference render，不证明当前用户 surface |

### 3.1 projection 前置缺口

实施 observation 前先处理以下事实：

- `PreviewProjectionTracker.onCommitted()` 当前会把 `appliedRevision` 推进到新提交 revision，同时设置 `invalidated=true`；字段混合了 committed baseline 与真实 projected revision。
- `PreviewProjectionTracker.ackPreview()` 只校验 revision 和 surface，不绑定 page、preview instance 或 render generation。
- 编辑页内容加载路径当前调用的是本地 tracker；真正向 Authority 发送 projection ack 的 `authorityState.ackPreview()` 需要接到实际渲染完成路径。
- 当前内容加载 ACK 使用可变的 `workspaceFlushRevisionRef.current`，它未必就是触发该次 iframe render 的 revision。revision/rootHash 必须在创建 render generation 时冻结并随请求传递。

在这些问题修复前，任何 observation 都只能称为“当前连接返回了一份结构数据”，不能称为指定 revision 的自验收证据。

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

| runtime | P0/P1 支持 | 后续方向 |
| --- | --- | --- |
| `prototype-html-css` | 完整 E1 DOM/布局观察，使用 Shadow DOM adapter | 按指标扩展局部视觉事实 |
| `high-fidelity-react` | 完整 E1 DOM/布局观察，使用 iframe bridge | P2 增加 Spine probe；其他播放器按指标接入 |
| `sandboxed-html` | 只返回宿主已知生命周期、iframe rect 和 `limited` capability | P3 单独设计受控跨源 probe bridge，禁止放宽 origin/ticket 隔离 |
| `sketch-scene` | 显式返回 `unsupported_runtime` | P3 由 sketch runtime 提供原生 scene adapter，不伪装成 DOM 观察 |

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

| 层 | 职责 | 明确不做 |
| --- | --- | --- |
| runtime adapter | 在浏览器本地解析 target，采集 viewport、DOM、资源和 runtime probe 事实 | 不认识 Agent、session、Authority；不决定完成措辞 |
| author registry | 注册当前页面/runtime/surface，冻结 render identity，路由 iframe/Prototype 请求 | 不保存长期 observation，不选择其他标签页 |
| LivePreviewChannel | 把当前 Agent run 与具体 WebSocket connection 绑定，发送请求和接收响应 | 不以 session 猜测“当前连接” |
| ObservationBroker | 管理 pending request、超时、断连、迟到响应、容量、权限和身份匹配 | 不读取跨项目任意页面，不回退旧缓存 |
| shared contract/evaluator | 定义 envelope、capability、状态轴、大小限制和纯断言语义 | 不读取 DOM，不依赖 React/Next/Fastify |
| Agent tool | 提供一个稳定的 `observePreview` schema，压缩结果供模型消费 | 不暴露任意 JS、任意 selector 或整页源码 |

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
  assertionStatus: "not-requested" | "passed" | "failed" | "uncertain" | "unsupported";
  evidence: {
    kind: "runtime-structure" | "current-surface-pixels" | "reference-render";
    precision: "layout" | "runtime-self-reported" | "painted-bounds" | "compositor" | "reference";
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

在 canonical `@preview/sdk` 中增加内部 probe registry，播放器挂载时注册、卸载时注销。registry 只提供受限 inspect snapshot，不暴露纹理、动画原始数据或用户资源正文。

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

E2 不纳入首版承诺。后续必须先完成载体和权限 ADR，评估浏览器扩展、桌面壳层能力、裁剪坐标、浏览器权限、用户可见提示和敏感 UI 泄露风险，再决定是否实现。

### 10.3 E3：reference render，保留

screenshot-service 继续用于：

- 无活动预览时的离线参考；
- 项目卡片和批量缩略图；
- 多 viewport 检查；
- 发布前严格参考渲染；
- 需要持久产物或跨会话比较的场景。

Agent `captureScreenshot` 后续可透传 screenshot-service 已有的 fast/strict render mode，并增加 region 语义，但结果始终是 E3。

## 十一、完成措辞与 RunSummary

| 证据 | Agent 可以声明 | 不得声明 |
| --- | --- | --- |
| committed receipt | 修改已提交 | 预览已更新、效果已实现 |
| matching projection ack | 指定 revision 已进入目标预览 surface | 用户目标已满足 |
| E1 observed，无 assertions | 已读取当前运行状态 | 已自行验证通过 |
| E1 assertions passed | 指定结构/布局条件已通过技术自验证 | 审美或像素效果已验收 |
| E2 compositor evidence | 当前 surface 的对应像素证据已检查 | 用户业务验收已完成 |
| E3 reference render | 独立参考渲染已检查 | 这就是用户当前画面 |

RunSummary 不新增一个模糊的 `asserted: true`。它保存有界 evidence summary：render identity 摘要、观察时间、evidence kind/precision、断言类型与结果、stale/unavailable 原因。原始节点和像素不进入长期 run log。

用户继续保留业务、审美和交互体验的最终验收权。

## 十二、实施阶段与任务拆解

### P0：projection 真值与最小单页闭环

目标：在不依赖 screenshot-service 的情况下，让 Agent 对 originating connection 当前活动单页取得可信 E1 摘要。P0 不交付画布、深度 sandbox、sketch、播放器或像素能力。

- [ ] **OBS-001 共享协议与容量边界**
  新增 preview observation contract、runtime guards、schema version、capability、identity、状态轴和集中容量常量。
  主要范围：`packages/shared/src/`、shared exports、contract tests。
  依赖：无。
  验收：畸形 identity、超大文本、非有限 rect、危险 URL 和超限 payload 均 fail closed。

- [ ] **OBS-002 修正 projection tracker 语义**
  将 committed baseline 与真实 projected revision 分开；实际 render 完成后调用 Authority projection ack；ACK revision 来自冻结的 render identity，不再读取可能已变化的全局 ref。
  主要范围：`preview-projection-tracker.ts`、`useWorkspaceAuthorityState.ts`、编辑页和 shared contracts。
  依赖：OBS-001。
  验收：commit 后未渲染保持 pending；旧 render 完成不能 ACK 新 revision；RunSummary 只在真实匹配 ACK 后显示 applied。

- [ ] **OBS-003 render identity 贯穿预览链路**
  为 high-fidelity iframe 和 Prototype adapter 建立 `previewInstanceId + renderGeneration + revision/rootHash`；生命周期响应回显 generation。
  主要范围：`iframe-types.ts`、`iframe-template.ts`、`PreviewPanel.tsx`、`PrototypePagePreview.tsx`、编辑页。
  依赖：OBS-001、OBS-002。
  验收：快速切页、重复编译、配置更新和 iframe 重建均不会让旧响应命中新实例。

- [ ] **OBS-004 typed auxiliary WebSocket channel**
  在 `StreamService` 和 agent-service WebSocket 协议中增加类型化 preview registration/request/result 消息；console 转发改用正式方法，不再从 hook 通过 `any` 访问私有 `ws`。
  主要范围：`ai-chat-shared` StreamService、`useConsoleBuffer`、`websocket.ts`、`ws-event-router.ts`。
  依赖：OBS-001。
  验收：observation 与 console/Agent stream 可并行传输；消息有大小限制；协议错误不终止正常 Agent stream。

- [ ] **OBS-005 connection-scoped PreviewObservationRegistry**
  author-site 注册当前活动单页及 runtime adapter，页面隐藏、切换、sleeping、卸载和重建时失效旧实例。
  主要范围：author-site 编辑页、demo-ui preview 组件。
  依赖：OBS-003、OBS-004。
  验收：同 session 两个标签页各自只响应自己发起的 run；非活动 pageId 返回 unavailable。

- [ ] **OBS-006 有界 ObservationBroker**
  建立 pending request registry、originating connection 绑定、超时、AbortSignal、断连清理、迟到响应丢弃和进程容量淘汰。
  主要范围：`packages/agent-service/src/session/`、WebSocket route。
  依赖：OBS-004。
  验收：超时、断连、重连、重复 response、错误 connection 和错误 identity 都返回稳定错误且无 pending 泄漏。

- [ ] **OBS-007 最小 runtime facts collector**
  为 Prototype 和 high-fidelity React 提供 page summary、单 target、有限 ancestors、图片状态、overflow 和 runtime error facts。默认不采集整树。
  主要范围：demo-ui runtime adapters。
  依赖：OBS-001、OBS-003、OBS-005。
  验收：表单值/contenteditable/完整 URL query 不出现在结果；sandbox 返回 limited，sketch 返回 unsupported。

- [ ] **OBS-008 `observePreview` Agent 工具**
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

- [ ] **OBS-101 共享 assertion evaluator**
  实现首批断言、容差、边界值、precision 和 unsupported 规则；使用脱敏 facts fixtures 回放。
  依赖：P0。
  验收：每种断言覆盖 transform、滚动、零尺寸、缺失 target 和非有限数值。

- [ ] **OBS-102 target resolution**
  实现 node ID、显式 selected element 和 source location candidates；歧义时返回候选，不自动选择。
  依赖：OBS-007、OBS-101。
  验收：DOM path fallback 标记为 unstable；页面重渲染后不能把旧 unstable ID 当成稳定身份。

- [ ] **OBS-103 RunSummary 与完成措辞**
  写入有界 evidence summary，更新 Agent system prompt 和前端展示；严格区分 committed/projected/observed/assertion passed/E3 reference。
  依赖：OBS-101。
  验收：无 assertions 不显示“验证通过”；reference screenshot 不显示“当前画面已验证”。

- [ ] **OBS-104 诊断摘要与指标**
  记录 observation latency、payload bytes、stale/unavailable/timeout 率、assertion 类型和结果；不记录节点树、文本、URL 或输入值。
  依赖：P0。
  验收：诊断导出不包含 observation 原文，且可按 project/session/run/identity 摘要定位失败阶段。

- [ ] **OBS-105 P1 浏览器验收集**
  覆盖中心、四角、滚动、transform、overflow、display/visibility/opacity、图片失败和运行时错误。
  依赖：OBS-101 至 OBS-104。
  验收：结构化结果与浏览器人工测量一致；近似能力不出现在首批确定规则中。

### P2：Spine 与复杂绘制最小闭环

目标：解决“播放器外框正确但动画内容偏移”的首个高价值场景。

- [ ] **OBS-201 canonical probe registry**
  在 `@preview/sdk` canonical source 建立 WeakMap/受限 snapshot registry，定义注册、注销、capability 和数据校验。
  依赖：P1。
  验收：组件卸载、热更新和页面切换无残留 probe；任意非有限/超界 bounds 被拒绝。

- [ ] **OBS-202 Spine probe adapter**
  暴露 ready、animation、loop、track time、skeleton bounds、camera、fit/alignment、canvas CSS/backing-store 尺寸和投影后的 painted bounds。
  依赖：OBS-201。
  验收：不同 skeleton bounds、viewport 比例、fit/alignment 和动画帧下均返回带时间范围和 precision 的结果。

- [ ] **OBS-203 媒体断言**
  增加 animation-playing/name/loop 和 painted-bounds centered，明确 runtime-self-reported/painted-bounds 精度。
  依赖：OBS-202。
  验收：无 probe 时返回 unsupported，不回退 DOM 外框并声称动画内容居中。

- [ ] **OBS-204 runtime 产物同步与验收**
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

- [ ] **OBS-401 E2 载体 ADR**：评估浏览器扩展、桌面壳层或暂不实现；记录权限、裁剪、DPR、缩放、敏感 UI 和用户提示边界。
- [ ] **OBS-402 current-surface crop identity**：只有 ADR 通过后实现 viewport/surface/region 与 render identity 绑定。
- [ ] **OBS-403 captureScreenshot 参数收敛**：向 Agent 工具透传 screenshot-service 已有 fast/strict，按需增加 region；所有结果保持 E3。
- [ ] **OBS-404 UI 证据标签**：清晰区分 runtime structure、current-surface pixels 和 reference render。

### P5：数据驱动优化

- [ ] **OBS-501 指标复盘**：观察调用率、P50/P90、payload、timeout、stale、断言失败和修复成功率。
- [ ] **OBS-502 回放集**：保留不含用户正文的中心、溢出、图片、Spine 和旧 revision facts fixtures。
- [ ] **OBS-503 扩展决策**：只有指标证明必要时扩大整树、播放器、sandbox、canvas 或 E2 能力。

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

- commit 后立即 observe，确认等待的是对应 render generation；
- 修改后快速切页，旧 response 不得命中；
- 同 session 两个标签页同时打开，只响应 originating connection；
- iframe sleeping、编译失败、runtime error、页面卸载和 WebSocket 重连；
- screenshot-service 不健康时 E1 工具仍可用；
- Prototype 与 high-fidelity React 返回同一 envelope，不要求内部采集实现相同；
- sandbox/sketch 首版返回明确 limited/unsupported；
- Spine 外框居中但 skeleton bounds 偏移时不得产生假阳性。

## 十五、风险与应对

| 风险 | 应对 |
| --- | --- |
| 旧页面/旧 revision 被误判通过 | identity-first、originating connection、preview instance + generation、Broker fail closed |
| 协议字段膨胀成“文本截图” | 默认 page summary/单 target、64KB 上限、capability 和 detail 分级 |
| 多 runtime 逻辑漂移 | shared contract/evaluator，runtime 只实现 adapter |
| probe 被同 realm 页面代码伪造 | 标记 self-reported precision、服务端校验 bounds、不能作为安全或 compositor 证明 |
| 持久状态与瞬时证据混淆 | evidence record 绑定 identity/observedAt，不保存单一 asserted 布尔值 |
| 动画永不稳定 | 有界时间窗口采样，返回 uncertain 和采样范围，不等待静止 |
| sandbox 为观察而降低隔离 | 不放宽 origin/ticket；安全 bridge 不成立时保持 limited |
| current-surface capture 泄露编辑器 UI | E2 独立 ADR、严格 surface crop、权限与用户提示 |
| observation 阻塞 Agent stream | auxiliary channel、并发/超时上限、AbortSignal 和断连清理 |

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

## 十九、相关文档

- [实时预览机制](../../项目文档/创作端/04-配置与预览/技术/02_实时预览机制.md)
- [截图服务与预览快照机制](../../项目文档/创作端/04-配置与预览/技术/07_截图服务与预览快照机制.md)
- [截图服务性能优化方案](../../项目文档/创作端/04-配置与预览/技术/09_截图服务性能优化方案.md)
- [AI 行为约束机制](../../项目文档/创作端/05-AI对话/技术/03_AI行为约束机制.md)
- [独立 Agent 服务层核心模块设计](../../项目文档/独立Agent服务层/03-核心模块设计.md)
