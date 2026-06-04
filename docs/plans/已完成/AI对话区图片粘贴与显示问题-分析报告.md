# AI 对话区图片粘贴与显示问题 — 问题分析报告

## 1. 问题背景

### 问题描述
创作端项目编辑页的 AI 对话区存在两个关联问题：
1. **无法通过粘贴上传剪切板图片**：输入框只能通过「添加图片」按钮上传本地图片，用户在别处复制图片后在输入框 Ctrl+V/Cmd+V 粘贴，图片不会被捕获。
2. **发送图片后用户消息中不显示图片**：即使通过按钮上传图片并发送，用户消息气泡中仅显示文本内容，不显示已发送的图片。

### 发生场景
- **环境**：开发环境，author-site (Next.js 14)
- **触发条件**：用户在 AI 对话输入框粘贴剪贴板图片 / 通过上传按钮发送图片消息

### 预期行为
1. 用户从系统剪贴板复制图片后，在输入框粘贴能自动将图片加入附件预览，可发送
2. 发送后用户消息气泡能展示图片内容（类似现有附件预览的展示方式）

### 实际行为
1. 粘贴图片无任何响应，图片未加入附件
2. 发送后用户气泡仅显示纯文本，图片丢失

---

## 2. 根因分析

### 调查过程

1. **追踪图片输入流**：从 `ChatInput` → `PromptInput` → `PromptInputTextarea`，确认粘贴事件的缺失
2. **追踪图片发送流**：从 `ChatInput.handleSubmit` → `handleSend`（use-chat-stream） → 消息列表，确认 `ChatMessage` 对象已正确携带 `parts` 中的图片数据
3. **追踪用户消息渲染流**：从 `ChatMessages` → `Message` 组件，确认用户消息分支只渲染 `content` 文本，忽略 `parts`

### 证据链

| 证据 | 级别 | 来源 | 说明 |
|------|------|------|------|
| PromptInputTextarea 无 onPaste 处理 | A | `prompt-input.tsx:282-339` | Textarea 仅处理 onChange/onKeyDown，未处理图片粘贴 |
| PromptInput 整体无粘贴事件 | A | `prompt-input.tsx:111-244` | form 元素只处理了 onDrop（拖拽），无 onPaste |
| 用户消息气泡仅渲染 content | A | `message.tsx:217-239` | 用户角色分支只检查并渲染 `message.content`，完全不读取 `message.parts` |
| handleSend 正确构造了带 image part 的 ChatMessage | A | `use-chat-stream.ts:166-177` | 图片数据以 `parts[{type:"image", url:"data:..."}]` 形式存入消息 |
| handleEditResend 不支持图片重新发送 | A | `use-chat-stream.ts:693-708` | `handleEditResend` 调用 `handleSend(newContent)` 时省略了图片参数；对比 `handleRegenerate`（L652-664）已正确提取并传递图片 |
| persistMessages 丢弃 parts | A | `message-service.ts:9-14` | 保存消息时只保留 id/role/content/timestamp，parts 被丢弃 |

### 根本原因

**问题1 — 粘贴不上传**：`PromptInputTextarea` 组件没有注册 `onPaste` 事件处理器，导致系统剪贴板的图片数据无法进入附件管理流程（`context.addFiles`）。对比之下，拖拽上传通过 `onDrop` 正常处理，有独立的事件处理器。

**问题2 — 发送后不显示**：`Message` 组件的用户消息渲染分支（`message.tsx:145-239`）仅渲染 `message.content`（纯文本），完全忽略了 `message.parts` 中可能携带的 `{type:"image"}` 条目。而相同的 `parts` 字段在 AI 消息分支（通过 `AssistantMessage`）中是被完整支持的。

**关联现象**：`persistMessages` 序列化时丢弃 `parts`（`message-service.ts:9-14`），这意味着即使渲染修复后，页面刷新/会话恢复后图片数据也会丢失。但这是消息持久化层面的问题，渲染问题是用户直接感知的现象。

### 代码执行路径

```
[粘贴图片] 用户 Ctrl+V
  → PromptInputTextarea (无 onPaste) ✗ 无法捕获剪贴板图片

[上传按钮图片] 用户点击 PromptInputAddImage
  → ChatInput.handleSubmit → fileToBase64()
  → ChatInput.onSubmit(text, images)
  → handleSend(userMessage, images) [use-chat-stream.ts:162]
  → setMessages → 构造 {content: text, parts: [{type: "image", url: "data:..."}]}
  → 消息列表更新
  → ChatMessages → <Message> 组件
  → message.tsx:145 用户分支 (仅渲染 content) ✗ 图片不显示
```

---

## 3. 解决方案

### 方案一：PromptInputTextarea 增加粘贴处理 + Message 用户分支渲染图片（推荐）

**描述**：
1. 在 `PromptInputTextarea` 中增加 `onPaste` 事件处理，检测剪贴板中的 `image` 类型数据，通过 `context.addFiles()` 添加到附件列表
2. 在 `Message` 组件的用户消息分支中，遍历 `message.parts`，渲染 `type === "image"` 的条目
3. 修复 `handleEditResend` 在重新发送时保留原消息的图片 parts

**涉及修改**：
| 文件 | 修改内容 | 说明 |
|------|---------|------|
| `prompt-input.tsx` | 在 `PromptInputTextarea` 添加 `onPaste` | 从 `event.clipboardData.items` 中提取图片并调用 `context.addFiles()` |
| `message.tsx` | 用户分支在 text 前后渲染 `image` type parts | 遍历 `message.parts`，对 `image` 类型渲染 `<img>` |
| `use-chat-stream.ts` | `handleEditResend` 传入图片参数 | 在截断消息后查找原用户消息的图片 parts，传入 `handleSend` |

**原理**：
- 粘贴 → 通过 Clipboard API 获取 `DataTransferItemList` 中的 `image/png` 等类型文件，复用现有的 `addFiles` 流程。**注意边界情况**：当粘贴内容同时包含图片和文本时，`preventDefault` 会拦截文本粘贴——建议 v1 只处理纯图片粘贴（`item.kind === 'file'`），纯文本粘贴走默认行为
- 显示 → 复用 `parts` 中的图片数据 URI，展示方式参考 `AssistantMessage` 中已有的 image render block（`assistant-message.tsx:432-441`），使用 `max-w-full rounded-md` 确保图片不超出气泡
- 编辑重发 → 参照 `handleRegenerate`（`use-chat-stream.ts:652-664`）已有的图片提取逻辑，确保编辑后消息也能带图重新发送

**影响范围**：3 个文件，共约 40-60 行新增逻辑，不改变现有接口签名

**风险**：低。粘贴处理需要处理大尺寸图片的内存占用（已有 maxSize 限制）；图片显示需注意过宽图片的样式约束

**复杂度**：低

### 方案二：额外考虑 — persistMessages 持久化图片

**描述**：在 `persistMessages` 中增加 `parts` 字段的存储，或将图片分块存储（将 base64 图片单独上传存储，消息中存 URL 引用）。

**风险**：base64 图片数据可能很大（数 MB），直接存储到 API 请求体可能超限。建议作为后续优化项，因为用户当前最直接感知的是渲染问题。

### 后续建议
- 在 `handleRegenerate` 中已正确支持图片重新发送（`use-chat-stream.ts:652-664`），可作为参考实现 `handleEditResend` 的图片支持
- `persistMessages` 的图片持久化问题：建议将图片数据从消息中剥离，通过独立 API 上传存储，消息中仅保存图片 ID 或 URL 引用（类似 `ProjectImage` 的机制）

---

## 4. 相关代码路径

### 涉及文件

| 文件路径 | 行号 | 说明 |
|---------|------|------|
| `packages/author-site/src/components/ai-elements/prompt-input.tsx` | L282-L339 | PromptInputTextarea 需要添加 onPaste 处理器 |
| `packages/author-site/src/components/ai-elements/message.tsx` | L145-L239 | Message 用户分支需要渲染 image parts |
| `packages/author-site/src/components/ai-elements/chat/hooks/use-chat-stream.ts` | L162-L177 | handleSend 构造带图片的用户消息（已正确） |
| `packages/author-site/src/components/ai-elements/chat/hooks/use-chat-stream.ts` | L693-L708 | handleEditResend 需要传递图片参数 |
| `packages/author-site/src/components/ai-elements/chat/services/message-service.ts` | L9-L14 | persistMessages 需要持久化图片（后续优化） |
| `packages/author-site/src/components/ai-elements/chat/chat-input.tsx` | L93-L114 | ChatInput 的 handleSubmit 封装（已正确，仅传递 images） |

### 调用链

```
[粘贴图片] 
  PromptInputTextarea (当前: 无 onPaste)
  → 添加 onPaste → context.addFiles() → 附件预览显示

[发送图片后渲染] 
  AIChat → ChatInput.handleSubmit → handleSend [use-chat-stream.ts]
  → setMessages → {content, parts: [{type:"image", url:"data:..."}]}
  → ChatMessages → Message [message.tsx]
  → 用户分支 (当前: 仅渲染 content)
  → 添加 parts 遍历 → 渲染 image 条目 → 图片正确显示
```

### 相关类型定义

| 类型 | 文件 | 行号 |
|------|------|------|
| `ChatMessage` (完整) | `message.tsx` | L59-L97 |
| `MessagePart` (含 image) | `message.tsx` | L27-L57 |
| `PromptInputFile` | `prompt-input.tsx` | L29-L36 |
| `ImageAttachment` (agent-client) | `@opencode-workbench/agent-client` | — |
