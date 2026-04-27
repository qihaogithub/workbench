# AI 回复"抱歉，我没有收到有效的回复"问题分析报告

## 一、问题概述

**现象**：用户在 AI 对话界面发送消息后，AI 回复"抱歉，我没有收到有效的回复。"

**错误消息定位**：该提示在 `packages/web/src/components/ai-elements/ai-chat.tsx` 中作为兜底文案出现，当 AI 返回的内容为空时显示。

---

## 二、代码链路分析

### 2.1 前端处理流程

```
用户输入
  ↓
ai-chat.tsx handleSend()
  ↓
创建 WebSocket 流 (agentClient.stream(sessionId))
  ↓
监听 stream/thought/tool_call/finish 事件
  ↓
finish 事件处理：accumulatedContent || event.content || "抱歉，我没有收到有效的回复。"
```

**关键代码位置**：
- [ai-chat.tsx:607-630](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/web/src/components/ai-elements/ai-chat.tsx#L607-L630)

```typescript
stream.on("finish", async (event: StreamEvent) => {
  const assistantMessage: ChatMessage = {
    id: `assistant-${Date.now()}`,
    role: "assistant",
    content:
      accumulatedContent ||
      event.content ||
      "抱歉，我没有收到有效的回复。",  // <-- 兜底文案
    parts: currentMsg.parts,
  };
  // ...
});
```

触发条件：`accumulatedContent`（流式累积内容）为空，且 `event.content`（finish 事件携带内容）也为空。

### 2.2 后端处理流程

```
WebSocket 收到 message
  ↓
websocket.ts: 创建/获取 Agent
  ↓
agent.sendMessage(content)
  ↓
backend-agent.ts: backend.sendMessage()
  ↓
base-acp.ts: connection.sendPrompt()
  ↓
acp/connection.ts: 发送 session/prompt JSON-RPC 请求
  ↓
等待 ACP CLI 返回结果
  ↓
结果返回给前端（通过 finish 事件）
```

**关键代码位置**：
- [websocket.ts:445-477](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/agent-service/src/routes/websocket.ts#L445-L477)
- [backend-agent.ts:54-64](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/agent-service/src/core/backend-agent.ts#L54-L64)
- [base-acp.ts:160-175](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/agent-service/src/backends/base-acp.ts#L160-L175)

### 2.3 ACP 协议通信流程

```
agent-service (ACP Client)          Agent CLI (ACP Server)
        │                                    │
        ├─ initialize ──────────────────────►│
        │◄──────────────────────── result ───┤
        ├─ session/new ─────────────────────►│
        │◄──────────────────────── result ───┤
        ├─ session/prompt ──────────────────►│
        │◄──── session/update (stream) ──────┤  (多次)
        │◄──────────────────────── result ───┤  (最终响应)
```

**关键代码位置**：
- [connection.ts:684-725](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/agent-service/src/acp/connection.ts#L684-L725)

---

## 三、可能原因分析

### 原因 1：ACP CLI 进程异常退出

**分析**：
- 如果 ACP CLI 子进程在发送 `session/prompt` 后异常退出，`sendRequest` 会被拒绝
- `connection.ts:209-235` 中 `handleProcessExit` 会拒绝所有 pending 请求
- 但异常会被 `base-acp.ts:171` 捕获并抛出，不会返回空内容

**可能性**：低（会抛出异常而非返回空）

### 原因 2：ACP CLI 返回了空结果

**分析**：
- `connection.ts:714-720` 中 `sendPrompt` 返回 `AcpPromptResult`
- 如果 CLI 返回的 `result` 对象存在但 `content` 字段为空
- `base-acp.ts:170` 会将空字符串赋值给 `fullContent`
- `backend-agent.ts:62` 将空内容返回给前端

**可能性**：高

**触发场景**：
1. AI 模型确实没有生成任何回复内容
2. ACP CLI 解析模型响应时出错，返回了空结果
3. 模型响应被过滤或拦截

### 原因 3：流式事件未正确累积

**分析**：
- `base-acp.ts:177-238` 中 `handleSessionUpdate` 处理 `agent_message_chunk`
- 只有当 `updateData.content?.type === "text" && updateData.content.text` 时才累积内容
- 如果 ACP CLI 发送的 `session/update` 通知格式不符合预期，内容不会被累积

**关键代码**：
```typescript
case "agent_message_chunk":
  if (updateData.content?.type === "text" && updateData.content.text) {
    this.fullContent += updateData.content.text;
    // ...
  }
  break;
```

**可能性**：中

### 原因 4：WebSocket finish 事件未携带内容

**分析**：
- `websocket.ts:459-466` 中，当 `result.success` 为 true 时发送 finish 事件
- finish 事件只携带 `files` 和 `metadata`，**不携带 `content`**
- 前端依赖 `accumulatedContent`（流式累积）或 `event.content`（finish 事件）

**关键代码**：
```typescript
if (result.success) {
  sendMessage({
    type: "finish",
    id: message.id,
    sessionId,
    files: result.files,
    metadata: result.metadata,
    // 注意：这里没有 content 字段
  });
}
```

**可能性**：高

**问题定位**：
- 如果流式过程中没有收到任何 `agent_message_chunk`（`accumulatedContent` 为空）
- 且 finish 事件也没有携带 `content`（`event.content` 为空）
- 就会触发兜底文案

### 原因 5：Agent 服务与 ACP CLI 通信超时

**分析**：
- `connection.ts:90` 默认 prompt 超时时间为 300 秒（5 分钟）
- `connection.ts:429-434` 设置超时定时器
- 如果超时，`handlePromptTimeout` 会取消请求并抛出错误

**可能性**：低（会抛出超时异常）

### 原因 6：权限请求阻塞

**分析**：
- 如果 AI 执行工具调用时需要权限确认
- `websocket.ts:217-260` 中权限请求等待用户响应（最长 60 秒）
- 如果用户未响应或拒绝，可能导致流程中断

**可能性**：中

---

## 四、根因推断

根据代码分析，最可能的原因是 **原因 2 和原因 4 的组合**：

1. **ACP CLI 返回了空结果**：AI 模型没有生成有效内容，或 ACP CLI 在解析响应时出现问题
2. **finish 事件设计不携带 content**：WebSocket 的 finish 事件只传递 files 和 metadata，不传递最终内容，导致前端完全依赖流式累积
3. **流式累积失败**：如果流式过程中没有收到任何 `agent_message_chunk`，`accumulatedContent` 保持为空

**核心问题**：前端在 `finish` 事件处理中，使用 `accumulatedContent || event.content || "抱歉，我没有收到有效的回复。"` 作为内容来源，但：
- `accumulatedContent` 依赖流式事件正确推送
- `event.content` 在 WebSocket 实现中始终为空（finish 事件不携带 content）
- 两者都为空时显示兜底错误

---

## 五、验证建议

### 5.1 检查 agent-service 日志

查看 agent-service 控制台日志，确认：
1. ACP CLI 是否正常启动
2. `session/prompt` 请求是否发送成功
3. 是否收到 `session/update` 通知（特别是 `agent_message_chunk` 类型）
4. 最终响应结果是否包含内容

### 5.2 检查 ACP CLI 输出

在 `connection.ts:169-184` 中添加调试日志，查看 stdout 输出的原始 JSON：

```typescript
this.child.stdout?.on("data", (data: Buffer) => {
  console.log("[ACP RAW]", data.toString()); // 添加此行
  // ...
});
```

### 5.3 检查 WebSocket 消息

在浏览器开发者工具中查看 WebSocket 消息：
1. 打开 Network → WS 标签
2. 找到 `/api/agent/:sessionId/stream` 连接
3. 查看 Messages 中是否有 `stream` 类型消息
4. 查看 `finish` 事件的内容

### 5.4 测试 ACP CLI 独立运行

手动运行 ACP CLI 测试其响应：

```bash
# 以 opencode 为例
opencode acp
```

然后手动发送 JSON-RPC 消息测试：

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1}}
{"jsonrpc":"2.0","id":2,"method":"session/new","params":{"cwd":".","mcpServers":[]}}
{"jsonrpc":"2.0","id":3,"method":"session/prompt","params":{"sessionId":"xxx","prompt":[{"type":"text","text":"你好"}]}}
```

---

## 六、修复建议

### 方案 1：在 finish 事件中携带最终内容（推荐）

修改 `websocket.ts:459-466`，在 finish 事件中添加 `content` 字段：

```typescript
if (result.success) {
  sendMessage({
    type: "finish",
    id: message.id,
    sessionId,
    content: result.content, // 添加最终内容
    files: result.files,
    metadata: result.metadata,
  });
}
```

### 方案 2：增强错误提示

在 `ai-chat.tsx` 中区分不同情况：

```typescript
stream.on("finish", async (event: StreamEvent) => {
  let finalContent = accumulatedContent || event.content;
  
  if (!finalContent) {
    if (event.error) {
      finalContent = `请求失败: ${event.error.message}`;
    } else {
      finalContent = "AI 未返回任何内容，请稍后重试。";
    }
  }
  
  // ...
});
```

### 方案 3：添加重试机制

在 `ai-chat.tsx` 中检测到空回复时自动重试一次：

```typescript
if (!accumulatedContent && !event.content) {
  // 自动重试逻辑
  console.warn("[AIChat] Empty response, retrying...");
  // 重新发送消息或提示用户
}
```

### 方案 4：检查 ACP CLI 健康状态

在发送消息前检查 ACP 连接状态：

```typescript
// 在 base-acp.ts sendMessage 中
if (!this.connection?.isConnected) {
  throw new Error("ACP 连接已断开，请刷新页面重试");
}
```

---

## 七、总结

| 项目 | 说明 |
|------|------|
| **错误消息来源** | `ai-chat.tsx` 中的兜底文案 |
| **直接原因** | `accumulatedContent` 和 `event.content` 同时为空 |
| **根本原因** | ACP CLI 未返回有效内容，或流式事件未正确推送 |
| **影响范围** | 所有使用 WebSocket 流式对话的功能 |
| **修复优先级** | 高 |

**建议排查步骤**：
1. 检查 agent-service 日志确认 ACP CLI 通信状态
2. 检查 WebSocket 消息确认是否有 stream 事件
3. 测试 ACP CLI 独立运行确认其是否正常响应
4. 根据排查结果选择修复方案
