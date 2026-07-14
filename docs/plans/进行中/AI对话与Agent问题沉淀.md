# AI对话与Agent问题沉淀

## 当前状态

- **AGENT_BUSY 状态卡死**：✅ 已修复。三层防御：StreamService.close() 发 cancel 帧、WebSocket close handler 自动 cancel Agent、前端收到 AGENT_BUSY 自动重试一次。

---

## 问题：用户取消或断连后 AGENT_BUSY 状态残留 ✅

### 现象

- 用户在 AI 对话中发送消息后取消（或 WebSocket 异常断连），再发送新消息时收到错误："上一轮 AI 请求仍在运行，请等待完成或先取消后再发送。"
- 后端 Agent 的 `busy` 标志永远无法被清除，该会话后续所有消息都被拒绝
- 用户只能等待超时（5-15 分钟）或刷新页面重建 Agent

### 影响范围

- 所有用户主动取消 AI 回复的场景
- 所有 WebSocket 异常断连的场景（网络中断、浏览器关闭、切换页面等）
- 每次触发后该会话永久不可用（直到超时或刷新）

### 根因分析

#### `busy` 状态生命周期

```
BackendAgent.sendMessage() 入口 → busy = true (backend-agent.ts:76)
  ├─ 正常完成 → busy = false (L162)
  ├─ 异常 catch → busy = false (L202)
  ├─ cancel() → busy = false (L241)
  └─ kill() → busy = false (L247)
```

`busy = false` 只在 `sendMessage` 的 try/catch 结束、`cancel()` 或 `kill()` 中被设置。没有任何 WebSocket 事件或定时器能自动清除它。

#### 三条触发路径

**路径 1（主要）：用户取消 → 前端关闭 WebSocket → 后端 Agent 未取消**

```
① 用户发消息 → 前端建 WebSocket → 后端 agent.sendMessage() → busy=true
② 用户点取消 → handleCancel() → streamService.close()
   → StreamService.close() 直接关闭 WebSocket，没有发送 cancel 帧
   → AgentStream.close() 也没有发 cancel
③ 后端 WebSocket close 事件：
   → agent.status === "processing" → 不清理、不取消 → busy 保持 true
④ 用户发下一条消息 → 新 WebSocket → agent.isBusy() === true → AGENT_BUSY
```

断裂点：`StreamService.close()` 和 `AgentStream.close()` 都没有在关闭前发送 `{ type: "cancel" }` 消息。

**路径 2：WebSocket 异常断连（网络中断、浏览器关闭）**

```
① 后端正在处理 → busy=true
② 网络断开 → WebSocket close 事件触发
③ 后端 close handler：agent.status === "processing" → 不清理
④ 用户重连后发消息 → AGENT_BUSY
```

断裂点：WebSocket `close` handler（websocket.ts:826）只对非 processing 状态的 Agent 做清理，对 processing 状态的 Agent 不取消。

**路径 3：Pi Agent harness 卡死（极端情况，已有超时兜底）**

```
① 模型无限 thinking → harness.prompt() 永不 resolve/reject
② busy 保持 true
③ 超时兜底：INACTIVITY_TIMEOUT=5min / ABSOLUTE_TIMEOUT=15min
④ 在超时触发前，用户发消息 → AGENT_BUSY
```

此路径有超时兜底，但等待时间过长（5-15 分钟），用户体验差。

#### 关键代码路径

| 组件                            | 文件                                                                                  | 问题                                 |
| ------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------ |
| `StreamService.close()`         | `packages/author-site/src/components/ai-elements/chat/services/stream-service.ts:348` | 关闭 WebSocket 前不发送 cancel 帧    |
| `AgentStream.close()`           | `packages/agent-client/src/client.ts:397`                                             | 底层也没有 cancel 帧                 |
| WebSocket `close` handler       | `packages/agent-service/src/routes/websocket.ts:812`                                  | 对 processing 状态 Agent 不做 cancel |
| `handleCancel`                  | `packages/author-site/src/components/ai-elements/chat/hooks/use-chat-stream.ts:1517`  | 只调用 close()，不发 cancel          |
| `BackendAgent.cancel()`         | `packages/agent-service/src/core/backend-agent.ts:234`                                | 正确实现，但从未被上述场景调用       |
| `PiAgentBackend.cancelPrompt()` | `packages/agent-service/src/backends/pi-agent.ts:861`                                 | 调用 `harness.abort()`，能正确中断   |

### 修复方案（三层防御）

| 层                   | 位置                           | 改动                                                                | 覆盖场景                               |
| -------------------- | ------------------------------ | ------------------------------------------------------------------- | -------------------------------------- |
| **第一层（主修复）** | `StreamService.close()`        | 关闭前检查 `messageInFlight`，发送 `{ type: "cancel" }`             | 用户主动取消、正常流结束但后端还在处理 |
| **第二层（兜底）**   | WebSocket `close` handler      | 最后一个连接关闭时，若 Agent 仍在 processing，调用 `agent.cancel()` | 网络断连、浏览器关闭、第一层来不及发   |
| **第三层（容错）**   | `startMessageRun` 的 `onError` | 收到 AGENT_BUSY 时自动 close → 短暂等待 → 重试当前消息              | 前两层都未覆盖的竞态边缘情况           |

#### 第一层：`StreamService.close()` 关闭前发 cancel

- 文件：`packages/author-site/src/components/ai-elements/chat/services/stream-service.ts`，line 348
- 改动：在 `this.stream.close()` 前，检查 `ws?.readyState === WebSocket.OPEN && this.messageInFlight`，发送 `{ type: "cancel" }`
- 安全分析：
  - 正常 finish 后 `messageInFlight=false` → 不会多发 cancel
  - 只在有消息在处理中且 WebSocket 仍连接时才发送

#### 第二层：后端 WebSocket 关闭时自动取消 Agent

- 文件：`packages/agent-service/src/routes/websocket.ts`，line 812-845
- 改动：在 `!hasOtherConnections` 分支中，先检查 `agent instanceof BackendAgent && agent.isBusy()`，若 busy 则调用 `agent.cancel()`
- 安全分析：
  - `cancel()` 是幂等的（内部有 `if (!this.busy) return` 守卫）
  - cancel 后 `busy=false`、`status="ready"`，后续 `agent.status !== "processing"` 检查通过，正常清理

#### 第三层：前端收到 AGENT_BUSY 后自动重试

- 文件：`packages/author-site/src/components/ai-elements/chat/hooks/use-chat-stream.ts`，`onError` handler（line 959）
- 改动：在 `onError` 中检查 `error.code === "AGENT_BUSY"`，若是则 close → completeRunAndDrain → 延迟 200ms → 重试 `startMessageRun`
- 安全分析：
  - 重试前 close 确保旧 WebSocket 已关闭
  - 延迟 200ms 给后端时间处理 cancel
  - 只重试一次（重试走新的 WebSocket，后端此时应该已 cancel）

### 验证状态

- ✅ 已修复，pnpm check:author + pnpm check:agent 通过
- 改动文件：`stream-service.ts`（Layer 1）、`websocket.ts`（Layer 2）、`use-chat-stream.ts`（Layer 3）
- 手动验证待执行：发送长消息 → 取消 → 发新消息、刷新页面 → 发新消息、断网 → 重连 → 发新消息

### 风险

| 风险                                                 | 影响                           | 缓解                                                                      |
| ---------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------- |
| cancel 帧和 close 帧竞态                             | 后端先收到 close 再收到 cancel | 第二层兜底：close 时直接 cancel，不依赖 cancel 帧                         |
| 第三层自动重试可能循环                               | 后端一直 busy 导致反复重试     | 重试只执行一次；后续仍 AGENT_BUSY 走正常 onError 显示错误                 |
| `cancelPrompt()` 后 `harness.prompt()` 不立即 reject | sendMessage promise 挂起       | 已有 inactivity/absolute 超时兜底；cancel 后 busy=false，新消息不会被拒绝 |
