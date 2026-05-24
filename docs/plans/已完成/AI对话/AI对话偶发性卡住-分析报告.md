# AI对话偶发性卡住 — 问题分析报告（修正版）

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
| 超时后resolve错误结果并发送error消息 | A | `websocket.ts:450-493` | 超时后发送error消息，但sendPromise可能继续运行 |
| ACP连接promptTimeoutMs设为300秒 | A | `connection.ts:91` | `private promptTimeoutMs: number = 300000` |
| ACP请求超时后reject | A | `connection.ts:454-491` | `handlePromptTimeout` 中reject错误 |
| 前端静默检测阈值30秒 | A | `use-chat-stream.ts:88` | `const SILENCE_THRESHOLD_MS = 30000` |
| 前端在WebSocket失败时回退到HTTP非流式模式 | A | `use-chat-stream.ts:388-462` | catch块中尝试HTTP回退 |
| WebSocket心跳检测60秒超时 | A | `websocket.ts:110` | `const HEARTBEAT_TIMEOUT = 60000` |
| Agent Manager空闲2小时自动清理 | A | `agent-manager.ts:7` | `DEFAULT_IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000` |
| ACP子进程通过stdio通信 | A | `connection.ts:152-155` | `stdio: ["pipe", "pipe", "pipe"]` |
| 权限请求等待60秒后自动拒绝 | A | `websocket.ts:258-261` | `setTimeout(() => resolve({ optionId: "reject_once" }), 60000)` |
| 前端streamService在finish事件中关闭连接 | A | `stream-service.ts:226-237` | `this.stream.on("finish", ...)` 中调用 `this.close()` |
| 前端error处理依赖connectionEstablished状态 | A | `stream-service.ts:239-264` | 未建立连接时只调用onConnectionError |
| 超时后sendPromise可能继续运行 | A | `websocket.ts:470-473` | `Promise.race`只返回一个结果，另一个继续pending |
| 前端未处理onConnectionError回调 | A | `use-chat-stream.ts:204-382` | 只设置了onError，未设置onConnectionError |

### 根本原因

**根因一（P0）：超时后sendPromise继续运行，导致事件混乱**

在`websocket.ts:470-473`中：
```typescript
const result: AgentResult = await Promise.race([
  sendPromise,
  timeoutPromise,
]);
```

**问题**：`Promise.race`在timeoutPromise resolve后，会立即返回错误结果。但`sendPromise`（即`agent.sendMessage()`）**仍在后台继续运行**。这导致：
1. 超时后发送了error消息给客户端
2. 但sendPromise可能仍在接收ACP事件
3. 这些后续事件可能被发送到**已经关闭或复用的连接**上
4. 或者事件发送到新的连接，造成消息顺序混乱

**更深层问题**：`agent.cancel()`被调用后，`backend-agent.ts:80-84`中的`cancel()`方法只是调用可选的`cancelPrompt()`，并非所有后端都实现了这个方法。如果cancelPrompt不存在，AI实际上仍在运行。

**根因二（P1）：多层超时机制缺乏协同，导致"静默卡住"**

系统存在多个独立的超时机制：
1. **WebSocket层**：300秒消息超时（`MESSAGE_TIMEOUT_MS`）
2. **ACP连接层**：300秒prompt超时（`promptTimeoutMs`）
3. **前端静默检测**：30秒无事件即显示静默状态

**问题**：当AI处理时间超过30秒但少于300秒时，前端已检测到静默，但后端仍在正常处理。此时如果用户继续等待，可能在300秒时收到超时错误；如果用户刷新或重试，可能导致重复请求或状态不一致。

**更深层问题**：
- 前端`stream-service.ts`中的error处理（line 239-264）仅在`connectionEstablished`为true时才会触发`onError`回调
- 如果连接尚未建立或事件顺序异常，错误可能被静默吞掉
- `use-chat-stream.ts`中没有处理`onConnectionError`回调，导致连接错误无反馈

**根因三（P2）：WebSocket心跳机制在长时无活动时可能断开连接**

服务端心跳检测（`websocket.ts:113-122`）每30秒检查一次，60秒无客户端消息则断开。

**问题**：`lastPing`只在收到客户端消息时更新（`websocket.ts:283`）。如果AI处理时间超过60秒且期间没有任何输出（也没有工具调用等事件），客户端不会发送消息，服务端会在60秒后断开连接。

**注意**：这不是"误判"，而是**长时无活动时的正常断开**。但如果AI确实在处理中（如深度思考），这种断开就会中断正常流程。

**根因四（P3）：Agent Manager的idle清理与WebSocket连接生命周期不同步**

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

**卡住时的可能路径（根因一）**：
```
[用户发送消息]
  → ... → ACP子进程处理中
    → AI处理时间超过300秒
      → WebSocket层timeoutPromise触发
        → 发送error消息给客户端
        → 但sendPromise仍在运行
          → 后续stream事件继续产生
            → 事件发送到已关闭/复用的连接
              → 客户端收到混乱的消息顺序
                → 或消息丢失
```

**卡住时的可能路径（根因二）**：
```
[用户发送消息]
  → ... → ACP子进程处理中
    → AI处理时间超过30秒但少于300秒
      → 前端静默检测触发（30秒）
        → 用户看到"已静默X秒"提示
          → 用户焦虑，可能刷新或重试
            → 但后端仍在正常处理
              → 300秒后WebSocket超时
                → 发送error消息
                  → 但前端可能未正确处理（connectionEstablished问题）
```

---

## 3. 解决方案

### 方案一（P0）：修复超时后sendPromise继续运行的问题（最高优先级）

**描述**：
1. 在`websocket.ts`中，超时后不仅返回错误，还要确保sendPromise被正确取消：
   - 添加一个取消标记（cancellation token）机制
   - 超时后设置标记，sendPromise检查标记后提前退出
   - 或者使用`AbortController`来取消sendMessage
2. 在`backend-agent.ts`中，确保`cancel()`方法能真正中断sendMessage：
   - 如果后端不支持cancelPrompt，至少设置一个标志位阻止后续事件处理
   - 或者强制断开ACP连接来终止子进程
3. 在`stream-service.ts`中，连接断开时清理所有pending的事件监听器

**原理**：防止超时后sendPromise继续运行，避免事件混乱和消息丢失。

**影响范围**：
- `packages/agent-service/src/routes/websocket.ts`
- `packages/agent-service/src/core/backend-agent.ts`
- `packages/web/src/components/ai-elements/chat/services/stream-service.ts`

**风险**：
- 强制取消可能导致资源泄漏（如子进程未正确清理）
- 需要确保取消后Agent状态一致

**复杂度**：高

---

### 方案二（P1）：统一超时机制并增强错误传播

**描述**：
1. **统一超时配置**：
   - 将WebSocket层超时（300秒）与ACP层超时（300秒）统一为一个配置项
   - 前端静默检测阈值应小于后端超时（如前端25秒，后端300秒）
2. **增强错误传播**：
   - 在`websocket.ts`中，超时后不仅发送error消息，还发送status消息（ready）
   - 在`stream-service.ts`中，确保error事件始终触发`onError`回调，无论`connectionEstablished`状态
   - 在`use-chat-stream.ts`中，添加`onConnectionError`处理逻辑
3. **前端状态重置**：
   - 收到error时，自动重置UI状态（停止loading动画）
   - 显示明确的错误信息（"AI处理超时，请重试"）

**原理**：消除多层超时不一致导致的"静默卡住"，确保用户在任何超时场景下都能收到明确反馈。

**影响范围**：
- `packages/agent-service/src/routes/websocket.ts`
- `packages/agent-service/src/acp/connection.ts`
- `packages/web/src/components/ai-elements/chat/services/stream-service.ts`
- `packages/web/src/components/ai-elements/chat/hooks/use-chat-stream.ts`

**风险**：
- 修改超时逻辑可能影响正常长对话
- 需确保前端状态重置不会丢失已接收的内容

**复杂度**：中

---

### 方案三（P2）：增强WebSocket心跳机制

**描述**：
1. 前端在静默检测期间（超过10秒无事件），主动发送ping消息维持连接
2. 服务端在收到ping后立即更新`lastPing`，避免断开
3. **不推荐**将心跳超时延长到300秒，这会增加服务端资源占用

**原理**：防止因AI处理时间长（超过60秒）且期间无输出时，WebSocket被正常断开。

**影响范围**：
- `packages/agent-service/src/routes/websocket.ts`
- `packages/web/src/components/ai-elements/chat/services/stream-service.ts`

**风险**：
- 前端主动ping增加少量网络流量（可忽略）
- 需要定义ping消息格式

**复杂度**：低

---

### 方案四（P3）：同步Agent生命周期与WebSocket连接

**描述**：
1. WebSocket断开时，通知Agent Manager清理对应Agent（或标记为待清理）
2. 缩短idle超时时间（如从2小时缩短到5分钟）
3. 用户重连时，检查Agent状态，如果Agent仍在处理中，等待或提示用户

**原理**：避免WebSocket断开后Agent仍在后台运行，造成资源浪费和状态不一致。

**影响范围**：
- `packages/agent-service/src/routes/websocket.ts`
- `packages/agent-service/src/core/agent-manager.ts`

**风险**：
- 缩短idle时间可能导致正常等待时被清理
- 需要处理Agent状态迁移

**复杂度**：中

---

### 方案五（补充）：添加ACP子进程健康检查

**描述**：
1. 在`connection.ts`中，定期（如每30秒）检查子进程是否仍在运行
2. 如果子进程异常退出，立即通知前端并清理状态
3. 在`opencode-acp.ts`中，添加对连接状态的监控

**原理**：及时发现ACP子进程崩溃，避免前端长时间等待。

**影响范围**：
- `packages/agent-service/src/acp/connection.ts`
- `packages/agent-service/src/backends/opencode-acp.ts`

**风险**：
- 健康检查本身可能引入性能开销
- 误判可能导致不必要的重启

**复杂度**：中

---

### 后续建议

1. **添加详细日志**：
   - 在关键路径（sendMessage、handleSessionUpdate、事件转发）添加更多debug日志
   - 记录超时事件、取消事件、连接断开事件
   - 便于下次问题发生时定位

2. **监控指标**：
   - WebSocket连接持续时间
   - 消息处理时间分布
   - 超时事件发生频率
   - Agent复用率（重连时是否复用旧Agent）

3. **用户反馈机制**：
   - 在UI上显示更详细的状态信息（如"AI正在思考..."、"处理工具调用..."）
   - 静默检测时显示"AI已静默X秒，仍在处理中..."
   - 超时时显示明确的错误提示和重试按钮

4. **压力测试**：
   - 模拟AI长时间输出大量内容的场景
   - 模拟AI处理时间超过60秒的场景
   - 测试超时后的状态一致性

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
- [x] **修正说明**：根因二（原stdio缓冲区）已删除，改为sendPromise继续运行问题
- [x] **修正说明**：根因三（原心跳误判）已修正为长时无活动的正常断开
- [x] **修正说明**：添加了P0-P3优先级标记
- [x] **修正说明**：补充了onConnectionError未处理的问题

---

## 6. 修正记录

### 本次修正内容

1. **删除根因二（stdio缓冲区溢出）**：原分析缺乏证据，代码中`data`事件是流式处理，不存在缓冲区满导致阻塞的机制
2. **修正根因三（心跳机制）**：原描述"误判超时"不准确，实际为"长时无活动时正常断开"
3. **新增根因一（P0）**：超时后sendPromise继续运行，这是最关键的问题
4. **新增问题**：前端未处理onConnectionError回调
5. **调整方案优先级**：按P0-P3标记优先级，方案一（修复sendPromise）为最高优先级
6. **补充方案五**：添加ACP子进程健康检查作为补充方案

### 原报告问题

原报告将"stdio缓冲区溢出"列为根因，但：
- Node.js的`data`事件会在数据到达时立即触发
- 代码中每行JSON被立即解析和处理
- 没有证据表明出现过缓冲区溢出问题

原报告将"心跳误判"描述为根因，但：
- 60秒无活动断开是正常行为
- 问题在于AI处理时间可能超过60秒且期间无输出
- 不是"误判"，而是"长时无活动的正常断开"
