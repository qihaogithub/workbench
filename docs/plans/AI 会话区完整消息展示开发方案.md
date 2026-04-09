# AI 会话区完整消息展示开发方案

## 一、背景与目标

当前 Web 端 AI 会话区仅能展示纯文本内容，无法完整展示 Agent 通过 ACP 协议输出的所有消息类型。本方案旨在实现完整的消息类型支持，让用户能够看到 Agent 的全部输出，包括思考过程、工具调用、权限请求等。

---

## 二、ACP 协议支持的消息类型

> **重要说明**：经代码审查确认，`agent-service` 层（`packages/agent-service/src/routes/websocket.ts`）已完整实现了 ACP 协议到 WebSocket 事件的转换。当前问题在于**前端消费端（`ai-chat.tsx`）未监听这些已存在的事件**。

### 2.1 核心通知类型（session/update）

| 类型 | 用途 | agent-service 状态 | 前端消费状态 |
|------|------|-------------------|-------------|
| `agent_message_chunk` | Agent 回复的文本块 | ✅ 已实现 | ✅ 已消费（映射为 `stream` 事件） |
| `agent_thought_chunk` | Agent 的思考/推理过程 | ✅ 已实现 | ❌ 未消费（映射为 `thought` 事件） |
| `tool_call` | 工具调用开始（文件读写、命令执行等） | ✅ 已实现 | ❌ 未消费 |
| `tool_call_update` | 工具调用状态更新（completed/failed） | ✅ 已实现 | ❌ 未消费 |
| `plan` | Agent 计划更新 | ⚠️ 未映射 | ❌ 未消费 |
| `available_commands_update` | 可用命令更新 | ⚠️ 未映射 | ❌ 未消费 |
| `user_message_chunk` | 用户消息块 | ⚠️ 未映射 | ❌ 未消费 |
| `config_option_update` | 配置选项更新 | ⏭️ 已忽略 | ⏭️ 无需消费 |
| `usage_update` | Token 使用量统计 | ⏭️ 已忽略 | ⏭️ 无需消费 |

**说明**：
- ✅ 已实现：`agent-service` 已将 ACP 消息转换为 WebSocket 事件
- ❌ 未消费：WebSocket 事件已存在，但前端未监听
- ⚠️ 未映射：ACP 协议支持但 `agent-service` 未转换
- ⏭️ 已忽略：`agent-service` 显式忽略（`websocket.ts` 第 177-180 行）

### 2.2 权限请求类型

| 类型 | 用途 | agent-service 状态 | 前端消费状态 |
|------|------|-------------------|-------------|
| `session/request_permission` | 敏感操作需要用户确认 | ✅ 已实现（映射为 `permission_request`） | ❌ 未消费 |

**实现位置**：`packages/agent-service/src/routes/websocket.ts` 第 187-224 行

### 2.3 文件系统通知类型

| 类型 | 用途 | agent-service 状态 | 前端消费状态 |
|------|------|-------------------|-------------|
| `fs/read_text_file` | 读取文件通知 | ✅ 已实现（映射为 `file_operation`） | ❌ 未消费 |
| `fs/write_text_file` | 写入文件通知 | ✅ 已实现（映射为 `file_operation`） | ❌ 未消费 |

**说明**：文件操作通过 `handleFileOperation` 统一映射为 `file_operation` 事件（`websocket.ts` 第 227-235 行）

### 2.4 WebSocket 层消息类型（前端接收）

| 类型 | 用途 | 服务端状态 | 前端消费状态 |
|------|------|-----------|-------------|
| `stream` | 流式文本输出 | ✅ 已实现 | ✅ 已消费 |
| `thought` | Agent 思考过程 | ✅ 已实现 | ❌ 未消费 |
| `tool_call` | 工具调用 | ✅ 已实现 | ❌ 未消费 |
| `tool_call_update` | 工具调用状态更新 | ✅ 已实现 | ❌ 未消费 |
| `error` | 错误事件 | ✅ 已实现 | ✅ 已消费 |
| `finish` | 完成事件 | ✅ 已实现 | ✅ 已消费 |
| `status` | 状态变更 | ✅ 已实现 | ⚠️ 仅用于连接检测 |
| `permission_request` | 权限请求 | ✅ 已实现 | ❌ 未消费 |
| `models` | 模型列表 | ✅ 已实现 | ❌ 未消费 |
| `file_operation` | 文件操作 | ✅ 已实现 | ❌ 未消费 |
| `pong` | 心跳响应 | ✅ 已实现 | ⏭️ 内部使用 |

---

## 三、当前实现问题分析

### 3.1 核心问题

1. **前端事件监听不完整**：`ai-chat.tsx` 仅监听 `stream`、`finish`、`error` 三个事件，**未消费 `agent-service` 已提供的 `thought`、`tool_call`、`tool_call_update`、`permission_request`、`file_operation` 等 WebSocket 事件**。

2. **消息结构扁平化**：当前 `ChatMessage` 主要使用 `content` 字符串字段，虽已定义 `parts` 数组和 `reasoning`、`tools` 字段，但未在流式接收过程中填充。

3. **组件已就绪但未连通**：`Tool` 和 `Reasoning` 组件已完整实现，但从未被调用。

4. **权限请求未处理**：当 Agent 需要用户确认敏感操作时，`agent-service` 已转发 `permission_request` 事件，但前端无任何响应。

### 3.2 现有可用组件

| 组件 | 位置 | 功能 | 状态 |
|------|------|------|------|
| `Tool` | `ai-elements/tool.tsx` | 工具调用卡片（可展开查看参数/结果） | ✅ 已实现 |
| `Reasoning` | `ai-elements/reasoning.tsx` | 思考过程折叠面板 | ✅ 已实现 |
| `FileAttachment` | `ai-elements/message.tsx` | 文件附件展示 | ✅ 已实现 |
| `ChatMessage` 接口 | `ai-elements/message.tsx` | 支持 `parts`、`reasoning`、`tools`、`images`、`files` | ✅ 已定义 |
| `MessagePart` 类型 | `ai-elements/message.tsx` 第 5-13 行 | 结构化消息片段类型 | ✅ 已定义 |

### 3.3 Agent-Service 层已实现的事件映射

**关键发现**：`agent-service` 层已完成 ACP 协议到 WebSocket 事件的转换工作，具体实现见 `packages/agent-service/src/routes/websocket.ts`：

```typescript
// ACP → WebSocket 事件映射（第 136-183 行）
case 'agent_message_chunk' → type: 'stream'
case 'agent_thought_chunk' → type: 'thought'
case 'tool_call' → type: 'tool_call'
case 'tool_call_update' → type: 'tool_call_update'

// 权限请求（第 187-224 行）
ACP session/request_permission → type: 'permission_request'

// 文件操作（第 227-235 行）
fs/read_text_file, fs/write_text_file → type: 'file_operation'
```

**开发重点**：前端需要**消费这些已存在的 WebSocket 事件**，而非重新实现后端逻辑。

---

## 四、开发方案

### 4.1 消息结构设计

#### 4.1.1 统一消息模型

**复用现有类型定义**：`message.tsx` 已定义完整的消息结构（第 5-37 行），无需重新定义：

```typescript
// 来自 packages/web/src/components/ai-elements/message.tsx
export interface MessagePart {
  type: 'text' | 'reasoning' | 'tool' | 'image' | 'file'
  content?: string
  name?: string
  status?: 'running' | 'completed' | 'error' | 'awaiting-approval'
  parameters?: Record<string, unknown>
  result?: unknown
  duration?: number
}

export interface ChatMessage {
  id?: string
  role: 'user' | 'assistant' | 'system'
  content: string
  parts?: MessagePart[]              // 结构化内容
  reasoning?: {                      // 向后兼容：思考过程
    content: string
    duration?: number
  }
  tools?: Array<{
    name: string
    status: 'running' | 'completed' | 'error'
    parameters?: Record<string, unknown>
    result?: unknown
  }>
  images?: Array<{ url: string; alt?: string }>
  files?: Array<{ name: string; url: string; size?: number }>
}
```

**注意**：`Tool` 组件使用的状态类型为 `'running' | 'completed' | 'error' | 'awaiting-approval'`，与方案中的 `'pending' | 'in_progress'` 不同，需要进行映射。

#### 4.1.2 消息聚合策略

一条完整的 Assistant 消息可能包含：
```
[thought] → [tool_call] → [tool_call_update] → [stream] → [tool_call] → ... → finish
```

需要在流式接收过程中动态聚合这些部分到一条消息中。

**聚合策略**：
- `thought` 事件 → 累积到 `reasoning.content`
- `tool_call` 事件 → 添加到 `tools` 数组，状态映射为 `'running'`
- `tool_call_update` 事件 → 更新对应 tool 的状态（`'completed'` 或 `'error'`）
- `stream` 事件 → 累积到 `content`
- `finish` 事件 → 完成消息并添加到消息列表

### 4.2 实现步骤

#### 阶段一：完善 WebSocket 事件监听

**文件**：`packages/web/src/components/ai-elements/ai-chat.tsx`

**改动**：
1. 添加 `thought` 事件监听，累积思考内容
2. 添加 `tool_call` 事件监听，记录工具调用开始
3. 添加 `tool_call_update` 事件监听，更新工具调用状态
4. 添加 `permission_request` 事件监听，显示权限确认对话框
5. 添加 `file_operation` 事件监听（可选，用于文件变更通知）

**示例代码结构**：
```typescript
// 状态管理
const [currentMessage, setCurrentMessage] = useState<ChatMessage>({
  role: 'assistant',
  content: '',
  reasoning: undefined,
  tools: [],
})

// 监听思考事件
stream.on('thought', (event: StreamEvent) => {
  setCurrentMessage(prev => ({
    ...prev,
    reasoning: {
      content: (prev.reasoning?.content || '') + (event.content || ''),
    },
  }))
})

// 监听工具调用开始
stream.on('tool_call', (event: StreamEvent) => {
  setCurrentMessage(prev => ({
    ...prev,
    tools: [
      ...(prev.tools || []),
      {
        name: event.title || '未知工具',
        status: 'running',  // 映射: pending/in_progress → running
        parameters: {
          toolCallId: event.toolCallId,
          kind: event.kind,
          // 注意: StreamEvent 暂无 rawInput 字段，参数需从后续事件或其他来源获取
        },
      },
    ],
  }))
})

// 监听工具调用状态更新
stream.on('tool_call_update', (event: StreamEvent) => {
  setCurrentMessage(prev => {
    const updatedTools = (prev.tools || []).map((tool, index) => {
      // 通过 toolCallId 或名称匹配
      if (event.toolCallId && tool.parameters?.toolCallId === event.toolCallId) {
        return { ...tool, status: event.toolCallStatus === 'completed' ? 'completed' : 'error' }
      }
      // 兜底：匹配最后一个工具
      if (index === prev.tools!.length - 1) {
        return { ...tool, status: event.toolCallStatus === 'completed' ? 'completed' : 'error' }
      }
      return tool
    })
    return { ...prev, tools: updatedTools }
  })
})

// 监听权限请求
stream.on('permission_request', (event: StreamEvent) => {
  // 显示权限对话框
  setPendingPermissionRequest(event.permissionRequest)
})

// 监听文件操作（可选）
stream.on('file_operation', (event: StreamEvent) => {
  // 可用于实时文件同步
  console.log('File operation:', event.fileOperation)
})
```

**注意事项**：
1. `StreamEvent` 类型定义在 `packages/agent-client/src/client.ts`，已包含 `toolCallId`、`title`、`kind`、`toolCallStatus` 等字段
2. 需要将 ACP 的 `'pending' | 'in_progress' | 'completed' | 'failed'` 映射为 `'running' | 'completed' | 'error'`
3. `tool_call_update` 事件需要通过 `toolCallId` 匹配对应的工具调用

#### 阶段二：验证消息渲染逻辑

**文件**：`packages/web/src/components/ai-elements/message.tsx`

**改动**：**无需修改**，该文件已实现完整渲染逻辑。

**验证项**：
1. ✅ `reasoning` 和 `tools` 字段渲染逻辑已存在（第 69-89 行）
2. ✅ `Streamdown` 组件正确渲染 Markdown 内容
3. ✅ 向后兼容：优先使用 `reasoning` 和 `tools` 字段

**现有渲染逻辑**（已实现，直接使用）：
```tsx
// 工具调用展示（第 69-79 行）
{message.tools && message.tools.length > 0 && (
  <div className="space-y-2">
    {message.tools.map((tool, index) => (
      <Tool
        key={index}
        name={tool.name}
        status={tool.status}  // 'running' | 'completed' | 'error'
        parameters={tool.parameters}
        result={tool.result}
      />
    ))}
  </div>
)}

// 思考过程展示（第 82-89 行）
{message.reasoning && message.reasoning.content && (
  <Reasoning
    content={message.reasoning.content}
    duration={message.reasoning.duration}
    isStreaming={isStreaming}
  />
)}
```

**结论**：`message.tsx` 已具备完整渲染能力，只需确保 `ai-chat.tsx` 正确填充 `ChatMessage` 的 `reasoning` 和 `tools` 字段即可。

#### 阶段三：实现权限请求 UI

**新建组件**：`packages/web/src/components/ai-elements/permission-dialog.tsx`

**功能**：
1. 弹出模态对话框显示权限请求
2. 展示工具调用详情和操作选项
3. 通过 WebSocket 发送用户选择（选项 ID 由 ACP 协议动态提供）

**权限请求事件结构**（来自 `websocket.ts` 第 57-69 行）：
```typescript
{
  type: 'permission_request',
  permissionRequest: {
    sessionId: string,
    options: Array<{
      optionId: string,  // 动态选项，如 'allow_once', 'allow_always' 等
      name: string,      // 显示名称
    }>,
    toolCall: {
      toolCallId: string,
      title?: string,
      kind?: string,
    },
  }
}
```

**示例结构**：
```tsx
interface PermissionDialogProps {
  request: {
    sessionId: string
    options: Array<{ optionId: string; name: string }>
    toolCall: { toolCallId: string; title?: string; kind?: string }
  }
  onRespond: (optionId: string) => void
  onCancel: () => void
}

// 显示工具名称、参数预览、操作按钮（动态渲染 options）
```

**集成到 ai-chat.tsx**：
```typescript
stream.on('permission_request', (event: StreamEvent) => {
  if (event.permissionRequest) {
    setPendingPermissionRequest(event.permissionRequest)
  }
})

// 用户选择后发送响应
const handlePermissionResponse = (optionId: string) => {
  // 注意: 需要通过 WebSocket 原生发送消息，而非通过 AgentStream
  // 因为 AgentStream 暂无自定义消息发送方法
  const ws = (streamRef.current as any)?.ws
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'permission_response',
      permissionId: pendingPermissionRequest?.toolCall?.toolCallId,
      optionId,
    }))
  }
  setPendingPermissionRequest(null)
}
```

**注意**：
- `agent-service` 已实现权限请求的转发和响应处理（`websocket.ts` 第 187-224 行）
- 前端需发送 `permission_response` 消息，包含 `permissionId` 和 `optionId`
- `AgentStream` 类暂无公共方法发送自定义消息，需直接访问私有 `ws` 属性（临时方案）
- 建议在 `AgentStream` 类中添加 `sendCustomMessage()` 方法以改善 API 设计

#### 阶段四：增强流式 UI 状态

**改动**：
1. 在流式输出过程中，实时显示当前正在执行的操作
2. 工具调用时显示加载状态
3. 思考过程显示可折叠面板（默认展开/折叠可配置）

**状态指示器示例**：
- 文本输出：打字机效果 + 闪烁光标
- 思考过程：🧠 "Agent 正在思考..." 折叠面板
- 工具调用：🔧 "正在执行 XXX" 加载状态
- 权限请求：⚠️ "等待用户确认" 提示

#### 阶段五：测试与优化

1. 使用不同 Agent 后端（opencode、claude、qwen 等）测试所有消息类型
2. 测试长思考过程、多工具调用链、权限请求等场景
3. 优化性能：大量工具调用时的渲染性能
4. 无障碍访问：确保屏幕阅读器能正确读取内容

### 4.3 文件变更清单

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `packages/web/src/components/ai-elements/ai-chat.tsx` | 修改 | 添加事件监听、消息聚合逻辑 |
| `packages/web/src/components/ai-elements/permission-dialog.tsx` | 新建 | 权限请求对话框组件 |
| `packages/web/src/components/ai-elements/index.ts` | 修改 | 导出 PermissionDialog 组件 |
| `packages/agent-client/src/client.ts` | 建议修改 | 添加 `sendCustomMessage()` 方法（可选） |

**注意**：`message.tsx` 无需修改，已具备完整渲染能力。

---

## 五、技术细节

### 5.1 StreamEvent 类型（来自 agent-client SDK）

**实际定义**（`packages/agent-client/src/client.ts` 第 128-141 行）：

```typescript
export interface StreamEvent {
  type: 'stream' | 'thought' | 'tool_call' | 'tool_call_update' | 'error' | 'finish' | 'pong' | 'status';
  id?: string;
  content?: string;
  done?: boolean;
  error?: { code: string; message: string };
  files?: FileChange[];
  metadata?: Record<string, unknown>;
  timestamp?: number;
  status?: string;
  toolCallId?: string;
  title?: string;
  kind?: 'read' | 'edit' | 'execute';
  toolCallStatus?: 'pending' | 'in_progress' | 'completed' | 'failed';
}
```

**注意**：
- `type` 字段用于区分事件类型
- `toolCallStatus` 为 ACP 原始状态码，需映射为 UI 状态
- `permission_request`、`file_operation` 等扩展事件通过 `metadata` 或动态字段传递

### 5.2 工具调用 kind 映射

| kind | 图标 | 说明 |
|------|------|------|
| `read` | 📖 | 读取文件 |
| `edit` | ✏️ | 编辑文件 |
| `execute` | ⚡ | 执行命令 |

### 5.3 权限选项

**动态选项**：权限选项由 ACP 协议动态提供，常见选项包括：

| optionId | 标签 | 说明 |
|----------|------|------|
| `allow_once` | 允许一次 | 仅本次允许 |
| `allow_always` | 始终允许 | 本次会话中始终允许 |
| `reject_once` | 拒绝一次 | 仅本次拒绝 |
| `reject_always` | 始终拒绝 | 本次会话中始终拒绝 |

**实现方式**：从 `event.permissionRequest.options` 动态读取，而非硬编码。

---

## 六、风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 大量工具调用导致渲染卡顿 | 用户体验下降 | 虚拟滚动、懒加载、折叠面板 |
| 不同 Agent 后端消息格式不一致 | 兼容性问题 | 在 agent-service 层统一格式 |
| 权限请求超时 | 会话卡住 | 添加超时处理和取消按钮 |
| 消息聚合逻辑复杂 | Bug 风险 | 编写单元测试覆盖聚合逻辑 |

---

## 七、后续优化方向

1. **消息分组**：将连续的同类型消息合并显示
2. **时间戳**：显示每条消息的发送时间
3. **Token 使用统计**：在会话底部显示 Token 消耗
4. **模型切换 UI**：支持在会话中切换 Agent 模型
5. **导出会话**：支持导出完整会话（含工具调用详情）
6. **自定义主题**：支持用户自定义消息样式

---

## 八、验收标准

- [ ] 思考过程（reasoning）能完整显示，支持折叠/展开
- [ ] 工具调用能显示名称、状态、参数和结果
- [ ] 权限请求能正常弹出确认对话框
- [ ] 多种消息类型混合时能正确排序展示
- [ ] 流式输出过程中 UI 实时反馈状态
- [ ] 所有组件通过基本无障碍测试
- [ ] 在不同 Agent 后端上测试通过
- [ ] 无明显性能问题（100+ 工具调用时仍能流畅运行）

---

**文档版本**：v1.2（二次审查修订）
**创建日期**：2026-04-08
**更新日期**：2026-04-09
**状态**：✅ 已审核（二次审查）
**审核人**：AI Agent

### 修订记录

| 版本 | 日期 | 修订内容 |
|------|------|---------|
| v1.0 | 2026-04-08 | 初始版本 |
| v1.1 | 2026-04-09 | 纠正 agent-service 层已实现事件的错误标注，明确前后端职责边界 |
| v1.2 | 2026-04-09 | 二次审查修复：修正文件变更清单、修复示例代码错误、明确权限响应机制 |