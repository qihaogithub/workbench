# AI 对话多模态 — 图片上传方案

> 版本：v1.0
> 创建日期：2026-05-27
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

### 1.2 断裂点

| 位置                                      | 问题                                          | 影响                          |
| :---------------------------------------- | :-------------------------------------------- | :---------------------------- |
| `ChatInput.handleSubmit`                  | 仅传递 `message.text`，丢弃 `message.files`   | 图片数据在 UI → Hook 边界丢失 |
| `useChatStream.handleSend`                | 签名为 `(userMessage: string)`，不接受附件    | 无法将图片传入流式通信层      |
| `StreamService.sendMessage`               | 仅发送 `{ type, id, content, workingDir }`    | WebSocket 消息体无图片字段    |
| `AgentStream.send` (agent-client)         | 签名为 `(content, id?, options?)`             | 客户端 SDK 不支持多模态       |
| `BaseBackend.sendMessage` (agent-service) | 签名为 `(content: string)`                    | 后端无法接收和转发图片        |
| 各 LLM Backend                            | Claude/Gemini 等 API 适配层未构建多模态消息体 | 图片无法送达模型              |

### 1.3 数据流断裂示意

```
用户选图 → PromptInputAddImage → attachments.files（✅ 已有）
    → ChatInput.handleSubmit → 只取 text（❌ files 丢弃）
        → useChatStream.handleSend(text)（❌ 无图片参数）
            → StreamService.sendMessage(text)（❌ 无图片字段）
                → AgentStream.send(text)（❌ 无图片字段）
                    → agent-service WebSocket handler（❌ 不解析图片）
                        → Backend.sendMessage(text)（❌ 不支持多模态）
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

| 阶段 | 任务                             | 说明                               |
| :--- | :------------------------------- | :--------------------------------- |
| P0   | Task 1-5 + Task 9                | 前端全链路 + agent-client 类型扩展 |
| P0   | Task 6                           | agent-service WS 解析              |
| P0   | Task 7 + Task 8（opencode-http） | 默认后端适配                       |
| P1   | Task 8（claude, gemini）         | 主流多模态后端适配                 |
| P2   | Task 8（ACP 后端）               | ACP 协议层扩展                     |
| P2   | 消息历史图片回显优化             | 持久化体积优化                     |
| P3   | 分片发送方案                     | 大图/多图场景优化                  |

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
