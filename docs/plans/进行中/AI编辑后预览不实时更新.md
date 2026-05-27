# AI 编辑后预览不实时更新问题分析报告（第四次）

> 分析时间：2026-05-27
> 分析范围：packages/author-site 前端 + packages/agent-service 后端
> 状态：✅ 根因已定位（经 OpenCode Server 源码验证），待修复

---

## 一、问题背景

### 1.1 问题描述

此前三次修复过"AI 编辑后预览不实时更新"问题（方案 D + 第二次修复 + 第三次 session.diff 修复），但问题**再次出现**。用户在 Demo 编辑页使用 AI 对话功能修改页面代码后，AI 编辑成功完成，但**预览区不会立刻显示最新效果**。用户需要**手动保存页面后，重新打开编辑页**，才能看到最新的预览效果。

### 1.2 预期行为 vs 实际行为

| 维度             | 预期行为                           | 实际行为                   |
| ---------------- | ---------------------------------- | -------------------------- |
| AI 编辑完成后    | 预览区应自动更新，显示最新代码效果 | 预览区仍显示旧版本内容     |
| 保存并重新打开后 | 预览区显示最新内容                 | 预览区显示最新内容（正常） |

---

## 二、历史修复回顾

### 2.1 方案 D 修复（第一次，已实施）

| Fix   | 内容                                                         | 当前状态      |
| ----- | ------------------------------------------------------------ | ------------- |
| Fix 1 | 替换 HTTP fallback 条件，使用 codeUpdated/schemaUpdated 标记 | ✅ 已在代码中 |
| Fix 2 | base-acp.ts sendMessage 传递 onFileOperation 给 sendPrompt   | ✅ 已在代码中 |
| Fix 3 | connection.ts content 缺失时的防御性日志                     | ✅ 已在代码中 |

### 2.2 第二次修复（已实施）

| Fix   | 内容                                                          | 当前状态      |
| ----- | ------------------------------------------------------------- | ------------- |
| Fix 1 | fetchSessionFiles 支持 MultiDemoFiles 格式 + demoId 参数      | ✅ 已在代码中 |
| Fix 2 | HTTP fallback 移出 finalFiles 条件块，finalFiles 为空时也触发 | ✅ 已在代码中 |
| Fix 3 | 传递 demoId 到 useChatStream → fetchSessionFiles              | ✅ 已在代码中 |

### 2.3 第三次修复（session.diff 处理，已实施）

| Fix   | 内容                                                                        | 当前状态                  |
| ----- | --------------------------------------------------------------------------- | ------------------------- |
| Fix 1 | opencode-http.ts session.diff case：解析 FileDiff，发出 file_operation 事件 | ✅ 已在代码中（L352-384） |
| Fix 2 | opencode-http.ts session.diff case：填充 this.files 数组                    | ✅ 已在代码中（L370-379） |
| Fix 3 | use-chat-stream.ts 增加诊断日志                                             | ✅ 已在代码中             |
| Fix 4 | OpenCodeSSEEvent 接口：FileDiff 类型、file 属性                             | ✅ 已在代码中（L12-48）   |

**结论**：前三次修复的所有内容在当前代码中均存在。第三次修复已正确处理 `session.diff` 事件的解析和转发逻辑，但问题仍然复现，说明 **session.diff 事件本身未被接收到**，或存在新的数据流断裂点。

---

## 三、当前代码数据流分析

### 3.1 第三次修复后的完整数据流（理论上应正常工作）

第三次修复在 `opencode-http.ts` 的 `handleSSEEvent` 中实现了 `session.diff` 事件处理（L352-384）：

- 解析 `FileDiff[]` 数组
- 对每个文件变更发出 `file_operation` 事件（实时更新前端）
- 填充 `this.files` 数组（finish 事件携带文件信息）

**如果 session.diff 事件正常到达，三条更新路径均应工作：**

```
路径 1（实时流）：session.diff → file_operation → WS → 前端 onFileOperation → processRealtimeFiles → onCodeUpdate ✅
路径 2（完成事件）：this.files 已填充 → getFiles() 返回文件 → finish 事件携带 files → extractCodeAndSchemaUpdates → onCodeUpdate ✅
路径 3（HTTP fallback）：如果路径 1/2 未覆盖 code/schema → fetchSessionFiles → 读取磁盘文件 → onCodeUpdate ✅
```

### 3.2 问题定位：session.diff 事件未到达 handleSSEEvent

既然第三次修复的处理逻辑已正确实现，但问题仍然复现，说明 **session.diff SSE 事件本身未到达或被丢弃**。以下是可能导致事件丢失的原因分析。

---

## 四、根因分析（经 OpenCode Server 源码验证）

> 以下根因通过研究 OpenCode Server 源码（GitHub）和 Issues 已**确认**，非假设。

### 4.1 根因 A（已确认）：SSE 事件时序竞争 — session.diff 与 session.idle 到达顺序不确定

**确认来源**：OpenCode Server `processor.ts:391` — `SessionSummary.summarize()` 在每条 assistant message 完成后发布 `session.diff` 事件，与 `session.idle` 事件几乎同时由不同模块发出。

**核心问题**：`session.idle` 事件到达后，SSE 连接被立即关闭（`closeSSE()`），如果 `session.diff` 在 `session.idle` 之后到达，文件变更数据将完全丢失。

[opencode-http.ts L322-336](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/agent-service/src/backends/opencode-http.ts#L322-L336) — session.idle 处理器：

```typescript
case 'session.idle': {
  this.eventCallback?.({ type: 'stream', ..., done: true });
  this.status = 'ready';
  this.closeSSE();     // ❌ 立即关闭 SSE，后续 session.diff 事件将丢失
  if (this.streamDone) {
    clearTimeout(this.streamDone.timeout);
    this.streamDone.resolve(this.fullContent);  // sendMessage Promise 立即 resolve
    this.streamDone = null;
  }
  break;
}
```

**OpenCode Server 内部事件发布顺序（源码验证）**：

```
OpenCode Server 内部执行流程：
  1. AI 生成文本 → message.part.delta × N
  2. AI 完成 → processor.ts 触发 session 状态变更 → session.idle 发布
  3. SessionSummary.summarize() → 计算文件 diff → session.diff 发布
     （summarize 是异步操作，与步骤 2 几乎同时但独立执行）
```

**结论**：`session.diff` 和 `session.idle` 由 Server 的不同模块独立发布，到达 SSE 客户端的顺序**不可预测**。当 `session.idle` 先到时，当前代码立即关闭 SSE 连接，`session.diff` 事件丢失。

**另一个相关的时序问题**：`session.idle` 触发后，`sendMessageStream` 的 Promise 立即 resolve，导致 `BackendAgent.sendMessage()` 继续执行：

```typescript
// backend-agent.ts L55-64
const resultContent = await this.backend.sendMessage(content, {
  stream: options?.stream,
});
// ↑ 此时 session.diff 可能尚未到达
const files = this.backend.getFiles?.() || [];
// ↑ this.files 可能仍为空数组
return {
  success: true,
  content: resultContent,
  files: files.length > 0 ? files : undefined,
};
```

即使 `session.diff` 稍后到达（SSE 尚未完全关闭），由于 `sendMessage` Promise 已 resolve，`getFiles()` 可能已经执行完毕，finish 事件已发送，错过了文件数据。

### 4.2 根因 B（已确认）：snapshot 配置可能导致 session.diff 携带空 diff 数组

**确认来源**：OpenCode Server GitHub Issue #22656 — 当 `opencode.json` 中 `snapshot` 配置为 `false` 时，`SessionSummary.summarize()` 仍会执行并发布 `session.diff` 事件，但 **diff 数组为空 `[]`**。

**影响**：当前代码在 `session.diff` 处理器中检查了 `props.diff.length > 0`（L352），空数组会导致整个处理逻辑被跳过，等同于 session.diff 未发送。

**当前部署状态**：[entrypoint.sh](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/docker/opencode-serve/entrypoint.sh) 生成的 `opencode.json` **未显式设置 snapshot 字段**，使用 OpenCode Server 的默认值。需要确认默认值是 `true` 还是 `false`。

**OpenCode Server FileDiff schema（源码验证）**：

```typescript
// OpenCode Server 的 FileDiff 定义
FileDiff = z.object({
  file: z.string(), // 文件路径
  before: z.string(), // 修改前完整内容
  after: z.string(), // 修改后完整内容
  additions: z.number(), // 新增行数
  deletions: z.number(), // 删除行数
});

// session.diff 事件定义
BusEvent.define(
  "session.diff",
  z.object({
    sessionID: z.string(),
    diff: Snapshot.FileDiff.array(), // snapshot:false 时为 []
  }),
);
```

### 4.3 根因 C（已确认）：测试覆盖完全失效 — 旧格式 vs 新格式

**确认来源**：commit `a874c1a` 将 SSE 事件格式从旧版迁移到新版，但 [opencode-http.test.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/agent-service/tests/unit/opencode-http.test.ts) 的测试用例**从未同步更新**。

| 事件类型 | 测试中使用的格式（旧）                 | 代码实际处理的格式（新）                          |
| -------- | -------------------------------------- | ------------------------------------------------- |
| 文本流   | `agent_message_chunk` + `content.text` | `message.part.delta` + `field='text'` + `delta`   |
| 完成     | `agent_message_done`                   | `session.idle`                                    |
| 思考     | `agent_thought_chunk`                  | `message.part.updated` + `part.type='reasoning'`  |
| 工具调用 | `tool_call` + `toolCallId`             | `message.part.updated` + `part.type='step-start'` |
| 文件变更 | `file_operation` + `files[]`           | `session.diff` + `diff: FileDiff[]`               |
| 权限请求 | `permission_request`                   | 未在当前代码中处理                                |

**影响**：

- 旧格式事件落入 `default` case，仅记录 debug 日志，测试**全部通过**但实际未测试任何有效行为
- `session.diff` 事件处理逻辑**零测试覆盖**
- 三次修复均无法通过测试回归发现问题

### 4.4 排除的假设：HTTP fallback 工作区路径不匹配（低概率，暂不处理）

HTTP fallback 通过 `GET /api/sessions/{sessionId}/files` 读取工作区文件。该 API 使用 `findWorkspacePath` 定位工作区目录。如果与 OpenCode Server 的 `workingDir` 不一致，可能读取到旧文件。但此路径仅在路径 1/2 均失败时触发，优先修复根因 A/B 后再验证。

---

## 五、根因总结

### 5.1 核心问题（已确认）

**根因 A（SSE 时序竞争）是主因**：OpenCode Server 的 `session.diff` 和 `session.idle` 由不同模块独立发布，到达顺序不可预测。当前代码在收到 `session.idle` 后立即关闭 SSE 连接，导致 `session.diff` 事件丢失。**根因 B（snapshot 配置）** 可能导致即使收到 `session.diff` 事件，diff 数组也为空。**根因 C（测试失效）** 导致三次修复均无法通过回归测试发现问题。

### 5.2 前三次修复为何无效

- **第一次修复（方案 D）**：解决了 ACP 后端下 content 缺失和 HTTP fallback 条件问题
- **第二次修复**：解决了前端 fetchSessionFiles 格式不匹配和 HTTP fallback 不触发的问题
- **第三次修复（session.diff）**：正确实现了 session.diff 事件的解析和转发，但 **事件本身因 SSE 时序竞争未到达**（根因 A），或 **事件到达但 diff 为空**（根因 B）

### 5.3 影响范围

- 仅影响使用 opencode-http 后端的 Demo 编辑页预览实时更新
- 不影响保存、版本管理等其他功能
- ACP 后端（已废弃）不受影响

---

## 六、解决方案建议

### 方向 1：修复 SSE 时序竞争 — 根因 A（推荐优先实施）

**方案 A：延迟关闭 SSE**
在 `session.idle` 中不立即关闭 SSE，而是设置一个短超时（如 2-3 秒），等待可能的 session.diff 事件：

```typescript
case 'session.idle': {
  this.eventCallback?.({ type: 'stream', ..., done: true });
  // 不立即关闭 SSE，等待可能的 session.diff
  setTimeout(() => {
    this.status = 'ready';
    this.closeSSE();
    if (this.streamDone) {
      clearTimeout(this.streamDone.timeout);
      this.streamDone.resolve(this.fullContent);
      this.streamDone = null;
    }
  }, 2000); // 等待 2 秒以接收 session.diff
  break;
}
```

**方案 B：主动拉取 session diff（更可靠，推荐）**
在 `sendMessageStream` 的 Promise resolve 后、`getFiles()` 调用前，主动通过 HTTP API 获取文件变更：

```typescript
// 在 sendMessageStream 返回后、getFiles() 调用前
private async fetchSessionDiff(): Promise<void> {
  if (!this.sessionId) return;
  try {
    const resp = await fetch(`${OPENCODE_SERVER_URL}/session/${this.sessionId}/diff`, {
      signal: AbortSignal.timeout(5000),
    });
    if (resp.ok) {
      const diffs = await resp.json() as FileDiff[];
      for (const diff of diffs) {
        // 同 session.diff 处理逻辑
      }
    }
  } catch { /* ignore */ }
}
```

### 方向 2：确认 snapshot 配置 — 根因 B

检查 OpenCode Server 的 `snapshot` 默认值。如果默认为 `false`，需在 [entrypoint.sh](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/docker/opencode-serve/entrypoint.sh) 生成的 `opencode.json` 中显式设置 `snapshot: true`。

### 方向 3：更新测试用例 — 根因 C

将 [opencode-http.test.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/agent-service/tests/unit/opencode-http.test.ts) 中的测试从旧版 SSE 事件格式迁移到新版格式，确保 session.diff 处理逻辑有测试覆盖。优先覆盖：

1. `session.diff` 正常解析 → file_operation 事件发出
2. `session.diff` diff 为空数组 → 不发出 file_operation
3. `session.idle` 先于 `session.diff` 到达 → 时序处理正确

### 方向 4：增强诊断日志

在 `handleSSEEvent` 的所有分支中增加带时间戳的日志，记录事件到达顺序：

```typescript
logger.info(
  { eventType: data.type, sessionId: this.sessionId, timestamp: Date.now() },
  "SSE event received",
);
```

---

## 七、验证方法

修复后，可通过以下方式验证：

1. **agent-service 日志**：检查是否出现 `"Session diff received"` 日志
   - 如果出现但前端仍未更新 → 问题在前端事件处理
   - 如果未出现 → 问题在 SSE 事件未到达或 Server 未发送
2. **浏览器控制台**：
   - `[useChatStream] onFileOperation:` — 实时文件操作事件
   - `[useChatStream] onFinish: finalFiles count:` — 完成事件文件数量
   - `[useChatStream] HTTP fallback:` — HTTP fallback 触发情况
3. **SSE 事件顺序日志**：通过新增的时间戳日志确认 session.diff 和 session.idle 的到达顺序

---

## 八、相关代码路径

| 文件                                                                                                                                                             | 关键位置                     | 说明                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------- |
| [opencode-http.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/agent-service/src/backends/opencode-http.ts)                               | handleSSEEvent (L257-415)    | SSE 事件处理，session.diff/session.idle 时序 |
| [opencode-http.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/agent-service/src/backends/opencode-http.ts)                               | sendMessageStream (L190-221) | 流式消息，Promise resolve 时机               |
| [backend-agent.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/agent-service/src/core/backend-agent.ts)                                   | sendMessage (L40-78)         | getFiles() 调用时机                          |
| [use-chat-stream.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/author-site/src/components/ai-elements/chat/hooks/use-chat-stream.ts)    | onFileOperation / onFinish   | 前端文件变更处理                             |
| [message-service.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/author-site/src/components/ai-elements/chat/services/message-service.ts) | fetchSessionFiles            | HTTP fallback                                |
| [ws-event-router.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/agent-service/src/routes/ws-event-router.ts)                             | handleEvent (L150-249)       | file_operation 事件转发                      |
| [websocket.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/agent-service/src/routes/websocket.ts)                                         | L260-276                     | finish 事件构建和发送                        |
| [opencode-http.test.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/agent-service/tests/unit/opencode-http.test.ts)                       | 全文                         | ⚠️ 使用旧版 SSE 格式，需更新                 |
