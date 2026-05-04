# AIChat 分层架构 - 技术文档

> 版本：v1.0
> 创建日期：2026-07-05
> 关联需求：[AI对话_需求文档.md](../AI对话_需求文档.md)
> 上层文档：[01_对话组件设计.md](./01_对话组件设计.md)

---
covers:
  - packages/web/src/components/ai-elements/ai-chat.tsx
  - packages/web/src/components/ai-elements/chat/hooks/use-chat-messages.ts
  - packages/web/src/components/ai-elements/chat/hooks/use-chat-stream.ts
  - packages/web/src/components/ai-elements/chat/hooks/use-chat-models.ts
  - packages/web/src/components/ai-elements/chat/services/stream-service.ts
  - packages/web/src/components/ai-elements/chat/services/message-service.ts
  - packages/web/src/components/ai-elements/chat/utils/chat-file-utils.ts
  - packages/web/src/components/ai-elements/chat/utils/chat-stream-utils.ts
  - packages/web/src/components/ai-elements/chat/chat-messages.tsx
  - packages/web/src/components/ai-elements/chat/chat-plan.tsx
  - packages/web/src/components/ai-elements/chat/chat-input.tsx
  - packages/web/src/components/ai-elements/chat/model-select-with-guard.tsx
  - packages/web/src/components/ai-elements/chat/types.ts
---

## 一、重构背景

原 AIChat 组件（1375 行）将 UI 渲染、状态管理、WebSocket 通信、HTTP 通信、模型管理、工具调用处理、权限管理、文件操作等 8+ 个独立职责混合在一起，严重违反单一职责原则。本次重构将其拆分为四层架构，主组件精简至约 190 行。

## 二、目录结构

```
chat/
├── hooks/                          # Hooks 层 - 状态与业务逻辑
│   ├── use-chat-messages.ts        # 受控/非受控消息状态管理
│   ├── use-chat-stream.ts          # 流式通信、事件处理、文件操作防抖
│   └── use-chat-models.ts          # 模型列表获取、模型切换
├── services/                       # Service 层 - 网络与持久化
│   ├── stream-service.ts           # WebSocket 封装、事件解析、连接管理
│   └── message-service.ts          # 消息持久化、会话标题更新、文件获取
├── utils/                          # Utils 层 - 纯工具函数
│   ├── chat-file-utils.ts          # 文件路径匹配、代码/schema 提取
│   └── chat-stream-utils.ts        # Parts 更新、工具调用解析
├── chat-messages.tsx               # UI 子组件 - 消息列表
├── chat-plan.tsx                   # UI 子组件 - Plan 折叠展示
├── chat-input.tsx                  # UI 子组件 - 输入区域
├── model-select-with-guard.tsx     # UI 子组件 - 模型选择器（含图片守卫）
└── types.ts                        # 类型导出
```

## 三、各层职责

### 3.1 Hooks 层

Hooks 层负责管理组件状态和业务逻辑，是 AIChat 与 UI 子组件之间的桥梁。

#### useChatMessages

统一管理消息相关的四个核心状态，封装了受控/非受控模式切换逻辑：

| 状态 | 说明 | 受控模式 |
|:-----|:-----|:---------|
| messages | 消息列表 | externalMessages + onMessagesChange |
| isStreaming | 是否正在流式输出 | externalIsStreaming + onIsStreamingChange |
| streamContent | 流式内容累积 | externalStreamContent + onStreamContentChange |
| currentMessage | 当前正在生成的消息 | externalCurrentMessage + onCurrentMessageChange |

关键设计：每个状态都维护一个 `ref` 用于同步追踪最新值，解决 WebSocket 密集事件下的状态跳闪问题。当受控模式时，ref 立即同步更新，确保下一次毫秒级调用能读取到最新数据。

#### useChatStream

核心流式通信 Hook，协调 StreamService、MessageService 和文件操作：

- 创建和管理 StreamService 实例
- 处理所有 WebSocket 事件（stream、thought、plan、tool_call、tool_call_update、permission_request、file_operation、finish、error）
- 实现文件操作的 300ms 防抖机制
- WebSocket 失败时自动降级到 HTTP 非流式模式
- 管理权限请求状态

数据流：用户发送消息 → handleSend → StreamService.connect → 事件回调 → 状态更新 → UI 响应

#### useChatModels

模型管理 Hook，维护一个独立的 WebSocket 长连接用于模型信息：

- agentSessionId 变化时自动建立模型流连接
- 连接成功后自动请求模型列表
- 处理模型切换指令
- 提供当前模型是否支持图片的判断

### 3.2 Service 层

Service 层封装了网络通信和持久化逻辑，可独立测试。

#### StreamService

WebSocket 通信的核心封装，职责包括：

- 连接管理：connect、waitForConnection、close
- 消息发送：sendMessage、sendPermissionResponse、sendModelChange、requestModels
- 事件分发：将原始 StreamEvent 解析为类型安全的业务事件，通过 handlers 回调分发给上层
- 会话隔离：通过 currentSessionId 过滤过期事件，防止旧流事件污染新会话状态

事件处理流程：AgentStream 原始事件 → StreamService 解析/过滤 → handlers 回调 → Hook 状态更新

#### MessageService

消息持久化和会话元数据管理，提供三个纯异步函数：

- `persistMessages`：将消息列表持久化到服务端
- `updateSessionTitle`：首条消息时更新会话标题
- `fetchSessionFiles`：从 HTTP API 获取代码/schema 文件内容（作为 WebSocket 事件的兜底）

### 3.3 Utils 层

纯工具函数，无副作用，便于单元测试。

#### chat-file-utils

文件路径匹配和内容提取：

- `normalizePath`：统一路径分隔符
- `isCodeFile` / `isSchemaFile`：根据路径后缀判断文件类型
- `extractCodeAndSchemaUpdates`：从文件变更列表中提取代码/schema 更新，触发对应回调
- `processFileChanges`：组合 onFilesChange + extractCodeAndSchemaUpdates 的便捷函数

#### chat-stream-utils

消息 Parts 的更新操作和工具调用事件解析：

- `updateTextPart`：向 parts 数组追加文本内容（智能合并到已有 TextPart）
- `addThoughtPart`：追加思考过程（短内容合并，长内容新建）
- `addToolPart`：添加工具调用 Part
- `updateToolPart`：根据 toolCallId 更新工具状态和结果
- `parseToolCallFromEvent`：从原始事件中提取工具名称、参数、路径等信息

### 3.4 UI 子组件

UI 子组件只负责渲染，不包含业务逻辑。

| 组件 | 职责 | 输入 |
|:-----|:-----|:-----|
| ChatMessages | 消息列表展示（含空状态） | messages, currentMessage, isStreaming |
| ChatPlan | Plan 折叠展示 | plan, isStreaming |
| ChatInput | 输入区域（附件、模型选择、历史按钮） | onSubmit, onCancel, modelState 等 |
| ModelSelectWithGuard | 模型选择器（切换时检查图片兼容性） | models, canSwitch, onModelChange |

## 四、数据流总览

### 4.1 发送消息

```
用户输入 → ChatInput.onSubmit
  → useChatStream.handleSend
    → setMessages（添加用户消息）
    → StreamService.connect（建立 WebSocket）
    → StreamService.waitForConnection（等待连接，3s 超时）
    → StreamService.sendMessage（发送消息）
    → 事件回调循环：
        stream       → setCurrentMessage（追加文本）
        thought      → setCurrentMessage（追加思考）
        plan         → setPlan（累积 Plan）
        tool_call    → setCurrentMessage（添加工具 Part）
        tool_update  → setCurrentMessage（更新工具状态）
        permission   → setPendingPermissionRequest
        file_op      → 防抖 300ms → processFileChanges
    → finish 事件：
        → setMessages（保存助手消息）
        → MessageService.persistMessages
        → MessageService.updateSessionTitle
        → 处理最终文件变更（优先 event.files，兜底 HTTP API）
    → error 事件：
        → 降级到 HTTP 非流式模式
```

### 4.2 模型切换

```
用户选择模型 → ModelSelectWithGuard（检查图片兼容性）
  → useChatModels.handleModelChange
    → StreamService.sendModelChange（通过模型流 WebSocket 发送）
```

### 4.3 权限响应

```
权限对话框 → useChatStream.handlePermissionResponse
  → StreamService.sendPermissionResponse（通过消息流 WebSocket 发送）
```

## 五、关键设计决策

### 5.1 受控/非受控统一封装

四个核心状态（messages、isStreaming、streamContent、currentMessage）都支持受控和非受控两种模式。useChatMessages 统一封装了这一逻辑，外部只需传入 external* 和 on*Change 即可切换模式，组件内部无需关心。

### 5.2 ref 同步追踪

WebSocket 事件可能以毫秒级频率到达，React 的状态更新是异步的。使用 ref 同步追踪最新值，确保在高频事件下不会读取到滞后的状态。

### 5.3 会话隔离

StreamService 通过 currentSessionId 过滤过期事件。当用户切换会话时，旧流的 finish/error 事件会被忽略，防止旧数据污染新会话状态。

### 5.4 文件操作防抖

文件写入事件可能频繁触发（AI 连续修改多个文件），使用 300ms 防抖机制批量通知父组件，避免频繁的 UI 更新和回调触发。

### 5.5 双通道文件获取

文件内容获取采用"WebSocket 实时事件优先 + HTTP API 兜底"策略。finish 事件中优先使用 event.files，如果缺少代码/schema 内容，再通过 HTTP API 获取。

## 六、相关文档

- [AI对话_需求文档.md](../AI对话_需求文档.md)
- [01_对话组件设计.md](./01_对话组件设计.md)
