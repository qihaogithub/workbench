# AI 会话区完整消息展示开发方案

## 一、背景与目标

当前 Web 端 AI 会话区仅能展示纯文本内容，无法完整展示 Agent 通过 ACP 协议输出的所有消息类型。本方案旨在实现完整的消息类型支持，让用户能够看到 Agent 的全部输出，包括思考过程、工具调用、权限请求等。

---

## 二、ACP 协议支持的消息类型

### 2.1 核心通知类型（session/update）

| 类型 | 用途 | 当前支持状态 |
|------|------|-------------|
| `agent_message_chunk` | Agent 回复的文本块 | ✅ 已支持 |
| `agent_thought_chunk` | Agent 的思考/推理过程 | ❌ 缺失 |
| `tool_call` | 工具调用开始（文件读写、命令执行等） | ❌ 缺失 |
| `tool_call_update` | 工具调用状态更新（completed/failed） | ❌ 缺失 |
| `plan` | Agent 计划更新 | ❌ 缺失 |
| `available_commands_update` | 可用命令更新 | ❌ 缺失 |
| `user_message_chunk` | 用户消息块 | ❌ 缺失 |
| `config_option_update` | 配置选项更新 | ❌ 缺失 |
| `usage_update` | Token 使用量统计 | ❌ 缺失 |

### 2.2 权限请求类型

| 类型 | 用途 | 当前支持状态 |
|------|------|-------------|
| `session/request_permission` | 敏感操作需要用户确认 | ❌ 缺失 |

### 2.3 文件系统通知类型

| 类型 | 用途 | 当前支持状态 |
|------|------|-------------|
| `fs/read_text_file` | 读取文件通知 | ❌ 缺失 |
| `fs/write_text_file` | 写入文件通知 | ❌ 缺失 |

### 2.4 WebSocket 层消息类型（前端接收）

| 类型 | 用途 | 当前支持状态 |
|------|------|-------------|
| `stream` | 流式文本输出 | ✅ 已支持 |
| `thought` | Agent 思考过程 | ❌ 缺失 |
| `tool_call` | 工具调用 | ❌ 缺失 |
| `tool_call_update` | 工具调用状态更新 | ❌ 缺失 |
| `error` | 错误事件 | ✅ 已支持 |
| `finish` | 完成事件 | ✅ 已支持 |
| `status` | 状态变更 | ⚠️ 部分支持 |
| `permission_request` | 权限请求 | ❌ 缺失 |
| `models` | 模型列表 | ❌ 缺失 |
| `file_operation` | 文件操作 | ❌ 缺失 |
| `pong` | 心跳响应 | ✅ 已支持 |

---

## 三、当前实现问题分析

### 3.1 核心问题

1. **事件监听不完整**：`ai-chat.tsx` 仅监听 `stream`、`finish`、`error` 三个事件，忽略了 `thought`、`tool_call`、`tool_call_update` 等关键事件。

2. **消息结构扁平化**：当前 `ChatMessage` 仅使用 `content` 字符串字段，未利用 `parts` 数组来结构化消息内容。

3. **组件已就绪但未连通**：`Tool` 和 `Reasoning` 组件已完整实现，但从未被调用。

4. **权限请求未处理**：当 Agent 需要用户确认敏感操作时，前端无任何响应。

### 3.2 现有可用组件

| 组件 | 位置 | 功能 | 状态 |
|------|------|------|------|
| `Tool` | `ai-elements/tool.tsx` | 工具调用卡片（可展开查看参数/结果） | ✅ 已实现 |
| `Reasoning` | `ai-elements/reasoning.tsx` | 思考过程折叠面板 | ✅ 已实现 |
| `FileAttachment` | `ai-elements/message.tsx` | 文件附件展示 | ✅ 已实现 |
| `ChatMessage` 接口 | `ai-elements/message.tsx` | 支持 `parts`、`reasoning`、`tools`、`images`、`files` | ✅ 已定义 |

---

## 四、开发方案

### 4.1 消息结构设计

#### 4.1.1 统一消息模型

采用 `parts` 数组方式组织单条消息中的多种内容类型：

```typescript
interface ChatMessage {
  id?: string
  role: 'user' | 'assistant' | 'system'
  content: string                    // 兼容模式：主要文本内容
  parts?: MessagePart[]              // 结构化内容（新增）
  reasoning?: {                      // 向后兼容：思考过程
    content: string
    duration?: number
  }
  tools?: Array<{                    // 向后兼容：工具调用
    name: string
    status: 'pending' | 'in_progress' | 'completed' | 'failed'
    parameters?: Record<string, unknown>
    result?: unknown
  }>
  images?: Array<{ url: string; alt?: string }>
  files?: Array<{ name: string; url: string; size?: number }>
}

type MessagePart = 
  | { type: 'text'; content: string }
  | { type: 'reasoning'; content: string; duration?: number }
  | { type: 'tool'; id: string; name: string; status: string; parameters?: unknown; result?: unknown }
  | { type: 'image'; url: string; alt?: string }
  | { type: 'file'; name: string; url: string; size?: number }
```

#### 4.1.2 消息聚合策略

一条完整的 Assistant 消息可能包含：
```
[reasoning] → [tool_call] → [tool_call_update] → [text] → [tool_call] → ... → finish
```

需要在流式接收过程中动态聚合这些部分到一条消息的 `parts` 数组中。

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
  parts: [],
  reasoning: undefined,
  tools: [],
})

// 监听思考事件
stream.on('thought', (event: StreamEvent) => {
  setCurrentMessage(prev => ({
    ...prev,
    reasoning: {
      content: (prev.reasoning?.content || '') + event.content,
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
        status: event.toolCallStatus || 'pending',
        parameters: event.rawInput,
      },
    ],
  }))
})

// 监听工具调用状态更新
stream.on('tool_call_update', (event: StreamEvent) => {
  setCurrentMessage(prev => {
    const updatedTools = (prev.tools || []).map(tool => 
      tool.name === event.title ? { ...tool, status: event.toolCallStatus } : tool
    )
    return { ...prev, tools: updatedTools }
  })
})
```

#### 阶段二：更新消息渲染逻辑

**文件**：`packages/web/src/components/ai-elements/message.tsx`

**改动**：
1. 支持 `parts` 数组渲染
2. 按顺序渲染不同类型的 MessagePart
3. 保持向后兼容：如果 `parts` 为空，则按原逻辑渲染 `content`、`reasoning`、`tools`

**示例渲染逻辑**：
```tsx
{message.parts?.map((part, index) => {
  switch (part.type) {
    case 'text':
      return <Streamdown key={index}>{part.content}</Streamdown>
    case 'reasoning':
      return <Reasoning key={index} content={part.content} />
    case 'tool':
      return <Tool key={part.id} {...part} />
    case 'image':
      return <img key={index} src={part.url} alt={part.alt} />
    case 'file':
      return <FileAttachment key={index} {...part} />
  }
})}

{/* 向后兼容 */}
{!message.parts?.length && message.reasoning && (
  <Reasoning content={message.reasoning.content} />
)}
{!message.parts?.length && message.tools?.map((tool, i) => (
  <Tool key={i} {...tool} />
))}
```

#### 阶段三：实现权限请求 UI

**新建组件**：`packages/web/src/components/ai-elements/permission-dialog.tsx`

**功能**：
1. 弹出模态对话框显示权限请求
2. 展示工具调用详情和操作选项
3. 通过 WebSocket 发送用户选择（`allow_once`、`allow_always`、`reject_once`、`reject_always`）

**示例结构**：
```tsx
interface PermissionDialogProps {
  request: PermissionRequest
  onRespond: (optionId: string) => void
  onCancel: () => void
}

// 显示工具名称、参数预览、操作按钮（允许一次/始终允许/拒绝）
```

**集成到 ai-chat.tsx**：
```typescript
stream.on('permission_request', (event: unknown) => {
  setPendingPermissionRequest(event)
})
```

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
| `packages/web/src/components/ai-elements/message.tsx` | 修改 | 支持 `parts` 数组渲染 |
| `packages/web/src/components/ai-elements/permission-dialog.tsx` | 新建 | 权限请求对话框组件 |
| `packages/web/src/components/ai-elements/index.ts` | 修改 | 导出新组件 |
| `packages/web/src/lib/agent-client.ts` | 可能修改 | 确保类型定义完整 |

---

## 五、技术细节

### 5.1 StreamEvent 类型（来自 agent-client SDK）

```typescript
interface StreamEvent {
  content: string
  files?: Array<{ name: string; url: string }>
  toolCallId?: string
  title?: string
  kind?: 'read' | 'edit' | 'execute'
  toolCallStatus?: 'pending' | 'in_progress' | 'completed' | 'failed'
  rawInput?: Record<string, unknown>
}
```

### 5.2 工具调用 kind 映射

| kind | 图标 | 说明 |
|------|------|------|
| `read` | 📖 | 读取文件 |
| `edit` | ✏️ | 编辑文件 |
| `execute` | ⚡ | 执行命令 |

### 5.3 权限选项

| optionId | 标签 | 说明 |
|----------|------|------|
| `allow_once` | 允许一次 | 仅本次允许 |
| `allow_always` | 始终允许 | 本次会话中始终允许 |
| `reject_once` | 拒绝一次 | 仅本次拒绝 |
| `reject_always` | 始终拒绝 | 本次会话中始终拒绝 |

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

**文档版本**：v1.0  
**创建日期**：2026-04-08  
**状态**：待审核