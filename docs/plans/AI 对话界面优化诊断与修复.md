# 🛠️ AI 对话界面优化诊断与修复指南

## 一、 核心问题 1：消息层级混乱与内容互相污染（文本溢出到工具卡片）

### 🔴 现象描述
AI 思考的纯文本（Text/Reasoning）被错误地塞进了“工具调用”的状态卡片中，并且随着调用次数增加不断累加重复；同时，真正的工具调用和文本回复失去了先后顺序。

### 🔍 根因分析
查看您 `ai-chat.txt` 中的 `ChatMessage` 数据结构设计：
```typescript
export interface ChatMessage {
  content: string; // 纯文本
  reasonings?: Array<{...}>; // 思考列表
  tools?: Array<{...}>; // 工具列表
}
```
并且在 `assistant-message.txt` 中，您采用了**固定的三段式渲染**：顶部固定渲染所有 `reasonings`，中间固定渲染所有 `tools`，底部固定渲染 `content`。
**这就破坏了 Agent 真实的运行时间线**。真实的 Agent 数据流是线性的：`思考 -> 工具调用A -> 得到结果 -> 纯文本回复 -> 工具调用B -> 再次回复`。由于您将它们分别抽离到独立的数组/字符串中，并在收到数据流时无差别地向 `content` 中拼接文本，导致状态合并错误（例如误把普通流文本塞入正在运行的 tool 的 result/content 字段中）。

### 💡 修复指引：重构数据结构为 `Parts` 数组
请参考 Vercel AI SDK 的核心理念，将“平铺式”的字段改为“有序的块（Parts）”数组。
1. **修改 `ChatMessage` 接口**：废弃独立的 `content`、`reasonings`、`tools` 字段，统一改为 `parts: Array<MessagePart>`。
2. **定义 `MessagePart` 的具体类型**，例如：
   * `TextPart`: 包含普通的 AI 回复内容。
   * `ReasoningPart`: 包含 AI 的思考片段。
   * `ToolCallPart`: 包含工具的 ID、名称、入参、执行状态和结果。
3. **改造数据监听 (`ai-chat.txt`)**：
   * 在处理 `stream.on` 的各个事件时，不要向全局的 `accumulatedContent` 无脑拼接。
   * 当收到 `stream`（文本流）时，寻找当前 `parts` 数组的最后一个 Part，如果它不是 `TextPart`，则新建一个 `TextPart` 并推入数组；如果是，则将增量文本追加到该 `TextPart` 的 `content` 中。
   * 当收到 `tool_call` 时，向 `parts` 数组推入一个全新的 `ToolCallPart`。
   * 当收到 `tool_call_update` 时，根据 `toolCallId` 遍历 `parts`，找到对应的 `ToolCallPart` 更新其 `状态(status)` 和 `结果(result)`，**绝不要**把无关的普通 `content` 塞进去。

---

## 二、 核心问题 2：工具调用解析异常（详情与状态缺失）

### 🔴 现象描述
所有的工具调用都显示为“未知文件”，并且无法像 Cursor/Trae 那样展开查看工具的“入参（Arguments/Parameters）”和“执行结果（Result）”。

### 🔍 根因分析
1. **取值兼容性问题**：在 `ai-chat.txt` 监听 `tool_call` 时，您使用了 `event.title || event.kind` 作为工具名称，而当这些字段缺失时回退到了“未知工具”。`acp` 协议底层返回的工具名称通常叫做 `name` 或 `toolName`，入参可能是 `arguments`（JSON字符串）或 `parameters`（对象）。当前映射逻辑未能准确抓取到原始协议中的字段。
2. **UI 组件能力缺失**：查看您的 `tool.txt` (`Tool` 组件)，该组件**完全没有**编写用于展示 `parameters` 和 `result` 的 DOM 结构。它只渲染了一个图标、一个文件名（甚至是从 path 强行截取的）和一个状态文本。如果没有用来渲染 JSON 代码块的 UI 代码，数据自然无法展示。

### 💡 修复指引：补全工具数据映射与 UI 展开态
1. **排查 ACP 协议真实 Payload (`ai-chat.txt`)**：
   * 在 `stream.on('tool_call')` 中打印完整的 `event` 对象：`console.log('Tool Call Event:', event)`。
   * 根据打印出的真实结构（寻找真正的工具名、输入参数字段），修正数据组装逻辑，确保 `toolName` 和 `args` 被准确提取并保存到 `ToolCallPart`。
2. **升级 `Tool` 组件 (`tool.txt`)**：
   * 为 `Tool` 组件引入折叠面板（可以使用您现有的 `Collapsible`）。
   * 组件的 Header 应该展示 `toolName`（如 `fs_read`）而不是硬凑的文件名。
   * 组件的 Content 区域，需要添加两个只读的区块，分别用来渲染格式化后的入参 `JSON.stringify(parameters, null, 2)` 和执行结果 `result`。

---

## 三、 核心问题 3：思维链（Chain of Thought）展示效果不佳

### 🔴 现象描述
目前的思考和工具展示是两个并列的下拉面板（且工具调用无法展开），缺乏步骤递进感，没有官方 `elements.ai-sdk.dev` 那种“思考和工具调用串联在一起”的树状时间线体验。

### 🔍 根因分析
查看 `assistant-message.txt` 发现，您目前是手动维护了 `reasoningOpen` 和 `toolsOpen` 两个独立面板。这就导致了割裂感。而在官方 `ChainOfThought` 的设计中，“思考（Reasoning）”和“工具调用（Tool Invocation）”都属于 AI 处理过程的**子步骤（Steps）**，它们应该包裹在同一个上下文中。

### 💡 修复指引：统一使用 `<ChainOfThought>` 组件构建时间线
参考官方文档 [Chain of Thought Components](https://elements.ai-sdk.dev/components/chain-of-thought) 的理念，建议按照以下方式重构 `AssistantMessage` 组件：

1. **统一包裹器**：
   为整条消息的“中间过程”准备一个统一的 `<ChainOfThought>` 包裹器。
2. **基于 Parts 数组动态渲染 (`assistant-message.txt`)**：
   遍历我们第一步优化后的 `parts` 数组：
   * 遇到 `ReasoningPart` -> 渲染一个 `<ChainOfThoughtStep>`，并在内部渲染您的 `Reasoning` 内容。
   * 遇到 `ToolCallPart` -> 同样渲染一个 `<ChainOfThoughtStep>`，在其内部渲染 `ToolCall` 组件（此时 ToolCall 不需要自带外框，作为 Step 的一部分即可）。
   * 遇到 `TextPart` -> **跳出** `<ChainOfThought>` 区域，将其作为普通 Markdown 正文渲染在下方。
3. **状态联动**：
   利用您写好的 `chain-of-thought.txt` 中的 `status` 属性，结合当前工具执行状态（`running` / `completed`）动态赋予 `<ChainOfThoughtStep status={...}>`，从而自然触发 Loading 动画或完成后的打勾图标。

---

### 🚀 总结下一步行动计划（Action Items）
作为开发者，您可以按以下顺序开始重构：
1. **修改数据结构**：先把 `ChatMessage` 接口改为基于 `parts` 数组的设计。
2. **重写 WebSocket Event 处理流**：在 `ai-chat.txt` 中，把 `stream`, `thought`, `tool_call` 事件转化为对 `parts` 数组的 追加/更新 操作。
3. **升级 Tool 组件**：打印出真实的协议数据，并在 `tool.txt` 中加上入参和返回值的代码高亮展示区。
4. **重构 AssistantMessage**：删除独立的 `toolsOpen` 和 `reasoningsOpen` 逻辑，用唯一的 `<ChainOfThought>` 容器遍历渲染 `parts` 中的中间过程块。纯文本块则渲染在容器外部。