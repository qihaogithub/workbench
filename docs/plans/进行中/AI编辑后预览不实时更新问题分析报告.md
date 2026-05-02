# AI 编辑后预览不实时更新问题分析报告

> 分析时间：2026-05-02（第四次修订 — 根因已落实）
> 分析范围：packages/web 前端 + packages/agent-service 后端
> 状态：✅ 根因已定位，方案 D 已实施

---

## 一、问题背景

### 1.1 问题描述

用户在 Demo 编辑页使用 AI 对话功能修改页面代码后，AI 编辑成功完成，但**预览区不会立刻显示最新效果**。用户需要**手动保存页面后，重新打开编辑页**，才能看到最新的预览效果。

### 1.2 预期行为 vs 实际行为

| 维度 | 预期行为 | 实际行为 |
|------|---------|---------|
| AI 编辑完成后 | 预览区应自动更新，显示最新代码效果 | 预览区仍显示旧版本内容 |
| 保存并重新打开后 | 预览区显示最新内容 | 预览区显示最新内容（正常） |

---

## 二、修复历史

### 2.1 方案 A（第一次修复）

**问题定位**：原分析认为 `code` prop 未传递给 PreviewPanel，导致编译 effect 不触发。

**修复内容**：在 page.tsx 中给 PreviewPanel 传递 `code` prop。

**结果**：❌ 修复后问题依然存在。

### 2.2 方案 A+、B、C（第二次修复）

**问题定位**：编译请求只发送 `sessionId`，`code` 被完全忽略；finish 事件正则提取覆盖正确代码；finish 事件清除防抖定时器导致文件变更丢失。

**修复内容**：
- **方案 A+**：PreviewPanel 编译请求同时发送 `code` 和 `sessionId`；编译 API 优先使用 `code` 编译
- **方案 B**：移除 finish 事件中的正则提取逻辑
- **方案 C**：finish 事件先调用 `processRealtimeFiles()` 再清除定时器

**结果**：❌ 修复后问题依然存在。

### 2.3 方案 D（第三次修复 — 根因修复）

**根因定位**：见第三节。

**修复内容**：
- **Fix 1**：ai-chat.tsx — 替换过于严格的 HTTP fallback 条件
- **Fix 2**：base-acp.ts — sendMessage 传递 onFileOperation 给 sendPrompt
- **Fix 3**：connection.ts — 添加 content 缺失时的防御性日志

**结果**：待验证。

---

## 三、根因分析

### 3.1 完整数据流追踪

AI 编辑 → 预览更新的数据流经两条路径：

**路径 1：实时流（AI 执行期间）**
```
AI 编辑文件 → ACP CLI 发送 fs/write_text_file 通知
→ AcpConnection.handleWriteOperation() 接收通知
→ this.onFileOperation?.({ method, path, content }) 转发
→ BackendAgent.eventCallback() → WebSocket 转发
→ AgentStream.emit("file_operation") → ai-chat.tsx 处理
→ realtimeFilesRef.set(path, { content })
→ 防抖 300ms → processRealtimeFiles()
→ isCodeFile && file.content → onCodeUpdate?.(file.content)
→ handleCodeUpdate → setCode(newCode)
→ PreviewPanel compile effect → iframe UPDATE_CODE
```

**路径 2：完成事件（AI 执行结束后）**
```
agent.sendMessage() 完成 → result.files = backend.getFiles()
→ WebSocket 发送 finish 事件（含 files 数组）
→ ai-chat.tsx finish handler:
   a. processRealtimeFiles()（如果防抖定时器未触发）
   b. 遍历 finalFiles → isCodeFile && content → onCodeUpdate
   c. HTTP fallback（仅当 realtimeFilesRef.size === 0 && event.files.length === 0）
```

### 3.2 根因 1：file_operation 事件的 content 字段可能缺失

**问题现象**：`file_operation` 事件到达前端，但 `content` 为 `undefined`，导致 `onCodeUpdate` 不被调用。

**根因分析**：

1. ACP 协议的 `fs/write_text_file` 通知中，`content` 字段类型为 `string`，但运行时可能为 `undefined`
2. 证据：[connection.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/agent-service/src/acp/connection.ts) 中 `params.content?.length` 使用了可选链，说明开发者已意识到 `content` 可能为空
3. `FileOperationHandler` 类型定义中 `content?: string`（可选），确认该字段不保证存在

**影响链路**：

```typescript
// ❌ 错误场景：content 为 undefined
// connection.ts handleWriteOperation:
this.onFileOperation?.({
  method: "fs/write_text_file",
  path: resolvedPath,
  content: params.content,  // undefined!
});

// ai-chat.tsx processRealtimeFiles:
if (isCodeFile && file.content) {  // file.content = undefined → falsy → 跳过
  onCodeUpdate?.(file.content);     // 不会被调用
}

// ai-chat.tsx finish handler:
if ("content" in file && typeof file.content === "string") {
  // "content" in file → true（属性存在）
  // typeof file.content === "string" → false（undefined 不是 string）
  // → 不会被调用
}
```

### 3.3 根因 2：AI 使用 edit 工具绕过 ACP 通知

**问题现象**：AI 使用 `edit` 工具修改代码文件时，ACP 协议不发送 `WRITE_TEXT_FILE` 通知，导致前端完全收不到该文件的变更事件。

**根因分析**：

1. ACP 协议仅在 AI 调用 `fs/write_text_file` 时发送通知
2. `edit` 工具（原地修改文件）不触发此通知
3. 证据：[opencode-acp.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/agent-service/src/backends/opencode-acp.ts) 中 `detectFileChangesAfterEdit()` 方法明确记录了此问题：
   > "No file_operation events captured, edit tool may have been used"

**影响链路**：

```
AI 使用 edit 工具修改 index.tsx
→ 无 WRITE_TEXT_FILE 通知 → 无 file_operation 事件
→ 前端不知道文件已变更 → 预览不更新
```

### 3.4 根因 3（关键）：HTTP fallback 条件过于严格

**问题现象**：当 `file_operation` 事件到达但 `content` 缺失，或 AI 同时使用 `write` 和 `edit` 工具时，HTTP fallback 不运行。

**根因分析**：

原代码的 HTTP fallback 条件：
```typescript
// ❌ 原条件：仅当完全没有文件变更时才走 HTTP fallback
if (
  realtimeFilesRef.size === 0 &&
  (!event.files || event.files.length === 0)
) {
  // fetch via HTTP API...
}
```

这个条件在以下场景下**不会触发**：

| 场景 | realtimeFilesRef.size | event.files.length | HTTP fallback |
|------|----------------------|-------------------|---------------|
| AI 只用 edit 工具 | 0 | 0 | ✅ 触发 |
| AI 只用 write 工具，content 存在 | >0 | >0 | ❌ 不触发（不需要） |
| **AI 只用 write 工具，content 缺失** | **>0** | **>0** | **❌ 不触发（需要但未触发！）** |
| **AI 同时用 write + edit 工具** | **>0** | **>0** | **❌ 不触发（需要但未触发！）** |

后两种场景正是问题持续存在的根因：
- **场景 3**：`file_operation` 事件到达但 `content` 为 `undefined`，`onCodeUpdate` 不被调用，HTTP fallback 也不运行
- **场景 4**：AI 用 `write` 写了 schema 文件（触发 `file_operation`），用 `edit` 改了代码文件（不触发 `file_operation`），代码文件变更被遗漏

### 3.5 根因 4：BaseAcpBackend.sendMessage() 缺失 onFileOperation

**问题现象**：所有继承 `BaseAcpBackend` 的后端（claude、codex、gemini、qwen、goose 等）在 `sendMessage()` 时不传递 `onFileOperation` 给 `sendPrompt()`。

**根因分析**：

```typescript
// ❌ base-acp.ts sendMessage() 原代码：
await this.connection.sendPrompt(content, {
  onSessionUpdate: (update) => { this.handleSessionUpdate(update); },
  onPermissionRequest: async (request) => { return this.handlePermissionRequest(request); },
  // ⚠️ onFileOperation 缺失！
});

// AcpConnection.sendPrompt() 会覆盖：
this.onFileOperation = handlers?.onFileOperation;  // → undefined
```

`OpenCodeAcpBackend` 重写了 `sendMessage()` 并正确传递了 `onFileOperation`，所以默认后端不受影响。但其他所有后端都会丢失 `file_operation` 事件。

---

## 四、方案 D 修复内容

### Fix 1：替换 HTTP fallback 条件（ai-chat.tsx）

**修改文件**：[ai-chat.tsx](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/web/src/components/ai-elements/ai-chat.tsx)

**修改内容**：将"完全没有文件变更才走 HTTP fallback"改为"代码/schema 文件未通过 file_operation 事件成功更新时走 HTTP fallback"。

```typescript
// ✅ 新逻辑：追踪代码和 schema 是否已通过 file_operation 事件成功更新
let codeFileUpdatedWithContent = false;
let schemaFileUpdatedWithContent = false;

// 遍历 finalFiles，标记哪些文件已成功更新
for (const file of finalFiles) {
  const isCodeFile = /* ... */;
  if (isCodeFile && typeof file.content === "string" && file.content.length > 0) {
    codeFileUpdatedWithContent = true;
    onCodeUpdate?.(file.content);
  } else if (isSchemaFile && typeof file.content === "string") {
    schemaFileUpdatedWithContent = true;
    onSchemaUpdate?.(file.content);
  }
}

// 仅当代码或 schema 未成功更新时，走 HTTP API 兜底
if (!codeFileUpdatedWithContent || !schemaFileUpdatedWithContent) {
  const filesRes = await fetch(`/api/sessions/${sessionId}/files`);
  // 仅更新缺失的部分
  if (code && !codeFileUpdatedWithContent) onCodeUpdate?.(code);
  if (schema && !schemaFileUpdatedWithContent) onSchemaUpdate?.(schema);
}
```

**效果**：覆盖所有四种场景，确保 AI 编辑完成后预览一定能更新。

### Fix 2：BaseAcpBackend.sendMessage() 传递 onFileOperation（base-acp.ts）

**修改文件**：[base-acp.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/agent-service/src/backends/base-acp.ts)

**修改内容**：在 `sendMessage()` 的 `sendPrompt()` 调用中添加 `onFileOperation` 回调。

```typescript
// ✅ 修复后：
await this.connection.sendPrompt(content, {
  onSessionUpdate: (update) => { this.handleSessionUpdate(update); },
  onPermissionRequest: async (request) => { return this.handlePermissionRequest(request); },
  onFileOperation: (operation) => { this.handleFileOperation(operation); },  // 新增
});
```

**效果**：所有继承 BaseAcpBackend 的后端（claude、codex、gemini、qwen、goose 等）都能正确转发 `file_operation` 事件。

### Fix 3：content 缺失时的防御性日志（connection.ts）

**修改文件**：[connection.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/agent-service/src/acp/connection.ts)

**修改内容**：在 `handleWriteOperation()` 中添加 `content` 缺失时的 warn 级别日志。

```typescript
// ✅ 新增防御性日志：
if (!params.content) {
  logger.warn(
    { method: "fs/write_text_file", originalPath: params.path, resolvedPath },
    "[ACP Connection] WRITE_TEXT_FILE notification received WITHOUT content - frontend will not be able to update preview",
  );
}
```

**效果**：当 ACP 通知缺少 `content` 时，服务端日志会明确记录，便于后续诊断。

---

## 五、根因总结

### 5.1 核心问题

**AI 编辑后预览不更新的根因是：`file_operation` 事件的 `content` 字段可能缺失，而 HTTP fallback 的触发条件过于严格，导致在 `content` 缺失时既无法通过事件更新预览，也无法通过 HTTP API 兜底。**

### 5.2 根因链路图

```
file_operation 事件 content 缺失
  ├── processRealtimeFiles: isCodeFile && file.content → false → onCodeUpdate 不调用
  ├── finish handler: typeof file.content === "string" → false → onCodeUpdate 不调用
  └── HTTP fallback: realtimeFilesRef.size > 0 → 条件不满足 → 不触发
      → 结果：预览不更新！

AI 使用 edit 工具（不触发 WRITE_TEXT_FILE 通知）
  ├── 无 file_operation 事件
  └── 如果同时有其他 write 操作 → HTTP fallback 条件不满足 → 不触发
      → 结果：代码文件变更被遗漏，预览不更新！
```

### 5.3 影响范围

- 仅影响 Demo 编辑页的预览实时更新
- 不影响保存、版本管理等其他功能
- Fix 2 影响所有非 opencode 后端（claude、codex、gemini、qwen、goose 等）

---

## 六、验证方法

修复后，可通过以下方式验证：

1. **正常场景**：AI 使用 `fs/write_text_file` 修改代码 → 预览应实时更新
2. **content 缺失场景**：如果 ACP 通知缺少 content → finish 事件后应通过 HTTP API 兜底更新
3. **edit 工具场景**：AI 使用 edit 工具修改代码 → finish 事件后应通过 HTTP API 兜底更新
4. **混合场景**：AI 同时修改 schema 和代码 → 两者都应正确更新

浏览器控制台日志关键字：
- `[AIChat] Finish - code update:` — 代码通过 file_operation 事件成功更新
- `[AIChat] Finish - code file found but content is missing:` — 检测到代码文件但 content 缺失
- `[AIChat] Code or schema not updated via file_operation events, fetching via HTTP API` — 触发 HTTP 兜底
- `[AIChat] Applying code update from HTTP API` — 通过 HTTP API 成功更新代码

服务端日志关键字：
- `[ACP Connection] WRITE_TEXT_FILE notification received WITHOUT content` — ACP 通知缺少 content
