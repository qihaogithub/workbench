# AI对话编辑重发 — 服务端历史重同步方案

## 背景

连续对话（如 10 轮）后，用户编辑其中一条消息（如第 3 轮）重发。当前实现：

- **前端** `handleEditResend` 正确截断消息列表，`buildConversationHistoryPrefix` 以文本形式注入最近 8 条历史（上限 2000 字符/条）到消息内容中。
- **服务端** `AgentHarness` 会话（`InMemorySessionRepo`）累积所有历史消息，编辑重发时旧消息及其回复仍存在于 session 中，导致模型看到已作废的上下文。

## 目标

编辑重发时：
1. 保留截断后历史（第 1-2 轮）的完整上下文
2. 第 3 轮旧消息及其后的回复全部作废
3. 不依赖前端 lossy prefix 作为唯一历史来源

## 方案

**Option B（已验证）：服务端销毁 + 保留角色重播**

编辑重发时，前端截断本地列表后：
1. 通过临时 WS 连接发送 `resync_history` 消息，携带截断后保留的消息列表
2. 服务端销毁旧 agent → 重建 → 逐条以正确 role（`user`/`assistant`）调用 `harness.appendMessage()` 写入 session
3. 前端再发送编辑后的新消息（跳过 `buildConversationHistoryPrefix`，避免重复）

### 关键验证

| 验证项 | 结论 |
|--------|------|
| `AgentHarness.appendMessage()` 存在 | ✅ `agent-harness.d.ts:58` |
| 空闲时直接写入 session | ✅ `agent-harness.js:590-597` |
| `convertToLlm` 透传 `user`/`assistant` | ✅ `messages.js:92-95` |
| 缺字段 `AssistantMessage` 不会导致 LLM 调用失败 | ✅ `transform-messages.js:65-67` — `isSameModel` 安全退化 |
| `handleEditResend` 截断后 `messagesRef` 已同步更新 | ✅ `use-chat-messages.ts:61` |
| `buildConversationHistoryPrefix` 在编辑重发时需跳过 | ✅ 否则与 `appendMessage` 重播历史重复 |
| `getConfig()` 可获取已有 agent 配置 | ✅ `agent.ts:67` |
| `manager.destroy()` + `getOrCreate()` 可重建干净 agent | ✅ `agent-manager.ts:147-153` |

## 改动清单

### 1. `agent-client/src/client.ts` — `AgentStream.resyncHistory()`

发送 `{ type: "resync_history", id, sessionId, messages }`，返回 Promise，监听 `status: ready` 且 `id` 匹配时 resolve。

### 2. `agent-service/src/backends/base.ts` — `IBackendAdapter`

新增可选方法：
```typescript
appendHistoryMessage?(role: string, content: string): Promise<void>;
```

### 3. `agent-service/src/backends/pi-agent.ts` — 实现

```typescript
async appendHistoryMessage(role: string, content: string): Promise<void> {
  if (!this.harness) throw new Error("Agent not initialized");
  await this.harness.appendMessage({
    role: role as "user" | "assistant",
    content: [{ type: "text", text: content }],
    timestamp: Date.now(),
  } as any);
}
```

### 4. `agent-service/src/core/agent.ts` — `BaseAgent` 新增抽象方法

### 5. `agent-service/src/core/backend-agent.ts` — 实现委托

### 6. `agent-service/src/routes/websocket.ts` — 新增 `case "resync_history"`

1. `manager.get(sessionId).getConfig()` 获取配置
2. `manager.destroy(sessionId)` 销毁旧 agent
3. `manager.getOrCreate(sessionId, config)` 重建
4. `agent.start()` 初始化
5. 遍历 messages 调用 `agent.appendHistoryMessage(role, content)`
6. 回复 `{ type: "status", id, sessionId, status: "ready" }`

### 7. `ai-chat-shared/src/chat/services/stream-service.ts` — 新增 `resyncHistory()`

### 8. `ai-chat-shared/src/chat/hooks/use-chat-stream.ts` — 修改 `handleEditResend`

- 截断后创建临时 `StreamService`，连接 WS 调 `resyncHistory`，等待返回后关闭
- 调 `handleSend(newContent, images, { skipHistoryPrefix: true })`
- `handleSend`/`startMessageRun` 接受 `skipHistoryPrefix` 选项

## 注意事项

- `handleEditResend` 签名改为 `Promise<void>`，调用方不 await，不影响
- resync 阶段多一次 WS 往返，用户无感知
- `appendHistoryMessage` 只传纯文本（与现有 `buildConversationHistoryPrefix` 行为一致）
- `skipHistoryPrefix` 仅在编辑重发时使用，正常消息不受影响

## 验证

```bash
pnpm check:agent && pnpm check:agent-client && pnpm check:ai-chat-shared
```