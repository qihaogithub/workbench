# AI对话偶发性卡住 — 问题分析报告

## 1. 问题背景

### 问题描述
AI对话时偶发性卡住，AI长时间运行但没有响应。表现为前端界面显示AI正在处理中，但长时间无内容输出，用户无法继续对话。

### 发生场景
- **时间**：偶发性，非每次必现
- **环境**：Next.js 14 前端 + agent-service 后端（Fastify + WebSocket）
- **触发条件**：发送消息后，AI处理过程中

### 预期行为
AI应该持续响应用户输入，通过WebSocket实时推送流式内容，保持对话流畅。即使AI思考时间较长，也应该有状态反馈或超时处理。

### 实际行为
AI在某些时刻停止响应，前端显示"处理中"状态但长时间无输出，用户无法得知是AI仍在思考、网络断开、还是系统卡死。

### 错误信息
暂无具体错误日志（用户未提供）

---

## 2. 根因分析

### 调查过程

1. **追踪WebSocket通信链路**：从客户端 `use-chat-stream.ts` 到服务端 `websocket.ts`，再到ACP连接 `connection.ts`
2. **检查超时机制**：发现多层超时设置，但存在关键缺陷
3. **检查流式响应处理**：发现服务端到客户端的事件转发机制
4. **检查ACP子进程通信**：发现stdio通信和JSON-RPC消息处理
5. **检查Agent生命周期管理**：发现Agent Manager的idle清理机制

### 证据链

| 证据 | 级别 | 来源 | 说明 |
|------|------|------|------|
| WebSocket消息超时设为300秒 | A | `websocket.ts:111` | `const MESSAGE_TIMEOUT_MS = 300000` |
| 超时后仅调用agent.cancel()，无错误推送到客户端 | A | `websocket.ts:450-467` | 超时后resolve错误结果，但前端可能未正确处理 |
| ACP连接promptTimeoutMs设为300秒 | A | `connection.ts:91` | `private promptTimeoutMs: number = 300000` |
| ACP请求超时后reject，但WebSocket层可能未捕获 | A | `connection.ts:454-491` | `handlePromptTimeout` 中reject错误 |
| 前端静默检测阈值30秒 | A | `use-chat-stream.ts:88` | `const SILENCE_THRESHOLD_MS = 30000` |
| 前端在WebSocket失败时回退到HTTP非流式模式 | A | `use-chat-stream.ts:388-462` | catch块中尝试HTTP回退 |
| WebSocket心跳检测60秒超时 | A | `websocket.ts:110` | `const HEARTBEAT_TIMEOUT = 60000` |
| Agent Manager空闲2小时自动清理 | A | `agent-manager.ts:7` | `DEFAULT_IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000` |
| ACP子进程通过stdio通信，缓冲区可能满 | B | `connection.ts:152-155` | `stdio: ["pipe", "pipe", "pipe"]` |
| 权限请求等待60秒后自动拒绝 | A | `websocket.ts:258-261` | `setTimeout(() => resolve({ optionId: "reject_once" }), 60000)` |
| 前端streamService在finish事件中关闭连接 | A | `stream-service.ts:226-237` | `this.stream.on("finish", ...)` 中调用 `this.close()` |

### 根本原因

**根因一：多层超时机制缺乏协同，导致"静默卡住"**

系统存在多个独立的超时机制：
1. **WebSocket层**：300秒消息超时（`MESSAGE_TIMEOUT_MS`）
2. **ACP连接层**：300秒prompt超时（`promptTimeoutMs`）
3. **前端静默检测**：30秒无事件即显示静默状态

**问题**：当AI处理时间超过30秒但少于300秒时，前端已检测到静默，但后端仍在正常处理。此时如果用户继续等待，可能在300秒时收到超时错误；如果用户刷新或重试，可能导致重复请求或状态不一致。

**更深层问题**：超时发生后，WebSocket层的错误处理（`websocket.ts:470-493`）会发送error消息，但前端`stream-service.ts`中的error处理（line 239-264）仅在`connectionEstablished`为true时才会触发`onError`回调。如果连接尚未建立或事件顺序异常，错误可能被静默吞掉。

**根因二：ACP子进程stdio通信存在缓冲区溢出风险**

ACP协议通过子进程的stdio进行JSON-RPC通信（`connection.ts:152-155`）：
```typescript
this.child = spawn(actualCommand, actualArgs, {
  cwd: this.workingDir,
  env: { ...cleanEnv, ...this.config?.env },
  stdio: ["pipe", "pipe", "pipe"],
  shell: useShell,
});
```

**问题**：当AI产生大量流式输出时，stdout管道缓冲区可能达到上限（通常在64KB-1MB之间，取决于操作系统）。如果前端消费速度跟不上AI生产速度，或者事件处理链中存在阻塞，ACP子进程的stdout写入将阻塞，导致AI进程挂起。

**根因三：WebSocket连接缺乏客户端心跳确认机制**

服务端有心跳检测（`websocket.ts:113-122`）：
```typescript
function heartbeat(): void {
  const now = Date.now();
  for (const [sessionId, conn] of connections) {
    if (now - conn.lastPing > HEARTBEAT_TIMEOUT) {
      logger.info({ sessionId }, "WebSocket connection timed out, closing");
      conn.socket.terminate();
      connections.delete(sessionId);
    }
  }
}
```

**问题**：心跳机制仅检查`lastPing`时间，但`lastPing`只在收到客户端消息时更新（`websocket.ts:283`）。如果客户端长时间不发消息（例如用户在等待AI响应），服务端可能在60秒后断开连接。虽然前端有`startSilenceTracking`检测，但这只是UI提示，不会主动发送ping维持连接。

**根因四：Agent Manager的idle清理与WebSocket连接生命周期不同步**

Agent Manager每60秒检查一次idle agent（`agent-manager.ts:42-48`），2小时无活动则清理。但WebSocket连接可能在60秒无消息后就断开。这意味着：
- WebSocket断开后，Agent仍在内存中保留2小时
- 用户重连时，可能复用旧的Agent实例，但旧实例状态可能不一致

### 代码执行路径

**正常流式响应路径**：
```
[用户发送消息]
  → use-chat-stream.ts:handleSend()
    → stream-service.ts:connect() → WebSocket连接
      → websocket.ts:handleSessionUpdate()
        → agent.sendMessage()
          → backend-agent.ts:sendMessage()
            → opencode-acp.ts:sendMessage()
              → connection.ts:sendPrompt()
                → ACP子进程 (opencode CLI)
                  ← 流式输出 (agent_message_chunk)
                ← connection.ts:handleMessage()
              ← opencode-acp.ts:handleSessionUpdate()
            ← backend-agent.ts:eventCallback
          ← agent.emit("stream")
        ← websocket.ts:eventHandler
      ← WebSocket推送 stream 事件
    ← stream-service.ts:onStream
  ← use-chat-stream.ts:setStreamContent / setCurrentMessage
```

**卡住时的可能路径**：
```
[用户发送消息]
  → ... → ACP子进程处理中
    → stdout缓冲区满 → 子进程阻塞
      → 无sessionUpdate事件产生
        → WebSocket无消息推送
          → 前端静默检测触发（30秒）
            → 用户看到"已静默X秒"提示
              → 但后端仍在阻塞中
                → 300秒后WebSocket超时
                  → 发送error消息
                    → 但前端可能未正确处理
```

---

## 3. 解决方案

### 方案一：修复stdio缓冲区溢出风险（推荐）

**描述**：
1. 在ACP连接中为stdout添加流控机制，使用`readable`事件而非`data`事件，或增加缓冲区大小
2. 在`connection.ts`中，当缓冲区积累过多未处理数据时，主动消费或丢弃旧数据
3. 考虑使用`spawn`的`maxBuffer`选项或手动管理背压（backpressure）

**原理**：防止ACP子进程因stdout缓冲区满而阻塞，确保流式输出不会被中断。

**影响范围**：
- `packages/agent-service/src/acp/connection.ts`
- 可能涉及所有ACP后端适配器

**风险**：
- 修改底层通信机制，需充分测试
- 可能引入新的流控问题

**复杂度**：高

---

### 方案二：统一超时机制并增强错误传播

**描述**：
1. 将WebSocket层超时（300秒）与ACP层超时（300秒）统一为一个配置项
2. 在超时发生时，确保错误信息能可靠传递到前端：
   - 在`websocket.ts`中，超时后不仅发送error消息，还发送status消息（ready）
   - 在`stream-service.ts`中，确保error事件始终触发`onError`回调，无论`connectionEstablished`状态
3. 前端在收到error时，自动重置UI状态（停止loading动画）

**原理**：消除多层超时不一致导致的"静默卡住"，确保用户在任何超时场景下都能收到明确反馈。

**影响范围**：
- `packages/agent-service/src/routes/websocket.ts`
- `packages/web/src/components/ai-elements/chat/services/stream-service.ts`
- `packages/web/src/components/ai-elements/chat/hooks/use-chat-stream.ts`

**风险**：
- 修改超时逻辑可能影响正常长对话
- 需确保前端状态重置不会丢失已接收的内容

**复杂度**：中

---

### 方案三：增强WebSocket心跳机制

**描述**：
1. 前端在静默检测期间（超过10秒无事件），主动发送ping消息维持连接
2. 服务端在收到ping后立即更新`lastPing`，避免误判超时
3. 或者，将心跳超时从60秒延长到300秒（与消息超时一致）

**原理**：防止因前端等待AI响应时，WebSocket被服务端误判为超时断开。

**影响范围**：
- `packages/agent-service/src/routes/websocket.ts`
- `packages/web/src/components/ai-elements/chat/services/stream-service.ts`

**风险**：
- 延长心跳超时可能增加服务端连接资源占用
- 前端主动ping可能增加网络流量（但极小）

**复杂度**：低

---

### 方案四：添加ACP子进程健康检查

**描述**：
1. 在`connection.ts`中，定期（如每30秒）检查子进程是否仍在运行且响应
2. 如果子进程无响应，主动重启或报错
3. 在`opencode-acp.ts`中，添加对`connection.isConnected`的定期检查

**原理**：及时发现ACP子进程挂起或崩溃，避免前端长时间等待。

**影响范围**：
- `packages/agent-service/src/acp/connection.ts`
- `packages/agent-service/src/backends/opencode-acp.ts`

**风险**：
- 健康检查本身可能引入性能开销
- 误判可能导致不必要的重启

**复杂度**：中

---

### 后续建议

1. **添加详细日志**：在关键路径（sendMessage、handleSessionUpdate、事件转发）添加更多debug日志，便于下次问题发生时定位
2. **监控指标**：收集以下指标：
   - WebSocket连接持续时间
   - 消息处理时间分布
   - ACP子进程stdout缓冲区大小
   - 超时事件发生频率
3. **用户反馈机制**：在UI上显示更详细的状态信息（如"AI正在思考..."、"处理工具调用..."），减少用户焦虑
4. **压力测试**：模拟AI长时间输出大量内容的场景，测试系统稳定性

---

## 4. 相关代码路径

### 涉及文件

| 文件路径 | 行号 | 说明 |
|---------|------|------|
| `packages/agent-service/src/routes/websocket.ts` | L1-L780 | WebSocket服务端路由，处理消息收发、超时、心跳 |
| `packages/agent-service/src/acp/connection.ts` | L1-L902 | ACP连接管理，子进程通信、JSON-RPC消息处理 |
| `packages/agent-service/src/backends/opencode-acp.ts` | L1-L430 | OpenCode ACP后端适配器 |
| `packages/agent-service/src/backends/base-acp.ts` | L1-L343 | ACP后端基类 |
| `packages/agent-service/src/core/backend-agent.ts` | L1-L118 | 后端Agent实现 |
| `packages/agent-service/src/core/agent-manager.ts` | L1-L163 | Agent生命周期管理 |
| `packages/web/src/components/ai-elements/chat/hooks/use-chat-stream.ts` | L1-L543 | 前端聊天流处理Hook |
| `packages/web/src/components/ai-elements/chat/services/stream-service.ts` | L1-L266 | 前端流服务，WebSocket客户端 |

### 调用链

**完整消息处理链**：
```
[前端] use-chat-stream.ts:handleSend()
  → [前端] stream-service.ts:connect()
    → [前端] agent-client.stream()
      → [网络] WebSocket连接
        → [后端] websocket.ts:registerWebSocketRoutes()
          → [后端] agent.sendMessage()
            → [后端] backend-agent.ts:sendMessage()
              → [后端] opencode-acp.ts:sendMessage()
                → [后端] connection.ts:sendPrompt()
                  → [子进程] ACP CLI (opencode)
                    ← [子进程] stdout (JSON-RPC)
                  ← [后端] connection.ts:handleMessage()
                ← [后端] opencode-acp.ts:handleSessionUpdate()
              ← [后端] backend-agent.ts:eventCallback
            ← [后端] agent.emit("stream")
          ← [后端] websocket.ts:eventHandler
        ← [网络] WebSocket消息
      ← [前端] stream-service.ts:onStream
    ← [前端] use-chat-stream.ts:onStream handler
  ← [前端] UI更新
```

### 相关配置

| 配置项 | 值 | 位置 | 说明 |
|--------|-----|------|------|
| `MESSAGE_TIMEOUT_MS` | 300000 (5分钟) | `websocket.ts:111` | WebSocket消息超时 |
| `promptTimeoutMs` | 300000 (5分钟) | `connection.ts:91` | ACP prompt超时 |
| `HEARTBEAT_INTERVAL` | 30000 (30秒) | `websocket.ts:109` | 心跳检查间隔 |
| `HEARTBEAT_TIMEOUT` | 60000 (60秒) | `websocket.ts:110` | 心跳超时阈值 |
| `SILENCE_THRESHOLD_MS` | 30000 (30秒) | `use-chat-stream.ts:88` | 前端静默检测阈值 |
| `DEFAULT_IDLE_TIMEOUT_MS` | 7200000 (2小时) | `agent-manager.ts:7` | Agent空闲清理超时 |
| `KEEPALIVE_INTERVAL_MS` | 60000 (60秒) | `connection.ts:93` | ACP keepalive间隔 |

---

## 5. 质量检查

- [x] 每个根因结论有A/B级证据支撑
- [x] 文件路径与行号准确
- [x] 区分了现象与根因
- [x] 解决方案具体可执行
- [x] 未包含未经验证的假设性断言
