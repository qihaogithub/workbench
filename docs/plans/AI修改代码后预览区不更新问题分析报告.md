# 问题分析报告：AI 修改代码后预览区不更新

## 一、问题描述

**现象**：在编辑页的 AI 会话区，让 AI 修改代码后，预览区（PreviewPanel）不会自动更新显示最新的代码效果。

**具体案例**：AI 声称修改了按钮颜色（如 `bg-blue-600`），但预览区依然显示原来的颜色

**影响范围**：所有通过 AI 对话修改代码的场景

---

## 二、问题现状（2025-04-12 最新）

### 2.1 当前状态

**问题仍未解决**。经过多次修复尝试，预览区仍然无法正确显示 Tailwind CSS 样式。

### 2.2 已验证的代码链路

经过代码分析，以下链路已经正确实现：

| 环节 | 文件路径 | 状态 | 说明 |
|------|---------|------|------|
| 1. AcpConnection.sendPrompt | `packages/agent-service/src/acp/connection.ts:578,587` | ✅ 已实现 | 正确接收和设置 `onFileOperation` |
| 2. OpenCodeAcpBackend.sendMessage | `packages/agent-service/src/backends/opencode-acp.ts:161-163` | ✅ 已实现 | 正确传递 `onFileOperation` 回调 |
| 3. AcpConnection.handleWriteOperation | `packages/agent-service/src/acp/connection.ts:321-329` | ✅ 已实现 | 正确调用 `this.onFileOperation?.()` |
| 4. handleNotification 分发 | `packages/agent-service/src/acp/connection.ts:261-264` | ✅ 已实现 | 正确分发 `WRITE_TEXT_FILE` 通知 |
| 5. OpenCodeAcpBackend.handleFileOperation | `packages/agent-service/src/backends/opencode-acp.ts:109-135` | ✅ 已实现 | 正确发出 `file_operation` 事件 |
| 6. WebSocket 路由监听 | `packages/agent-service/src/routes/websocket.ts:435` | ✅ 已实现 | `agent.on("file_operation", eventHandler)` |
| 7. WebSocket 事件转发 | `packages/agent-service/src/routes/websocket.ts:418-424` | ✅ 已实现 | 正确转发 `file_operation` 事件 |
| 8. 前端监听 file_operation | `packages/web/src/components/ai-elements/ai-chat.tsx:499-519` | ✅ 已实现 | 正确监听并处理文件变更 |
| 9. 文件路径匹配 | `packages/web/src/components/ai-elements/ai-chat.tsx:478-483` | ⚠️ 需验证 | 匹配 `index.tsx`、`Demo.tsx` 等 |
| 10. handleCodeUpdate | `packages/web/src/app/demo/[id]/edit/page.tsx:268-285` | ✅ 已实现 | 正确更新 `code` 状态 |
| 11. PreviewPanel 接收 code | `packages/web/components/demo/PreviewPanel.tsx:45-52` | ✅ 已实现 | 正确接收 `code` prop |
| 12. SandpackProvider key | `packages/web/components/demo/PreviewPanel.tsx:127` | ✅ 已实现 | 使用 `key={code}` 触发重新渲染 |

### 2.3 待验证的问题点

**🔴 关键问题：需要通过实际运行验证以下环节**

1. **Agent CLI 是否正确发送 `WRITE_TEXT_FILE` 通知？**
   - 需要在 `AcpConnection.handleNotification()` 添加日志
   - 检查 `ACP_METHODS.WRITE_TEXT_FILE` 的值是否正确

2. **WebSocket 连接是否正常？**
   - 需要检查浏览器控制台是否有 WebSocket 连接错误
   - 需要检查 `stream.on("file_operation")` 是否被触发

3. **文件路径是否匹配？**
   - AI 修改的文件路径可能是完整路径（如 `e:\重要文件\...\index.tsx`）
   - 需要检查 `normalizedPath.endsWith("index.tsx")` 是否能匹配

4. **Tailwind CSS 在 Sandpack 中是否生效？**
   - 当前使用 `externalResources={["https://cdn.tailwindcss.com#tailwind.js"]}`
   - 需要验证 CDN 是否正确加载

---

## 三、相关代码路径清单

### 3.1 后端代码（agent-service）

| 文件 | 路径 | 关键行号 | 作用 |
|------|------|---------|------|
| ACP 连接 | `packages/agent-service/src/acp/connection.ts` | 89, 314-329, 578-587 | 处理 ACP 协议通信，分发文件操作通知 |
| OpenCode ACP 后端 | `packages/agent-service/src/backends/opencode-acp.ts` | 109-135, 154-164, 161-163 | 处理文件操作事件，发出 `file_operation` 事件 |
| WebSocket 路由 | `packages/agent-service/src/routes/websocket.ts` | 259-277, 418-424, 435, 449 | 监听并转发 `file_operation` 事件到前端 |
| 核心类型 | `packages/agent-service/src/core/types.ts` | 170-178, 188 | `FileOperationEvent` 类型定义 |
| ACP 方法常量 | `packages/agent-service/src/acp/types.ts` | - | `ACP_METHODS.WRITE_TEXT_FILE` 定义 |

### 3.2 前端代码（web）

| 文件 | 路径 | 关键行号 | 作用 |
|------|------|---------|------|
| AI 聊天组件 | `packages/web/src/components/ai-elements/ai-chat.tsx` | 454-519 | 监听 `file_operation` 事件，提取代码更新 |
| 编辑页面 | `packages/web/src/app/demo/[id]/edit/page.tsx` | 268-285, 469-473 | 处理代码更新，传递给 PreviewPanel |
| 预览面板 | `packages/web/components/demo/PreviewPanel.tsx` | 全文件 | Sandpack 预览渲染，Tailwind CSS 配置 |
| Agent 客户端 | `packages/agent-client/src/client.ts` | - | WebSocket 流式连接管理 |
| Stream 类型 | `packages/agent-client/src/types.ts` | - | `StreamEvent` 类型定义 |

---

## 四、数据流图

```
[Agent CLI 子进程]
    │
    │ 执行 fs/write_text_file
    ▼
[AcpConnection.handleNotification()]
    │ 文件：packages/agent-service/src/acp/connection.ts:232-270
    │ 检查点：notification.method === ACP_METHODS.WRITE_TEXT_FILE ?
    ▼
[AcpConnection.handleWriteOperation()]
    │ 文件：packages/agent-service/src/acp/connection.ts:321-329
    │ 检查点：this.onFileOperation?.() 是否被调用？
    ▼
[OpenCodeAcpBackend.handleFileOperation()]
    │ 文件：packages/agent-service/src/backends/opencode-acp.ts:109-135
    │ 检查点：this.eventCallback?.() 是否被调用？
    ▼
[Agent.emit("file_operation")]
    │ 文件：packages/agent-service/src/core/agent.ts
    ▼
[WebSocket eventHandler]
    │ 文件：packages/agent-service/src/routes/websocket.ts:418-424
    │ 检查点：sendMessage() 是否被调用？
    ▼
[WebSocket 连接]
    │ 
    ▼
[前端 stream.on("file_operation")]
    │ 文件：packages/web/src/components/ai-elements/ai-chat.tsx:499-519
    │ 检查点：event.fileOperation 是否存在？
    ▼
[processRealtimeFiles()]
    │ 文件：packages/web/src/components/ai-elements/ai-chat.tsx:462-497
    │ 检查点：文件路径是否匹配？onCodeUpdate?.() 是否被调用？
    ▼
[handleCodeUpdate()]
    │ 文件：packages/web/src/app/demo/[id]/edit/page.tsx:268-285
    │ 检查点：setCode() 是否被调用？
    ▼
[PreviewPanel code prop]
    │ 文件：packages/web/components/demo/PreviewPanel.tsx:45
    │ 检查点：code 是否更新？
    ▼
[SandpackProvider key={code}]
    │ 文件：packages/web/components/demo/PreviewPanel.tsx:127
    │ 检查点：Sandpack 是否重新渲染？
    ▼
[预览区显示]
```

---

## 五、调试建议

### 5.1 后端调试

在以下位置添加日志：

```typescript
// packages/agent-service/src/acp/connection.ts:261
case ACP_METHODS.WRITE_TEXT_FILE:
  console.log('[ACP] WRITE_TEXT_FILE notification received:', notification.params);
  if (notification.params) {
    this.handleWriteOperation(notification.params as { path: string; content: string; sessionId?: string });
  }
  break;

// packages/agent-service/src/acp/connection.ts:321
private async handleWriteOperation(params: { path: string; content: string; sessionId?: string }): Promise<void> {
  console.log('[ACP] handleWriteOperation called:', params.path);
  const resolvedPath = this.resolveWorkspacePath(params.path);
  console.log('[ACP] resolvedPath:', resolvedPath);
  this.onFileOperation?.({
    method: 'fs/write_text_file',
    path: resolvedPath,
    content: params.content,
    sessionId: params.sessionId || '',
  });
}

// packages/agent-service/src/backends/opencode-acp.ts:109
private handleFileOperation(operation: {
  method: string;
  path: string;
  content?: string;
  sessionId: string;
}): void {
  console.log('[OpenCodeAcpBackend] handleFileOperation:', operation);
  // ...
}
```

### 5.2 前端调试

在浏览器控制台检查：

```javascript
// 检查 WebSocket 连接状态
// 应该看到 WebSocket URL 日志

// 检查 file_operation 事件
// 应该看到 [AIChat] file_operation event 日志

// 检查代码更新
// 应该看到 [AIChat] Code update detected 日志
// 应该看到 [DemoEdit] handleCodeUpdate called 日志
// 应该看到 [PreviewPanel] code prop changed 日志
```

### 5.3 Sandpack 调试

检查 Sandpack iframe 中是否加载了 Tailwind CDN：

```javascript
// 在浏览器开发者工具中，选择 Sandpack iframe
// 检查 <head> 中是否有 <script src="https://cdn.tailwindcss.com">
// 检查 window.tailwind 是否存在
```

---

## 六、可能的根本原因

### 6.1 假设 1：Agent CLI 没有发送 WRITE_TEXT_FILE 通知

**验证方法**：在 `AcpConnection.handleNotification()` 添加日志

**如果确认**：需要检查 Agent CLI（如 opencode、claude）是否正确实现了 ACP 协议

### 6.2 假设 2：文件路径不匹配

**验证方法**：打印 `event.fileOperation.path` 的完整值

**如果确认**：需要修改 `ai-chat.tsx` 中的路径匹配逻辑

### 6.3 假设 3：Tailwind CDN 在 Sandpack 中无法工作

**验证方法**：在 Sandpack iframe 中检查 `window.tailwind` 是否存在

**如果确认**：需要寻找替代方案，如：
- 使用内联样式
- 使用预编译的 Tailwind CSS
- 使用其他 CSS-in-JS 方案

### 6.4 假设 4：React 状态更新问题

**验证方法**：检查 `handleCodeUpdate` 是否真的被调用，`setCode` 是否触发重新渲染

**如果确认**：需要检查 React 状态管理逻辑

---

## 七、下一步行动

1. **🔴 立即执行**：在关键位置添加调试日志，运行实际测试
2. **验证数据流**：确认每个环节是否正常工作
3. **定位断裂点**：找到数据流中断的位置
4. **针对性修复**：根据断裂点进行修复

---

**报告更新时间**：2025-04-12
**更新人**：AI Assistant
**更新内容**：
1. 详细列出所有相关代码路径和行号
2. 绘制完整数据流图
3. 提供调试建议
4. 列出可能的根本原因假设
