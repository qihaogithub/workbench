# AI 编辑后预览不实时更新问题分析报告（第三次）

> 分析时间：2026-05-25
> 分析范围：packages/author-site 前端 + packages/agent-service 后端
> 状态：✅ 根因已定位，修复已实施

---

## 一、问题背景

### 1.1 问题描述

此前已两次修复过"AI 编辑后预览不实时更新"问题（方案 D + 第二次修复），但问题再次出现。用户在 Demo 编辑页使用 AI 对话功能修改页面代码后，AI 编辑成功完成，但**预览区不会立刻显示最新效果**。用户需要**手动保存页面后，重新打开编辑页**，才能看到最新的预览效果。

### 1.2 预期行为 vs 实际行为

| 维度 | 预期行为 | 实际行为 |
|------|---------|---------|
| AI 编辑完成后 | 预览区应自动更新，显示最新代码效果 | 预览区仍显示旧版本内容 |
| 保存并重新打开后 | 预览区显示最新内容 | 预览区显示最新内容（正常） |

---

## 二、历史修复回顾

### 2.1 方案 D 修复（第一次，已实施）

| Fix | 内容 | 当前状态 |
|-----|------|---------|
| Fix 1 | 替换 HTTP fallback 条件，使用 codeUpdated/schemaUpdated 标记 | ✅ 已在代码中 |
| Fix 2 | base-acp.ts sendMessage 传递 onFileOperation 给 sendPrompt | ✅ 已在代码中 |
| Fix 3 | connection.ts content 缺失时的防御性日志 | ✅ 已在代码中 |

### 2.2 第二次修复（已实施）

| Fix | 内容 | 当前状态 |
|-----|------|---------|
| Fix 1 | fetchSessionFiles 支持 MultiDemoFiles 格式 + demoId 参数 | ✅ 已在代码中 |
| Fix 2 | HTTP fallback 移出 finalFiles 条件块，finalFiles 为空时也触发 | ✅ 已在代码中 |
| Fix 3 | 传递 demoId 到 useChatStream → fetchSessionFiles | ✅ 已在代码中 |

**结论**：前两次修复的所有内容在当前代码中均存在，但问题仍然复现。说明存在前两次修复未覆盖的新根因。

---

## 三、根因分析

### 3.1 核心发现：后端已从 ACP 迁移到 opencode-http

项目后端已从 ACP（子进程通信）迁移到 `opencode-http`（HTTP + SSE 通信）。两种后端在文件操作事件处理上存在根本性差异：

| 特性 | ACP 后端（base-acp.ts） | opencode-http 后端 |
|------|------------------------|-------------------|
| 通信方式 | stdio 子进程，JSON-RPC | HTTP + SSE |
| file_operation 事件 | 实时发出，每次写文件时通知前端 | **不发出** |
| this.files 填充 | 每次写文件时 push { path, action, content } | **始终为空数组** |
| finish 事件 files | 包含所有写入的文件（含 content） | **为空** |
| session.diff 处理 | 不适用 | 收到 diff 但**仅记录日志，未解析使用** |

### 3.2 完整数据流追踪（opencode-http 后端）

AI 编辑 → 预览更新有三条路径：

**路径 1：实时流（AI 执行期间）— 完全失效**
```
AI 编辑文件 → OpenCode Server 发送 session.diff SSE 事件
→ opencode-http 后端 handleSSEEvent() 接收
→ ❌ 仅记录日志，不发出 file_operation 事件
→ 前端 onFileOperation 永远不会被调用
→ realtimeFilesRef 始终为空
```

**路径 2：完成事件（AI 执行结束后）— 完全失效**
```
agent.sendMessage() 完成 → result.files = backend.getFiles()
→ getFiles() 返回 this.files → 始终为空数组
→ BackendAgent: files.length > 0 ? files : undefined → undefined
→ WebSocket 发送 finish 事件（files = undefined）
→ 前端 onFinish: finalFiles 为空
```

**路径 3：HTTP fallback（兜底）— 唯一可用路径**
```
onFinish → codeUpdated=false, schemaUpdated=false
→ fetchSessionFiles(sessionId, demoId)
→ GET /api/sessions/{sessionId}/files
→ 读取本地工作区文件 → 返回最新 code/schema
→ onCodeUpdate?.(code) → 预览更新
```

### 3.3 根因：opencode-http 后端不处理 session.diff 事件

[opencode-http.ts:335-339](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/agent-service/src/backends/opencode-http.ts) — 修复前的代码：

```typescript
case 'session.diff': {
  if (props.diff && Array.isArray(props.diff) && props.diff.length > 0) {
    logger.info({ diffCount: props.diff.length, sessionId: this.sessionId }, 'Session diff received');
  }
  break;
  // ❌ 仅记录日志，不发出 file_operation 事件，不填充 this.files
}
```

OpenCode Server 的 `session.diff` SSE 事件包含完整的文件变更数据（`FileDiff` 类型）：

```typescript
// 来自 OpenCode SDK types.gen.ts
type FileDiff = {
  file: string;      // 文件路径
  before: string;    // 变更前内容
  after: string;     // 变更后内容（完整文件内容）
  additions: number; // 新增行数
  deletions: number; // 删除行数
}

type EventSessionDiff = {
  type: "session.diff"
  properties: {
    sessionID: string
    diff: Array<FileDiff>
  }
}
```

**影响链路**：

```
session.diff 事件到达 → 仅记录日志
→ file_operation 事件不发出 → 前端无实时更新
→ this.files 不填充 → finish 事件 files=undefined → 前端无完成更新
→ 仅靠 HTTP fallback → 如果工作区文件未及时写入磁盘，fallback 也返回旧数据
→ 预览不更新！
```

### 3.4 根因链路图

```
场景 A（opencode-http 后端，当前默认）：
  session.diff 到达 → 不处理 → file_operation 不发出 → this.files 为空
  → finish 事件 files=undefined → finalFiles 为空
  → HTTP fallback 触发 → 取决于工作区文件是否已写入磁盘
  → 如果文件已写入：预览更新 ✅（但有延迟）
  → 如果文件未写入：预览不更新 ❌

场景 B（ACP 后端，已废弃）：
  fs/write_text_file 通知 → file_operation 事件发出 → this.files 填充
  → 实时更新 + finish 事件携带 files → 预览正常更新 ✅
```

**核心结论**：opencode-http 后端迁移时，`session.diff` 事件处理逻辑缺失，导致文件变更数据无法传递到前端。前两次修复只解决了前端解析问题，但数据源本身是空的。

---

## 四、解决方案

### Fix 1：处理 session.diff 事件，发出 file_operation 事件并填充 files 数组（opencode-http.ts）

修改 `opencode-http` 后端的 `handleSSEEvent` 方法，处理 `session.diff` 事件：

1. 解析 `FileDiff` 数组
2. 对每个文件变更，发出 `file_operation` 事件（含完整文件内容）
3. 填充 `this.files` 数组（确保 finish 事件携带文件信息）

```typescript
case 'session.diff': {
  if (props.diff && Array.isArray(props.diff) && props.diff.length > 0) {
    for (const fileDiff of props.diff) {
      if (fileDiff.file && fileDiff.after !== undefined) {
        // 发出 file_operation 事件，前端可实时更新预览
        this.eventCallback?.({
          type: 'file_operation',
          sessionId: this.config.sessionId,
          fileOperation: {
            method: 'fs/write_text_file',
            path: fileDiff.file,
            content: fileDiff.after,
          },
        });
        // 填充 this.files，finish 事件将携带文件信息
        const existingIndex = this.files.findIndex(f => f.path === fileDiff.file);
        if (existingIndex >= 0) {
          this.files[existingIndex].content = fileDiff.after;
        } else {
          this.files.push({
            path: fileDiff.file,
            action: fileDiff.before ? 'modified' : 'created',
            content: fileDiff.after,
          });
        }
      }
    }
  }
  break;
}
```

### Fix 2：更新 OpenCodeSSEEvent 接口类型（opencode-http.ts）

将 `diff` 字段类型从 `Array<unknown>` 更新为 `Array<FileDiff>`，并添加 `file` 属性支持 `file.edited` 事件。

### Fix 3：前端增加诊断日志（use-chat-stream.ts）

在 `onFileOperation` 和 `onFinish` 的 HTTP fallback 路径中增加 `console.log`，便于后续排查：
- `onFileOperation`：记录 method、path、是否有 content
- `onFinish`：记录 finalFiles 数量、codeUpdated/schemaUpdated 状态
- HTTP fallback：记录 fetchSessionFiles 调用和返回值

---

## 五、根因总结

### 5.1 核心问题

**AI 编辑后预览不更新的根因是：后端从 ACP 迁移到 opencode-http 后，`session.diff` SSE 事件未被处理。该事件包含完整的文件变更数据（FileDiff.after 为变更后的完整文件内容），但 opencode-http 后端仅记录日志，不发出 `file_operation` 事件也不填充 `this.files` 数组，导致前端两条更新路径（实时流 + 完成事件）全部失效，仅靠 HTTP fallback 兜底。**

### 5.2 前两次修复为何无效

- **第一次修复（方案 D）**：解决了 ACP 后端下 content 缺失和 HTTP fallback 条件问题，但 ACP 后端本身能发出 file_operation 事件
- **第二次修复**：解决了前端 fetchSessionFiles 格式不匹配和 HTTP fallback 不触发的问题，但 opencode-http 后端不发出任何文件变更数据，HTTP fallback 也因工作区文件可能未及时写入而不可靠

### 5.3 影响范围

- 仅影响使用 opencode-http 后端的 Demo 编辑页预览实时更新
- 不影响保存、版本管理等其他功能
- ACP 后端（已废弃）不受影响

---

## 六、验证方法

修复后，可通过以下方式验证：

1. **实时更新场景**：AI 编辑代码过程中，预览应实时更新（通过 session.diff → file_operation 事件）
2. **完成更新场景**：AI 编辑完成后，finish 事件应携带 files 数组，预览应更新
3. **HTTP fallback 场景**：如果 session.diff 未提供完整数据，HTTP fallback 应兜底更新
4. **混合场景**：AI 同时修改 schema 和代码 → 两者都应正确更新

浏览器控制台日志关键字：
- `[useChatStream] onFileOperation:` — 实时文件操作事件
- `[useChatStream] onFinish: finalFiles count:` — 完成事件文件数量
- `[useChatStream] HTTP fallback:` — HTTP fallback 触发情况

---

## 七、相关代码路径

| 文件 | 关键位置 | 说明 |
|------|---------|------|
| [opencode-http.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/agent-service/src/backends/opencode-http.ts) | session.diff case | **本次修复核心**：处理 session.diff 事件 |
| [use-chat-stream.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/author-site/src/components/ai-elements/chat/hooks/use-chat-stream.ts) | onFileOperation / onFinish | 前端文件变更处理 + 诊断日志 |
| [message-service.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/author-site/src/components/ai-elements/chat/services/message-service.ts) | fetchSessionFiles | HTTP fallback（第二次修复已更新） |
| [ws-event-router.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/agent-service/src/routes/ws-event-router.ts) | AGENT_EVENT_TYPES | file_operation 事件路由（已包含） |
| [backend-agent.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/agent-service/src/core/backend-agent.ts) | sendMessage | finish 事件构建逻辑 |
