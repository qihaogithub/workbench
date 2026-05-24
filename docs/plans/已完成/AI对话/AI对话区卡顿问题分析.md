# AI对话区卡顿问题分析报告

> 文档位置：`docs/plans/进行中/AI对话区卡顿问题分析.md`
> 分析时间：2026-05-04
> 校正时间：2026-05-04（基于源码 Phase 1 验证）
> 状态：进行中

---

## 0. 校正说明（基于源码核对）

原始分析报告存在多处与现行代码不符的地方，已逐项核对并修正：

| 原始论断 | 真实情况 | 影响 |
|---------|---------|------|
| 前端 `timeout: 120000` 限制了消息超时 | **完全无效（no-op）**：`AgentStream.send()` 仅把 `options` 序列化到 JSON payload，不读取 `timeout`；后端 `websocket.ts` 收到后亦未消费此字段 | 前端"120秒超时"是错觉，前端 Promise 不会因此 reject |
| 后端 ACP 超时固定为 300 秒 | 后端有 **silence-based 超时** + **keepalive 自重置** 机制：每个 `SESSION_UPDATE` 重置计时器；每 60 秒 keepalive 也会重置（限定在原始 5 分钟窗口内） | 卡死（无任何 session_update）场景下，超时实际在 **原始时间 + 5 分钟** 之间触发，最坏 ~9-10 分钟 |
| 文件路径 `ai-chat.tsx` L1008 / L368-L966 | 该文件已被重构，代码拆分到 `chat/services/stream-service.ts`、`chat/hooks/use-chat-stream.ts`、`chat/chat-messages.tsx` 等 | 原文件路径已失效 |
| `BackendAgent.cancel()` 能停止处理 | **仅翻转 `busy` 标志**，不会中断进行中的 ACP `sendPrompt` Promise | 用户点击"取消"无法真正取消正在执行的 LLM 请求 |
| 仅前端 `stream.send` 有 120 秒超时 | HTTP fallback（`use-chat-stream.ts` L349）也设置了 `timeout: 120000`，同样是无效的（取决于 `agentClient.sendMessage` 是否消费） | 失败模式相同 |

详见下方 §2 重写的根因分析。

---

## 1. 问题背景

### 1.1 问题描述
在Web前端的AI对话区域，AI在执行任务过程中会**长时间停留在某个步骤无响应**，具体表现为：
- 思考过程（"思考中..."）持续显示，但长时间没有新内容输出
- 工具调用状态停留在"running"不更新
- 整体对话流程卡住，用户无法判断AI是仍在处理还是已经死锁

### 1.2 预期行为 vs 实际行为
| 维度 | 预期行为 | 实际行为 |
|------|---------|---------|
| **响应时间** | AI应在合理时间内完成思考并输出结果或执行工具 | 某些步骤耗时极长（数分钟甚至更久），无进度反馈 |
| **状态更新** | 工具调用状态应实时更新（running → completed/error） | 状态停留在"running"长时间不变 |
| **错误处理** | 超时或出错时应明确提示用户 | 可能无错误提示，界面持续显示"处理中..." |

### 1.3 涉及组件
- **前端 AI 对话**：`AIChat` 组件 + chat hooks（`use-chat-stream.ts`、`use-chat-messages.ts`、`use-chat-models.ts`）+ `StreamService`
- **后端 agent-service**：WebSocket 路由、`AgentManager`、`BackendAgent`、`AcpConnection`、各 backend 适配器（`opencode-acp.ts` 等）
- **通信协议**：WebSocket 自定义 JSON 帧 + ACP（Agent Client Protocol）JSON-RPC over stdio

---

## 2. 根因分析（已校正）

### 2.1 核心问题：业务层"卡死无感知" + 无中间反馈机制

四层链路上每一层都缺少能感知"业务卡死"的机制，导致 ACP 子进程无 session_update 时，前端用户感知为完全卡住。

#### 证据 1：前端 `timeout` 字段是 NO-OP（最关键的发现）

**真实路径**：`packages/web/src/components/ai-elements/chat/services/stream-service.ts` L111-L120

```typescript
sendMessage(message: string, workingDir?: string): void {
  if (!this.stream) {
    throw new Error("Stream not connected");
  }
  this.stream.send(message, `msg-${Date.now()}`, {
    timeout: 120000,    // ← 此字段被透传到 agent-client，最终被丢弃
    stream: true,
    workingDir,
  });
}
```

`AgentStream.send()`（`packages/agent-client/src/client.ts` L306-L324）的真实行为：

```typescript
send(content: string, id?: string, options?: SendMessageOptions): void {
  if (!this.ws || this.ws.readyState !== WebSocket.OPEN) { /* ... */ return; }
  this.ws.send(JSON.stringify({
    type: "message",
    id: id || `msg-${Date.now()}`,
    content,
    workingDir: options?.workingDir,
    options,                    // ← 整个 options 对象被序列化进 JSON
  }));
}
// 没有任何 setTimeout(timeout, ...) 调用！
```

后端 `websocket.ts` L297-L497 也没有消费 `message.options.timeout`（仅消费 `resumeSessionId`）。**结论：前端 120 秒超时配置是完全无效的视觉装饰。**

HTTP fallback 路径（`chat/hooks/use-chat-stream.ts` L343-L353）也设置了同样无效的 `timeout: 120000`，行为取决于 `agentClient.sendMessage` 内部是否实现 fetch timeout（待进一步验证；不影响主路径分析）。

#### 证据 2：后端 ACP 超时是 silence-based + 自维持 keepalive

**文件**：`packages/agent-service/src/acp/connection.ts`

关键参数（L90-L92）：
```typescript
private promptTimeoutMs: number = 300000;          // 默认 5 分钟
private static readonly KEEPALIVE_INTERVAL_MS = 60000;  // keepalive 60 秒
```

机制：
- **每收到一条 `SESSION_UPDATE`（L265）都会调用 `resetSessionPromptTimeouts()`** —— 把 `startTime` 重置为当下，重新启动 5 分钟计时器
- **每 60 秒 keepalive 触发（L548-L562）**：
  - 检查 `now - r.promptOriginTime < r.timeoutDuration`，即"自原始发起以来还在 5 分钟内"
  - 若是，则调用 `resetSessionPromptTimeouts()` 重置计时器
- **权限请求暂停/恢复（L323-L351）** 会重置 `promptOriginTime`，相当于"会话事件让原始时间窗口重新开始"

实际行为（关键修正）：
- **AI 在持续输出思考/工具调用**：每条 session_update 重置计时器 → 计时器永不触发 → 无超时
- **AI 完全卡死（无任何 session_update）**：
  - 0~5 分钟（自原始发起）：keepalive 每 60 秒重置一次计时器
  - 5 分钟后：keepalive 不再重置
  - 计时器从最后一次重置（约 t=240 秒）开始计 300 秒 → **约 t=540 秒（9 分钟）触发超时**
- 触发后 `handlePromptTimeout` 会发送 ACP `cancelPrompt`，并 reject 上层 Promise → 错误冒泡到 WebSocket → 前端收到 `error` 事件

**所以原报告"Promise 永远 pending"不准确，但用户实际上看到的是"无反馈卡 5~10 分钟"，UX 上接近"永远卡住"。**

#### 证据 3：WebSocket 层只有 TCP 心跳，无业务心跳

**文件**：`packages/agent-service/src/routes/websocket.ts` L107-L108

```typescript
const HEARTBEAT_INTERVAL = 30000;
const HEARTBEAT_TIMEOUT = 60000;
```

`heartbeat()`（L110-L119）仅在 60 秒未收到客户端 ping 时 terminate 连接。这只能检测 **TCP 连接是否存活**，不能检测 **业务是否在处理**。AI 卡死时 WebSocket 仍正常，前端继续等待。

#### 证据 4：WebSocket 路由对 `agent.sendMessage` 无外层超时

**文件**：`packages/agent-service/src/routes/websocket.ts` L436-L457

```typescript
agent.on("stream", eventHandler);
// ... 注册其他 7 个事件
const result: AgentResult = await agent.sendMessage(message.content, message.options);
agent.off("stream", eventHandler);
// ...
```

整个 `await agent.sendMessage` 没有任何 timeout 或 race，完全依赖底层 `AcpConnection` 的 silence-based 超时。前端无任何业务级超时（见证据 1），后端这一层也无 → 唯一兜底是底层 5 分钟 silence + 60 秒 keepalive 链路。

#### 证据 5：`BackendAgent.cancel()` 仅翻转标志位

**文件**：`packages/agent-service/src/core/backend-agent.ts` L79-L81

```typescript
cancel(): void {
  this.busy = false;
}
```

它**不会**：
- 调用 `connection.cancelPrompt()` 真正中断 ACP 请求
- 调用 `pendingRequests` 上的 `request.reject(...)`
- 触发 `setStatus('ready')`

所以前端"取消"按钮不会真正中断正在执行的 LLM 调用，子进程会继续工作直到自己结束或上述 silence 超时触发。

#### 证据 6：Agent 忙状态返回 retryable 错误，但前端无重试

**文件**：`packages/agent-service/src/core/agent-manager.ts` L99-L106（无变化）

```typescript
if (agent instanceof BackendAgent && agent.isBusy()) {
  return {
    success: false,
    error: {
      code: 'AGENT_NOT_INITIALIZED',
      message: 'Agent is currently processing a previous message',
      retryable: true,
    },
  };
}
```

前端 `use-chat-stream.ts` 的 `onError` 仅根据 `code` 判断是否是 model 相关错误，对 `retryable` 字段无任何处理。

#### 证据 7：工具调用无独立超时

无任何代码对单个 `tool_call` 设置独立计时器。tool_call 卡死只能依赖整体 ACP silence 超时（5~10 分钟），且期间前端只能持续显示 "running"。

### 2.2 卡顿触发路径（已校正）

```
用户发送消息
    ↓
前端 stream.send(content, id, { timeout: 120000, ... })   ← timeout 字段被吞掉
    ↓
WebSocket → websocket.ts handleMessage("message")
    ↓
agent = manager.getOrCreate(sessionId, config)            ← 若 busy 则 retryable 错误（前端不重试）
    ↓
注册 8 个事件监听 → await agent.sendMessage(...)         ← 无外层 timeout
    ↓
BackendAgent.sendMessage → busy=true → backend.sendMessage
    ↓
OpenCodeAcpBackend.sendMessage → connection.sendPrompt
    ↓
连接层启动 5 分钟计时器 + 60 秒 keepalive
    ↓
向 ACP 子进程 stdin 写 JSON-RPC
    ↓
【正常路径】子进程持续返回 session_update
   → 每条 update 重置计时器
   → 前端持续看到 stream/thought/tool_call 事件
   → 最终 finish

【卡死路径】子进程不再返回 session_update（hung、死锁、等待外部资源）
   → 前 5 分钟：keepalive 自我重置计时器（无意义保活）
   → 5 分钟后：keepalive 停止重置
   → 9-10 分钟时计时器触发 → handlePromptTimeout
   → 期间前端：UI 显示"思考中..."或"running"，无任何反馈
   → 用户体验等同永久卡住
```

### 2.3 根本原因总结（已校正）

| 根因 | 证据 | 影响 |
|------|------|------|
| **前端 `timeout` 配置完全是装饰，未实际生效** | `AgentStream.send()` 不读取 `timeout` 字段；后端也不消费 | 给用户和后续维护者造成"前端有超时"的错觉 |
| **WebSocket 路由无业务级超时兜底** | `await agent.sendMessage` 无外层 race | 完全依赖底层 ACP silence 超时 |
| **底层 silence 超时 + keepalive 联合行为不直观** | keepalive 每 60s 重置；session_update 每条都重置 | 卡死场景需要约 9-10 分钟才能感知超时 |
| **无 frontend ↔ backend 的"业务进度"反馈通道** | TCP 心跳只验证连接存活 | 前端无法显示"等待中"vs"处理中"vs"卡死" |
| **`BackendAgent.cancel()` 不真正取消** | 仅 `busy = false` | "取消"按钮形同虚设 |
| **无单工具调用超时** | tool_call → tool_call_update 中间无独立 timer | 工具卡住只能等总超时 |
| **Agent busy 返回 retryable 但前端不处理** | 前端 onError 仅特例化 model 错误 | 偶发并发冲突不会自动恢复 |

---

## 3. 解决方案

### 方案 A：在 WebSocket 路由层增加整体消息超时（最高优先级）

由于前端 `timeout` 是 no-op、底层 silence 超时实际生效但延迟太长，最务实的修复点是在 `websocket.ts` 的 `case "message"` 分支为 `await agent.sendMessage` 增加 race。

**实现要点**：
- 引入常量 `MESSAGE_TIMEOUT_MS = 600000`（10 分钟，覆盖正常 LLM 长任务且接近底层 silence 上限）
- 用 `Promise.race([agent.sendMessage(...), timeoutPromise])` 包裹
- 超时时 `agent.cancel()` + 发送 `error` + `status: ready`
- **同步修复 `BackendAgent.cancel()`**，使其真正调用 `connection.cancelPrompt()` 并 reject 当前 pending request

**优点**：单点修复就能给所有卡死场景兜底，且能与底层 silence 超时叠加保护
**缺点**：仍然要等待最长 10 分钟

### 方案 B：前端"长时间无 session_update"友好提示（高优先级）

在 `use-chat-stream.ts` 中维护"最后收到任何 stream 事件的时间戳"，超过阈值（如 30 秒）后在 UI 上显示"AI 仍在处理，已 X 秒无新输出..."。

**优点**：用户随时知道现在卡了多久
**缺点**：仅缓解 UX，不解决卡死本身

### 方案 C：工具调用级超时（中优先级）

在 `AcpConnection.handleSessionUpdate` 中：tool_call 出现时启动定时器，到期未收到 tool_call_update 就发送 tool_call_update 事件标记为 `failed`，并继续推进流。

**风险**：合法长耗时工具（大文件搜索、build）会被误杀。需要可配置阈值，或排除已知长耗时工具。

### 方案 D：子进程健康探活（低优先级）

定期向 ACP 子进程发送轻量级方法（如 `ping`）；超过 N 次无响应则 `kill + restart`。

**风险**：实现复杂，状态恢复（pending requests、session ID）需要严密设计。

### 方案 E：让"取消"按钮真的能取消（独立修复，建议同步执行）

修复 `BackendAgent.cancel()`：
```typescript
cancel(): void {
  this.busy = false;
  if ('cancelPrompt' in this.backend && typeof this.backend.cancelPrompt === 'function') {
    (this.backend as any).cancelPrompt();
  }
  this.setStatus('ready');
}
```
配套在 `OpenCodeAcpBackend` 上暴露 `cancelPrompt()` → 调用 `connection.cancelPrompt()`。

---

## 4. 相关代码路径（已校正）

### 4.1 前端核心文件

| 文件 | 行号 | 说明 |
|------|------|------|
| `packages/web/src/components/ai-elements/ai-chat.tsx` | L1-L188 | 顶层组合（已重构，仅组合 hooks） |
| `packages/web/src/components/ai-elements/chat/hooks/use-chat-stream.ts` | L109-L412 | `handleSend`、handlers 注册、HTTP fallback |
| `packages/web/src/components/ai-elements/chat/hooks/use-chat-stream.ts` | L349 | HTTP fallback `timeout: 120000`（验证是否生效待办） |
| `packages/web/src/components/ai-elements/chat/services/stream-service.ts` | L84-L120 | `waitForConnection` 3s + `sendMessage` 中无效的 120000 timeout |
| `packages/web/src/components/ai-elements/chat/services/stream-service.ts` | L162-L266 | 各事件订阅 + 错误分类（modelError 特例） |
| `packages/agent-client/src/client.ts` | L306-L324 | **`AgentStream.send()` 实际不读 `options.timeout`** |
| `packages/agent-client/src/types.ts` | — | `SendMessageOptions.timeout?: number` 仅是类型声明 |

### 4.2 后端核心文件

| 文件 | 行号 | 说明 |
|------|------|------|
| `packages/agent-service/src/routes/websocket.ts` | L107-L119 | TCP 心跳 30s/60s |
| `packages/agent-service/src/routes/websocket.ts` | L255-L258 | 权限请求 60s reject_once |
| `packages/agent-service/src/routes/websocket.ts` | L436-L457 | **`await agent.sendMessage` 无外层超时** ← 最佳修复点 |
| `packages/agent-service/src/core/backend-agent.ts` | L39-L77 | `sendMessage` 仅设 busy，无 timeout |
| `packages/agent-service/src/core/backend-agent.ts` | L79-L81 | **`cancel()` 仅翻转标志位，不真正取消** |
| `packages/agent-service/src/core/agent-manager.ts` | L99-L108 | busy 守卫返回 retryable 错误 |
| `packages/agent-service/src/acp/connection.ts` | L90-L92 | `promptTimeoutMs=300000` + `KEEPALIVE_INTERVAL_MS=60000` |
| `packages/agent-service/src/acp/connection.ts` | L262-L321 | `handleNotification`：每条 `SESSION_UPDATE` reset 计时器 |
| `packages/agent-service/src/acp/connection.ts` | L323-L351 | 权限请求 pause/resume，pause 时 `promptOriginTime` 被重置 |
| `packages/agent-service/src/acp/connection.ts` | L465-L480 | `handlePromptTimeout` reject + cancelPrompt |
| `packages/agent-service/src/acp/connection.ts` | L548-L562 | keepalive 在原始 5 分钟内每 60s 重置计时器 |

### 4.3 调用链（精确）

```
用户输入
  → ChatInput.onSubmit
  → use-chat-stream.handleSend
  → new StreamService() → connect(agentSessionId, sessionId)
  → AgentClient.stream() → 建立 WebSocket
  → StreamService.sendMessage → AgentStream.send (timeout 字段被丢弃)
  → WebSocket /api/agent/:sessionId/stream  (websocket.ts)
    → AgentManager.getOrCreate(busy 检查)
    → agent.sendMessage(content, options)              ← 无 timeout
      → BackendAgent.sendMessage (busy=true)            ← 无 timeout
        → OpenCodeAcpBackend.sendMessage
          → AcpConnection.sendPrompt                    ← silence 超时（300s 默认 + keepalive）
            → child stdin write JSON-RPC
              → opencode CLI 子进程
```

---

## 5. 建议的优先修复顺序（已校正）

1. **【高】WebSocket 路由层加整体消息超时**（方案 A）—— 单点兜底，规避 silence 链路 9-10 分钟延迟
2. **【高】修复 `BackendAgent.cancel()` 真正取消 ACP 请求**（方案 E）—— 让取消按钮可用，且为方案 A 提供清理路径
3. **【中】前端"长时间无 session_update"友好提示**（方案 B）—— UX 速效药
4. **【中】工具调用级超时**（方案 C）—— 精准解决工具死锁，但需谨慎设置阈值/白名单
5. **【低】子进程健康探活与自动重启**（方案 D）—— 长远建设，复杂度最高
6. **【清理项，独立】移除前端 `timeout: 120000` 字段或在 agent-client 中真正实现 timeout** —— 避免误导未来维护者

---

## 6. Phase 1 验证记录

以下论断均已通过源码核对（grep + 全文阅读）确认：

- ✅ `AgentStream.send()` 不调用 `setTimeout`，`options.timeout` 仅被序列化进 JSON payload
- ✅ `agent-service/src` 中只有 `websocket.ts` 两处引用 `message.options`：L447（透传给 `agent.sendMessage`，但 `BackendAgent.sendMessage` 仅读取 `options.stream`，不读取 `options.timeout`）和 L501（`resumeSessionId`）
- ✅ `BackendAgent.cancel()` 实现仅一行 `this.busy = false;`
- ✅ `AcpConnection`：每条 `SESSION_UPDATE`（L265）调用 `resetSessionPromptTimeouts()`；keepalive interval 60s（L92, L548-L562）
- ✅ `resetSessionPromptTimeouts` 不重置 `promptOriginTime`；keepalive 检查 `now - promptOriginTime < timeoutDuration`，超出后停止保活
- ✅ `ai-chat.tsx` 已重构为单纯组合层，超时逻辑分布在 `chat/services/stream-service.ts` 和 `chat/hooks/use-chat-stream.ts`
