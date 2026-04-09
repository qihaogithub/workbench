# TRAE 风格 AI 消息组件自研方案

> 放弃 AI Elements 组件库，完全自主实现 TRAE 风格的 AI 对话 UI

---

## 1. 项目背景与目标

### 1.1 为什么要放弃 AI Elements

| 维度 | AI Elements 问题 | 影响 |
|------|------------------|------|
| **定制化限制** | 样式和行为被组件库约束，难以深度定制 | 无法完美复刻 TRAE 交互体验 |
| **学习成本** | 需要学习其特有的 API 和概念 | 团队学习成本高 |
| **维护依赖** | 依赖外部库更新，存在 breaking change 风险 | 长期维护不可控 |
| **包体积** | 包含大量可能用不到的组件和逻辑 | 影响应用加载性能 |
| **调试困难** | 问题定位需要深入第三方库源码 | 排查问题效率低 |
| **技术债务** | 引入不熟悉的模式增加代码复杂性 | 降低代码可维护性 |

### 1.2 目标

**核心目标**：完全模仿 TRAE 的 AI 对话 UI，实现以下特性：

- 消息流式渲染，支持 Markdown 代码高亮
- 思考过程（Reasoning）折叠/展开展示
- 工具调用卡片，实时进度更新
- 文件附件展示
- 消息操作（复制、重新生成、编辑）
- Prompt 输入框，支持多行和快捷键
- 完整的动画过渡效果

---

## 2. TRAE AI 对话 UI 特征分析

### 2.1 视觉风格特点

```
┌─────────────────────────────────────────────────────────┐
│  视觉特征            │  TRAE 实现方式                     │
├─────────────────────┼───────────────────────────────────┤
│  配色方案            │  深色主题为主，边缘有紫色渐变点缀  │
│  消息气泡            │  AI 消息无气泡背景，用户消息有浅色背景│
│  间距                │  消息之间 16px，组内 8px           │
│  圆角                │  气泡 12px，按钮 8px               │
│  字体                │  代码用等宽字体，正文用系统字体    │
│  图标风格            │  Lucide Icons，线性风格            │
└─────────────────────┴───────────────────────────────────┘
```

### 2.2 消息展示方式

```tsx
// 消息类型分类
type MessageType = 'text' | 'reasoning' | 'tool-call' | 'attachment' | 'error';

// 消息角色
type MessageRole = 'user' | 'assistant' | 'system';
```

**用户消息**：
- 右对齐，带浅灰色背景 (`bg-zinc-800/50`)
- 头像在右侧

**AI 消息**：
- 左对齐，无背景或极浅背景
- 头像在左侧，带紫色渐变环形

### 2.3 思考过程展示

```
┌─ 用户消息 ─────────────────────────────────────────────┐
│ 你好，帮我写一个快速排序算法                        →
└────────────────────────────────────────────────────────┘

┌─ AI 消息 ──────────────────────────────────────────────┐
│ ○ Thinking                                              │ ← 可折叠面板
│ ├─ 我需要实现一个快速排序算法...                       │
│ ├─ 选择基准值，使用 Lomuto 分区方案...                 │
│ └─ 递归处理左右两部分...                               │
├────────────────────────────────────────────────────────│
│ 好的，我来为你实现快速排序算法：                        │
│                                                         │
│ ```python                                               │
│ def quicksort(arr):                                     │
│     if len(arr) <= 1:                                   │
│         return arr                                      │
│     ...                                                 │
│ ```                                                     │
└────────────────────────────────────────────────────────┘
```

**折叠状态**：显示一行 `○ Thinking (展开 N 步)`

**展开状态**：显示缩进的多步思考过程，使用等宽字体

### 2.4 工具调用展示

```
┌─ Tool: read_file ─────────────────────────────────────┐
│ 📄 src/utils/sorter.py                                 │
│ ├─ 状态：正在读取...                                   │
│ └─ 进度：████████░░ 80%                               │
└───────────────────────────────────────────────────────┘

┌─ Tool: write_file ────────────────────────────────────┐
│ ✏️ src/utils/sorter.py                                 │
│ ├─ 状态：已写入                                        │
│ └─ 写入内容：45 行                                      │
└───────────────────────────────────────────────────────┘
```

**工具调用卡片特征**：
- 左侧有彩色竖条指示工具类型（读取=蓝色，写入=绿色，执行=紫色）
- 工具名称使用粗体
- 文件路径使用等宽字体
- 状态和进度实时更新

### 2.5 交互细节

| 交互 | 行为描述 |
|------|----------|
| **Hover 消息** | 显示操作按钮（复制、重新生成、编辑） |
| **点击复制** | 复制消息内容到剪贴板，显示 "已复制" 提示 2 秒 |
| **点击重新生成** | 显示加载状态，重新调用 AI |
| **点击编辑** | 消息变为可编辑状态，输入框获得焦点 |
| **发送 Shift+Enter** | 换行 |
| **发送 Enter** | 提交消息 |
| **空消息** | 禁用发送按钮 |

---

## 3. 技术方案设计

### 3.1 组件架构设计

```
AIChat (主容器)
├── ChatHeader (会话头部)
├── MessageList (消息列表)
│   └── ChatMessage (单条消息)
│       ├── MessageAvatar (头像)
│       ├── MessageBubble (消息气泡)
│       │   ├── TextContent (文本内容)
│       │   ├── ReasoningPanel (思考过程)
│       │   ├── ToolCallCard (工具调用)
│       │   └── FileAttachment (附件)
│       ├── StreamingIndicator (流式指示器)
│       └── MessageActions (操作按钮)
└── PromptInput (输入区域)
    ├── Textarea (多行输入)
    ├── AttachmentButton (附件按钮)
    └── SendButton (发送按钮)
```

### 3.2 核心组件列表及职责

| 组件 | 文件路径 | 职责 |
|------|----------|------|
| `AIChat` | `src/components/ai-chat/AIChat.tsx` | 主容器，管理全局状态和布局 |
| `ChatMessage` | `src/components/ai-chat/ChatMessage.tsx` | 单条消息的整合展示 |
| `MessageBubble` | `src/components/ai-chat/MessageBubble.tsx` | 消息内容气泡 |
| `ReasoningPanel` | `src/components/ai-chat/ReasoningPanel.tsx` | 思考过程折叠面板 |
| `ToolCallCard` | `src/components/ai-chat/ToolCallCard.tsx` | 工具调用卡片 |
| `PromptInput` | `src/components/ai-chat/PromptInput.tsx` | 消息输入框 |
| `StreamingIndicator` | `src/components/ai-chat/StreamingIndicator.tsx` | 流式响应动画 |
| `MessageActions` | `src/components/ai-chat/MessageActions.tsx` | 消息操作按钮组 |
| `FileAttachment` | `src/components/ai-chat/FileAttachment.tsx` | 文件附件展示 |

### 3.3 组件 API 设计

```typescript
// types/ai-chat.ts

import type { ReactNode } from 'react';

// ==================== 核心类型 ====================

export type MessageRole = 'user' | 'assistant' | 'system';

export type MessageType = 
  | 'text' 
  | 'reasoning' 
  | 'tool-call' 
  | 'attachment' 
  | 'error';

export type ToolCallStatus = 'pending' | 'running' | 'success' | 'error';

// ==================== 内容块类型 ====================

export interface TextContent {
  type: 'text';
  content: string; // Markdown 格式
}

export interface ReasoningStep {
  id: string;
  content: string;
  timestamp: number;
}

export interface ReasoningContent {
  type: 'reasoning';
  steps: ReasoningStep[];
  isCollapsed: boolean;
}

export interface ToolCallArgument {
  name: string;
  value: string;
}

export interface ToolCallContent {
  type: 'tool-call';
  id: string;
  name: string;
  arguments: ToolCallArgument[];
  status: ToolCallStatus;
  result?: string;
  progress?: number; // 0-100
}

export interface FileAttachmentContent {
  type: 'attachment';
  id: string;
  fileName: string;
  fileType: string;
  size: number;
  content?: string; // 预览内容
}

export type MessageContent = 
  | TextContent 
  | ReasoningContent 
  | ToolCallContent 
  | FileAttachmentContent;

// ==================== 消息类型 ====================

export interface ChatMessage {
  id: string;
  role: MessageRole;
  contents: MessageContent[];
  createdAt: number;
  updatedAt?: number;
  isStreaming?: boolean;
}

// ==================== Props 定义 ====================

export interface AIChatProps {
  /** 初始消息列表 */
  initialMessages?: ChatMessage[];
  /** 是否禁用输入 */
  disabled?: boolean;
  /** 发送消息回调 */
  onSendMessage?: (content: string, attachments?: File[]) => Promise<void>;
  /** 重新生成消息回调 */
  onRegenerate?: (messageId: string) => Promise<void>;
  /** 编辑消息回调 */
  onEditMessage?: (messageId: string, newContent: string) => Promise<void>;
  /** 自定义头像 */
  renderUserAvatar?: () => ReactNode;
  renderAssistantAvatar?: () => ReactNode;
  /** 类名 */
  className?: string;
}

export interface ChatMessageProps {
  message: ChatMessage;
  onRegenerate?: () => void;
  onEdit?: (newContent: string) => void;
  onCopy?: () => void;
  isLast?: boolean;
}

export interface MessageBubbleProps {
  content: MessageContent;
  onAction?: (action: string, data?: unknown) => void;
}

export interface ReasoningPanelProps {
  steps: ReasoningStep[];
  isCollapsed: boolean;
  onToggle: () => void;
}

export interface ToolCallCardProps {
  toolCall: ToolCallContent;
  onCancel?: () => void;
}

export interface PromptInputProps {
  disabled?: boolean;
  placeholder?: string;
  onSubmit: (content: string, files?: File[]) => void;
  onCancel?: () => void;
}

export interface StreamingIndicatorProps {
  type?: 'typing' | 'thinking';
}
```

### 3.4 状态管理方案

采用 **React Context + useReducer** 进行状态管理，避免引入额外状态管理库。

```typescript
// context/ChatContext.tsx

interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  streamingMessageId: string | null;
}

type ChatAction =
  | { type: 'ADD_MESSAGE'; payload: ChatMessage }
  | { type: 'UPDATE_MESSAGE'; payload: { id: string; updates: Partial<ChatMessage> } }
  | { type: 'DELETE_MESSAGE'; payload: string }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_STREAMING'; payload: string | null }
  | { type: 'APPEND_CONTENT'; payload: { messageId: string; content: MessageContent } };

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'ADD_MESSAGE':
      return { ...state, messages: [...state.messages, action.payload] };
    case 'UPDATE_MESSAGE':
      return {
        ...state,
        messages: state.messages.map((msg) =>
          msg.id === action.payload.id ? { ...msg, ...action.payload.updates } : msg
        ),
      };
    // ... 其他 case
  }
}
```

### 3.5 样式方案

**基于 Tailwind CSS + shadcn/ui**：

| 样式层级 | 实现方式 |
|----------|----------|
| 基础样式 | Tailwind CSS 工具类 |
| 组件样式 | shadcn/ui `cn()` 工具函数合并 |
| 变体 | `class-variance-authority` (CVA) |
| 主题变量 | Tailwind CSS 配置中的 CSS 变量 |

**关键 Tailwind 配置**（需添加到 `tailwind.config.ts`）：

```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss';

export default {
  content: [
    './src/components/ai-chat/**/*.{ts,tsx}',
    // ...
  ],
  theme: {
    extend: {
      colors: {
        // TRAE 风格配色
        'ai-purple': {
          50: '#faf5ff',
          100: '#f3e8ff',
          500: '#a855f7',
          600: '#9333ea',
        },
      },
      animation: {
        'streaming-dot': 'streaming-dot 1.4s infinite ease-in-out',
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-up': 'slide-up 0.3s ease-out',
      },
      keyframes: {
        'streaming-dot': {
          '0%, 80%, 100%': { opacity: '0.3', transform: 'scale(0.8)' },
          '40%': { opacity: '1', transform: 'scale(1)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
} satisfies Config;
```

---

## 4. 组件设计详情

### 4.1 AIChat（主容器）

**文件位置**：`src/components/ai-chat/AIChat.tsx`

**功能职责**：
- 管理全局聊天状态
- 协调子组件通信
- 处理滚动和懒加载
- 提供 Context 向下传递

**Props 接口**：

```typescript
interface AIChatProps {
  initialMessages?: ChatMessage[];
  disabled?: boolean;
  onSendMessage?: (content: string, attachments?: File[]) => Promise<void>;
  onRegenerate?: (messageId: string) => Promise<void>;
  onEditMessage?: (messageId: string, newContent: string) => Promise<void>;
  className?: string;
}
```

**状态管理**：
- 使用 `useReducer` 管理消息列表
- 使用 `useRef` 管理滚动位置
- 使用 `useCallback` 缓存回调函数

**样式设计要点**：

```tsx
// AIChat.tsx 结构
<div className="flex flex-col h-full bg-zinc-950">
  {/* 头部 */}
  <ChatHeader />

  {/* 消息列表 */}
  <div className="flex-1 overflow-y-auto">
    <MessageList />
  </div>

  {/* 输入区域 */}
  <div className="border-t border-zinc-800">
    <PromptInput />
  </div>
</div>
```

---

### 4.2 ChatMessage（消息展示）

**文件位置**：`src/components/ai-chat/ChatMessage.tsx`

**功能职责**：
- 根据角色渲染不同样式
- 整合多个内容块
- 处理消息操作

**Props 接口**：

```typescript
interface ChatMessageProps {
  message: ChatMessage;
  onRegenerate?: () => void;
  onEdit?: (newContent: string) => void;
  onCopy?: () => void;
  isLast?: boolean;
}
```

**样式设计要点**：

```tsx
// 用户消息样式
<div className="flex justify-end gap-3 px-4 py-2">
  <div className="bg-zinc-800/50 rounded-2xl rounded-tr-md px-4 py-2 max-w-[80%]">
    {/* 内容 */}
  </div>
  <MessageAvatar role="user" />
</div>

// AI 消息样式
<div className="flex justify-start gap-3 px-4 py-2">
  <MessageAvatar role="assistant" />
  <div className="max-w-[80%] space-y-2">
    {/* 内容块列表 */}
  </div>
</div>
```

---

### 4.3 MessageBubble（消息气泡）

**文件位置**：`src/components/ai-chat/MessageBubble.tsx`

**功能职责**：
- 分发不同类型内容到对应组件
- 渲染 Markdown（使用 `react-markdown` + `highlight.js`）
- 处理代码块复制

**Props 接口**：

```typescript
interface MessageBubbleProps {
  content: MessageContent;
}

interface TextBubbleProps {
  content: TextContent;
  onCopyCode?: (code: string) => void;
}
```

**样式设计要点**：

```tsx
// 文本内容渲染
<div className="prose prose-invert prose-zinc max-w-none">
  <ReactMarkdown
    components={{
      code: ({ className, children, ...props }) => {
        const match = /language-(\w+)/.exec(className || '');
        const isInline = !match && !className;

        return isInline ? (
          <code className="bg-zinc-800 px-1 py-0.5 rounded text-sm">
            {children}
          </code>
        ) : (
          <CodeBlock language={match[1]} code={String(children)} />
        );
      },
      pre: ({ children }) => (
        <pre className="bg-zinc-900 rounded-lg p-4 overflow-x-auto">
          {children}
        </pre>
      ),
    }}
  >
    {content.content}
  </ReactMarkdown>
</div>
```

---

### 4.4 ReasoningPanel（思考过程面板）

**文件位置**：`src/components/ai-chat/ReasoningPanel.tsx`

**功能职责**：
- 展示思考过程步骤
- 支持折叠/展开
- 显示步骤计数

**Props 接口**：

```typescript
interface ReasoningPanelProps {
  steps: ReasoningStep[];
  isCollapsed: boolean;
  onToggle: () => void;
}

interface ReasoningStep {
  id: string;
  content: string;
  timestamp: number;
}
```

**样式设计要点**：

```tsx
// 折叠状态
<button
  onClick={onToggle}
  className="flex items-center gap-2 text-zinc-400 hover:text-zinc-200 transition-colors"
>
  <span className="text-lg">{isCollapsed ? '○' : '●'}</span>
  <span>Thinking</span>
  <span className="text-zinc-600">({steps.length} 步)</span>
</button>

// 展开状态
<div className="space-y-1 pl-2 border-l-2 border-zinc-700">
  {steps.map((step, index) => (
    <div
      key={step.id}
      className="text-sm text-zinc-400 font-mono animate-fade-in"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <span className="text-zinc-600 mr-2">├─</span>
      {step.content}
    </div>
  ))}
</div>
```

---

### 4.5 ToolCallCard（工具调用卡片）

**文件位置**：`src/components/ai-chat/ToolCallCard.tsx`

**功能职责**：
- 展示工具调用信息
- 显示执行状态和进度
- 展示调用结果

**Props 接口**：

```typescript
interface ToolCallCardProps {
  toolCall: ToolCallContent;
  onCancel?: () => void;
}

interface ToolCallContent {
  type: 'tool-call';
  id: string;
  name: string;
  arguments: Array<{ name: string; value: string }>;
  status: 'pending' | 'running' | 'success' | 'error';
  result?: string;
  progress?: number;
}
```

**样式设计要点**：

```tsx
// 工具卡片容器
<div className={cn(
  "rounded-lg border border-zinc-700/50 overflow-hidden",
  "bg-zinc-900/50"
)}>
  {/* 左侧状态条 */}
  <div className={cn(
    "w-1 absolute inset-y-0 left-0",
    statusColors[toolCall.status]
  )} />

  {/* 内容区 */}
  <div className="p-3 pl-4">
    {/* 工具名称 */}
    <div className="flex items-center gap-2 mb-2">
      <span className="text-lg">{toolIcons[toolCall.name]}</span>
      <span className="font-semibold text-zinc-200">{toolCall.name}</span>
      <span className="text-zinc-500">({toolCall.status})</span>
    </div>

    {/* 参数列表 */}
    {toolCall.arguments.length > 0 && (
      <div className="text-sm font-mono text-zinc-400 space-y-1">
        {toolCall.arguments.map((arg) => (
          <div key={arg.name}>
            <span className="text-zinc-500">{arg.name}:</span>{' '}
            <span className="text-zinc-300">{arg.value}</span>
          </div>
        ))}
      </div>
    )}

    {/* 进度条 */}
    {toolCall.status === 'running' && toolCall.progress !== undefined && (
      <div className="mt-3">
        <div className="h-1 bg-zinc-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-purple-500 transition-all duration-300"
            style={{ width: `${toolCall.progress}%` }}
          />
        </div>
      </div>
    )}

    {/* 结果 */}
    {toolCall.result && (
      <div className="mt-2 text-sm text-zinc-400">
        {toolCall.result}
      </div>
    )}
  </div>
</div>

// 状态颜色映射
const statusColors = {
  pending: 'bg-zinc-500',
  running: 'bg-purple-500',
  success: 'bg-green-500',
  error: 'bg-red-500',
};
```

---

### 4.6 PromptInput（输入框）

**文件位置**：`src/components/ai-chat/PromptInput.tsx`

**功能职责**：
- 多行文本输入
- 支持文件拖拽和附件
- 处理快捷键（Enter 发送，Shift+Enter 换行）
- 发送动画反馈

**Props 接口**：

```typescript
interface PromptInputProps {
  disabled?: boolean;
  placeholder?: string;
  onSubmit: (content: string, files?: File[]) => void;
  onCancel?: () => void;
}
```

**样式设计要点**：

```tsx
// 输入框容器
<div className="relative bg-zinc-900 border border-zinc-700 rounded-xl focus-within:border-purple-500 transition-colors">
  {/* 附件区域（当有文件时） */}
  {attachments.length > 0 && (
    <div className="flex flex-wrap gap-2 p-3 border-b border-zinc-700">
      {attachments.map((file, index) => (
        <div key={index} className="flex items-center gap-2 bg-zinc-800 rounded-lg px-3 py-1">
          <Paperclip className="w-4 h-4 text-zinc-400" />
          <span className="text-sm text-zinc-300">{file.name}</span>
          <button
            onClick={() => removeAttachment(index)}
            className="text-zinc-500 hover:text-zinc-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  )}

  {/* 文本输入区 */}
  <div className="flex items-end gap-2 p-3">
    <textarea
      ref={textareaRef}
      value={content}
      onChange={(e) => setContent(e.target.value)}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      disabled={disabled}
      rows={1}
      className={cn(
        "flex-1 bg-transparent resize-none text-zinc-100 placeholder-zinc-500",
        "focus:outline-none max-h-40 scrollbar-thin"
      )}
      style={{
        height: 'auto',
        minHeight: '24px',
      }}
    />

    {/* 发送按钮 */}
    <Button
      onClick={handleSubmit}
      disabled={disabled || !content.trim()}
      size="icon"
      className={cn(
        "rounded-lg transition-all",
        content.trim() && !disabled && "bg-purple-600 hover:bg-purple-500"
      )}
    >
      <Send className="w-4 h-4" />
    </Button>
  </div>
</div>
```

**快捷键处理**：

```tsx
function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSubmit();
  }
}
```

---

### 4.7 StreamingIndicator（流式响应指示器）

**文件位置**：`src/components/ai-chat/StreamingIndicator.tsx`

**功能职责**：
- 显示 AI 正在输入的动画
- 三点波浪动画

**Props 接口**：

```typescript
interface StreamingIndicatorProps {
  type?: 'typing' | 'thinking';
}
```

**样式设计要点**：

```tsx
const StreamingIndicator = ({ type = 'typing' }: StreamingIndicatorProps) => {
  return (
    <div className="flex items-center gap-1 px-4 py-2">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={cn(
              "w-2 h-2 rounded-full bg-zinc-400",
              "animate-streaming-dot"
            )}
            style={{ animationDelay: `${i * 200}ms` }}
          />
        ))}
      </div>
      <span className="text-sm text-zinc-500 ml-2">
        {type === 'thinking' ? '思考中...' : '输入中...'}
      </span>
    </div>
  );
};
```

---

### 4.8 MessageActions（消息操作按钮）

**文件位置**：`src/components/ai-chat/MessageActions.tsx`

**功能职责**：
- 复制消息内容
- 重新生成回复
- 编辑消息内容
- 显示悬浮操作菜单

**Props 接口**：

```typescript
interface MessageActionsProps {
  messageId: string;
  content: string;
  onCopy?: () => void;
  onRegenerate?: () => void;
  onEdit?: (newContent: string) => void;
}
```

**样式设计要点**：

```tsx
// 默认隐藏，hover 时显示
<div className={cn(
  "absolute right-2 top-2",
  "opacity-0 group-hover:opacity-100 transition-opacity",
  "flex items-center gap-1 bg-zinc-800 rounded-lg p-1"
)}>
  <ActionButton onClick={handleCopy} title="复制">
    <Copy className="w-4 h-4" />
  </ActionButton>

  {onRegenerate && (
    <ActionButton onClick={handleRegenerate} title="重新生成">
      <RefreshCw className="w-4 h-4" />
    </ActionButton>
  )}

  {onEdit && (
    <ActionButton onClick={handleEdit} title="编辑">
      <Pencil className="w-4 h-4" />
    </ActionButton>
  )}
</div>
```

---

### 4.9 FileAttachment（文件附件）

**文件位置**：`src/components/ai-chat/FileAttachment.tsx`

**功能职责**：
- 展示文件信息（名称、类型、大小）
- 文件类型图标
- 预览内容（文本/图片）

**Props 接口**：

```typescript
interface FileAttachmentProps {
  attachment: FileAttachmentContent;
  onRemove?: () => void;
  onPreview?: () => void;
}

interface FileAttachmentContent {
  type: 'attachment';
  id: string;
  fileName: string;
  fileType: string;
  size: number;
  content?: string; // 文本内容或 base64 图片
  previewUrl?: string;
}
```

**样式设计要点**：

```tsx
// 文件卡片
<div className="flex items-center gap-3 bg-zinc-800/50 rounded-lg p-3">
  {/* 文件类型图标 */}
  <div className={cn(
    "w-10 h-10 rounded-lg flex items-center justify-center",
    iconColors[getFileCategory(fileType)]
  )}>
    {fileIcon}
  </div>

  {/* 文件信息 */}
  <div className="flex-1 min-w-0">
    <div className="text-sm font-medium text-zinc-200 truncate">
      {fileName}
    </div>
    <div className="text-xs text-zinc-500">
      {formatFileSize(size)}
    </div>
  </div>

  {/* 操作按钮 */}
  {onPreview && (
    <Button variant="ghost" size="icon" onClick={onPreview}>
      <Eye className="w-4 h-4" />
    </Button>
  )}
</div>

// 文件类型颜色
const iconColors = {
  image: 'bg-green-500/20 text-green-400',
  code: 'bg-blue-500/20 text-blue-400',
  document: 'bg-yellow-500/20 text-yellow-400',
  other: 'bg-zinc-500/20 text-zinc-400',
};
```

---

## 5. 实现计划

### 第一阶段：基础设施（1-2 天）

| 任务 | 描述 | 优先级 |
|------|------|--------|
| 目录结构创建 | 创建 `src/components/ai-chat/` 目录 | P0 |
| 类型定义 | 创建 `types/ai-chat.ts` | P0 |
| ChatContext 创建 | 状态管理和 Context Provider | P0 |
| Tailwind 配置更新 | 添加 AI 组件相关主题配置 | P0 |
| 基础组件搭建 | AIChat 容器和布局 | P0 |

**交付物**：
- 可运行的基础容器
- 类型定义文件
- 状态管理架构

### 第二阶段：核心消息展示（2-3 天）

| 任务 | 描述 | 优先级 |
|------|------|--------|
| ChatMessage 组件 | 消息基础渲染 | P0 |
| MessageBubble 组件 | Markdown 渲染和代码高亮 | P0 |
| MessageActions 组件 | 操作按钮（复制/重新生成/编辑） | P1 |
| 用户/AI 头像 | 头像组件 | P1 |

**交付物**：
- 完整的消息展示功能
- Markdown 和代码高亮支持
- 消息操作功能

### 第三阶段：特殊内容展示（2-3 天）

| 任务 | 描述 | 优先级 |
|------|------|--------|
| ReasoningPanel | 思考过程折叠面板 | P0 |
| ToolCallCard | 工具调用卡片 | P0 |
| FileAttachment | 文件附件展示 | P1 |
| StreamingIndicator | 流式响应指示器 | P1 |

**交付物**：
- 思考过程展示
- 工具调用状态展示
- 文件附件展示

### 第四阶段：输入功能（1-2 天）

| 任务 | 描述 | 优先级 |
|------|------|--------|
| PromptInput 组件 | 多行输入框 | P0 |
| 文件拖拽上传 | 附件支持 | P1 |
| 快捷键处理 | Enter/Shift+Enter | P1 |
| 发送动画 | 按钮反馈动画 | P2 |

**交付物**：
- 完整的输入功能
- 附件支持

### 第五阶段：集成与优化（2-3 天）

| 任务 | 描述 | 优先级 |
|------|------|--------|
| 与 Agent Service 集成 | WebSocket 流式对接 | P0 |
| 性能优化 | 虚拟滚动（大量消息时） | P1 |
| 动画完善 | 过渡动画和微交互 | P1 |
| 无障碍支持 | ARIA 标签和键盘导航 | P2 |
| 测试补全 | 单元测试和集成测试 | P1 |

**交付物**：
- 可投产的 AI 聊天组件
- 完整的测试覆盖

---

## 6. 风险与注意事项

### 6.1 技术风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Markdown 渲染性能 | 大量代码块时卡顿 | 使用 `react-markdown` + `remark-gfm`，按需渲染 |
| 流式渲染抖动 | 内容闪烁或跳动 | 使用 `useRef` 缓存 DOM，光标保持位置 |
| 内存泄漏 | 长时间使用后内存增长 | 及时清理订阅和定时器 |
| 长消息性能 | 几千行代码渲染慢 | 实现虚拟滚动，只渲染可见区域 |

### 6.2 实现注意事项

1. **流式渲染**：AI 响应使用 `useRef` 而非 `useState` 存储中间内容，避免频繁重渲染
2. **代码高亮**：使用 `highlight.js` 或 `shiki`，注意按需加载语言包
3. **滚动保持**：使用 `scrollIntoView` 和 `preserveScrollBehavior`
4. **Z-index 管理**：确保下拉菜单、Toast 等正确层级
5. **事件清理**：组件卸载时清理所有定时器、订阅和 AbortController

### 6.3 依赖包清单

```json
{
  "dependencies": {
    "react-markdown": "^9.0.0",
    "remark-gfm": "^4.0.0",
    "highlight.js": "^11.9.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.2.0",
    "class-variance-authority": "^0.7.0",
    "lucide-react": "^0.300.0"
  }
}
```

### 6.4 参考资源

- [TRAE UI 截图分析](./trae-ui-analysis.md)（如已创建）
- [shadcn/ui 组件模式](https://ui.shadcn.com/)
- [React Markdown 文档](https://remarkjs.github.io/react-markdown/)
- [Tailwind CSS 动画](https://tailwindcss.com/docs/animation)

---

## 附录：组件文件结构

```
src/
├── components/
│   └── ai-chat/
│       ├── AIChat.tsx                 # 主容器
│       ├── ChatMessage.tsx            # 消息组件
│       ├── MessageBubble.tsx          # 消息气泡
│       ├── MessageActions.tsx         # 操作按钮
│       ├── ReasoningPanel.tsx          # 思考面板
│       ├── ToolCallCard.tsx           # 工具卡片
│       ├── PromptInput.tsx             # 输入框
│       ├── StreamingIndicator.tsx    # 流式指示器
│       ├── FileAttachment.tsx         # 附件组件
│       ├── ChatContext.tsx            # 状态管理
│       └── index.ts                   # 导出入口
├── types/
│   └── ai-chat.ts                     # 类型定义
└── lib/
    └── utils.ts                       # cn() 等工具函数
```
