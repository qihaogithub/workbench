# AI对话区卡顿问题分析报告

> 文档位置：`docs/plans/进行中/AI对话区卡顿问题分析.md`
> 分析时间：2026-05-04
> 状态：进行中

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
- **前端**: `AIChat` 组件 (`packages/web/src/components/ai-elements/ai-chat.tsx`)
- **后端**: `agent-service` WebSocket路由、ACP连接管理、BackendAgent
- **通信协议**: WebSocket + ACP (Agent Client Protocol)

---

## 2. 根因分析

### 2.1 核心问题：多层超时机制不一致 + 缺乏进度保活

#### 证据1：前端超时时间过短（120秒）
**文件**: `packages/web/src/components/ai-elements/ai-chat.tsx` L1008

```typescript
stream.send(userMessage, `msg-${Date.now()}`, {
  timeout: 120000,  // 120秒
  stream: true,
  workingDir,
});
```

**分析**: 前端发送消息时设置了120秒超时，但ACP后端默认超时是**300秒**（5分钟）。

#### 证据2：后端ACP连接超时更长（300秒）
**文件**: `packages/agent-service/src/acp/connection.ts` L90

```typescript
private promptTimeoutMs: number = 300000; // 300秒 = 5分钟
```

**分析**: 当AI执行复杂任务（如多文件修改、长时间思考）时，120秒可能不够，但前端不会收到超时错误——因为WebSocket连接本身没有断，只是`sendMessage`的Promise一直等待。

#### 证据3：WebSocket心跳机制存在但前端无感知
**文件**: `packages/agent-service/src/routes/websocket.ts` L107-L108

```typescript
const HEARTBEAT_INTERVAL = 30000;  // 30秒
const HEARTBEAT_TIMEOUT = 60000;   // 60秒
```

**分析**: 后端有WebSocket心跳检测，但心跳只检测**连接是否存活**，不检测**业务是否仍在处理**。即使AI卡死，只要TCP连接没断，心跳就正常。

#### 证据4：Agent忙状态检测但无队列机制
**文件**: `packages/agent-service/src/core/agent-manager.ts` L99-L106

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

**分析**: 当Agent正在处理消息时，新消息会被拒绝。但前端没有处理这种`retryable`错误的重试逻辑。

#### 证据5：工具调用状态更新依赖ACP协议通知
**文件**: `packages/agent-service/src/backends/opencode-acp.ts` L215-L300

```typescript
// sendMessage中调用sendPrompt，等待ACP协议返回
await this.connection.sendPrompt(content, {
  onSessionUpdate: (update: AcpSessionUpdate) => {
    this.handleSessionUpdate(update);  // 这里转发stream/thought/tool_call事件
  },
  // ...
});
```

**分析**: 如果ACP子进程（opencode CLI）在某个工具调用上卡住（例如等待用户确认、网络请求超时），不会发送任何`session/update`通知，前端就永远收不到状态更新。

#### 证据6：权限请求有60秒超时，但其他操作无超时
**文件**: `packages/agent-service/src/routes/websocket.ts` L232-L260

```typescript
// 权限请求有60秒超时
setTimeout(() => {
  socket.off("message", handlePermissionResponse);
  resolve({ optionId: "reject_once" });
}, 60000);
```

**对比**: 权限请求有明确的60秒超时保护，但**普通的消息处理没有类似的超时保护**。

### 2.2 问题触发场景

综合以上证据，卡顿问题的触发路径如下：

```
用户发送消息
    ↓
前端建立WebSocket连接（3秒超时）
    ↓
前端发送消息（120秒超时设置，但仅影响send()调用）
    ↓
后端AgentManager.getOrCreate()获取Agent
    ↓
BackendAgent.sendMessage()设置busy=true
    ↓
OpenCodeAcpBackend.sendMessage() → AcpConnection.sendPrompt()
    ↓
启动opencode CLI子进程，通过stdio发送JSON-RPC
    ↓
【卡点1】opencode CLI初始化/连接耗时（无进度通知）
    ↓
【卡点2】AI思考过程（可能持续数分钟，只有thought_chunk流）
    ↓
【卡点3】工具调用执行（如文件读写、命令执行）
    ↓
    ├─ 工具正常完成 → 发送tool_call_update → 前端状态更新
    ├─ 工具需要权限 → 发送permission_request → 等待用户响应（60秒超时）
    └─ 工具卡住/死锁 → 无任何通知 → 前端永远显示"running"
    ↓
【卡点4】ACP协议层无响应（子进程崩溃/网络问题）
    ↓
AcpConnection.sendPrompt()的Promise一直pending
    ↓
BackendAgent.sendMessage()一直等待
    ↓
WebSocket路由中await agent.sendMessage()一直等待
    ↓
不发送finish/error消息 → 前端isStreaming永远为true
```

### 2.3 根本原因总结

| 根因 | 证据 | 影响 |
|------|------|------|
| **前端超时与后端超时不一致** | 前端120s vs 后端300s | 前端以为超时，但实际还在处理；或前端没超时但用户已等待很久 |
| **缺乏业务级进度保活机制** | 只有TCP心跳，无业务心跳 | 无法区分"连接正常但业务卡死" vs "正常处理中" |
| **工具调用无超时保护** | 仅权限请求有60s超时 | 工具死锁时前端永远显示running |
| **前端无重试机制** | agent-manager返回retryable错误但前端未处理 | 偶发失败无法自动恢复 |
| **ACP子进程异常无感知** | 子进程崩溃时handleProcessExit会reject，但可能未被正确捕获 | Promise永远pending |

---

## 3. 解决方案

### 方案A：增加前端业务级超时与进度检测（推荐）

**实现方式**：
1. 在`AIChat`组件中增加一个**业务进度定时器**：
   - 如果超过一定时间（如30秒）没有收到任何stream/thought/tool_call事件
   - 显示"AI处理时间较长，请稍候..."的友好提示
   - 如果超过最大等待时间（如5分钟），主动断开并提示用户

2. **统一前后端超时时间**：
   - 将前端`timeout: 120000`改为与后端一致的300000，或后端改为120000

**优点**: 用户体验改善明显，实现相对简单
**缺点**: 只是缓解症状，未解决根本的卡死问题

### 方案B：后端增加消息处理超时保护

**实现方式**：
1. 在`WebSocket路由`的`message`处理中增加超时：
   ```typescript
   const MESSAGE_TIMEOUT = 300000; // 5分钟
   const timeoutPromise = new Promise((_, reject) => {
     setTimeout(() => reject(new Error('Message processing timeout')), MESSAGE_TIMEOUT);
   });
   const result = await Promise.race([agent.sendMessage(...), timeoutPromise]);
   ```

2. 在`BackendAgent`或`AcpConnection`层增加**子进程健康检查**：
   - 定期检测子进程是否还在响应
   - 如果子进程无响应，主动kill并重建

**优点**: 从服务端解决卡死问题，更彻底
**缺点**: 实现复杂度较高，需要谨慎处理状态恢复

### 方案C：增加工具调用级超时

**实现方式**：
1. 在`AcpConnection`的`handleSessionUpdate`中，为每个`tool_call`启动一个定时器
2. 如果工具在指定时间内（如60秒）没有返回`tool_call_update`，自动标记为error并继续

**优点**: 精准解决工具死锁问题
**缺点**: 某些合法的长耗时工具可能被误判

### 方案D：前端增加重试机制

**实现方式**：
1. 当收到`AGENT_NOT_INITIALIZED`或类似可重试错误时，自动重试1-2次
2. 当WebSocket连接失败时，自动降级到HTTP非流式模式（已有部分实现）

**优点**: 提高系统容错性
**缺点**: 重试可能加剧问题（如重复执行工具）

---

## 4. 相关代码路径

### 4.1 前端核心文件

| 文件 | 行号 | 说明 |
|------|------|------|
| `packages/web/src/components/ai-elements/ai-chat.tsx` | L368-L966 | 流事件处理（stream/thought/tool_call/finish/error） |
| `packages/web/src/components/ai-elements/ai-chat.tsx` | L977-L1000 | WebSocket连接超时（3秒） |
| `packages/web/src/components/ai-elements/ai-chat.tsx` | L1008 | 消息发送超时设置（120秒） |
| `packages/web/src/components/ai-elements/assistant-message.tsx` | L1-L303 | 消息渲染（含工具状态显示） |
| `packages/web/src/components/ai-elements/reasoning.tsx` | L1-L188 | 思考过程组件 |

### 4.2 后端核心文件

| 文件 | 行号 | 说明 |
|------|------|------|
| `packages/agent-service/src/routes/websocket.ts` | L101-L726 | WebSocket路由，消息处理主逻辑 |
| `packages/agent-service/src/routes/websocket.ts` | L107-L108 | 心跳配置（30秒间隔，60秒超时） |
| `packages/agent-service/src/routes/websocket.ts` | L232-L260 | 权限请求超时（60秒） |
| `packages/agent-service/src/core/agent-manager.ts` | L99-L106 | Agent忙状态检测 |
| `packages/agent-service/src/core/backend-agent.ts` | L40-L66 | sendMessage实现，busy状态管理 |
| `packages/agent-service/src/acp/connection.ts` | L90 | ACP提示超时（300秒） |
| `packages/agent-service/src/acp/connection.ts` | L438-L447 | 请求超时设置逻辑 |
| `packages/agent-service/src/backends/opencode-acp.ts` | L215-L230 | sendMessage调用sendPrompt |

### 4.3 调用链

```
用户输入
  → AIChat.handleSubmit() [ai-chat.tsx]
    → AIChat.handleSend() [ai-chat.tsx]
      → AgentClient.stream() [agent-client]
        → WebSocket /api/agent/:sessionId/stream [websocket.ts]
          → AgentManager.sendMessage() [agent-manager.ts]
            → BackendAgent.sendMessage() [backend-agent.ts]
              → OpenCodeAcpBackend.sendMessage() [opencode-acp.ts]
                → AcpConnection.sendPrompt() [connection.ts]
                  → opencode CLI子进程 (stdio JSON-RPC)
```

---

## 5. 建议的优先修复顺序

1. **高优先级**：统一前后端超时时间（前端120s → 300s，或后端300s → 120s）
2. **高优先级**：在`WebSocket路由`的消息处理中增加整体超时保护（如5分钟）
3. **中优先级**：前端增加"长时间无响应"的友好提示（基于最后收到消息的时间）
4. **中优先级**：增加工具调用级超时（如60秒无更新则标记为error）
5. **低优先级**：增加子进程健康检查与自动重建机制
