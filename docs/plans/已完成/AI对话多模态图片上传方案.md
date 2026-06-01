# AI 对话多模态 — 图片上传方案

> 版本：v1.2
> 创建日期：2026-05-27
> 根因确认：2026-05-29（代码审查验证 10 处断裂点）
> 第一轮修复：2026-05-29（全链路 images 参数贯通）
> 关联需求：[AI对话\_需求文档.md](../../项目文档/创作端/05-AI对话/AI对话_需求文档.md)
> 关联架构：[02_AIChat分层架构.md](../../项目文档/创作端/05-AI对话/技术/02_AIChat分层架构.md)

---

## 一、现状分析

### 1.1 已有能力

| 层级       | 组件/模块                                | 现状                                                  |
| :--------- | :--------------------------------------- | :---------------------------------------------------- |
| UI 组件    | `PromptInputAddImage`                    | ✅ 已支持图片文件选择（`accept="image/*"`，多选）     |
| UI 组件    | `usePromptInputAttachments`              | ✅ 已支持附件状态管理（add/remove/files）             |
| UI 组件    | `AttachmentPreview` / `AttachmentRemove` | ✅ 已支持缩略图预览和移除操作                         |
| UI 组件    | `ModelSelectWithGuard`                   | ✅ 已实现图片兼容性守卫（切换不支持图片的模型时拦截） |
| 模型元数据 | `ResolvedModel.supportsImages`           | ✅ 模型列表已携带图片支持标记                         |
| 消息类型   | `PromptInputMessage.files`               | ✅ onSubmit 回调已携带 `PromptInputFile[]`            |

### 1.2 根因分析（代码验证）

> 以下断裂点已通过代码审查逐一验证，标注了具体文件与行号。

| # | 位置 | 代码位置 | 问题 | 影响 |
| :-- | :--- | :--- | :--- | :--- |
| ① | `ChatInput.handleSubmit` | `chat-input.tsx:91` | `onSubmit(message.text \|\| "处理附件文件")` — 只传 text，`message.files` 被丢弃 | **根因起点**：图片数据在 UI 组件层被截断 |
| ② | `ChatInput.onSubmit` 类型 | `chat-input.tsx:52` | `onSubmit: (message: string) => void` — 回调签名不含 files 参数 | 类型层面不支持传递附件 |
| ③ | `useChatStream.handleSend` | `use-chat-stream.ts:159` | `async (userMessage: string)` — 仅接受文本参数 | Hook 层无法接收图片 |
| ④ | `useChatStream` 调用 StreamService | `use-chat-stream.ts:416` | `streamService.sendMessage(userMessage, workingDir)` — 无 images 参数 | 图片未传入通信层 |
| ⑤ | `StreamService.sendMessage` | `stream-service.ts:113-121` | `sendMessage(message: string, workingDir?: string)` — 仅发 text + workingDir | WebSocket 消息无图片字段 |
| ⑥ | `AgentStream.send` | `client.ts:315-323` | JSON 体只有 `type, id, content, workingDir, options` — 无 `images` | 客户端 SDK 不支持多模态 |
| ⑦ | `SendMessageOptions` 类型 | `types.ts:78-86` | 无 `images` 字段定义 | 类型层面不支持 |
| ⑧ | WebSocket 消息解析 | `websocket.ts:31-44` | `ClientMessage` 接口无 `images` 字段 | 服务端不解析图片 |
| ⑨ | `agent.sendMessage` 调用 | `websocket.ts:235-237` | `agent.sendMessage(message.content, message.options)` — 不传 images | Agent 层不接收图片 |
| ⑩ | `IBackendAdapter.sendMessage` | `base.ts:8` | `(content: string, options?: { stream?: boolean })` — 无 images 参数 | 后端适配器不支持多模态 |

**根因结论**：图片数据在 **ChatInput.handleSubmit**（第①处）被丢弃，后续全链路均无 images 参数传递。这是一处**设计遗漏** — UI 层已完整实现附件管理，但 `onSubmit` 回调签名仅为 `string`，导致图片从未进入数据流。

### 1.2.1 第一轮修复记录（2026-05-29）

已完成的修复 — 全链路 images 参数贯通：

| # | 文件 | 改动 |
| :-- | :--- | :--- |
| 1 | `packages/shared/src/index.ts` | 新增 `ImageAttachment` 共享类型 |
| 2 | `packages/agent-client/src/types.ts` | `SendMessageOptions` 添加 `images` 字段 |
| 3 | `packages/agent-client/src/client.ts` | `AgentStream.send` 和 `AgentClient.sendMessage` 支持 images |
| 4 | `packages/author-site/.../chat-input.tsx` | `handleSubmit` 提取图片转 Base64，`onSubmit` 签名扩展 |
| 5 | `packages/author-site/.../use-chat-stream.ts` | `handleSend` 接受 images 参数并透传 |
| 6 | `packages/author-site/.../stream-service.ts` | `sendMessage` 支持 images |
| 7 | `packages/agent-service/.../types.ts` | `SendMessageOptions` 添加 `images` 字段 |
| 8 | `packages/agent-service/.../websocket.ts` | 解析 images 并传递给 agent |
| 9 | `packages/agent-service/.../base.ts` | `sendMessage` 接口添加 images |
| 10 | `packages/agent-service/.../opencode-http.ts` | `sendMessage` 构建多模态 parts 数组 |

### 1.2.2 剩余问题（待排查）

> 第一轮修复后测试：发送图片，AI 依然看不到图片。需要排查以下环节。

| # | 排查方向 | 可能原因 | 排查方法 |
| :-- | :--- | :--- | :--- |
| **A** | OpenCode Server API 兼容性 | `/session/:id/message` 和 `/session/:id/prompt_async` 的 `parts` 数组是否支持 `type: "image"` 格式？ | 查阅 OpenCode Server API 文档或源码，确认 `parts` 支持的类型 |
| **B** | 图片 parts 格式 | 当前实现使用 `{ type: "image", image: data, mimeType }` — 字段名 `image` 和 `mimeType` 是否正确？OpenCode Server 可能期望 `data`/`mediaType` 或其他字段名 | 对比 OpenCode Server 的 `UserMessagePart` 类型定义 |
| **C** | 图片数据编码 | 前端 `fileToBase64` 去掉了 `data:...;base64,` 前缀，但 OpenCode Server 可能期望完整 Data URL 或纯 base64 字符串 | 测试发送不同格式的 base64 数据 |
| **D** | WebSocket 消息大小 | 大图片可能导致 WebSocket 帧超限，消息被静默丢弃 | 检查 agent-service 日志，确认消息是否到达后端 |
| **E** | 非 opencode-http 后端 | 如果使用的是 ACP 后端（claude/gemini 等），它们通过 stdio 子进程通信，images 参数未被传递到 ACP 协议层 | 检查当前使用的 backend 类型，确认是否为 opencode-http |
| **F** | 浏览器端图片转换 | `PromptInputFile.file` 可能为 undefined（File 对象在某些情况下会丢失） | 在 `handleSubmit` 中添加 `console.log(message.files)` 调试 |

### 1.3 数据流（修复后 + 待验证断裂点）

```
用户选图 → PromptInputAddImage → attachments.files（✅ 已有）
    → ChatInput.handleSubmit（chat-input.tsx:82-94）
        → fileToBase64() → ImageAttachment[]（✅ 已修复）
            → onSubmit(text, images)（✅ 已修复）
                → useChatStream.handleSend(text, images)（✅ 已修复）
                    → StreamService.sendMessage(text, workingDir, images)（✅ 已修复）
                        → AgentStream.send(text, id, { images })（✅ 已修复）
                            → WebSocket JSON: { type, content, images }（✅ 已修复）
                                → agent-service: ClientMessage.images（✅ 已修复）
                                    → agent.sendMessage(content, { images })（✅ 已修复）
                                        → OpenCodeHttpBackend.sendMessage（✅ 已修复）
                                            → parts = [...imageParts, {type:"text"}]（✅ 已修复）
                                                → POST /session/:id/message（⚠️ 待验证）
                                                    → OpenCode Server 处理（❓ 未知）
                                                        → LLM API（❓ 未知）
```

---

## 二、目标

当用户选择支持图片的多模态模型时，可在对话输入区上传图片（已在 UI 层实现），图片随文本一起发送到 AI Agent，AI 能基于图片内容理解用户意图并生成代码。

---

## 三、技术方案

### 3.1 图片编码策略

**方案：Base64 内联传输**

- 前端将图片文件转为 Base64 Data URL（`data:image/png;base64,...`）
- 通过 WebSocket JSON 消息体中的 `images` 数组字段传输
- 单张图片限制 4MB（前端压缩），单次消息最多 5 张图片

选择 Base64 而非独立上传的理由：

1. 避免引入额外的文件上传 API 和临时存储
2. 图片与消息文本原子性发送，无需关联 ID
3. 当前场景下图片数量少、体积小（UI 截图/设计稿参考）

### 3.2 全链路数据流设计

```
用户选图 → PromptInputAddImage → attachments.files
    → ChatInput.handleSubmit({ text, files })
        → 图片转 Base64：fileToBase64(file) → ImageAttachment[]
        → useChatStream.handleSend(text, images)
            → StreamService.sendMessage(text, images)
                → AgentStream.send(text, id, { images })
                    → WebSocket JSON: { type: "message", content, images: [...] }
                        → agent-service WS handler 解析 images
                            → Backend.sendMessage(content, { images })
                                → LLM API 多模态消息体
```

### 3.3 各层改动清单

#### Task 1：前端 — ChatInput 传递附件

**文件**：`packages/author-site/src/components/ai-elements/chat/chat-input.tsx`

- `handleSubmit` 中将 `message.files` 转为 Base64 数组
- 传递给 `onSubmit` 回调

```typescript
// ChatInput.handleSubmit 改造
const handleSubmit = useCallback(
  async (message: PromptInputMessage) => {
    const hasText = Boolean(message.text);
    const hasAttachments = Boolean(message.files?.length);
    if (!(hasText || hasAttachments)) return;

    // 将附件转为 Base64
    const images: ImageAttachment[] = [];
    if (message.files?.length) {
      for (const file of message.files) {
        if (file.file && file.type.startsWith("image/")) {
          const base64 = await fileToBase64(file.file);
          images.push({ data: base64, mimeType: file.type, name: file.name });
        }
      }
    }

    onSubmit(
      message.text || "处理附件图片",
      images.length > 0 ? images : undefined,
    );
  },
  [onSubmit],
);
```

**新增工具函数**：`chat/utils/image-utils.ts`

```typescript
export interface ImageAttachment {
  data: string; // Base64 字符串（不含 data:... 前缀）
  mimeType: string; // image/png, image/jpeg 等
  name: string; // 文件名
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // 去掉 "data:image/xxx;base64," 前缀
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
```

#### Task 2：前端 — AIChat 组合层适配

**文件**：`packages/author-site/src/components/ai-elements/ai-chat.tsx`

- `ChatInput.onSubmit` 类型从 `(message: string) => void` 改为 `(message: string, images?: ImageAttachment[]) => void`
- 将 `images` 参数透传给 `useChatStream.handleSend`

#### Task 3：前端 — useChatStream 支持图片参数

**文件**：`packages/author-site/src/components/ai-elements/chat/hooks/use-chat-stream.ts`

- `handleSend` 签名改为 `(userMessage: string, images?: ImageAttachment[]) => void`
- 将 `images` 传递给 `StreamService.sendMessage`
- 用户消息的 `ChatMessage` 中记录图片信息（用于历史回显）

```typescript
const handleSend = useCallback(
  async (userMessage: string, images?: ImageAttachment[]) => {
    // ... 现有逻辑 ...

    // 用户消息中记录图片
    setMessages((prev) => [
      ...prev,
      {
        id: `user-${Date.now()}`,
        role: "user",
        content: userMessage.trim(),
        parts:
          images?.map((img) => ({
            type: "image" as const,
            url: `data:${img.mimeType};base64,${img.data}`,
          })) || [],
      },
    ]);

    // ... StreamService.connect ...

    streamService.sendMessage(userMessage, workingDir, images);
  },
  [
    /* deps */
  ],
);
```

#### Task 4：前端 — StreamService 发送图片

**文件**：`packages/author-site/src/components/ai-elements/chat/services/stream-service.ts`

- `sendMessage` 签名新增 `images` 参数
- 将图片通过 WebSocket JSON 消息体发送

```typescript
sendMessage(message: string, workingDir?: string, images?: ImageAttachment[]): void {
  if (!this.stream) throw new Error("Stream not connected");
  this.stream.send(message, `msg-${Date.now()}`, {
    stream: true,
    workingDir,
    images,  // 新增
  });
}
```

#### Task 5：agent-client — AgentStream.send 支持图片

**文件**：`packages/agent-client/src/client.ts`

- `SendMessageOptions` 新增 `images` 字段
- `send` 方法将 `images` 包含在 WebSocket JSON 中

```typescript
// types.ts
export interface ImageAttachment {
  data: string;
  mimeType: string;
  name: string;
}

export interface SendMessageOptions {
  timeout?: number;
  stream?: boolean;
  workingDir?: string;
  images?: ImageAttachment[];  // 新增
  context?: { files?: string[]; presetRules?: string };
}

// client.ts — AgentStream.send
send(content: string, id?: string, options?: SendMessageOptions): void {
  // ...
  this.ws.send(JSON.stringify({
    type: "message",
    id: id || `msg-${Date.now()}`,
    content,
    workingDir: options?.workingDir,
    images: options?.images,  // 新增
    options,
  }));
}
```

#### Task 6：agent-service — WebSocket 消息路由解析图片

**文件**：`packages/agent-service/src/routes/ws-event-router.ts`（或对应的 WS handler）

- 解析 WebSocket 消息中的 `images` 字段
- 传递给 `Backend.sendMessage`

```typescript
// WS 消息体
interface WSMessagePayload {
  type: "message";
  id: string;
  content: string;
  workingDir?: string;
  images?: Array<{ data: string; mimeType: string; name: string }>;
  options?: SendMessageOptions;
}
```

#### Task 7：agent-service — BaseBackend 接口扩展

**文件**：`packages/agent-service/src/backends/base.ts`

```typescript
interface SendMessageOptions {
  stream?: boolean;
  images?: Array<{ data: string; mimeType: string; name: string }>;
}

interface BaseBackend {
  sendMessage(content: string, options?: SendMessageOptions): Promise<string>;
  // ...
}
```

#### Task 8：agent-service — 各 LLM Backend 适配多模态

需要适配的后端：

| 后端            | 多模态支持方式                                   | 优先级         |
| :-------------- | :----------------------------------------------- | :------------- |
| `opencode-http` | HTTP API 转发 images 字段                        | P0（默认后端） |
| `claude`        | Anthropic Messages API `content[].type: "image"` | P1             |
| `gemini`        | Gemini API `inlineData`                          | P1             |
| ACP 后端        | 通过 ACP 协议扩展 `images` 参数                  | P2             |

**Claude Backend 示例**：

```typescript
async sendMessage(content: string, options?: { stream?: boolean; images?: ImageAttachment[] }): Promise<string> {
  const messageContent: any[] = [];

  // 添加图片
  if (options?.images?.length) {
    for (const img of options.images) {
      messageContent.push({
        type: "image",
        source: { type: "base64", media_type: img.mimeType, data: img.data },
      });
    }
  }

  // 添加文本
  messageContent.push({ type: "text", text: content });

  this.conversationHistory.push({ role: "user", content: messageContent });
  // ... 后续 API 调用不变
}
```

#### Task 9：HTTP 降级模式支持

**文件**：`useChatStream` 中的 HTTP 降级分支 + `agent-client` 的 `sendMessage`

- HTTP `POST /api/agent/:sessionId/message` 的 body 中新增 `images` 字段
- `AgentClient.sendMessage` 签名扩展

### 3.4 类型定义汇总

新增共享类型（建议放在 `packages/shared/src/` 或 `agent-client/src/types.ts`）：

```typescript
/** 图片附件，Base64 编码 */
export interface ImageAttachment {
  /** Base64 数据（不含 data URI 前缀） */
  data: string;
  /** MIME 类型，如 image/png */
  mimeType: string;
  /** 原始文件名 */
  name: string;
}
```

---

## 四、消息历史中的图片回显

### 4.1 用户消息中的图片

用户发送带图片的消息后，`ChatMessage.parts` 中应包含 `image` 类型的 Part，用于在 `ChatMessages` 中回显：

```typescript
{
  role: "user",
  content: "帮我实现这个设计",
  parts: [
    { type: "image", url: "data:image/png;base64,..." },
    { type: "text", content: "帮我实现这个设计" },
  ]
}
```

### 4.2 持久化注意事项

- 消息持久化到 `data/sessions/` 时，Base64 图片会增加文件体积
- 建议：持久化时仅保存图片元数据（名称、MIME），不保存 Base64 数据；或限制历史消息中图片的保留数量

---

## 五、约束与安全

| 约束               | 说明                                                                     |
| :----------------- | :----------------------------------------------------------------------- |
| 图片大小限制       | 单张 ≤ 4MB（前端压缩），超出提示用户                                     |
| 数量限制           | 单次消息 ≤ 5 张（已有 `PromptInput.maxFiles = 5`）                       |
| 格式限制           | `image/png`、`image/jpeg`、`image/webp`、`image/gif`                     |
| 模型守卫           | 仅当 `currentSupportsImages = true` 时显示图片按钮（已实现）             |
| WebSocket 消息大小 | Base64 编码后约增大 33%，5 张 4MB 图片 ≈ 26MB JSON，需评估 WS 帧大小限制 |

---

## 六、WebSocket 大消息风险评估

当前方案在极端情况下（5 张 4MB 图片）WebSocket 单帧 JSON 约 26MB，可能存在问题：

**缓解方案**（按需实施）：

1. **前端压缩**：使用 Canvas API 将图片缩放到最大 1024px 宽，JPEG 质量 0.8
2. **分片发送**（远期）：图片先通过 HTTP 上传获取临时 URL，WebSocket 仅传 URL 引用
3. **WebSocket 帧大小调优**：确认 `ws` 库默认 `maxPayload` 并适当调大

建议 P0 阶段先用前端压缩控制体积，后续按需引入分片方案。

---

## 七、实施优先级

| 阶段 | 任务 | 说明 | 状态 |
| :--- | :--- | :--- | :--- |
| P0 | Task 1-5 + Task 9 | 前端全链路 + agent-client 类型扩展 | ✅ 已完成 |
| P0 | Task 6 | agent-service WS 解析 | ✅ 已完成 |
| P0 | Task 7 + Task 8（opencode-http） | 默认后端适配 | ✅ 已完成 |
| **P0** | **OpenCode Server API 兼容性验证** | **确认 API 支持 image parts** | ⏳ 待排查 |
| P1 | Task 8（claude, gemini） | 主流多模态后端适配 | ⏳ 待实施 |
| P2 | Task 8（ACP 后端） | ACP 协议层扩展 | ⏳ 待实施 |
| P2 | 消息历史图片回显优化 | 持久化体积优化 | ⏳ 待实施 |
| P3 | 分片发送方案 | 大图/多图场景优化 | ⏳ 待实施 |

---

## 八、测试要点

| 测试场景                   | 预期行为                                 |
| :------------------------- | :--------------------------------------- |
| 选择图片 + 输入文本 → 发送 | 文本和图片一起到达 AI，AI 能理解图片内容 |
| 仅选择图片，不输入文本     | 发送"处理附件图片"作为默认文本           |
| 切换到不支持图片的模型     | Toast 提示"请先移除已添加的图片"         |
| 上传超过 4MB 的图片        | 前端提示"图片过大，请压缩后重试"         |
| 上传 5 张以上图片          | PromptInput 已有的 maxFiles 限制阻止     |
| WebSocket 断开降级到 HTTP  | 图片通过 HTTP body 正确传递              |
| 对话历史中包含图片消息     | 图片缩略图正确回显                       |

---

## 九、相关文档

- [AI对话\_需求文档.md](../../项目文档/创作端/05-AI对话/AI对话_需求文档.md)
- [01\_对话组件设计.md](../../项目文档/创作端/05-AI对话/技术/01_对话组件设计.md)
- [02_AIChat分层架构.md](../../项目文档/创作端/05-AI对话/技术/02_AIChat分层架构.md)
- [AI对话模型选择功能方案](../已完成/AI对话/AI对话模型选择功能方案.md)（图片守卫的初始实现）

---

## 十、调试指南（下次修复用）

### 10.1 快速验证图片是否到达 OpenCode Server

在 `packages/agent-service/src/backends/opencode-http.ts` 的 `sendMessageSync` 方法开头添加日志：

```typescript
private async sendMessageSync(content: string, images?: ImageAttachment[]): Promise<string> {
  logger.info({ 
    contentLength: content.length, 
    imagesCount: images?.length,
    imageDetails: images?.map(img => ({ mimeType: img.mimeType, dataLength: img.data.length }))
  }, "OpenCodeHttpBackend.sendMessageSync called");
  // ... 原有逻辑
}
```

### 10.2 检查 OpenCode Server API 是否支持图片

测试命令（手动验证）：

```bash
# 1. 创建 session
curl -X POST http://localhost:4096/session \
  -H "Content-Type: application/json" \
  -d '{"title":"test-image"}'

# 返回 {"id":"<session-id>"}

# 2. 发送带图片的消息（用一个小的 1x1 像素 PNG base64）
curl -X POST http://localhost:4096/session/<session-id>/message \
  -H "Content-Type: application/json" \
  -d '{
    "parts": [
      {"type":"image","image":"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==","mimeType":"image/png"},
      {"type":"text","text":"这是什么图片？"}
    ]
  }'
```

如果返回错误，说明 OpenCode Server 不支持 image parts，需要查阅其 API 文档确认正确的格式。

### 10.3 前端调试

在 `packages/author-site/src/components/ai-elements/chat/chat-input.tsx` 的 `handleSubmit` 中添加日志：

```typescript
const handleSubmit = useCallback(
  async (message: PromptInputMessage) => {
    console.log("[ChatInput] handleSubmit called", {
      text: message.text,
      filesCount: message.files?.length,
      files: message.files?.map(f => ({ name: f.name, type: f.type, hasFile: !!f.file }))
    });
    // ... 原有逻辑
  },
  [onSubmit],
);
```

### 10.4 WebSocket 消息调试

在浏览器开发者工具的 Network → WS 标签中，找到 `/api/agent/:sessionId/stream` 连接，查看发送的消息是否包含 `images` 字段。
