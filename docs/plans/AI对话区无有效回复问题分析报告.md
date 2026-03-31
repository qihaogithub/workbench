# AI 对话区 "没有收到有效的回复" 问题分析报告

> 生成时间：2026-03-31  
> 分析范围：前端 AI 对话区 → `/api/ai/chat` → OpenCode Server SSE 事件流  
> 严重等级：🔴 阻塞（AI 对话功能完全不可用）

---

## 1. 问题描述

用户在 AI 编辑工作台（`/demo/[id]/edit`）的 AI 对话区发送消息后，AI 助手回复显示：

> **"抱歉，我没有收到有效的回复。"**

用户消息正常发送，AI 显示 loading 状态，但最终内容为空时触发此兜底提示。

---

## 2. 消息链路追踪

```
用户输入 → handleAiSend() 
  → POST /api/ai/chat (SSE 流式响应)
    → POST /session (创建 OpenCode Session)
    → POST /session/{id}/message (发送消息)
    → GET /session/{id}/event (监听 SSE 事件流)
    ← readSSEStream 解析事件
  ← 前端解析 delta 字段 JSON 行
  ← fullContent 为空 → 显示兜底提示
```

---

## 3. 根因分析

### 3.1 核心问题：SSE 事件格式不匹配

**文件：** `packages/web/src/app/api/ai/chat/route.ts` — `readSSEStream` 函数（第 51-160 行）

当前实现尝试解析 SSE 格式的 `event:` / `data:` 行对，但 OpenCode Server 的 `/session/{id}/event` 端点返回的数据格式与预期不匹配。

#### 当前代码的解析逻辑

```typescript
// 第 102-153 行：尝试多种事件类型
if (lastEventType === 'message' || lastEventType === 'text') {
  if (data.type === 'text' && data.text) {
    onMessage(data.text);
  }
  if (data.content || data.text) {
    onMessage(data.content || data.text);
  }
}
if (lastEventType === 'session.message') {
  if (data.parts) {
    for (const part of data.parts) {
      if (part.type === 'text' && part.text) {
        onMessage(part.text);
      }
    }
  }
}
if (data.choices && Array.isArray(data.choices)) {
  // OpenAI 风格
}
if (data.delta !== undefined && typeof data.delta === 'string') {
  onMessage(data.delta);
}
```

#### 问题所在

根据 OpenCode 社区 Issue 调研，存在以下已知问题：

| Issue | 描述 | 状态 |
|-------|------|------|
| [#16860](https://github.com/anomalyco/opencode/issues/16860) | `/message` 端点返回空 body (HTTP 200, Content-Length: 0) | Open |
| [#17437](https://github.com/anomalyco/opencode/issues/17437) | 指定 agent 时 `/message` 返回 200 空 body | Open |
| [#17505](https://github.com/anomalyco/opencode/issues/17505) | `session/update` 通知在 `end_turn` 响应**之后**才到达 | Open |
| [#13416](https://github.com/anomalyco/opencode/issues/13416) | SSE 端点文档缺失，REST API 行为不稳定 | Closed (not planned) |
| [#7451](https://github.com/anomalyco/opencode/issues/7451) | 缺少 session 级别的 SSE 事件监听文档 | Open |

**关键发现：** OpenCode Server 的 SSE 事件流格式在不同版本间存在变化，且官方文档不完善。当前代码尝试了多种格式（`event: message`、`event: text`、`event: session.message`、`choices`、`delta`），但实际返回的事件类型可能不匹配任何分支。

### 3.2 辅助问题：错误被静默吞没

**文件：** `packages/web/src/app/demo/[id]/edit/page.tsx` — 第 306 行

```typescript
} catch (parseError) {
  // 空 catch 块 — 所有解析错误被静默忽略！
}
```

SSE 流解析过程中发生的任何 JSON 解析错误都被静默吞没，导致：
1. 无法在控制台看到实际收到的数据格式
2. 无法判断 OpenCode Server 实际返回了什么
3. `fullContent` 保持为空，最终触发兜底提示

### 3.3 辅助问题：`data.done` 处理逻辑缺失

**文件：** `packages/web/src/app/demo/[id]/edit/page.tsx` — 第 303-305 行

```typescript
if (data.done) {
  // 收到完成信号，不需要更新 sessionId
}
```

`data.done` 分支为空操作，虽然不影响功能，但缺少对完成状态的日志记录。

---

## 4. 详细代码分析

### 4.1 前端发送逻辑（`page.tsx` 第 222-336 行）

```typescript
// 发送消息时传 undefined 作为 sessionId
const response = await fetch('/api/ai/chat', {
  method: 'POST',
  body: JSON.stringify({ 
    messages, 
    sessionId: undefined,  // 每次创建新 OpenCode Session
    demoId 
  }),
});
```

**潜在问题：** 每次发送消息都创建新的 OpenCode Session，导致：
- 多轮对话上下文丢失（新 Session 没有历史消息）
- 资源浪费（Session 泄漏）

### 4.2 API 路由逻辑（`route.ts` 第 162-306 行）

#### Session 创建（第 200-220 行）

```typescript
if (!sessionId) {
  const sessionRes = await fetch(`${OPENCODE_SERVER_URL}/session`, {
    method: 'POST',
    body: JSON.stringify({ title: `Demo: ${demoId}` }),
  });
  sessionId = sessionData.id;
}
```

**问题：** 创建 Session 时未指定 `directory` 参数，AI 无法访问 Demo 目录进行代码编辑。

#### 消息发送（第 229-238 行）

```typescript
const messageBody = {
  template: 'build',
  parts: [{ type: 'text', text: lastUserMessage.content }],
};

const response = await fetch(`${OPENCODE_SERVER_URL}/session/${sessionId}/message`, {
  method: 'POST',
  body: JSON.stringify(messageBody),
});
```

**问题：** 
1. 使用 `template: 'build'` 可能不正确
2. 未传递 `model` 参数
3. 根据 Issue #16860，此端点可能返回空 body

#### SSE 事件监听（第 255-273 行）

```typescript
const eventUrl = `${OPENCODE_SERVER_URL}/session/${sessionId!}/event`;
await readSSEStream(eventUrl, sessionId!, (content) => {
  controller.enqueue(encoder.encode(JSON.stringify({ delta: content }) + '\n'));
  fullResponse += content;
}, 120000);
```

**问题：** `/session/{id}/event` 端点的行为未经验证，可能：
- 不返回任何事件
- 返回的事件格式与 `readSSEStream` 解析逻辑不匹配
- 需要特定的请求头或参数

### 4.3 SSE 解析逻辑（`readSSEStream` 函数）

```typescript
// 第 61-68 行：请求事件流
const response = await fetch(url, {
  method: 'GET',
  headers: { 
    'Accept': 'text/event-stream',
    'x-session-id': sessionId  // 自定义头，可能无效
  },
});
```

**问题：** `x-session-id` 请求头可能不被 OpenCode Server 支持。

---

## 5. 问题总结

| # | 问题 | 严重度 | 影响 |
|---|------|--------|------|
| 1 | SSE 事件格式不匹配 | 🔴 致命 | AI 回复内容无法被解析，fullContent 始终为空 |
| 2 | 解析错误被静默吞没 | 🟡 中等 | 无法调试，无法定位实际数据格式 |
| 3 | 每次消息创建新 Session | 🟡 中等 | 多轮对话上下文丢失 |
| 4 | Session 未指定 directory | 🟡 中等 | AI 无法编辑 Demo 代码 |
| 5 | OpenCode Server 端点行为不确定 | 🟡 中等 | 依赖未文档化的 API |
| 6 | messageBody 格式可能不正确 | 🟠 高 | AI 可能不响应或响应异常 |

---

## 6. 修复建议

### 6.1 紧急修复（P0）

#### 修复 1：添加 SSE 调试日志

在 `readSSEStream` 函数中，对无法解析的原始数据添加日志：

```typescript
// 在 catch 块中添加
} catch (e) {
  console.error('[SSE] Failed to parse JSON:', e);
  console.error('[SSE] Raw unparsed data:', val);  // 新增：查看实际数据
  onMessage(val);  // 降级：直接传递原始文本
}
```

在 `page.tsx` 的 catch 块中添加日志：

```typescript
} catch (parseError) {
  console.error('[AI Chat] Parse error in SSE stream:', parseError);  // 新增
  console.error('[AI Chat] Buffer content:', buffer);  // 新增
}
```

#### 修复 2：扩展 SSE 事件类型匹配

OpenCode Server 可能使用不同的事件类型名称。尝试添加更多匹配分支：

```typescript
// 添加更多事件类型
if (lastEventType === 'session/update' || lastEventType === 'update') {
  if (data.type === 'agent_message_chunk' && data.content) {
    onMessage(data.content);
  }
  if (data.type === 'agent_thought_chunk' && data.content) {
    // 可选：忽略思考内容
  }
}

// 裸 data 行（无 event 类型）
if (!lastEventType) {
  if (data.text || data.content) {
    onMessage(data.text || data.content);
  }
  if (data.type === 'text' && data.text) {
    onMessage(data.text);
  }
}
```

### 6.2 中期修复（P1）

#### 修复 3：Session 复用

不要每次消息都创建新 Session，而是复用同一个 Session：

```typescript
// 在组件状态中保存 OpenCode Session ID
const [opencodeSessionId, setOpenCodeSessionId] = useState<string | null>(null);

// 在 handleAiSend 中复用
const response = await fetch('/api/ai/chat', {
  body: JSON.stringify({ 
    messages, 
    sessionId: opencodeSessionId,  // 复用已有 Session
    demoId 
  }),
});
```

#### 修复 4：指定工作目录

创建 Session 时指定 Demo 目录：

```typescript
const sessionRes = await fetch(`${OPENCODE_SERVER_URL}/session`, {
  method: 'POST',
  body: JSON.stringify({ 
    title: `Demo: ${demoId}`,
    directory: `/path/to/sessions/${sessionId}`  // 指定工作目录
  }),
});
```

### 6.3 长期修复（P2）

#### 修复 5：验证 OpenCode Server API

使用 curl 手动测试 OpenCode Server 的 API 端点，确认实际返回格式：

```bash
# 1. 创建 Session
curl -X POST http://localhost:4096/session -H "Content-Type: application/json" -d '{"title":"test"}'

# 2. 发送消息
curl -X POST http://localhost:4096/session/{id}/message -H "Content-Type: application/json" -d '{"parts":[{"type":"text","text":"hello"}]}'

# 3. 监听事件流
curl -N http://localhost:4096/session/{id}/event -H "Accept: text/event-stream"
```

根据实际返回格式调整 `readSSEStream` 的解析逻辑。

#### 修复 6：考虑使用 `prompt_async` + 轮询

根据社区讨论，`/message` 端点行为不稳定。备选方案：

1. 使用 `POST /session/{id}/prompt_async` 发送消息
2. 通过轮询 `GET /session/{id}` 获取最新状态
3. 从 Session 的 messages 列表中提取 AI 回复

---

## 7. 调试步骤

在修复之前，建议按以下步骤收集更多信息：

### Step 1：检查 OpenCode Server 是否运行

```bash
curl http://localhost:4096/global/health
```

### Step 2：查看浏览器控制台日志

当前代码已有以下日志点：
- `[SSE] Response status:`
- `[SSE] Raw chunk received:`
- `[SSE] Raw data:`
- `[SSE] Parsed data:`

打开浏览器开发者工具 → Console，发送一条 AI 消息，查看上述日志输出。

### Step 3：手动测试 API

```bash
# 测试 chat API
curl -X POST http://localhost:3000/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"hello"}],"demoId":"test-demo"}' \
  -N
```

### Step 4：检查 Next.js 服务器日志

查看 `pnpm dev` 输出中的 `[AI Chat]` 和 `[SSE]` 前缀日志。

---

## 8. 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| OpenCode Server 版本不兼容 | 高 | 高 | 先确认 Server 版本，手动测试 API |
| SSE 事件流格式随版本变化 | 中 | 高 | 添加多格式兼容逻辑 |
| Session 泄漏（未清理） | 中 | 中 | 实现 Session 超时清理机制 |
| 多轮对话上下文丢失 | 高 | 中 | 实现 Session 复用 |

---

## 9. 结论

**核心问题**是 `readSSEStream` 函数无法正确解析 OpenCode Server 返回的 SSE 事件格式，导致 AI 回复内容始终为空。这很可能是由于：

1. OpenCode Server 的 `/session/{id}/event` 端点返回的事件类型与代码中硬编码的类型不匹配
2. OpenCode Server 本身的 API 行为在不同版本间存在变化（社区多个 Open Issue 佐证了这一点）

**建议优先执行 Step 1-4 调试步骤**，收集实际的 SSE 数据格式，然后针对性地修复解析逻辑。在不确定 OpenCode Server 实际行为的情况下盲目修改代码，很可能无法解决问题。
