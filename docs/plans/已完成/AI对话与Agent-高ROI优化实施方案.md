# AI 对话与 Agent - 高 ROI 优化实施方案

> 状态：进行中 · 已完成代码复查；第 1 项（工具启动后的整轮重试闸门）已实施并通过定向验证
> 创建日期：2026-08-12
> 范围：Pi Agent 可靠性、上下文成本、日志吞吐、会话恢复、能力暴露与前端运行体验
> 不含：数据驱动模型路由（已单列至 `docs/plans/远期规划/AI对话与Agent-数据驱动模型路由方案.md`）

## 背景

Pi Agent 已具备上下文预压缩、一次上下文溢出恢复、超时控制、权限确认和基础重试能力。当前仍有一组高收益问题：工具执行后发生短暂错误可能整轮重放；历史附件仍携带短预览；高频运行事件同步写磁盘；重连或编辑时需要从客户端逐条回放完整历史；取消和前端流式体验缺少完整的状态与结果闭环。

本方案按两期实施。第一期优先消除副作用重复、无效上下文与同步 I/O；第二期建立可控的会话恢复、执行状态机、安全边界和用户可见验证结果。两期均不包含按数据自动切换模型。

## 目标与非目标

### 目标

- 工具已开始后不因可重试模型错误重复执行整轮；
- 减少普通轮次的附件、工具和 Skill 上下文开销，同时保留能力发现路径；
- 让高频流式事件不阻塞 WebSocket 推送；
- 使重连、编辑重发和超时清理具备服务端权威状态；
- 清楚区分“修改已提交”和“修改已验证”。

### 非目标

- 不实施数据驱动模型路由或替用户自动换模型；
- 不移除现有上下文压缩、权限确认、Workspace Mutation Authority 等保护；
- 不把客户端提供的历史记录当作唯一会话事实；
- 不为兼容历史不规范数据增加永久兼容分支。

## 总体原则

1. **渐进披露，不是静态隐藏**：模型始终知道能力类别存在，但仅在需要时拿到详细工具定义。
2. **副作用优先**：任何重试、恢复或回退均不能重复已开始的写操作。
3. **服务端权威**：会话检查点、执行状态和变更凭据由服务端维护，客户端只能请求同步。
4. **关键事件可靠，增量事件可合并**：错误、权限、工具结果和完成必须保留；可重建的流式增量可以批量记录。
5. **可验证才称完成**：修改的提交、投影和验证状态需分别表达。

## 2026-08-12 复查结论与校正

| 原方案项 | 实际状态 | 校正结论 |
| --- | --- | --- |
| 工具后整轮重试 | `BackendAgent.sendMessage()` 将完整 `backend.sendMessage()` 包在 `withLlmRetry` 内；Pi 的 context-overflow 恢复也会重发 prompt。 | 问题成立。两层重发都必须在收到首个 `tool_call` 后关闭。第 1 项已完成并有回归测试。 |
| 历史附件按需注入 | 已按 attachmentId 读取、历史附件去重和 20 项上限，但历史条目仍注入 `textPreview`（最多 240 字）。 | 问题部分成立；实施目标改为“历史附件只注入索引，不带 preview”。 |
| `run_summary` 与验证闭环 | 后端已生成 mutation receipt/projection ack 的 `run_summary` 事件；但 WS event router 未订阅或转发它。 | 不重建数据模型；补齐 WS/client/UI 通路及适用验证证据即可。 |
| 能力渐进披露 | 工具集和预装 Skill 在 Harness 初始化时整体注册/注入，初始上下文成本随工具数线性增长。 | 问题成立；改为完整注册、最小初始发现集与 Agent 自主按需激活，不以 profile 收窄权限。 |
| 取消与断连 | `cancel()` 发出 abort 后立即把状态设为 `ready`；最后连接断开会在 abort 未 settle 时继续清理。 | 问题成立。状态机必须等 Harness 与子 Agent 清理完成。 |
| 外部内容边界 | WS 当前允许调用方直接更新完整 system prompt。 | 此项提升为 P0：调用方内容只能进入受限槽位，不能替换安全骨架。 |

复查范围：`pi-agent.ts`、`backend-agent.ts`、`websocket.ts`、`ws-event-router.ts`、`run-log-store.ts`、附件提示与现有单元测试；结论均来自当前代码。

## 第一期：副作用安全、上下文成本与日志吞吐

### 1. 渐进披露的工具与 Skill 能力

#### 方案

服务端保留完整工具注册，但每轮只把最小发现集的 schema 交给模型：安全读取、Skill 读取、计划/选择控制和按需加载入口。其余工具按任务能力分组为 `workspace`、`pages`、`comments`、`image`、`web`、`external`，避免一开始注入全部 schema。

模型始终看到简短能力目录和 `activateCapabilities` 入口，不携带未激活工具的完整 schema。模型自行判断任务需要后调用该入口，Pi Harness 在当前会话内激活对应已注册工具，并在同一轮的下一次模型循环继续执行；不弹用户确认，不通过客户端参数扩大权限。

复杂任务可由模型请求多个分组或 `all`，因此渐进披露不会限制 Agent 使用能力。文件/命令/外部操作的既有服务端权限检查保持不变；计划、用户选择和取消等控制工具始终可用。

#### 风险控制

- 能力目录确保模型知道可申请的能力，不会因工具暂未注册而误以为系统不支持；
- 加载失败应返回结构化原因，模型可继续使用已激活工具或请求 `all`；
- 记录能力加载次数、成功率和“工具不存在”错误，作为回归指标；
- 不以能力分组限制 Agent 权限；分组只影响初始上下文大小。

### 2. 工具开始后禁止整轮重试

#### 方案

为单次运行维护执行阶段：`no_side_effect`、`tool_started`、`mutation_committed`、`finished`。只有 `no_side_effect` 允许外层 LLM 整轮重试；出现任一工具调用后，外层重试立即失效。工具返回错误、限流或模型传输错误时，返回本轮已获得的结构化进度和可重试错误，不重新 prompt 整个 Agent。

上下文溢出保持最多一次“压缩后重发原请求”，但仅在未进入 `tool_started` 阶段时执行。供应商级、可证明尚未发送请求的重试可保留在更低的传输边界。

#### 当前实施

`BackendAgent` 在本轮第一个 `tool_call` 后关闭外层 `withLlmRetry`；`PiAgentBackend` 同步关闭 context-overflow 的 prompt 重发。此时错误被标记为不可自动重试，避免 UI 暗示安全重试。覆盖“写工具启动后 503”的回归测试。

#### 验收

- 模拟写工具成功后发生 5xx/超时，确认不会产生第二次写入；
- 无工具调用前的 429/5xx 仍可按现有次数重试；
- 已发生工具调用的失败包含阶段、已执行工具和可恢复建议；
- 上下文压缩与取消测试不回归。

### 3. 历史附件按需注入

#### 方案

本轮附件的 metadata 与必要提示始终注入。历史附件默认仅提供紧凑索引（附件 ID、名称、类型、大小、提取状态），不注入文本预览；用户明确询问历史附件、消息显式引用附件，或模型调用读取附件工具时，才读取目标附件内容。

首期先移除历史附件 `textPreview`，保留现有的内容去重、20 项上限和稳定 attachmentId 读取。项目附件清单 TTL 缓存不是当前性能瓶颈的既有证据，不在首期引入；若后续指标显示目录读取成为热点，再以附件版本或内容哈希失效实现缓存。本轮上传始终即时可见。

#### 验收

- 无附件关联的普通轮次不读取或注入历史附件预览；
- 用户问历史附件或模型读取指定 ID 时可获得正确内容；
- 上传新附件后不受缓存影响；
- 同一内容的重复历史附件不会多次进入索引。

### 4. 异步批量运行日志

#### 方案

引入每 run 有序异步日志队列。权限、工具开始/结束、mutation receipt、错误、取消、完成和 context compacted 为关键事件：立即入队并保证顺序。`stream`、`thought`、重复状态等高频事件按短时间窗合并为聚合记录。

队列使用有界内存、定时 flush 和完成时 drain。超出容量时只丢弃可重建的流式增量，保留关键事件；磁盘错误只降级诊断，不阻塞 Agent/WS 主路径，并记录一次聚合告警。

#### 验收

- 高 token 速率下 WS 事件推送不等待同步文件写；
- run 完成、取消、异常时关键事件均已 flush；
- 队列饱和时工具结果、错误和完成事件不丢失；
- 日志顺序按 run 内序号稳定，可关联 traceId。

## 第二期：会话恢复、执行边界与体验闭环

### 5. 从压缩检查点恢复，而非完整历史回放

#### 方案

首期服务端维护内存级 canonical session checkpoint：真实用户/助手轮次、消息 ID 与单调版本号。每条消息及总量均受预算限制，并会剥离旧版客户端注入的“最近历史”前缀，避免回放时上下文重复。它不保存图片 base64、密钥或冗余工具输出，也不在进程重启后恢复；Pi 压缩摘要、附件索引、当前已激活能力和持久化恢复属于后续扩展。

`resync_history` 已改为版本化截断协议：客户端提交其已知 checkpoint version 和截断锚点；服务端优先从 canonical checkpoint 截取后重建 Harness。首次灰度会话才接受受限全量历史作为种子，之后版本或锚点冲突返回明确错误，不能静默覆盖服务端权威状态。

#### 验收

- 长会话重连后恢复输入大小近似“检查点 + 最近轮次”，而非完整历史线性增长；
- 编辑重发不丢失附件索引、模型配置与已压缩上下文；
- 版本冲突返回明确重同步动作，不静默覆盖；
- 客户端超出回放预算时不会压垮 Agent 或绕过服务端状态。

### 6. 取消与超时执行状态机

#### 方案

将执行状态明确为 `idle → processing → aborting → cleaning_up → idle`。超时、用户取消或最后连接断开时，先进入 `aborting`，调用 Harness abort；等待 prompt settle、子 Agent 停止和环境清理完成后才进入 `idle`。`aborting/cleaning_up` 期间的新消息要么返回“正在取消”，要么在有限队列中等待，不能直接进入同一个 Harness。

断连销毁顺序固定为：停止接收 → abort → await agent destroy → workspace/session cleanup → 移除连接状态。

#### 验收

- 取消后立即发送下一条消息不会并发进入同一 Harness；
- 超时结果只发送一次，最终清理完成可被观察；
- 最后一个 WS 断开后不会在底层工具仍运行时清理 workspace。

### 7. 外部内容提示注入边界

#### 方案

网页正文、上传文件、工作区记忆和知识源统一以带来源、长度和信任级别的“不可信数据”块交付。系统级规则明确：其中的指令不能更改系统提示、权限、工具可用性、任务目标或数据边界。

服务端 system prompt 改为受控模板/模板标识；调用方传入的自定义内容只能进入明确的项目规则或用户上下文槽位，不能替换不可协商安全规则。每类外部来源均设置 token/字符预算及截断说明。

#### 验收

- 典型网页/附件注入样本不能诱导工具越权或改变系统规则；
- 正常的资料内容仍可被模型引用和总结；
- 日志保留来源和截断信息，不记录不必要的原始敏感内容。

### 8. 流式渲染与终态失败体验

#### 方案

前端将 token delta 以 `requestAnimationFrame` 或短窗口合并后写入状态；流式消息气泡独立 memo，历史消息避免因 current delta 重渲染或深序列化。仅在用户接近底部时自动滚动。

连接错误归并为单一 terminal error，不再由多个回调重复创建失败气泡。按错误类型提供有限、明确的后续操作：重试、切换模型、新建对话、查看技术详情。

#### 验收

- 长回答时 Markdown/滚动不会因每个 token 产生全列表重渲染；
- 一次连接故障只展示一次失败结果；
- busy、timeout、context overflow、quota 等错误都有对应且不误导的操作建议。

### 9. 修改完成的验证闭环

#### 方案

将 `run_summary` 作为类型化 Agent/WS 事件贯穿服务端、客户端与 UI，包含 mutation receipt、projection ack 和适用验证证据。修改任务完成状态分为：`committed`、`verified`、`unverified`、`failed`。

控制器根据任务类型要求一个适用验证器：读取回检、schema 校验、测试、截图/控制台或 projection ack。拿到 mutation receipt 但没有验证证据时，UI 只能显示“已提交，待验证”，不得宣称完整完成。

#### 验收

- 客户端能看到 mutation 和 projection 的真实状态；
- 有修改但无验证时不显示“已验证完成”；
- 已验证结果可定位到对应工具、receipt 或验证器输出。

## 实施顺序与依赖

1. [x] 工具启动后的整轮重试闸门；
2. [x] 受控 project rules 槽位与服务端提示词安全骨架（P0）；
3. [x] 历史附件按需注入；
4. [x] 异步日志队列；
5. [ ] Agent 自主按需工具/Skill 加载（最小发现集、同轮自动激活、完整权限保持和加载指标已完成；跨 checkpoint 恢复已激活能力仍待实现）；
6. [ ] canonical checkpoint 与增量重同步（首期内存级版本化截断、冲突拒绝和受限 seed 已完成；Pi 摘要/附件索引、持久化和真正增量追加仍待实现）；
7. [x] 取消/超时状态机；
8. [x] 前端流式与终态错误统一；
9. [x] run_summary 的 WS/client/UI 通路与验证闭环。

第 1 项是后续恢复/回退安全边界。第 5、6 项应连续实现，因为检查点恢复不能与尚未完成清理的旧运行并发。第 9 项依赖现有 mutation authority，但不依赖模型路由。

## 主要改动边界

- `packages/agent-service/src/backends/pi-agent.ts`：执行阶段、按需能力加载、检查点、恢复与 Harness 生命周期；
- `packages/agent-service/src/core/backend-agent.ts`：重试边界与状态机；
- `packages/agent-service/src/backends/pi-tools/`：能力注册、扩展入口与附件读取；
- `packages/agent-service/src/routes/websocket.ts`、`ws-event-router.ts`：增量重同步、终态协议与 run_summary；
- `packages/agent-service/src/session/run-log-store.ts`：异步有序日志队列；
- `packages/agent-client/src/`、`packages/ai-chat-shared/src/`：事件消费、流式渲染和失败 UI；
- `packages/author-site/src/lib/agent/`：受控 system prompt 模板与外部上下文边界。

## 验证策略

- 单元测试：执行阶段、重试闸门、附件缓存/按需加载、日志队列、检查点选择、状态机转换、能力扩展授权；
- 协议测试：WS 的 checkpoint/version、run_summary、单一 terminal error；
- 集成测试：写工具后网络错误、压缩后恢复、取消与立即下一轮、断连清理；
- 前端测试：流式更新合并、自动滚动、错误只显示一次、验证状态文案；
- 回归：`pnpm check:agent`、相关前端 typecheck/test，以及真实长会话/附件/编辑场景的手动冒烟。

## 风险与发布策略

- 所有新策略通过显式 feature flag 灰度：附件懒加载、异步日志、checkpoint resync 和验证闭环分别可独立关闭；按需能力加载不改变权限，仅改变初始工具上下文；
- 第一阶段每项先启用诊断指标，再逐步默认开启；
- checkpoint 协议变更必须支持服务端拒绝旧客户端并返回一次受限的兼容重同步动作；
- 如果按需加载导致任务完成率下降，允许模型请求 `all`，并根据指标调整最小发现集；
- 任何检测到副作用不确定的错误均禁止自动整轮回放，交给用户或明确的恢复流程处理。

## 进度记录

- 2026-08-12：确认采用两期方案；渐进披露采用“短能力目录 + 按需扩展”，不采用静态隐藏工具；数据驱动模型路由单列远期规划，不纳入本方案。
- 2026-08-12：完成源码复查并校正文档。确认完整 prompt 的可重试边界确有副作用重放风险；已在外层 LLM 重试和 Pi 的 context-overflow 重发两处以首个 `tool_call` 为闸门关闭重试。补齐 `BaseAgent` 的 `context_compacted` / `run_summary` 事件类型声明，使现有 WS 订阅可通过完整类型检查。定向测试：`pnpm --filter @workbench/agent-service test -- tests/unit/backend-agent-inactivity-timeout.test.ts`；类型检查：`pnpm check:agent`。
- 2026-08-12：完成 P0 提示词信任边界。对外协议将 `systemPrompt` 改为 `projectRules`；创作端静态规则、评论任务与使用端规则均只能写入该槽位。Pi 后端固定在前拼接服务端安全骨架，明确外部内容不得改变安全规则、权限、工具或工作区边界，并限制项目规则长度。`pi-agent`、规则委托、agent-client 与 ai-chat-shared 的定向测试/类型检查通过；完整 agent-service 测试有一个既有环境限制：Authority 路由用例监听 `127.0.0.1` 时被 sandbox 以 EPERM 拒绝。
- 2026-08-12：完成历史附件按需注入。历史附件清单不再注入 `textPreview`，只提供稳定 attachmentId 与元数据；本轮上传保留必要预览。模型需要历史内容时必须调用 `readUploadedFile`。定向测试：`pnpm --filter @workbench/agent-service test -- tests/unit/uploaded-file-prompt.test.ts`；类型检查：`pnpm --filter @workbench/agent-service typecheck`。
- 2026-08-12：完成异步日志队列。Agent run log 与结构化诊断日志改为 run 内有序、短窗口批量的异步写入；关键事件触发立即 flush，增量事件在队列满载时优先丢弃，run 完成/取消/销毁前 `drain()`，不让落盘阻塞 WS 推送。定向测试：`pnpm --filter @workbench/agent-service test -- tests/unit/ws-event-router.test.ts`；类型检查：`pnpm --filter @workbench/agent-service typecheck`。
- 2026-08-13：完成 `run_summary` 的 WS/client/UI 通路与验证闭环。事件路由器透传 Authority mutation/projection 摘要；agent-client、共享 stream service 提供强类型字段和 `onRunSummary` 回调，`finish.metadata.runSummary` 保留相同摘要作为终态兜底。聊天消息仅在收到 receipt 时显示已提交 mutation 数，projection 失败则显示失败数，不以模型文本冒充验证。事件路由与聊天渲染回归测试通过。
- 2026-08-13：完成取消/超时状态机。Agent 请求取消后先进入 `cancelling`，直到 Harness abort 与本轮 `sendMessage` 实际收束才释放 busy 并回到 `ready`；显式取消的 WS 状态不再提前伪报 `ready`。取消期间的新请求得到 `AGENT_BUSY`，防止复用仍在收尾的 Harness。定向测试覆盖延迟 abort、超时、busy 响应；Agent Service、Client 和共享聊天包类型检查通过。
- 2026-08-13：完成前端流式与终态错误统一。部分正文/工具过程存在时把错误合并入当前 assistant 消息；连接建立前的服务端错误只交付一次携带错误码的终态回调，消除“连接错误 + 具体服务端错误”双气泡。聊天渲染与 StreamService 回归测试通过。
- 2026-08-13：完成 canonical checkpoint 首期。`PI_AGENT_CANONICAL_CHECKPOINTS_ENABLED=true` 时，服务端对成功轮次记录受 24 条/48KB 预算限制的真实 user/assistant 文本与消息 ID；编辑重发以 checkpoint version 和末条消息 ID 请求截断重建，版本或锚点冲突明确拒绝。首次会话可由受校验的前端历史 seed，之后不能覆盖服务端状态。该能力为进程内会话恢复，不宣称跨重启持久化；Agent Service、Client、共享聊天包和创作端类型检查及 checkpoint 单测通过。
- 2026-08-13：按用户意图撤回“以 profile 收窄工具集”的设计，改为 Agent 自主按需加载。所有工具仍在服务端注册，初始只向模型暴露最小发现集与短目录；模型调用 `activateCapabilities` 后，Pi Harness 用 `setActiveTools()` 在同一轮后续循环激活对应真实工具，或可请求 `all`。Skill 继续由 `readPreinstalledSkill` 按名称读取全文；全程没有用户授权步骤，也没有客户端提权入口。定向工具、Pi Agent 与 AgentManager 测试通过。
- 2026-08-13：补齐按需加载验证与指标。真实 Pi Agent loop 集成测试模拟“先加载、后写入”的连续工具循环，证明下一次模型请求携带新 active tool；每次加载同时写入 `ai.capability_activated`，只记录能力分组、成功/失败、加载前后工具数、耗时和短错误摘要。run log/diagnostic 测试覆盖落盘与不向用户侧 WS 透传；Agent Service 类型检查通过。
