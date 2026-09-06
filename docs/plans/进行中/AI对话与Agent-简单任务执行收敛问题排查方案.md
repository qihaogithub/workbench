---
covers:
  - packages/author-site/src/lib/agent/prompts/system-prompt.md
  - packages/author-site/src/app/demo/[id]/edit/hooks/useVisualEditState.ts
  - packages/author-site/src/app/demo/[id]/edit/hooks/useWorkspaceAuthorityState.ts
  - packages/demo-ui/src/iframe-types.ts
  - packages/agent-service/src/backends/pi-agent.ts
  - packages/agent-service/src/backends/pi-tools/index.ts
  - packages/agent-service/src/backends/pi-tools/authority-result-summary.ts
  - packages/agent-service/src/backends/pi-tools/edit-file-tool.ts
  - packages/agent-service/src/backends/managers/tool-hook-manager.ts
  - packages/agent-service/src/session/run-log-store.ts
  - packages/agent-service/src/core/backend-agent.ts
  - packages/agent-service/src/core/types.ts
  - packages/agent-service/src/routes/ws-event-router.ts
  - packages/ai-chat-shared/src/chat/services/stream-service.ts
  - packages/ai-chat-shared/src/chat/hooks/use-chat-stream.ts
  - packages/ai-chat-shared/src/chat/chat-messages.tsx
---

# AI 对话与 Agent 简单任务执行收敛问题排查方案

> 状态：核心实施完成，真实回放与 guard 待代表性运行数据
> 日期：2026-09-06
> 文档性质：单次真实运行的证据复核、根因判断、实施与验证方案
> 原始证据：用户提供的 `对话记录-2026-9-6-session-.json`（未纳入仓库）

## 一、结论摘要

本次任务不是“模型不会做”，也不能仅凭单个样本归因于某个模型或供应商。记录表明 Agent 最终完成了目标文件修改，并取得 `committed=true` 的 Workspace Authority receipt 与 `runtimeValidation.ok=true`；主要异常是**执行前长时间围绕同一歧义反复权衡，执行后留下了可见内容与配置语义不一致的产物**。

经源码复核，最可信的根因按优先级为：

1. **P0：选区已有的语义和源码定位信息没有进入对话引用。** `VisualNodeInfo` 已包含 `componentName`、`sourceFile`、`sourceStart/sourceEnd`、`sourceLine/sourceColumn`、父路径、属性和尺寸，但 `buildVisualSelectionPrompt()` 只发送标签、DOM 路径、class、文本和一个推定的 `index.tsx` 路径。本次选中节点又恰好缺少 class/text，最终只剩“内容区域 + 通用 DOM 路径”，直接放大了目标识别成本。
2. **P0：素材替换与配置契约发生真实冲突，但系统没有给出单次分叉规则。** 附件图片把“2908 人已参与”固化在位图中，而原组件仍有动态 `count`。Agent 既不能在用户未明确要求时删除配置字段，也不应让字段继续存在却失去可见作用；当前提示只分别规定了“执行要收敛”和“配置字段不得擅自增删”，没有说明两者冲突时应如何一次性决策。
3. **P1：模型可见的写入结果没有明确表达 Authority 终态。** `editFile` 把 receipt 放在 `details.receipt`，应用层会据此记录文件变更并生成 `RunSummary`；但工具的文本 `content` 只说替换成功和 validation 结果。不能假设所有模型/供应商适配器都会读取或重视 `details`，而系统提示又要求模型只有看到 receipt 才能宣称提交成功。本次“没有收到 receipt”的 reasoning 更像反馈契约不清晰，而不是可以确定的模型事实提取错误。
4. **P1：当前日志能证明工具不是主要耗时，却还不能稳定拆分模型、供应商和编排时间。** run log 已记录时间戳、模型 ID、thought 长度、工具事件、工具耗时和能力加载耗时，但没有直接汇总端到端阶段指标；附件导出也没有保留完整的运行元数据。

图片能力按需加载不是本次主要瓶颈：附件已经在首轮作为 image part 直传给多模态模型，自动入库后也会注入 image ID/URL；`activateCapabilities(image)` 的工具耗时只有几十毫秒。真正缺少的是自动入库结果中的宽高、MIME 等最小文字元数据，以及明确说明“当前附件无需再次读取”的指引。

因此，优先方案不是先增加全局任务分类器或固定工具调用上限，而是先修正**选区输入、配置冲突分叉、模型可见的提交结果**这三项确定性契约，再用代表性回放决定是否需要编排级防循环机制。

上一版“20% / 35% / 45%”之类精确归因比例没有实验依据，应废弃。

## 二、证据边界与口径校正

### 2.1 可以确认

- 用户任务是单页面、单图片、局部视觉替换。
- 记录包含 68 个 reasoning part、10 次工具调用，没有 `delegateTask`、计划审批、权限等待或工具失败。
- 工具返回中存在 `receipt.committed=true` 和 `runtimeValidation.ok=true`。
- 没有对应 revision 的 projection ack；`getConsoleLogs` 还提示预览可能尚未打开，因此只能证明文件已提交，不能证明视觉结果已在预览中正确呈现。
- 最终页面把包含“2908 人已参与”的静态图片作为可见内容，同时仍保留 `count: 128`，并用 `count` 生成图片 `alt`，造成视觉内容与无障碍文本不一致。

### 2.2 需要谨慎解释

- **68 个 reasoning part 是流式/导出分段，不等于 68 次独立模型请求，也不等于 68 次完整决策。** “反复推翻判断”的结论应建立在内容语义重复上，不能只靠 part 数量。
- assistant part 时间戳跨度约 121.7 秒；10 次工具调用的累计工具耗时约 14.5 秒。由于工具可并行，累计耗时不是工具占用的墙钟时间，不能直接相减得到精确“模型时间”。它只能说明工具执行总量远小于总跨度；若各工具耗时口径一致且都落在该区间内，约 107 秒可视为非工具墙钟时间的保守下界，而不是精确分解。
- 附件没有实际模型变体、供应商请求阶段、token usage 和服务端排队数据，不能判断这段非工具时间中多少来自模型生成、首 token 等待、网络或 Agent loop 调度。
- 当前前端“思考深度”通过完整模型变体 ID（如 `-low/-medium/-high`）表达，Pi Harness 本身仍以 `thinkingLevel: "off"` 初始化。后续统计应记录**最终解析后的完整模型 ID/变体**；在建立真实映射前，不应笼统记录一个可能与实际请求不一致的 `reasoning effort` 字段。

## 三、运行时间线

| 阶段 | 记录证据 | 判断 |
| --- | --- | --- |
| 初始定位 | `readFile(index.tsx)`、`listFiles` | 读取目标文件合理；返回 1034 行使定位上下文偏大，但不是主要耗时 |
| 配置确认 | 并行读取 `config.values.json`、`config.schema.json` | 必要，因为图片固化人数与动态 `count` 存在契约冲突 |
| 目标权衡 | 多个 reasoning part 反复讨论“整个模块/文字区域/配置字段” | 主要收敛问题；根因是选区信息弱且冲突分叉缺失 |
| 图片处理 | `activateCapabilities(workspace,image)`、`readUserImage`、`listImages` | 当前附件已直传并自动入库；这组调用多数可省，但工具耗时本身不是瓶颈 |
| 文件提交 | 一次 `editFile` | 写入成功，receipt 与 runtime validation 均存在 |
| 提交后检查 | `readFile`、`getConsoleLogs` | 代码复读可确认文本结果；没有 projection ack 或截图，不能视为视觉验收 |
| 最终回复 | 汇报已完成并展示图片 | “文件已提交，预览未验证”才是准确状态；配置语义仍未闭环 |

工具链并不长，问题集中在工具之间的决策质量和工具结果之后的状态表达。

## 四、根因分析

### 4.1 P0：选区上下文丢失了已有的稳定定位信息

当前 `VisualNodeInfo` 已经提供：

- `componentName`；
- `sourceFile`、`sourceStart/sourceEnd`、`sourceLine/sourceColumn`；
- `parentPath`、`attrs`、`rect`；
- `domPath`、class、文本和可编辑能力。

但 `buildVisualSelectionPrompt()` 当前只传：

- 元素标签；
- DOM 路径；
- class；
- 文本；
- 根据页面 ID 拼出的 `demos/{pageId}/index.tsx`。

本次节点没有 class 和文本，标签又被 UI 归纳为泛化的“内容区域”，导致模型只能从整页源码、图片语义和 DOM 层级反推目标。这里应先消费已有元数据，而不是立即设计一套新的全局 `regionId` 协议。

只有当源码 instrumentation 确实拿不到稳定位置、且回放证明现有字段仍不足时，再评估 `data-region-id` / `data-ai-region`。新增业务 region 协议会影响页面生成、运行时和存量页面约定，不应作为本问题的第一修复。

### 4.2 P0：配置保护规则缺少“替换导致绑定失效”的冲突分叉

当前规则分别要求：

- 简单低风险任务直接执行；
- 配置字段增删必须由用户明确指示；
- 目标不明确时才澄清；
- 确认单一路径后停止比较。

这些规则本身合理，但本次不是普通样式歧义，而是可验证的语义冲突：整张位图已经包含人数，继续显示动态 `count` 会重复；不显示 `count` 又会使现有配置成为死字段。

正确的收敛规则应是：

1. 若附件替换不会改变现有配置字段的可见作用，直接执行。
2. 若替换会让某个现有配置字段失效、与位图内容冲突或造成可见值/无障碍文本不一致，只提出一个窄问题，例如“参与人数还需要随配置动态变化吗？”
3. 用户选择静态视觉后，才同步删除或改写 `count` 契约；用户选择动态人数时，必须使用不包含固定数字的素材，或把图片拆为头像/背景与动态文本。
4. 不允许用“字段仍保留但仅写进 alt”作为兼容方案。

这条规则比“允许一个低风险假设”更准确，因为本次冲突会改变配置契约，不属于低影响细节。

### 4.3 P1：模型状态反馈与应用状态反馈没有对齐

现有链路已经具备两套正确基础设施：

- `editFile` / `writeFile` 的 `details.receipt` 是 live Workspace 提交依据；
- `ToolHookManager` 汇总 receipt，`PiAgentBackend.buildRunSummary()` 生成 `mutations/projections`，`useChatStream` 和 `chat-messages` 用结构化状态展示“已提交 N 项修改”。

问题不在于缺少 `RunSummary`，而在于它在 `harness.prompt()` 结束后才生成，主要服务应用层 UI；模型在同一轮工具后的下一次推理主要看到工具 `content`，而该文本没有明确的 `committed/revision/validation` 摘要。

建议保持职责分离：

- `details.receipt` 和 `RunSummary` 继续作为应用层权威结构，不改变现有字段位置。
- 写工具的模型可见 `content` 追加一行短状态，例如：`Authority committed: revision=123; runtimeValidation=ok; previewProjection=not_verified.`
- 由统一 helper 生成这段文本，供 `editFile`、`writeFile`、创建/删除页等 Authority 写工具复用，避免各工具自行拼接漂移。
- 模型只据该状态决定最终措辞；前端仍只信 receipt / projection ack，不信模型自然语言。

上一版建议把 receipt 字段“扁平化到工具返回顶层”不符合当前 `AgentToolResult { content, details }` 契约，也会和既有消费者重复，应取消。

此外，当前 `RunSummary` 是 prompt 完成时的快照：当 projection ack 稍后到达时，本轮历史消息未必会自动更新。这个时序问题影响“预览已验证”的展示准确性，但不是本次 121.7 秒收敛问题的主要根因，应作为独立 P1 验证项处理。

### 4.4 P1：附件快速路径已有一半，不应重复造能力预热

`PiAgentBackend.sendMessage()` 当前已经：

- 把本轮图片作为 image part 传给多模态模型；
- 自动写入图片存储与项目图片清单；
- 在 prompt 中给出 image ID 和 URL；
- 提示仅在需要重新查看时调用 `readUserImage`。

因此不需要为了本轮附件默认开放完整 `image` capability，也不应把生成、抠图、截图或子 Agent 一并预热。更小的修复是：

- 自动入库成功后，把 `name/MIME/width/height/size/imageId/URL` 中可用的最小集合写入附件摘要；
- 明确写出“本轮图片已直接提供给模型，直接引用 URL 时无需调用 `readUserImage` 或 `listImages`”；
- 只有需要回看历史图片、搜索项目素材、截图或生成素材时，才激活 `image` capability。

这能减少一次能力决策和两次冗余读取，同时保留渐进披露的工具面控制。

### 4.5 P1：观测应先补“可直接测量项”，不要伪造语义指标

现有 run log 已有事件时间戳、模型、thought 内容长度、工具名、工具结果和 `durationMs`。第一阶段应从这些数据直接汇总：

- `runDurationMs`；
- `firstThoughtMs`、`firstToolMs`、`firstTextMs`、`finishMs`；
- `thoughtEventCount`、`thoughtCharCount`（明确它们是流式事件指标）；
- `toolCallCount`、工具耗时总和与工具区间并集；
- `capabilityActivationCount/DurationMs`；
- `mutationCommitted`、`runtimeValidationOk`、`projectionStatus`；
- 最终解析后的完整模型 ID、provider ID。

`decisionRevisionCount`、`重复目标判断`、`是否已锁定假设` 不是当前事件能够可靠推导的事实。若需要这些指标，应在离线 eval 中由规则或 grader 对脱敏后的 trace 评分，不应先把它们做成生产运行时字段。

### 4.6 P2：一次样本不足以证明需要全局硬预算

上一版提出“目标重判最多 1 次、工具循环最多 4 次、截图作为第 5 次”。该上限缺少基线，且工具调用数受并行读取、运行时类型、校验失败和 Authority 冲突影响，硬切断可能让原本可自修复的简单任务半途结束。

更安全的顺序是：

1. 先修复选区、配置冲突和模型可见终态。
2. 用回放集测量工具调用与端到端延迟分布。
3. 若仍有重复行为，优先增加确定性 guard，例如“同一 revision 下不得无理由重复读取同一文件”“成功提交且 validation 通过后最多进行一次相关验证”。
4. 只有 eval 证明收益且误杀率可接受时，才启用任务分类或按类型预算；先灰度、可观测、可回退，不能直接作为 P0 硬规则上线。

现有无进展超时已明确不把 thought 当作实质活动，但默认是分钟级故障保护，用于卡死收束，不等同于简单任务优化，也不应为了单个慢样本直接大幅缩短。

## 五、推荐实施方案

### 5.1 P0：增强现有选区引用，不新增协议

修改 `buildVisualSelectionPrompt()`，按可用性发送：

- 页面 ID 与真实运行时文件；
- `componentName` + tag；
- `sourceFile` 与源码位置；
- DOM/parent path；
- text、class、关键 attrs（src/alt/role/aria-label）；
- rect 宽高；
- `editCapabilities`。

优先使用 `sourceFile + sourceLine/sourceStart` 定位，DOM path 仅作运行时辅助。若 `sourceFile` 缺失，才回退到 `demos/{pageId}/index.tsx`；原型页还需要按 runtimeType 指向 `prototype.html/prototype.css`，不能永远假定 React 页面。

同时为 `buildVisualSelectionPrompt()` 增加纯函数测试，覆盖：

- 有完整源码位置；
- 只有 DOM 路径；
- 无 class/text 的泛化容器；
- 图片元素；
- 原型页运行时文件。

### 5.2 P0：加入配置绑定冲突的一次性决策规则

在 `system-prompt.md` 的执行收敛和配置约束之间增加一条短规则：

```text
若素材替换会使现有配置字段失去可见作用、与素材中的固定内容冲突，或造成视觉值与 alt/aria 文本不一致，不要自行保留死字段或删除配置；只提出一个最小澄清问题。用户确认静态内容后再同步修改配置契约，确认动态内容后保留字段并使用不含固定值的素材。
```

不要再追加通用“多思考/少思考”说明；当前 prompt 已有单一路径收敛规则，只需补上这个缺失分叉。

### 5.3 P1：统一生成模型可见的 Authority 状态摘要

新增一个小型纯函数，根据工具结果生成模型可见状态：

```text
Authority committed: revision=<n>; runtimeValidation=<ok|failed|not_applicable>; previewProjection=not_verified.
```

要求：

- 只有真实 `receipt.committed=true` 才输出 committed；
- validation 失败时保留现有 repair 指令；
- 未收到 projection ack 时固定为 `not_verified`，不能写“预览已更新”；
- `details`、`ToolHookManager`、`RunSummary` 继续保留权威结构化数据；
- 各 Authority 写工具复用同一 helper 和测试。

另行验证 `RunSummary` 的 finish fallback 与晚到 projection ack 更新，避免把这个展示问题混入简单任务的停止逻辑。

### 5.4 P1：补齐当前附件摘要，保留按需能力

在自动入库摘要中加入真实可得的宽高、MIME 和大小，并明确本轮无需再次回读。不要改动 `INITIAL_TOOL_NAMES`，不要默认激活完整 `image` capability。

当前实现对本轮已直传给模型的图片统一保留原图输入，并在自动入库摘要中提供相同的 image ID/URL、MIME、尺寸和大小；无需再次读取像素或历史素材时，不应调用 `readUserImage` / `listImages`。文本模型的独立图片预描述链路仍属于既有测试契约中的后续核对项，本次不借新增工具能力掩盖其现状。

### 5.5 P1：先做运行指标聚合，再决定 guard

在 `run-log-store.ts` 里以 run start 时间为基准聚合可直接测量的阶段指标，并把摘要写入 finish payload/结构化诊断。不要把完整 prompt、图片内容、工具大结果或凭证写入指标。

在回放工具中计算工具区间并集，而不是把 `durationMs` 简单相加后直接从总时间扣除。若当前事件只有 duration 没有明确开始/结束时间，再为工具事件补齐单调时间或相对时间。

第一阶段只记录完整模型变体 ID。若未来把 Pi Harness `thinkingLevel` 真正接入运行配置，再单独记录“请求到 provider 的 thinking level”，不能从 UI 选择或模型名称猜测。

### 5.6 P2：基于 eval 决定是否启用防循环 guard

候选 guard 只考虑可确定判断：

- 同一文件、同一 revision/hash、无中间写入的重复读取；
- receipt committed + runtime validation ok 后的无关继续搜索；
- 同一工具以相同参数连续调用；
- validation 通过后超过一次的重复验证。

guard 首先只记录命中，不改变执行；确认误报率后再灰度提示或中断。不要把“reasoning part 数”或模型自然语言中的方案名称作为生产硬状态。

## 六、验证与验收

### 6.1 回放集

至少准备以下代表性任务，每类运行 10 次以上，并保留实际完整模型变体、provider 和阶段时间：

1. 单图片替换，无配置冲突。
2. 单图片替换，图片固定文字与动态配置冲突。
3. 单文案修改。
4. 局部样式修改。
5. 选区信息完整，可直接定位源码。
6. 选区只有 DOM 路径，需要一次源码确认。
7. 真实双目标歧义，需要一个澄清问题。
8. 写入后 validation 失败，需要自修复。

比较至少包括：修复前基线、仅增强选区、再加入配置冲突规则、再加入工具终态摘要。这样才能判断每项改动的独立贡献。

### 6.2 核心指标

- 任务成功率与错误修改率；
- 配置语义一致率；
- 视觉文本与 alt/aria 一致率；
- 无需澄清任务的端到端 p50/p95；
- 需要澄清任务是否只提出一个聚焦问题；
- 首工具时间、提交时间、最终完成时间；
- 工具调用数、重复读/重复同参调用率；
- receipt / runtime validation / projection 状态在模型回复与 UI 中的一致率。

不把“工具调用不超过 4 次”设为验收目标；工具数是诊断指标，不是业务成功标准。

### 6.3 正确性门槛

- receipt 与 UI `committed` 判断准确率 100%；
- 没有 projection ack 时不得宣称预览已验证；
- 不产生死配置字段；
- 位图固定文字与可访问文本不得互相矛盾；
- 安全权限、Authority 单写者、配置字段显式授权和 validation 自修复能力不回退；
- guard 如进入灰度，不得阻断 validation 失败后的必要修复。

### 6.4 建议测试位置

- `packages/author-site/src/app/demo/[id]/edit/__tests__/useVisualEditState.test.tsx`：选区 prompt 的完整元数据与回退路径；
- `packages/author-site/src/lib/agent/__tests__/system-prompt.test.ts`：配置冲突分叉的最小文本契约；
- `packages/agent-service/tests/unit/pi-agent.test.ts`：图片摘要、当前附件无需回读的提示、run summary 时序；
- `packages/agent-service/tests/unit/edit-file-tool.test.ts` 与对应 write/create/delete 测试：模型可见 Authority 状态摘要；
- `packages/agent-service/tests/unit/tool-hook-manager.test.ts`：receipt 仍是结构化权威；
- `packages/agent-service/tests/unit/backend-agent-inactivity-timeout.test.ts`：保留 thought 不重置无进展计时器的现有边界；
- `packages/agent-service/tests/unit/ws-event-router.test.ts`：run summary 透传与 finish fallback；
- `packages/ai-chat-shared` 相关 stream/message 测试：已提交、预览未验证、预览已应用、预览失败。

## 七、实施清单

- [x] 复核原始记录中的用户请求、reasoning、工具结果和时间戳。
- [x] 区分 reasoning part、模型请求、工具累计耗时和墙钟时间。
- [x] 核对图片附件直传、自动入库和按需能力现状。
- [x] 核对选区已有字段与实际注入字段。
- [x] 核对 editFile receipt、ToolHookManager、RunSummary 和前端展示链路。
- [x] 废弃无依据的精确归因比例和固定四次工具预算。
- [x] P0：增强 `buildVisualSelectionPrompt()`，优先使用既有源码定位元数据。
- [x] P0：为“素材替换导致配置绑定失效”增加一次性澄清规则。
- [x] P1：统一写工具的模型可见 Authority 状态摘要。
- [x] P1：补齐当前图片附件摘要，不扩大初始工具集。
- [x] P1：补齐可直接测量的 run 阶段指标；沿用现有 diagnostics/export 作为日志复现入口。
- [x] P1：验证并修复 RunSummary finish fallback / 晚到 projection ack 时序。
- [ ] 待具备实际模型、provider 和样本集后，用代表性任务集比较改动前后成功率、语义一致率和 p50/p95。
- [ ] 只有回放仍证明存在重复行为时，再灰度确定性 guard；当前仅记录指标，不改变执行。

实施验证记录（2026-09-06）：

- 选区源码上下文、prototype runtime 文件回退、配置冲突提示、Authority 摘要、图片元数据和 projection pending/late ack 均已增加单元测试或组件测试。
- `@workbench/agent-service`、`@workbench/ai-chat-shared`、`@workbench/author-site` 类型检查通过；Authority/run-log 与 author 相关定向测试通过。
- 当前 agent-service 全量 `pi-agent` 测试仍有 5 个既有失败，集中在旧的 text-only 图片预描述 mock/实现契约和缺失的 `complete` mock，不由本次改动引入；未借本次收敛改动扩大范围修复。
- 真实 10×回放、前后基线对比和确定性 guard 未执行：当前没有新的代表性模型运行样本与可安全复现的完整 provider 凭据，继续保持 guard 为 record-only。

## 八、风险与非目标

- 本文不根据单个样本选择或淘汰模型。
- 本文不把模型 reasoning 流式文本保存为新的生产业务数据。
- 本文不默认开放图片生成、抠图、截图或子 Agent 能力。
- 本文不新增全局 `regionId` 协议；除非现有源码定位元数据经回放证明不足。
- 本文不以缩短超时替代收敛设计；超时是故障保护，不是性能优化。
- 本文不授权直接修复示例项目中的 `count`；其静态/动态产品语义仍需业务确认。

## 九、最终判断

本次慢执行的最准确描述是：**一个存在配置契约冲突的局部图片替换任务，因选区引用丢失已有语义定位信息而扩大了搜索空间，又因模型可见的提交终态不清晰而增加了收尾不确定性。**

优雅且可维护的处理顺序是：先把已有事实送完整、把真实冲突压缩成一次选择、把 Authority 结果用同一份结构生成模型可见摘要；随后用回放数据决定是否需要更强的编排 guard。这样既能缩短简单任务，又不会牺牲复杂任务的自修复能力，也避免重复建设现有 `RunSummary`、渐进工具加载和超时机制。

外部模型调优依据可参考 [OpenAI Model guidance](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-5.5)：其建议从最小可用 prompt 和代表性基线开始，明确结果、成功标准与停止条件，并只在 eval 证明收益时提高 reasoning effort。该指导支持本文的验证方法，但不能替代本项目自身的回放数据。
