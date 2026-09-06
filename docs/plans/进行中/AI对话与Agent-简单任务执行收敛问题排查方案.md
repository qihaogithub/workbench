---
covers:
  - packages/author-site/src/lib/agent/prompts/system-prompt.md
  - packages/author-site/src/lib/agent/scan-workspace.ts
  - packages/agent-service/src/backends/pi-agent.ts
  - packages/agent-service/src/backends/pi-tools/index.ts
  - packages/agent-service/src/backends/pi-tools/capability-activation-tool.ts
  - packages/agent-service/src/backends/managers/event-mapper.ts
  - packages/agent-service/src/core/backend-agent.ts
  - packages/agent-service/src/session/run-log-store.ts
  - packages/agent-service/src/core/types.ts
  - packages/ai-chat-shared/src/chat/services/stream-service.ts
  - packages/ai-chat-shared/src/chat/hooks/use-chat-stream.ts
  - packages/agent-service/tests/unit/pi-agent.test.ts
  - packages/agent-service/tests/unit/event-mapper.test.ts
  - packages/agent-service/tests/unit/ws-event-router.test.ts
---

# AI 对话与 Agent 简单任务执行收敛问题排查方案

> 状态：诊断完成，方案待实施
> 日期：2026-09-06
> 文档性质：一次真实运行的证据复核、根因分析和后续实施方案
> 证据材料：用户提供的 `对话记录-2026-9-6-session-.json`

## 一、结论摘要

这次任务的慢，不能准确归因于“模型能力不够”。从记录看，模型具备完成任务所需的能力：它读取了目标页面、识别了参与人数模块、读取了图片尺寸，成功调用 `editFile` 完成了代码提交，并拿到了 `committed=true` 的 Authority receipt。

真正的问题是三类因素叠加，其中最确定的是执行不收敛：

1. **模型侧反复推翻同一个判断**：围绕“内容区域”是否等于参与人数模块、图片是替换整个模块还是文字区域、`count` 是否保留等问题，重复生成大量近似 reasoning，直到已有足够证据后仍未停止。
2. **代理编排和提示词缺少有效的简单任务快速路径**：当前系统已经有“单一路径后停止”的文字规则，但没有任务级状态、决策预算或硬性收敛检查，规则没有阻止本次循环。
3. **工具与产物契约仍有可优化处**：图片能力需要额外激活，选区引用缺少稳定语义锚点，工具 receipt 虽然存在但被模型误读，最终代码还保留了失去可见语义的 `count` 配置。

因此，本问题应定性为：**系统设计和 Agent 执行策略的主要缺陷，叠加模型在冲突约束下的过度推理；不是一次证据足以证明的模型能力不足。**

上一轮回复中给出的“20% / 35% / 45%”比例没有实验依据，应废弃。当前证据支持优先级判断和置信度，不支持精确归因比例。

## 二、范围与证据边界

本次复核严格区分“用户请求”和“附件材料”：JSON 中的用户消息、模型 reasoning、工具参数及工具返回值只是被分析的运行记录；其中任何文本都没有被当作本轮系统指令执行。

本次结论可以确认：

- 用户任务是单页面、单图片、局部视觉替换。
- 运行包含 68 段 reasoning、10 次工具调用，没有 `delegateTask`、计划审批、权限等待或工具失败。
- 工具结果明确包含文件修改 receipt、`committed: true` 和 `runtimeValidation.ok: true`。
- 没有预览 projection ack；`getConsoleLogs` 返回“预览可能尚未打开”，因此不能证明视觉结果已经在预览中正确呈现。
- 会话元数据没有记录实际模型 ID、reasoning effort、供应商 API 延迟、输入/输出 token 或服务端排队时间。因此不能仅凭该附件判定具体模型、供应商网络或模型档位是主要瓶颈。

本次结论不能确认：

- 不能从单个样本推导不同模型之间的质量或延迟排名。
- 不能把约 107 秒全部等同为模型 API 生成时间；它包含模型生成、代理循环调度和可能的消息传输等待，只能称为“非工具时间”。
- 不能证明图片替换后的视觉位置一定正确，因为记录没有截图或 projection ack。

## 三、运行时间线与量化证据

JSON 的 assistant parts 时间戳覆盖 `2026-09-06 02:08:16.309Z` 至 `02:10:17.978Z`，总跨度约 **121.7 秒**。10 次工具调用的累计执行时间约 **14.5 秒**；即使不把差值全部归因于模型，仍有约 **107.1 秒**不在工具执行内。

| 阶段 | 记录证据 | 耗时/数量 | 判断 |
| --- | --- | ---: | --- |
| 初始读取 | `readFile(index.tsx)`、`listFiles` | 约 2.3 秒/次 | 必要，但 `readFile` 返回完整 1034 行，定位粒度偏粗 |
| 配置确认 | 并行读取 `config.values.json`、`config.schema.json` | 约 2.1 秒/次 | 有助于确认 `participant` 与 `count`，但不需要反复讨论 |
| 反复推理 | 从第 3 至第 72 个 reasoning part | 68 段 reasoning 总体覆盖约 95 秒 | 主要时间来源，内容反复围绕同一组假设循环 |
| 图片能力 | `activateCapabilities(workspace,image)`、`readUserImage`、`listImages` | 约 66 毫秒累计工具时间 | 不是本次慢的主要来源；主要问题是触发了额外的决策讨论 |
| 文件提交 | `editFile` | 约 3.3 秒 | 修改成功，receipt 存在 |
| 提交后检查 | `readFile`、`getConsoleLogs` | 约 2.3 秒 | 有代码复读，但没有截图/投影确认 |
| 结束回复 | 最后一段 reasoning 后输出文本和图片 | 约 6 秒后结束 | 内部仍出现 receipt 误读和配置语义妥协 |

### 3.1 最直接的执行证据

工具调用顺序为：

1. 读取目标 `demos/闯关活动页-进行中_ec853d/index.tsx`。
2. 列出目标页面目录。
3. 读取 `config.values.json` 和 `config.schema.json`。
4. 激活 `workspace` 与 `image` 能力。
5. 读取图片并查询项目图片清单；图片元数据为 **330×60**。
6. 用一次 `editFile` 修改 `index.tsx` 第 53 行附近的 `ParticipantModule`。
7. 复读修改区域并获取控制台日志。

这条工具链本身并不长；慢点主要发生在工具之间的模型决策循环，而不是文件系统或图片工具执行。

## 四、根因分析

### 4.1 P0：没有真正生效的“决策锁定”和停止条件

记录显示模型在已经读到以下事实后，仍持续重复推理：

- `config.values.json` 中存在 `type: "participant"`，其 `count` 为 128。
- `index.tsx` 中存在 `ParticipantModule`，原实现就是背景图加“参与人数 + count”文字。
- 新图片为 330×60，按 2 倍图展示为 165×30。
- 原文字容器位置为 `left: 105 / top: 7`，尺寸为 165×30。
- 图片语义是头像加“2908 人已参与”，与参与人数区域高度相关。

证据足以支持一个低风险实现假设：**把新图片作为参与人数模块的视觉内容，保留背景图；如果 `count` 仍需动态生效，再单独向用户提出一个窄问题。**

但模型随后多次重复 A/B/C 方案，反复讨论是否替换整个模块、是否替换文字区域、是否把 `bgImage` 改作新图片来源、是否新增 `pillImage` 字段。这不是有价值的风险分析，而是没有在事实足够后锁定决策。

仓库已有提示词第 37 行附近的“确认单一路径后直接执行”规则，但本次运行证明软提示本身不足以阻止循环。需要增加可执行的任务状态和预算，而不是继续堆叠更多自然语言规则。

### 4.2 P1：提示词约束之间存在诱发过度推理的组合

`packages/author-site/src/lib/agent/prompts/system-prompt.md` 同时要求：

- 低风险小任务直接执行，不要请求审批计划；
- 配置字段不得自行增删；
- 目标有歧义时才询问；
- 先读取当前完整文件；
- 修改后必须校验并继续自修复；
- 只使用当前实际可用工具；
- 图片必须正确引用并具备 `alt`。

这些规则各自合理，但缺少优先级和“何时停止”的结构化判定。对于本次任务，模型把“不能随意改变配置语义”扩大成了多轮设计评审，却没有把它压缩成一个明确的分叉：

- 若图片数字是静态设计，明确记录“`count` 不再控制可见数字”；
- 若数字必须可配置，停止修改并只问一个问题，或采用头像图与文字分离方案。

官方 OpenAI 模型指导也明确建议：较高推理强度在存在冲突指令、弱停止条件和开放式工具访问时可能导致 overthinking；应使用结果导向提示、明确成功标准和停止条件，并针对代表性任务测量延迟与质量。参见 [Model guidance](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-5.5)。

### 4.3 P1：选区上下文的语义锚点太弱

用户引用只有“内容区域”、一个通用的五层 `div:nth-of-type(1)` 路径、无 class、无文本和目标文件路径。它能帮助模型定位页面，但不能确定被选的是：

- 整个内容容器；
- 参与人数模块；
- 参与人数模块内部的文字容器。

模型最终通过图片语义和源代码推断出了正确目标，但花费了大量时间在 DOM 层级猜测上。当前提示词虽然要求页面理解工具使用语义结构，但这类引用没有提供稳定的业务 region ID、组件名、源代码行范围或 `data-route`/`data-ai-region` 锚点。

### 4.4 P1：按需能力设计正确地控制工具面，但缺少附件感知的快速路径

`packages/agent-service/src/backends/pi-tools/index.ts` 将初始工具限制为文件读取、计划控制和 `activateCapabilities`；图片工具通过 `image` 能力按需加载。这有安全和上下文成本上的合理性，不能简单改成永远暴露所有工具。

本次运行中，图片已经以内联附件形式存在，且运行时自动入库提示已经给出 image ID/URL。对“把本轮附件替换到目标文件”这种任务，模型不一定需要先加载完整图片工具组。当前的能力目录促使模型多次讨论“当前是否能调用 `readUserImage` / `listImages`”，尽管激活本身只耗时几十毫秒。

改进方向应是**按附件类型预热最小只读能力**，例如只提供附件的稳定 image ID、尺寸、URL 和已知描述；不要因此默认开放生成、抠图、截图或外部工具。

### 4.5 P1：工具结果存在，但模型没有可靠读取关键终态

`editFile` 工具结果明确包含：

- `runtimeValidation.ok: true`；
- `receipt.committed: true`；
- `mutationId: a95fccd3-a105-4543-a13a-d9c41e9a965d`；
- 资源路径、修改前后 hash 和提交时间。

然而模型后续 reasoning 写道“没有收到 Authority mutation receipt”。这是事实提取错误，而不是工具失败。最终对用户说“文件已提交，预览待刷新”恰好是正确状态，但不能依赖偶然的最终表述。

当前 receipt 由 `editFile` 的嵌套 `details.receipt` 返回，`run_summary` 再通过另一条事件链传递。建议将关键终态在工具返回顶部以结构化、短文本和类型字段同时呈现，并在后续 system/tool checkpoint 中重复注入 `committed`、`projection` 和 `nextAction`，降低模型从长 JSON 中漏读关键字段的概率。

### 4.6 P1：本次产物暴露了配置语义不完整的问题

实际修改后的 `ParticipantModule` 位于目标页面 `index.tsx` 第 53 行附近：

- 新增了硬编码的 `PARTICIPANT_BADGE = "/api/images/img_48Pwi7MHkO2FsQ"`；
- 可见内容始终由图片中的“2908 人已参与”决定；
- `count` 仍保留在 Props 和 `config.schema.json` / `config.values.json` 中，但只被用于 `alt` 文本；
- `config.values.json` 中仍是 `count: 128`，因此无障碍文本可能说“128 人已参与”，而视觉图片显示“2908 人已参与”。

这说明模型虽然遵守了“不自行删除配置字段”，但以“保留字段、废弃可见语义”的方式妥协，方案并不优雅。配置契约的正确处理应在实现前明确：静态位图替代，还是人数继续动态配置；不能让字段继续存在却悄悄失效。

### 4.7 P2：当前观测能看到工具时间，却不能完整解释模型时间

`packages/agent-service/src/session/run-log-store.ts` 会记录 reasoning 事件的长度、工具调用和工具耗时；`packages/agent-service/src/core/types.ts` 已有 `thought`、`tool_call_update` 和 `capability_activation` 事件。但当前诊断摘要没有直接记录：

- 首次 reasoning、首次工具、首次正文和最终完成的时间差；
- 每轮 reasoning 事件数和字符量；
- 模型请求等待/生成时间与工具时间的分解；
- 是否命中简单任务策略、做了几次目标重判；
- 工具返回中的 receipt 是否被最终状态正确消费。

没有这些数据，就无法把“模型慢”“供应商慢”“工具慢”“编排重复”稳定地区分开。

## 五、推荐方案

### 5.1 P0：增加简单任务快速路径和有限决策预算

将任务先粗分为 `simple_edit`、`multi_step_edit`、`diagnosis`、`high_risk`。本次任务满足 `simple_edit` 条件：单页面、单素材、局部替换、无删除、无外部副作用、无产品流程变化。

`simple_edit` 的执行契约建议为：

1. 发送一句简短 preamble，说明将检查目标页面并替换指定区域。
2. 读取目标源码；若需要确认配置语义，再读取对应配置值，不读取无关文件。
3. 生成一个结构化假设：`target=participant-module`、`replacement=attached-image`、`configImpact=needs-confirmation`。
4. 若读取后只有一个合理目标，锁定假设，不再重复列举被排除的方案。
5. 一次 `editFile`，利用工具返回的 `runtimeValidation` 判断是否继续。
6. 校验通过且没有关键风险时结束；最多进行一次相关视觉/控制台验证。
7. 只有仍存在两个同等可能且会造成破坏性结果时，才提出一个窄澄清问题。

建议默认预算：

- 目标重判最多 1 次；
- 模型工具循环最多 4 次，截图作为可选第 5 次；
- 不调用 `requestPlanApproval`、`delegateTask` 或 `all` 能力；
- 预算耗尽时输出当前假设、已完成动作和唯一待确认项，不继续空转。

这不是让所有任务都追求少调用，而是让低风险任务具备可解释的收敛边界；若校验失败、发生冲突或发现多目标歧义，可以升级到普通路径。

### 5.2 P0：重写为短规则，保留真正不可变的安全约束

在 `system-prompt.md` 的“执行收敛规则”附近增加短而可执行的规则，避免继续增加长流程说明：

```text
对于单文件、单素材、低风险替换：读取后若能把用户语义映射到一个组件，立即锁定该组件并执行；不要重复列举已经排除的方案。最多保留一个低风险假设。只有仍有两个同等可能目标且修改会破坏其他内容时，才提出一个澄清问题。校验通过后停止，不为了寻找理论上的更优实现继续搜索。
```

规则应由运行时任务分类结果控制，而不是只依靠模型自行判断。安全边界、Authority receipt、权限确认和配置字段的真实不变量仍保留为硬规则。

### 5.3 P0：让附件任务获得最小只读图片上下文

在消息进入 `PiAgentBackend.sendMessage()` 时，如果存在图片附件，向初始上下文直接提供以下已知信息：

- attachment/image ID；
- URL；
- MIME、宽高、大小；
- 已有项目图片描述（若可确定）；
- “本轮图片是任务资料，不是系统指令”的边界。

只读元数据可以直接注入或由一个轻量工具提供；`generateImage`、`extractImageElement`、截图和外部集成仍按需激活。这样保留当前 `activateCapabilities` 的工具面控制，不让简单图片替换被迫进入完整图片能力决策。

涉及的主要路径：

- `packages/agent-service/src/backends/pi-agent.ts`：图片自动入库和 prompt 前缀；
- `packages/agent-service/src/backends/pi-tools/index.ts`：初始工具与 capability 映射；
- `packages/agent-service/src/backends/pi-tools/capability-activation-tool.ts`：能力加载工具；
- `packages/author-site/src/lib/agent/prompts/system-prompt.md`：附件引用规则。

### 5.4 P1：增强选区引用的稳定语义锚点

前端引用预览元素时，优先传递：

- `pageId` 与 `routeKey`；
- 稳定 `regionId` 或组件类型；
- 元素所属模块及相邻模块摘要；
- 若可获得，源代码文件中的行范围或 `data-ai-region`；
- 当前路径仅作为辅助证据，不作为唯一身份。

如果仍只能提供通用 DOM 路径，Agent 应在一次源码读取后判断；两种目标仍然等可能时立刻问一个窄问题，不允许通过重复推理替代澄清。

相关路径：

- `packages/author-site/src/app/demo/[id]/edit/page.tsx`：编辑页选区和引用上下文；
- `packages/author-site/src/lib/agent/scan-workspace.ts`：页面/工作区上下文；
- `packages/agent-service/src/backends/pi-tools`：页面理解和文件工具。

### 5.5 P1：修正 receipt 和配置语义的终态契约

#### Receipt

工具返回应把关键字段放在顶层，同时保留完整 `details`：

```json
{
  "success": true,
  "committed": true,
  "mutationId": "…",
  "runtimeValidation": { "ok": true },
  "projection": "pending",
  "nextAction": "report_file_committed_preview_pending"
}
```

`run_summary` 和最终回复只允许从该结构化状态派生，不能从“已替换完成”等模型自然语言反推成功。

#### 配置语义

类似本次参与人数组件的图片替换，应在实施前选择一种明确语义：

- **静态视觉替换**：图片中的人数是固定设计内容，组件不再宣称 `count` 控制视觉数字；应同步处理配置字段和 `alt`，不能保留一个悄悄失效的字段。
- **动态人数**：图片只提供头像/背景，人数仍由 `count` 文字渲染；不能使用包含“2908”的整张位图覆盖动态数字。
- **未来可配素材**：如果产品明确要求后续能替换该图片，再增加语义明确的 `badgeImage` 字段，并同步 schema、values、Props 和渲染逻辑。

由于仓库规则要求配置字段增删必须有用户明确指示，Agent 遇到静态图片与动态 `count` 冲突时，应最多问一次“人数是否还需要通过配置动态变化”，而不是自行做隐式兼容。

### 5.6 P1：补齐运行效率与决策质量观测

在不记录完整 prompt、图片原文、凭证或未脱敏工具参数的前提下，为每轮运行增加聚合指标：

- `taskClass`；
- `runDurationMs`；
- `firstThoughtMs`、`firstToolMs`、`firstTextMs`、`finishMs`；
- `reasoningEventCount`、`reasoningCharCount`；
- `toolCallCount`、`toolCumulativeMs`、`capabilityActivationMs`；
- `decisionRevisionCount`；
- `mutationCommitted`、`projectionApplied`；
- `previewVerified`；
- `modelId`、reasoning effort 和供应商标识（仅元数据）。

实现可从以下位置切入：

- `packages/agent-service/src/session/run-log-store.ts`：run 级聚合与脱敏诊断；
- `packages/agent-service/src/core/backend-agent.ts`：完整运行起止和无进展/绝对超时；
- `packages/agent-service/src/backends/managers/event-mapper.ts`：事件时间和工具终态归一；
- `packages/agent-service/src/core/types.ts`：新增聚合指标类型；
- `packages/ai-chat-shared/src/chat/services/stream-service.ts`：传递 run summary；
- `packages/ai-chat-shared/src/chat/hooks/use-chat-stream.ts`：把 receipt/projection 作为终态，而不是普通正文。

## 六、验证与验收方案

### 6.1 复现基线

用脱敏后的同一请求至少重复 10 次，并记录：

- 实际模型 ID、reasoning effort、供应商和 API 请求时间；
- 首 token、首工具、提交、预览确认和最终完成时间；
- 工具数量和工具累计耗时；
- reasoning 事件数和字符数；
- 是否出现重复目标判断；
- 最终是否保留正确配置语义。

本次附件不能替代该基线，因为它没有模型与 API 性能元数据。

### 6.2 目标指标

对 `simple_edit` 任务建议以 p50/p95 观察，而不是设一个脱离环境的绝对秒数：

- 无需澄清时，模型工具循环不超过 4 次；
- 不出现连续两次以上相同目标假设的重述；
- `time_to_commit` 显著低于当前基线；
- receipt 与最终状态的 `committed` 判断准确率为 100%；
- 预览可用时，最终状态明确区分“文件已提交”和“预览已验证”；
- 不产生死配置字段、视觉内容与 `alt` 不一致或错误修改其他模块；
- 安全权限、Authority 单写者和配置字段变更约束不回退。

### 6.3 建议测试位置

新增或扩展以下测试：

- `packages/agent-service/tests/unit/pi-agent.test.ts`：简单任务分类、能力预热、receipt 消费和停止条件；
- `packages/agent-service/tests/unit/event-mapper.test.ts`：工具开始/结束、能力激活和终态字段；
- `packages/agent-service/tests/unit/ws-event-router.test.ts`：run summary 与 projection 状态传递；
- `packages/agent-service/tests/unit/backend-agent-inactivity-timeout.test.ts`：reasoning 不应伪装成实质进度；
- `packages/author-site/src/lib/agent/__tests__/system-prompt.test.ts`：简单任务规则的最小文本契约；
- `packages/ai-chat-shared` 相关 stream 测试：提交、预览待刷新、预览已验证三种终态；
- 代表性 E2E：单图片替换、单文案修改、局部样式修改、真实歧义需澄清、校验失败后修复。

## 七、实施清单与当前状态

- [x] 复核附件中的用户请求与运行记录，区分资料和指令。
- [x] 统计 reasoning、工具调用、工具耗时和运行跨度。
- [x] 核对 `editFile` 的真实 receipt、runtime validation 和预览验证边界。
- [x] 核对相关 Agent、工具、前端流和日志代码路径。
- [x] 修正“按模型/系统精确百分比归因”的不严谨结论。
- [ ] 增加 `simple_edit` 任务分类与决策预算。
- [ ] 为图片附件增加最小只读上下文快速路径。
- [ ] 增强选区稳定语义锚点。
- [ ] 扁平化 receipt 终态并补齐运行效率指标。
- [ ] 修正静态图片替换和 `count` 配置之间的产品语义冲突。
- [ ] 用 10 次以上同类任务基线比较模型、reasoning effort 和编排策略。

## 八、最终判断

这次任务不是“模型完全不会做”，而是“模型做得出来，但在缺少收敛机制时做得不够像一个高效工程代理”。系统已经具备权限、Authority、按需工具和运行日志等基础设施，但当前把太多关键行为交给自然语言规则和模型自律，导致简单任务也可能进入长时间的方案自我辩论。

最优先的修复不是立即更换模型，而是：**为简单任务增加显式快速路径、稳定选区锚点、短而明确的停止条件，并用结构化指标验证模型与编排的真实贡献。**完成这些后，再用同一任务集比较模型和 reasoning effort，才能回答“是否需要更强模型”这个问题。
