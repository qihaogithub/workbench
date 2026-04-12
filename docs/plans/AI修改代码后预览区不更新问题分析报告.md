# 问题分析报告：AI 修改代码后预览区不更新

## 一、问题描述

**现象**：在编辑页的 AI 会话区，让 AI 修改代码后，预览区（PreviewPanel）不会自动更新显示最新的代码效果。

**具体案例**：AI 声称修改了按钮颜色，但预览区依然显示原来的颜色

**影响范围**：所有通过 AI 对话修改代码的场景

---

## 二、问题根因分析

### 2.1 历史问题（已修复）

#### 核心问题：`file_operation` 事件从未被推送到前端

**问题状态**：✅ **已修复**

经过深入分析代码，发现 **数据流在 WebSocket 路由层断裂**，导致前端永远收不到文件变更通知。该问题已在代码中修复。

#### 修复内容验证

**1. OpenCodeAcpBackend 正确发出 file_operation 事件**

文件：`packages/agent-service/src/backends/opencode-acp.ts` 第 109-135 行

```typescript
private handleFileOperation(operation: {
  method: string;
  path: string;
  content?: string;
  sessionId: string;
}): void {
  if (operation.method === "fs/write_text_file") {
    this.files.push({
      path: operation.path,
      action: "modified",
      content: operation.content,
    });

    // ✅ 发出正确的 file_operation 事件
    if (this.eventCallback) {
      this.eventCallback({
        type: "file_operation",
        sessionId: this.config.sessionId,
        fileOperation: {
          method: operation.method,
          path: operation.path,
          content: operation.content,
        },
      });
    }
  }
}
```

**2. WebSocket 路由监听 file_operation 事件**

文件：`packages/agent-service/src/routes/websocket.ts`

- 第 418-424 行：正确处理 `file_operation` 事件类型
- 第 435 行：`agent.on("file_operation", eventHandler)` 已添加

**3. 类型定义已更新**

文件：`packages/agent-service/src/core/types.ts`

- 第 170-178 行：`FileOperationEvent` 接口已定义
- 第 188 行：`AgentEvent` 联合类型已包含 `FileOperationEvent`

**4. 前端正确处理 file_operation 事件**

文件：`packages/web/src/components/ai-elements/ai-chat.tsx` 第 456-480 行

```typescript
stream.on("file_operation", (event: StreamEvent) => {
  if (event.fileOperation) {
    const { method, path, content } = event.fileOperation;

    // 仅处理文件写入操作
    if (method === "fs/write_text_file" && path) {
      // 更新累计文件变更（去重）
      realtimeFilesRef.set(path, {
        action: "modified",
        content,
      });

      // 防抖：300ms 后批量通知
      if (fileUpdateTimer) {
        clearTimeout(fileUpdateTimer);
      }

      fileUpdateTimer = setTimeout(() => {
        processRealtimeFiles();
        fileUpdateTimer = null;
      }, 300);
    }
  }
});
```

---

## 三、当前问题分析（2025-04-12）

### 3.1 问题现状

用户反馈：AI 声称修改了按钮颜色，但预览区未生效。

**浏览器控制台日志**：
```
[AIChat] Tool Call Event: {type: tool_call, title: read}
[AIChat] Tool Call Event: {type: tool_call, title: read}
[AIChat] Tool Call Event: {type: tool_call, title: edit}
```

**关键发现**：没有看到 `[AIChat] Code update detected: ...` 日志，也没有 `[PreviewPanel] code prop changed, length: ...` 日志。

### 3.2 🔴 新发现的问题根因

经过深入代码分析，发现 **问题的根本原因**：

**`AcpConnection.sendPrompt()` 方法没有使用 `this.onFileOperation`**

文件：`packages/agent-service/src/acp/connection.ts` 第 573-599 行

```typescript
async sendPrompt(
  prompt: string | Array<{ type: 'text' | 'image'; text?: string; data?: string; mimeType?: string }>,
  handlers?: {
    onSessionUpdate?: SessionUpdateHandler;
    onPermissionRequest?: PermissionHandler;
  },
): Promise<AcpPromptResult> {
  if (!this.sessionId) {
    throw new Error('No active session');
  }

  this.onSessionUpdate = handlers?.onSessionUpdate;
  this.onPermissionRequest = handlers?.onPermissionRequest;
  // ❌ 缺少：this.onFileOperation = handlers?.onFileOperation;

  const promptArray = typeof prompt === 'string' ? [{ type: 'text' as const, text: prompt }] : prompt;

  this.startPromptKeepalive();
  try {
    const result = await this.sendRequest<AcpPromptResult>(ACP_METHODS.SESSION_PROMPT, {
      sessionId: this.sessionId,
      prompt: promptArray,
    });
    return result;
  } finally {
    this.stopPromptKeepalive();
  }
}
```

**问题分析**：

1. `AcpConnection` 类定义了 `public onFileOperation?: FileOperationHandler`（第 89 行）
2. `handleWriteOperation()` 方法正确调用了 `this.onFileOperation?.()`（第 321-329 行）
3. 但是 `sendPrompt()` 方法**没有接收 `onFileOperation` 参数**，也**没有设置 `this.onFileOperation`**
4. 这导致当 AI 执行文件写入操作时，`handleWriteOperation` 被调用，但 `this.onFileOperation` 是 `undefined`，事件无法传递出去

**完整数据流断裂点**：

```
[Agent CLI 子进程写文件]
    │
    ▼
[AcpConnection.handleNotification()]
    │
    ▼
[AcpConnection.handleWriteOperation()]
    │
    ├─ 调用 this.onFileOperation?.() 
    │
    └─ ❌ this.onFileOperation 是 undefined！
         因为 sendPrompt() 没有设置它
```

### 3.3 为什么之前的问题分析有误

之前的分析认为 `OpenCodeAcpBackend` 已经修复了 `file_operation` 事件推送，但实际上：

1. `OpenCodeAcpBackend.start()` 设置了 `this.connection.onFileOperation = ...` ✅
2. 但 `OpenCodeAcpBackend.sendMessage()` 调用的是 `this.connection.sendPrompt()` 
3. `sendPrompt()` 内部**重置了** `this.onSessionUpdate` 和 `this.onPermissionRequest`，但**没有处理 `onFileOperation`**
4. 更糟糕的是，`sendPrompt` 的 `handlers` 参数类型定义中根本没有 `onFileOperation`！

---

## 四、解决方案

### 方案 1：修复 `AcpConnection.sendPrompt()` 方法

**文件**：`packages/agent-service/src/acp/connection.ts`

#### 步骤 1：修改 `sendPrompt` 方法的参数类型

```typescript
// 修改前（第 573-577 行）
async sendPrompt(
  prompt: string | Array<{ type: 'text' | 'image'; text?: string; data?: string; mimeType?: string }>,
  handlers?: {
    onSessionUpdate?: SessionUpdateHandler;
    onPermissionRequest?: PermissionHandler;
  },
): Promise<AcpPromptResult> {

// 修改后
async sendPrompt(
  prompt: string | Array<{ type: 'text' | 'image'; text?: string; data?: string; mimeType?: string }>,
  handlers?: {
    onSessionUpdate?: SessionUpdateHandler;
    onPermissionRequest?: PermissionHandler;
    onFileOperation?: FileOperationHandler;  // ← 添加此行
  },
): Promise<AcpPromptResult> {
```

#### 步骤 2：在方法内部设置 `this.onFileOperation`

```typescript
// 修改前（第 583-584 行）
this.onSessionUpdate = handlers?.onSessionUpdate;
this.onPermissionRequest = handlers?.onPermissionRequest;

// 修改后
this.onSessionUpdate = handlers?.onSessionUpdate;
this.onPermissionRequest = handlers?.onPermissionRequest;
this.onFileOperation = handlers?.onFileOperation;  // ← 添加此行
```

### 方案 2：修改 `OpenCodeAcpBackend.sendMessage()` 传递 `onFileOperation`

**文件**：`packages/agent-service/src/backends/opencode-acp.ts`

```typescript
// 修改前（第 153-161 行）
await this.connection.sendPrompt(content, {
  onSessionUpdate: (update: AcpSessionUpdate) => {
    this.handleSessionUpdate(update);
  },
  onPermissionRequest: async (request: AcpPermissionRequest) => {
    return this.handlePermissionRequest(request);
  },
});

// 修改后
await this.connection.sendPrompt(content, {
  onSessionUpdate: (update: AcpSessionUpdate) => {
    this.handleSessionUpdate(update);
  },
  onPermissionRequest: async (request: AcpPermissionRequest) => {
    return this.handlePermissionRequest(request);
  },
  onFileOperation: (operation) => {  // ← 添加此回调
    this.handleFileOperation(operation);
  },
});
```

---

## 五、总结

| 问题 | 状态 | 严重程度 | 备注 |
|------|------|---------|------|
| **file_operation 事件未推送** | ✅ 已修复 | 极高 | WebSocket 路由层已修复 |
| SandpackProvider 缺少 key 属性 | ✅ 已修复 | 极高 | PreviewPanel.tsx 第 144 行 |
| 文件路径匹配不精确 | ✅ 已修复 | 中 | ai-chat.tsx 使用 endsWith |
| 防抖时间过短 | ✅ 已修复 | 低 | 从 100ms 增加到 300ms |
| **🔴 AcpConnection.sendPrompt 未设置 onFileOperation** | ❌ **待修复** | **极高** | **根本原因** |
| OpenCodeAcpBackend.sendMessage 未传递 onFileOperation | ❌ **待修复** | 高 | 需同步修改 |

**根本原因**：

`AcpConnection.sendPrompt()` 方法没有设置 `this.onFileOperation`，导致 `handleWriteOperation()` 被调用时，`this.onFileOperation` 是 `undefined`，文件操作事件无法传递到 `OpenCodeAcpBackend`。

**下一步行动**：

1. 🔴 **立即实施方案 1**（修复 `AcpConnection.sendPrompt()` 方法）
2. 🔴 **立即实施方案 2**（修改 `OpenCodeAcpBackend.sendMessage()` 传递 `onFileOperation`）
3. 验证修复后 `file_operation` 事件能正常触发

---

## 六、相关文件清单

| 文件 | 路径 | 作用 |
|------|------|------|
| ACP 连接 | `packages/agent-service/src/acp/connection.ts` | **需要修改：sendPrompt 方法** |
| OpenCode ACP 后端 | `packages/agent-service/src/backends/opencode-acp.ts` | **需要修改：sendMessage 方法** |
| WebSocket 路由 | `packages/agent-service/src/routes/websocket.ts` | 监听 file_operation 事件 ✅ |
| 核心类型 | `packages/agent-service/src/core/types.ts` | FileOperationEvent 类型 ✅ |
| AI 聊天组件 | `packages/web/src/components/ai-elements/ai-chat.tsx` | 监听文件变更事件 ✅ |
| 预览面板 | `packages/web/components/demo/PreviewPanel.tsx` | Sandpack 预览渲染 ✅ |

---

**报告更新时间**：2025-04-12
**更新人**：AI Assistant
**更新内容**：
1. 确认真正的根本原因：`AcpConnection.sendPrompt()` 没有设置 `onFileOperation`
2. 提供详细的修复方案