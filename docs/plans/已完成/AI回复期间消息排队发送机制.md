# AI 回复期间消息排队发送机制

## 背景

当前 AI 回复期间，创作端输入框处于不可编辑状态，发送按钮变成停止按钮。用户希望参考 Codex 的交互：AI 正在回复时仍允许用户继续输入并发送消息，但新消息不会打断当前回复，而是进入队列，等当前 AI 回复结束后自动发送下一条。

本任务已进入实施阶段。当前第一版采用前端本地队列，不改变后端 Agent 单消息处理模型。

## 目标

- AI 回复中，用户仍可在输入框输入新消息。
- 用户点击发送或按 Enter 时，新消息进入待发送队列。
- 当前 AI 回复完成后，系统自动按顺序发送队列中的下一条消息。
- 队列消息应吸附展示在输入框上方，并明确处于“等待发送”状态。
- 用户应能取消尚未发送的排队消息。

## 范围

- 主要涉及创作端 AI 对话组件和 WebSocket 发送生命周期。
- 第一版只要求同一会话内串行队列，不要求并发执行多个 Agent 请求。
- 不改变后端 Agent 单消息处理模型；后端仍保持同一 Agent 同时只处理一条消息。
- 不改变现有“停止当前回复”能力，但需要重新设计发送按钮/停止按钮的关系。

## 当前现状

### 前端输入禁用点

- `packages/author-site/src/components/ai-elements/ai-chat.tsx`
  - 将 `isStreaming` 传给 `ChatInput`。
  - `handleHistoryClick` 在 `isStreaming` 时阻止切换历史。
  - `triggerAutoSend` 只有 `!isStreaming` 时才自动发送。
- `packages/author-site/src/components/ai-elements/chat/chat-input.tsx`
  - `PromptInput` 的 `status` 由 `isStreaming ? "streaming" : "idle"` 决定。
  - 历史按钮在 `isStreaming` 时 disabled。
- `packages/author-site/src/components/ai-elements/prompt-input.tsx`
  - `PromptInputTextarea` 在 `context.status !== "idle"` 时 disabled。
  - Enter 发送条件要求 `context.status === "idle"`。
  - `PromptInputSubmit` 在 `streaming` 状态点击会调用 `onCancel`，显示停止图标，而不是发送当前输入。

### 前端发送生命周期

- `packages/author-site/src/components/ai-elements/chat/hooks/use-chat-stream.ts`
  - `handleSend()` 会立即追加用户消息、创建新的 assistant currentMessage、建立 WebSocket、发送消息并设置 `isStreaming=true`。
  - `onFinish` 中把 current assistant message 追加到历史、持久化消息、刷新文件变更，并最终 `setIsStreaming(false)`。
  - `onError`、连接失败和 HTTP fallback 也会结束 streaming 状态。
  - 当前实现没有 pending queue；再次调用 `handleSend()` 会创建新流，可能和正在运行的流状态冲突，因此 UI 直接禁用了输入。
- `packages/author-site/src/components/ai-elements/chat/services/stream-service.ts`
  - `connect()` 创建 `AgentStream`。
  - `sendMessage()` 负责拼接 L3/L4/L5 上下文和 system prompt 后，通过 WebSocket 发送 `type: "message"`。

### 后端单消息约束

- `packages/agent-service/src/core/agent-manager.ts`
  - `sendMessage()` 在 `BackendAgent.isBusy()` 时返回错误：`Agent is currently processing a previous message`。
- `packages/agent-service/src/core/backend-agent.ts`
  - `sendMessage()` 设置 `busy=true` 和状态 `processing`，完成后恢复。
- `packages/agent-service/src/routes/websocket.ts`
  - 每个 `message` 会调用 `eventRouter.startMessage(messageId)`，等待 `agent.sendMessage()` 完成后发送 `finish` 或 `error`。
  - 目前没有服务端队列；排队应优先放在前端，避免改变 Agent 并发语义。

## 建议方案

### 1. 前端新增本地发送队列

建议在 `use-chat-stream.ts` 内维护队列，或拆出新 hook：

- `queuedMessages: QueuedChatMessage[]`
- `enqueueMessage(message, images, runOptions)`
- `sendNextQueuedMessage()`
- `cancelQueuedMessage(queueId)`

建议队列项字段：

- `queueId`
- `content`
- `images`
- `runOptions`
- `createdAt`
- `status: "queued" | "sending" | "cancelled"`
- `displayMessageId`

当 `isStreaming=true` 时，`handleSend()` 不直接开新流，而是：

1. 追加一条用户消息到 `messages`，标记为 `queued`。
2. 存入本地队列。
3. 清空输入框和附件。
4. 不修改当前 assistant message。

当前流结束后，在 `onFinish` / `onError` 的收尾路径中检查队列，取第一条未取消消息自动调用内部发送函数。

### 2. 拆分“提交消息”和“开始流式执行”

当前 `handleSend()` 同时负责追加用户消息、创建 assistant 消息、连接流和发送。建议拆成两层：

- `submitMessage()`：用户提交入口；根据是否正在 streaming 决定立即发送或入队。
- `startMessageRun()`：真正启动 WebSocket 流，只允许在没有活动流时调用。

这样可以避免排队消息自动发送时重复追加用户消息，也能清晰处理系统自动修复任务。

### 3. 输入框 streaming 时仍可编辑

需要调整：

- `PromptInputTextarea` 不应因为 `streaming` 禁用；可新增 prop 控制是否允许 streaming 输入。
- Enter 发送条件从 `status === "idle"` 改为允许 `streaming` 下调用 `onSubmit`。
- `PromptInputSubmit` 的行为需要拆分：
  - 如果有输入内容或附件：显示发送图标，点击后入队。
  - 如果没有输入内容且正在 streaming：显示停止图标，点击取消当前回复。

建议不要把“停止”和“发送”绑定在同一个不可区分状态上；可在输入区右侧同时显示“停止当前回复”小按钮和“发送/排队”按钮，或按 Codex 风格在有文本时优先发送。

### 4. 排队消息展示

`packages/author-site/src/components/ai-elements/message.tsx` 的 `ChatMessage` 可增加可选队列状态：

- `queueStatus?: "queued" | "sending" | "cancelled"`
- `queueId?: string`

用户消息渲染时：

- `queued`：显示“等待发送”轻量标识和取消入口。
- `sending`：显示“正在发送”或移除标识。
- `cancelled`：可从历史移除，或保留为“已取消”等弱提示；第一版建议直接移除，减少噪音。

2026-07-01 调整：排队消息不再混入 `ChatMessages` 历史滚动流，而是由 `AIChat` 在输入框上方渲染吸附式队列栏，参考 Codex 的贴底等待消息体验。

相关渲染路径：

- `packages/author-site/src/components/ai-elements/chat/chat-messages.tsx`
- `packages/author-site/src/components/ai-elements/message.tsx`

### 5. 自动发送队列的时机

需要统一在所有结束路径触发：

- `onFinish`
- `onError`
- `onConnectionError`
- HTTP fallback finally
- 用户手动 `handleCancel`

推荐使用一个 `drainQueue()` 函数，只在 `isStreaming=false` 且没有 active stream 时启动下一条。注意 React state 更新是异步的，建议用 `queueRef` 和 `activeRunRef` 避免重复发送。

### 6. 与现有特殊能力的关系

- 历史切换：当前 `handleHistoryClick` streaming 时阻止切换。若有排队消息，也应阻止切换，或切换前提示会丢弃队列。第一版建议保留阻止。
- 自动修复：`triggerAutoSend` 当前只在 `!isStreaming` 时触发。后续可让系统任务也进入同一队列，但第一版建议只处理用户手动输入，避免自动修复和用户消息抢顺序。
- 单选题确认卡片：如果 AI 正在等待 `requestUserChoice` 的用户选择，不应把普通输入误当作卡片答案；排队消息仍作为下一轮用户消息处理。
- 权限确认：如果 AI 正在等待权限弹窗，普通输入可排队，但不能自动替代权限响应。

## 关键代码路径

前端输入和消息流：

- `packages/author-site/src/components/ai-elements/ai-chat.tsx`
- `packages/author-site/src/components/ai-elements/chat/chat-input.tsx`
- `packages/author-site/src/components/ai-elements/prompt-input.tsx`
- `packages/author-site/src/components/ai-elements/chat/hooks/use-chat-stream.ts`
- `packages/author-site/src/components/ai-elements/chat/services/stream-service.ts`
- `packages/author-site/src/components/ai-elements/message.tsx`
- `packages/author-site/src/components/ai-elements/chat/chat-messages.tsx`

后端并发边界：

- `packages/agent-service/src/core/agent-manager.ts`
- `packages/agent-service/src/core/backend-agent.ts`
- `packages/agent-service/src/routes/websocket.ts`

现有测试参考：

- `packages/author-site/src/components/ai-elements/__tests__/prompt-input.test.tsx`
- `packages/author-site/src/components/ai-elements/__tests__/message.test.tsx`
- `packages/author-site/src/components/ai-elements/__tests__/use-chat-stream-auto-repair.test.tsx`
- `packages/agent-service/tests/unit/agent-manager.test.ts`

## 任务清单

- [x] 设计 `QueuedChatMessage` 类型和队列状态。
- [x] 拆分 `handleSend()` 为提交入口和实际启动流入口。
- [x] streaming 时允许输入和提交，将新消息入队。
- [x] 当前回复结束后自动发送下一条队列消息。
- [x] 为排队用户消息增加“等待发送”展示和取消入口。
- [x] 保留当前停止回复能力，明确停止按钮和发送按钮的优先级。
- [x] 补充单元测试和交互测试。
- [x] 更新 AI 对话需求文档和组件技术文档。

## 进度记录

### 2026-06-30 实施完成

- `use-chat-stream.ts` 已将用户提交入口与实际 Agent 运行拆开：空闲时直接启动，流式回复中提交的普通用户消息进入本地队列。
- 当时排队消息以用户气泡展示“等待发送”状态，并提供取消入口；2026-07-01 已调整为输入框上方吸附队列栏。
- 当前轮 `finish`、连接错误、Agent 错误、事务化工具缺失、HTTP fallback 和用户手动停止都会释放运行锁并尝试发送下一条队列消息。
- `PromptInput` 在 streaming 状态下仍允许输入、粘贴图片和提交；有内容时提交消息，空内容且正在 streaming 时才停止当前回复。
- 当时 `ChatMessages` 渲染顺序调整为：普通历史、当前流式回复、排队气泡；2026-07-01 已改为 `ChatMessages` 不渲染排队消息。
- 已补充 Jest 覆盖输入组件 streaming 提交、排队消息取消、hook 自动 drain。

### 2026-07-01 输入区吸附展示调整

- 排队消息展示从 `ChatMessages` 历史流移出，改由 `AIChat` 在输入框上方渲染 `QueuedMessagesTray`。
- 队列栏右对齐展示排队内容、“等待发送”状态和取消入口，最大高度受控，超出后内部滚动。
- 新增 `AIChat` 级别测试，确认排队内容只出现在输入框上方队列栏，并且取消按钮仍调用队列取消逻辑。

## 验收标准

- AI 正在回复时，输入框仍可输入文字、粘贴图片、发送消息。
- AI 正在回复时发送的消息不会触发后端 busy 错误。
- 多条排队消息按提交顺序串行发送。
- 用户能取消尚未发送的排队消息。
- 当前回复完成、失败、取消后，队列不会卡死。
- 切换会话或组件卸载时，不应把旧会话队列发送到新会话。
- `corepack pnpm check:author` 通过；若触及后端队列或协议，再运行 `corepack pnpm check:agent`。

## 验证结果

- 2026-06-30：`corepack pnpm --filter @opencode-workbench/author-site test -- --runTestsByPath src/components/ai-elements/__tests__/prompt-input.test.tsx src/components/ai-elements/__tests__/message.test.tsx src/components/ai-elements/__tests__/use-chat-stream-auto-repair.test.tsx` 通过，3 个测试文件共 12 个用例通过。
- 2026-06-30：`corepack pnpm check:author` 通过，包含 author-site typecheck 和全部 Jest；61 个测试套件、463 个用例通过。
- 2026-07-01：`corepack pnpm --filter @opencode-workbench/author-site test -- --runTestsByPath src/components/ai-elements/__tests__/ai-chat-queued-tray.test.tsx src/components/ai-elements/__tests__/prompt-input.test.tsx src/components/ai-elements/__tests__/message.test.tsx src/components/ai-elements/__tests__/use-chat-stream-auto-repair.test.tsx` 通过，4 个测试文件共 13 个用例通过。

## 风险点

- `handleSend()` 当前承担太多职责，直接在原函数内加队列容易造成重复追加用户消息或重复持久化。
- `isStreaming` state 更新异步，队列 draining 需要 ref 防重入。
- 图片附件在入队时应保存转换后的 `ImageAttachment[]`，不能依赖已经被清空的 input files。
- 当前后端会拒绝 busy Agent；第一版前端队列必须确保不会在上一轮未结束时调用 WebSocket `message`。
- HTTP fallback 路径也要触发队列收尾，否则 WebSocket 失败后可能卡住。
