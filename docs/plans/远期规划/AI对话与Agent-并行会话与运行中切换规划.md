---
covers:
  - packages/ai-chat-shared/src/ai-chat.tsx
  - packages/ai-chat-shared/src/history-dialog.tsx
  - packages/ai-chat-shared/src/prompt-input.tsx
  - packages/ai-chat-shared/src/chat/hooks/use-chat-stream.ts
  - packages/ai-chat-shared/src/chat/hooks/use-chat-models.ts
  - packages/ai-chat-shared/src/chat/services/stream-service.ts
  - packages/author-site/src/app/demo/[id]/edit/page.tsx
  - packages/author-site/src/app/api/sessions/route.ts
  - packages/author-site/src/app/api/sessions/project/[projectId]/route.ts
  - packages/author-site/src/app/api/sessions/[sessionId]/meta/route.ts
  - packages/author-site/src/lib/session-manager.ts
  - packages/agent-service/src/routes/websocket.ts
  - packages/agent-service/src/core/backend-agent.ts
  - packages/agent-service/src/backends/pi-agent.ts
  - packages/shared/src/contracts.ts
---

# AI 对话并行会话与运行中切换规划

> 状态：远期规划
> 更新日期：2026-09-03
> 文档性质：开发复杂度评估、目标行为与实施方案
> 相关需求：[AI 对话需求文档](../../项目文档/创作端/05-AI对话/AI对话_需求文档.md)、[工作空间与对话解耦](../../项目文档/创作端/03-项目管理/技术/07_工作空间对话解耦.md)

## 一、需求与结论

用户希望在 AI 输出过程中仍能打开历史对话、新建多个对话并行执行任务，并支持切换模型，交互体验接近 Codex。

截图中的中文句子是当时的 AI 输出示例，不是开发指令；本规划只依据用户需求和仓库现状制定。

综合评估为高复杂度（L）：后端已有“每个 session 一个 Agent”的基础，但前端仍把流式连接、消息和模型状态绑定在唯一可见组件上；同时多个会话共享 Workspace，会引入运行时生命周期、编辑器投影和写入冲突的新边界。

建议投入：

- MVP：约 20–30 人日，单人 4–6 周；两人并行约 2–3 周加联调。
- 生产加固：额外 8–15 人日，覆盖跨标签页限流、断线恢复、资源监控和复杂冲突场景。

## 二、当前实现与主要阻塞

- [AIChat](../../../packages/ai-chat-shared/src/ai-chat.tsx#L404) 在 `isStreaming` 时直接阻止历史入口，并向用户提示无法切换。
- [PromptInput](../../../packages/ai-chat-shared/src/prompt-input.tsx#L673) 在输入上下文非 `idle` 时禁用模型选择。
- [useChatStream](../../../packages/ai-chat-shared/src/chat/hooks/use-chat-stream.ts#L664) 在组件卸载或 `sessionId` 变化时关闭流、清空运行锁并持久化消息。
- 编辑页只有一份 `aiMessages`、流状态和 `agentSessionId`，并通过 `key={agentSessionId}` 重挂载 [DeferredAuthorAIChat](../../../packages/author-site/src/app/demo/[id]/edit/page.tsx#L8996)，所以切换会话会结束旧流。
- 新建会话接口在 `forceNew` 时归档当前编辑会话：[sessions/route.ts](../../../packages/author-site/src/app/api/sessions/route.ts#L189)。切换历史时还会把旧会话标记为 `discarded`：[edit/page.tsx](../../../packages/author-site/src/app/demo/[id]/edit/page.tsx#L9189)。
- agent-service 已按 `sessionId` 隔离 Agent，不同 session 理论上可以并行；但当前 `set_model` 会立即改变运行中的 harness：[websocket.ts](../../../packages/agent-service/src/routes/websocket.ts#L741)。
- Workspace Authority 对 Workspace mutation 串行化并提供结构化冲突码，但不同工具的冲突自愈并不统一；Yjs 路径与 Authority fallback 的冲突语义也不同。

## 三、目标行为与已确定决策

### 3.1 会话与并发

- 同一 live Workspace 允许多个 `editing` session；切换会话只切换 AI 上下文，不归档或丢弃旧会话。
- 当前页面最多同时运行 2–3 个会话，数量可配置；超出上限的任务进入会话级队列。
- 当前页面切换会话时，旧会话在后台继续；刷新、关闭或离开页面时取消所有运行并尽力保存部分消息，不做刷新后的后台恢复。
- 后台会话等待权限、计划审批或用户选择时不自动批准；历史列表显示“需要确认”徽标，用户切换过去后处理。

### 3.2 模型

- 模型偏好按每个对话独立保存，接近 Codex 的任务级模型选择。
- 新建对话复制创建时当前对话的模型和思考深度；创建后各会话互不影响。
- 输出过程中可以选择模型，但只记录为 `pending`，当前轮继续使用旧模型；下一轮发送前再应用。
- 模型不可用时保留当前会话的有效模型或后端默认模型，不强制切换。

### 3.3 Workspace 冲突

- 所有 AI 写入继续经过 Authority/Yjs 受管链路，不允许静默覆盖。
- 发生 `WORKSPACE_RESOURCE_CONFLICT` 时，向模型返回结构化、可重试结果；模型重新读取最新资源并重新计算修改。
- 最多自动重试 2 次，不重放已经产生工具副作用的整轮 LLM 请求。
- 不向用户展示原始错误码、堆栈或技术 Toast；两次仍无法收敛时，以简洁的 assistant 状态说明未能自动合并，避免无限静默重试。

## 四、推荐实施方案

### 4.1 前端运行时管理器

新增按 `sessionId` 索引的 `ChatRuntimeManager`。每个 runtime 保存消息、流内容、运行状态、队列、审批请求、运行摘要和模型状态；`StreamService` 与模型连接按 runtime 独立创建。

界面只保留一个可见的 `AIChat`，通过 runtime 快照切换展示内容，不再通过卸载组件结束旧流。`HistoryDialog` 在流式输出时保持可用，并显示 `queued/processing/awaiting_approval/completed/failed` 等状态。

AI 文件事件必须携带 `sessionId`、原始 `resourcePath` 和 `pageId`。编辑页统一读取 Authority snapshot 做投影，不能再把后台会话的 `index.tsx` 依赖到当前 `activeDemoIdRef`，避免后台任务修改错误页面。

### 4.2 Session API 与生命周期

- `POST /api/sessions` 在传入 `workspaceId` 创建并行会话时不再调用 `archiveActiveSession`。
- `onSelectSession` 只加载目标消息和 runtime，不再 PATCH 旧会话为 `discarded`。
- `SessionMeta.status=editing` 表示会话仍可运行/续租，不再表示项目只能有一个当前会话。
- 历史列表接口在已有文件元数据基础上合并 agent-service 当前运行状态；运行状态本身不写入持久化 SessionMeta。

### 4.3 模型协议

扩展 agent-client/WebSocket 的模型事件，至少区分：

- `effectiveModelId`：当前运行实际使用的模型。
- `pendingModelId`：用户已选择、等待下一轮生效的模型。
- `applyAt: "next_turn"`：模型切换时机。

`SessionMeta` 增加会话级模型偏好；浏览器本地存储只作为缓存。agent-service 在 Agent busy 时不得直接调用运行中的 `harness.setModel()`，而应在下一次 `sendMessage` 前应用 pending 模型。

### 4.4 冲突自愈与安全边界

为 Authority fallback 和非协同资源抽取统一的冲突处理辅助逻辑，规范工具结果中的 `retryable`、资源路径、当前 hash 和重试次数。模型系统规则明确要求“重新读取后再提交”，并与现有“工具产生副作用后禁止整轮重放”的约束保持一致。

Yjs 协同路径继续使用当前串行提交语义；冲突重试不能绕过 Yjs room、Authority receipt、权限确认或 Workspace lease。

## 五、公共接口与类型调整

- 新增聊天 runtime 快照和控制器接口，替代编辑页当前单份 `aiMessages/aiIsStreaming/aiStreamContent` 作为并行状态源。
- `HistoryDialog` 会话条目增加运行状态、待确认标记和会话模型信息。
- AI 文件更新回调增加 `sessionId/resourcePath/pageId` 上下文。
- agent-client `StreamEvent` 的模型事件增加 effective/pending/applyAt 字段。
- `SessionMeta` 增加会话级模型偏好字段。
- 保留现有 `AGENT_BUSY`，继续保证同一 session 单轮互斥；页面级并发由 runtime manager 控制。

## 六、实施拆分与复杂度

| 子系统 | 主要工作 | 复杂度 | 估算 |
| --- | --- | --- | --- |
| 前端 runtime 与历史交互 | 多 runtime、后台流、审批徽标、队列和单一可见 Chat 投影 | 高 | 8–12 人日 |
| Workspace 事件投影 | session/page/resource 归因、Authority snapshot 投影、预览刷新 | 高 | 4–6 人日 |
| Session 与模型协议 | 多 editing 会话、模型持久化、pending → effective | 中高 | 4–6 人日 |
| Agent/Authority 冲突自愈 | 结构化结果、重读、两次重试、诊断 | 中高 | 3–5 人日 |
| 测试、E2E、文档 | 并行运行、审批、卸载、模型和冲突回归 | 高 | 5–8 人日 |

## 七、验收标准

### 单元与服务测试

- 流式输出时历史 Popover 可打开，模型选择可提交并显示下一轮生效。
- A/B 会话的消息、流事件、审批卡和模型状态互不串线。
- 并发上限、排队、取消和 `pagehide` 清理行为正确。
- 同一 Workspace 可创建多个 `editing` session，新建/切换不会归档旧会话。
- busy 时模型切换只生成 pending 状态；下一轮才变为 effective。
- Authority 冲突最多自动重试 2 次，不重复执行整轮副作用。

### Playwright E2E

1. 启动会话 A 的长任务。
2. 输出过程中打开历史并新建会话 B。
3. A、B 同时运行，切换历史仍能看到各自实时输出。
4. A、B 使用不同模型；A 运行中切换模型并验证下一轮生效。
5. 后台会话进入审批等待，历史徽标正确，切换后可以完成审批。
6. 第 4 个任务进入排队。
7. 刷新页面后运行被取消，部分消息仍可恢复。
8. 两个会话修改同一资源时，AI 自动重读并重试，不能覆盖最新 Workspace 内容。

建议验证命令：

```text
corepack pnpm check:ai-chat-shared
corepack pnpm check:author
corepack pnpm check:agent
corepack pnpm test:e2e
```

## 八、风险与后续

- 共享 Workspace 只能保证写入安全，不能保证两个 AI 的业务意图自动合并；必须依赖最新读取、资源级冲突和有限重试。
- 页面级并发限制无法阻止多个浏览器标签页绕过限制。若未来需要全局配额，应在 agent-service 增加按用户/项目的服务端 semaphore。
- agent-service 的 Agent 状态目前以内存为主；本规划明确“当前页面存活”，不把它扩展为跨进程 durable background job。
- 开发完成后需同步更新 AI 对话需求、组件设计、运行日志、会话管理和实时协同文档，修正“流式期间禁用历史”“切换即归档”的旧语义。
