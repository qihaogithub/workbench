# AI 编辑后预览不实时更新问题分析报告（第二次）

> 分析时间：2026-05-05
> 分析范围：packages/web 前端 + packages/agent-service 后端
> 状态：✅ 根因已定位

---

## 一、问题背景

### 1.1 问题描述

此前已修复过"AI 编辑后预览不实时更新"问题（方案 D），但问题再次出现。用户在 Demo 编辑页使用 AI 对话功能修改页面代码后，AI 编辑成功完成，但**预览区不会立刻显示最新效果**。用户需要**手动保存页面后，重新打开编辑页**，才能看到最新的预览效果。

### 1.2 预期行为 vs 实际行为

| 维度 | 预期行为 | 实际行为 |
|------|---------|---------|
| AI 编辑完成后 | 预览区应自动更新，显示最新代码效果 | 预览区仍显示旧版本内容 |
| 保存并重新打开后 | 预览区显示最新内容 | 预览区显示最新内容（正常） |

---

## 二、历史修复回顾

### 2.1 方案 D 修复内容（已实施）

| Fix | 文件 | 内容 | 当前状态 |
|-----|------|------|---------|
| Fix 1 | ai-chat.tsx → use-chat-stream.ts | 替换 HTTP fallback 条件，使用 codeUpdated/schemaUpdated 标记 | ✅ 代码中存在 |
| Fix 2 | base-acp.ts | sendMessage 传递 onFileOperation 给 sendPrompt | ✅ 代码中存在 |
| Fix 3 | connection.ts | content 缺失时的防御性日志 | ✅ 代码中存在 |

**结论**：方案 D 的三处修复在当前代码中均存在，但问题仍然复现。说明存在方案 D 未覆盖的新根因。

---

## 三、根因分析

### 3.1 完整数据流追踪

AI 编辑 → 预览更新有两条路径：

**路径 1：实时流（AI 执行期间）**
```
AI 编辑文件 → ACP CLI 发送 fs/write_text_file 通知
→ AcpConnection.handleWriteOperation() 接收通知
→ onFileOperation 回调 → WebSocket 转发 file_operation 事件
→ use-chat-stream.ts onFileOperation handler:
  realtimeFilesRef.set(path, { content })
  防抖 300ms → processRealtimeFiles()
  → extractCodeAndSchemaUpdates → typeof file.content === "string" → onCodeUpdate
```

**路径 2：完成事件（AI 执行结束后）**
```
agent.sendMessage() 完成 → result.files = backend.getFiles()
→ WebSocket 发送 finish 事件（含 files 数组）
→ use-chat-stream.ts onFinish handler:
  a. 刷出防抖定时器 → processRealtimeFiles()
  b. 确定 finalFiles（优先 result.files，回退 realtimeFilesRef）
  c. if (finalFiles.length > 0):
     extractCodeAndSchemaUpdates → codeUpdated/schemaUpdated
     if (!codeUpdated || !schemaUpdated):
       fetchSessionFiles(sessionId) → HTTP fallback
       → onCodeUpdate / onSchemaUpdate
```

### 3.2 根因 1（核心）：fetchSessionFiles 返回格式与 API 实际返回不匹配

**问题现象**：HTTP fallback 触发后，`fetchSessionFiles` 返回的 `code` 和 `schema` 均为 `undefined`，导致 `onCodeUpdate` 不被调用。

**根因分析**：

多页面架构迁移后，API 端点 `GET /api/sessions/${sessionId}/files` 的返回格式从单页面格式变更为多页面格式，但 `fetchSessionFiles` 函数未同步更新。

**证据 A**：[message-service.ts:46-61](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/web/src/components/ai-elements/chat/services/message-service.ts#L46-L61) — `fetchSessionFiles` 的返回类型声明

```typescript
// ❌ 旧的单页面格式
export async function fetchSessionFiles(
  sessionId: string,
): Promise<{ code?: string; schema?: string } | null> {
  const filesRes = await fetch(`/api/sessions/${sessionId}/files`);
  if (filesRes.ok) {
    const filesData = await filesRes.json();
    if (filesData.success && filesData.data) {
      return filesData.data;  // 直接返回 data，期望顶层有 code 和 schema
    }
  }
  return null;
}
```

**证据 B**：[route.ts:60-65](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/web/src/app/api/sessions/[sessionId]/files/route.ts#L60-L65) — API 实际返回格式

```typescript
// ✅ 实际返回的是 MultiDemoFiles 格式
return NextResponse.json(
  createApiSuccess({
    ...multi,       // { demos: { [demoId]: { code, schema } }, projectConfigSchema? }
    demoPages,
    workspacePath,
  }),
);
```

**证据 C**：[shared/src/index.ts:22-25](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/shared/src/index.ts#L22-L25) — MultiDemoFiles 类型定义

```typescript
export interface DemoFiles {
  code: string;
  schema: string;
}

export interface MultiDemoFiles {
  demos: Record<string, DemoFiles>;  // code/schema 嵌套在 demos 对象内
  projectConfigSchema?: string;
}
```

**影响链路**：

```
API 实际返回: { demos: { "page1": { code: "...", schema: "..." } }, demoPages: [...], workspacePath: "..." }
fetchSessionFiles 返回: filesData.data = { demos: {...}, demoPages: [...], workspacePath: "..." }
解构: const { code, schema } = filesData → code = undefined, schema = undefined
→ onCodeUpdate?.(code) 不调用（code 为 undefined，falsy）
→ 预览不更新！
```

### 3.3 根因 2：finalFiles 为空时 HTTP fallback 不触发

**问题现象**：当 AI 使用 edit 工具（不触发 `WRITE_TEXT_FILE` 通知）时，`finalFiles` 为空数组，整个 HTTP fallback 分支不执行。

**根因分析**：

[use-chat-stream.ts:306-351](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/web/src/components/ai-elements/chat/hooks/use-chat-stream.ts#L306-L351) — onFinish 中的 HTTP fallback 逻辑被包裹在 `if (finalFiles.length > 0)` 内：

```typescript
const finalFiles: FileChangeEntry[] =
  result.files && result.files.length > 0
    ? result.files
    : Array.from(realtimeFilesRef.entries()).map(...);

// ❌ 如果 finalFiles 为空，整个分支不执行
if (finalFiles.length > 0) {
  // ... extractCodeAndSchemaUpdates ...
  // HTTP fallback 在这里
  if (!codeUpdated || !schemaUpdated) {
    const filesData = await fetchSessionFiles(sessionId);
    // ...
  }
}
```

**影响场景**：

| 场景 | result.files | realtimeFilesRef | finalFiles | HTTP fallback |
|------|-------------|-----------------|------------|---------------|
| AI 只用 write 工具，content 存在 | 有条目 | 有条目 | 有条目 | ✅ 不需要 |
| AI 只用 write 工具，content 缺失 | 有条目 | 有条目 | 有条目 | ✅ 触发但 fetchSessionFiles 返回 undefined |
| AI 只用 edit 工具 | 空/undefined | 空 | **空数组** | **❌ 不触发** |
| AI 用 write + edit 混合 | 有条目 | 有条目 | 有条目 | ✅ 触发但 fetchSessionFiles 返回 undefined |

### 3.4 根因链路图

```
场景 A：file_operation 事件 content 缺失
  → extractCodeAndSchemaUpdates: typeof file.content === "string" → false → codeUpdated = false
  → HTTP fallback 触发 → fetchSessionFiles → code = undefined → onCodeUpdate 不调用
  → 预览不更新！

场景 B：AI 使用 edit 工具（无 file_operation 事件）
  → finalFiles 为空 → if (finalFiles.length > 0) 不执行 → HTTP fallback 不触发
  → 预览不更新！

场景 C：AI 使用 write 工具，content 正常传递
  → extractCodeAndSchemaUpdates: codeUpdated = true → onCodeUpdate 调用
  → 预览正常更新 ✅（此场景不受影响）
```

**核心结论**：方案 D 的 HTTP fallback 机制因多页面架构迁移而完全失效。`fetchSessionFiles` 按旧格式解析 API 返回值，始终拿到 `undefined` 的 code/schema。同时，当 finalFiles 为空时，HTTP fallback 甚至不会触发。

---

## 四、解决方案

### Fix 1：修复 fetchSessionFiles 返回格式（message-service.ts）

修改 `fetchSessionFiles` 函数，接受 `demoId` 参数，从 API 返回的 `MultiDemoFiles` 格式中正确提取指定页面的 code/schema。

```typescript
// ✅ 修复后：
export async function fetchSessionFiles(
  sessionId: string,
  demoId?: string,
): Promise<{ code?: string; schema?: string } | null> {
  try {
    const filesRes = await fetch(`/api/sessions/${sessionId}/files`);
    if (filesRes.ok) {
      const filesData = await filesRes.json();
      if (filesData.success && filesData.data) {
        const data = filesData.data;
        // 多页面格式：从 demos 对象中提取
        if (data.demos && typeof data.demos === "object") {
          const demoIds = Object.keys(data.demos);
          const targetId = demoId || demoIds[0];
          if (targetId && data.demos[targetId]) {
            return {
              code: data.demos[targetId].code,
              schema: data.demos[targetId].schema,
            };
          }
        }
        // 兼容旧的单页面格式
        if (data.code || data.schema) {
          return { code: data.code, schema: data.schema };
        }
      }
    }
  } catch (error) {
    console.error("[MessageService] Error fetching files via HTTP:", error);
  }
  return null;
}
```

### Fix 2：将 HTTP fallback 移出 finalFiles 条件块（use-chat-stream.ts）

确保即使 `finalFiles` 为空，也能触发 HTTP fallback 兜底。

```typescript
// ✅ 修复后：
if (finalFiles.length > 0) {
  onFilesChange?.(finalFiles);
  extractCodeAndSchemaUpdates(finalFiles, { onCodeUpdate, onSchemaUpdate });
}

// HTTP fallback 始终检查，不受 finalFiles 是否为空的影响
const { codeUpdated, schemaUpdated } = finalFiles.length > 0
  ? extractCodeAndSchemaUpdates(finalFiles, { onCodeUpdate, onSchemaUpdate })
  : { codeUpdated: false, schemaUpdated: false };

if (!codeUpdated || !schemaUpdated) {
  const filesData = await fetchSessionFiles(sessionId, activeDemoId);
  if (filesData) {
    const { code, schema } = filesData;
    if (code && !codeUpdated) onCodeUpdate?.(code);
    if (schema && !schemaUpdated) onSchemaUpdate?.(schema);
    // ... 通知 onFilesChange
  }
}
```

### Fix 3：传递 demoId 到 useChatStream（ai-chat.tsx + use-chat-stream.ts）

让 `useChatStream` 能获取到当前的 `activeDemoId`，以便 `fetchSessionFiles` 能正确提取对应页面的文件。

---

## 五、根因总结

### 5.1 核心问题

**AI 编辑后预览不更新的根因是：多页面架构迁移后，`fetchSessionFiles` 函数的返回类型声明与 API 实际返回格式不匹配。API 返回的是 `MultiDemoFiles` 格式（code/schema 嵌套在 demos 对象内），但 `fetchSessionFiles` 仍按旧的单页面格式（顶层 code/schema）解析，导致 HTTP fallback 始终获取到 undefined 的 code 和 schema，兜底机制完全失效。**

### 5.2 次要问题

**当 AI 使用 edit 工具且无 file_operation 事件时，finalFiles 为空数组，HTTP fallback 分支不执行，连失效的兜底机制都无法触发。**

### 5.3 影响范围

- 仅影响 Demo 编辑页的预览实时更新
- 不影响保存、版本管理等其他功能
- 影响所有 AI 编辑场景（write 工具 content 缺失 + edit 工具无通知）

---

## 六、验证方法

修复后，可通过以下方式验证：

1. **正常场景**：AI 使用 `fs/write_text_file` 修改代码且 content 正常 → 预览应实时更新
2. **content 缺失场景**：ACP 通知缺少 content → finish 事件后应通过 HTTP API 兜底更新
3. **edit 工具场景**：AI 使用 edit 工具修改代码 → finish 事件后应通过 HTTP API 兜底更新
4. **混合场景**：AI 同时修改 schema 和代码 → 两者都应正确更新

浏览器控制台日志关键字：
- `[MessageService] Error fetching files via HTTP` — fetchSessionFiles 调用失败
- `fetchSessionFiles` 返回值中 `code`/`schema` 是否为有效字符串

---

## 七、相关代码路径

| 文件 | 关键位置 | 说明 |
|------|---------|------|
| [message-service.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/web/src/components/ai-elements/chat/services/message-service.ts#L46-L61) | L46-61 | fetchSessionFiles 函数（返回格式不匹配） |
| [use-chat-stream.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/web/src/components/ai-elements/chat/hooks/use-chat-stream.ts#L306-L351) | L306-351 | onFinish handler（HTTP fallback 逻辑） |
| [route.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/web/src/app/api/sessions/[sessionId]/files/route.ts#L60-L65) | L60-65 | API 返回 MultiDemoFiles 格式 |
| [route.ts (demoId)](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/web/src/app/api/sessions/[sessionId]/files/[demoId]/route.ts#L20-L68) | L20-68 | 单页面文件 API（返回 DemoFiles 格式） |
| [chat-file-utils.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/web/src/components/ai-elements/chat/utils/chat-file-utils.ts#L36-L63) | L36-63 | extractCodeAndSchemaUpdates 函数 |
| [shared/src/index.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/shared/src/index.ts#L22-L25) | L22-25 | MultiDemoFiles / DemoFiles 类型定义 |
