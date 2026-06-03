# AI对话区消息展示效果优化方案

> 版本：v2.0  
> 创建日期：2026-06-03  
> 更新日期：2026-06-04  
> 关联问题：消息操作功能过于单一、滚动体验不佳、代码块对非专业用户不友好  
> 状态：方案评审中

---

## 二、现状分析

### 2.1 现有架构

AI 对话区消息展示采用三层组件结构：

| 层级           | 组件                           | 文件                                    | 职责                         |
| -------------- | ------------------------------ | --------------------------------------- | ---------------------------- |
| **容器层**     | `AIChat`                       | `ai-chat.tsx`                           | 整体布局、状态管理、滚动控制 |
| **消息列表层** | `ChatMessages`                 | `chat-messages.tsx`                     | 消息遍历渲染、空状态展示     |
| **消息渲染层** | `Message` / `AssistantMessage` | `message.tsx` / `assistant-message.tsx` | 单条消息内容渲染、折叠交互   |

### 2.2 当前展示能力（已实现）

当前 AI 消息渲染采用**智能分块策略**（`renderBlocks`），已具备完整聚合能力：

| 内容类型  | 聚合规则                   | 展示形式                   | 折叠行为                     |
| --------- | -------------------------- | -------------------------- | ---------------------------- |
| 思考过程  | 连续 reasoning 合并为一组  | `Reasoning` 组件           | 流式展开 → 结束后 800ms 折叠 |
| 工具调用  | 连续同类型工具（≥2个）合并 | `ToolCallGroup` 组件       | 手动展开/折叠                |
| 执行阶段  | reasoning + tool 交替混合  | `ExecutionPhase` 组件      | 流式展开 → 结束后 800ms 折叠 |
| 文本回复  | 独立文本块                 | `Streamdown` Markdown 渲染 | 不折叠                       |
| 图片/文件 | 独立渲染                   | `<img>` / `<a>`            | 不折叠                       |

**结论**：消息**展示结构本身已较完善**，主要短板在于：

1. **滚动体验**（强制跟随，用户无法回看）
2. **消息操作**（仅复制，无重新生成/回撤/编辑/反馈）
3. **代码块展示**（对非专业用户过于技术化）
4. **流式指示器**（信息量不足）

### 2.3 关键问题清单

#### 问题 1：滚动体验不佳（P0）

**代码位置**：`ai-chat.tsx` 第 145-147 行

```typescript
useEffect(() => {
  messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
}, [messages, streamContent]);
```

**现象**：

- 每次 `messages` 或 `streamContent` 变化都触发滚动
- **流式输出期间频繁滚动**，用户无法回看历史
- **缺少用户手动滚动打断机制**
- 滚动容器是 `ConversationContent` 中的 `ScrollAreaPrimitive`（Radix ScrollArea），而非普通 div

---

#### 问题 2：消息操作功能单一（P0）

**当前状态**：AI 消息仅有 `hover` 显示的"复制"按钮（`assistant-message.tsx` 第 460-474 行）。

**缺失的关键操作**：

- **重新生成**：对 AI 回答不满意时，一键用相同问题重新请求
- **回撤**：撤销上一轮 AI 对文件的修改，同时删除对应的问答对
- **编辑**：修改用户已发送的消息并重新请求

**当前消息持久化能力**：

- `POST /api/sessions/{sessionId}/messages`：整体覆盖写（`message-service.ts`）
- `agent-service` 有 `/api/agent/:sessionId/rollback` 端点，但**当前为空实现**（直接返回成功）
- `SnapshotService` 已具备文件快照对比和恢复能力（`snapshot-service.ts`）

---

#### 问题 3：代码块对非专业用户过于技术化（P1）

**当前状态**：`@streamdown/code` 插件渲染的代码块包含：

- 语法高亮 + 行号 + 语言标签 + 复制按钮
- 完整展示原始代码（占大量垂直空间）

**目标用户画像**：本项目面向**非专业用户**（运营/产品/设计师），通常**不看代码**，AI 生成的代码对他们而言是噪音。

**需求**：代码块应**默认折叠**，仅显示"已生成 X 行代码"的摘要，用户可选择性展开。

---

#### 问题 5：间距和视觉层次微调（P2）

**当前状态**：

- 外层 `ConversationContent` 已有 `gap-4 p-4`（`conversation.tsx` 第 29 行），消息间距已统一
- AI 消息内部折叠触发器字号偏小（`text-[11px]`），与正文 `text-[14px]` 落差较大，点击区域也偏小

---

#### 问题 6：执行过程展示区域过长（P2）

**当前状态**：`ExecutionPhase` 组件（`assistant-message.tsx` 第 530-639 行）展开后，内容区域没有最大高度限制。当 AI 进行多次思考 + 多次工具调用时，执行过程会占据大量垂直空间，影响页面整体阅读体验。

**思考内容展示策略**：
- 直接展示 AI 原始思考文本（英文），不做摘要、不做翻译
- 多次连续思考不做视觉区分（无步骤编号、无分割线）
- 标题栏保持当前格式（如"执行过程（3 次思考、1 次工具调用）"），不添加额外信息

**优化目标**：仅通过**限高 + 滚动区域**，让执行过程内容区视觉上可控、滚动体验良好。

**当前代码结构**：

```typescript
// assistant-message.tsx 第 585-636 行
<CollapsibleContent className="overflow-hidden transition-all ...">
  <div className="pl-4 border-l border-border/20 ml-[5px] mt-0.5 space-y-0.5">
    {parts.map((part, i) => { /* ... */ })}
  </div>
</CollapsibleContent>
```

---

## 三、优化方案设计

### 3.1 优化目标与优先级

| 优化项           | 目标                        | 优先级 | 工作量 |
| ---------------- | --------------------------- | ------ | ------ |
| 智能滚动控制     | 用户可打断 + 回到底部按钮   | **P0** | 2h     |
| 消息操作功能扩展 | 复制/重新生成/回撤/编辑     | **P0** | 4-5h   |
| 代码块简化展示   | 默认折叠，仅显示摘要        | **P1** | 1.5h   |
| 执行过程限高滚动 | 内容区限高+优雅滚动体验     | **P2** | 1h     |
| 流式指示器动画   | 保持信息简洁，优化视觉动画  | **P2** | 0.5h   |
| 间距微调         | 增大折叠触发器字号和点击区  | **P2** | 0.5h   |

---

### 3.2 方案 1：智能滚动控制（P0）

#### 3.2.1 技术前提

当前 `ConversationContent` 使用 `ScrollAreaPrimitive`（Radix ScrollArea），滚动发生在内部 `viewport` 元素上，而非外层容器。`scrollIntoView` 方案不直接适用。

**推荐方案**：将 `ConversationContent` 替换为原生滚动容器（`<div>` + `overflow-y-auto`），简化滚动控制。Radix ScrollArea 的主要价值是自定义滚动条样式，这个收益在聊天场景下远低于滚动控制的复杂度。

#### 3.2.2 滚动控制逻辑

```typescript
// ai-chat.tsx
const scrollContainerRef = useRef<HTMLDivElement>(null);
const [isUserScrolling, setIsUserScrolling] = useState(false);

// 监听滚动，判断是否在底部附近
const handleScroll = useCallback(() => {
  const el = scrollContainerRef.current;
  if (!el) return;
  const threshold = 100; // 距底部 100px 内视为"在底部"
  const isNearBottom =
    el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  setIsUserScrolling(!isNearBottom);
}, []);

// 智能自动滚动：仅当用户未手动滚动时
useEffect(() => {
  if (isUserScrolling) return;
  const el = scrollContainerRef.current;
  if (!el) return;
  el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
}, [messages, currentMessage.parts, isUserScrolling]);

// 用户点击"回到底部"
const scrollToBottom = useCallback(() => {
  const el = scrollContainerRef.current;
  if (!el) return;
  el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  setIsUserScrolling(false);
}, []);
```

#### 3.2.3 "回到底部"按钮

```tsx
{
  isUserScrolling && isStreaming && (
    <button
      onClick={scrollToBottom}
      className="sticky bottom-4 self-center bg-primary text-primary-foreground px-4 py-2 rounded-full shadow-lg text-sm flex items-center gap-2 z-10"
    >
      <ArrowDown className="h-4 w-4" />
      回到底部
    </button>
  );
}
```

> 使用 `sticky` 而非 `fixed`，避免脱离对话区容器。

#### 3.2.4 文件改动

| 文件                | 改动                                                                           |
| ------------------- | ------------------------------------------------------------------------------ |
| `conversation.tsx`  | `ConversationContent` 替换为原生 `<div>` + `overflow-y-auto`                   |
| `ai-chat.tsx`       | 新增 `scrollContainerRef`、`isUserScrolling`、`handleScroll`、`scrollToBottom` |
| `chat-messages.tsx` | 新增"回到底部"按钮（条件渲染）                                                 |

---

### 3.3 方案 2：消息操作功能扩展（P0，核心新增）

#### 3.3.1 操作功能矩阵

| 操作         | 适用对象                | 触发方式   | 行为                                           | 后端依赖                     |
| ------------ | ----------------------- | ---------- | ---------------------------------------------- | ---------------------------- |
| **复制**     | AI 消息                 | hover 按钮 | 复制文本内容到剪贴板                           | 无                           |
| **重新生成** | AI 消息                 | hover 按钮 | 找到配对的用户消息，重新发送，替换当前 AI 回复 | `handleSend` + 消息截断      |
| **编辑**     | 用户消息                | hover 按钮 | 进入编辑态，修改后重发，删除后续所有消息       | 消息截断 + `handleSend`      |
| **回撤**     | AI 消息（有文件修改时） | hover 按钮 | 恢复文件到本轮对话前的状态 + 删除本轮问答      | `snapshotService` + 消息截断 |

#### 3.3.2 操作栏 UI 设计

在 AI 消息底部显示操作栏（PC 端仅 hover 时显示）：

```
┌─ AI 消息内容 ─────────────────────────────────┐
│ [思考过程]                                    │
│ [执行阶段]                                    │
│ 这里是 AI 的回复文本...                       │
│                                               │
│ [📋 复制] [🔄 重新生成] [↩️ 回撤]               │  ← hover 显示
└───────────────────────────────────────────────┘
```

**组件结构**：

```tsx
function MessageActionBar({
  message,
  onRegenerate,
  onRollback,
  hasFileChanges,
}: MessageActionBarProps) {
  return (
    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity mt-1">
      <ActionButton icon={Copy} label="复制" onClick={handleCopy} />
      <ActionButton icon={RotateCcw} label="重新生成" onClick={onRegenerate} />
      {hasFileChanges && (
        <ActionButton icon={Undo2} label="回撤" onClick={onRollback} />
      )}
    </div>
  );
}
```

#### 3.3.3 核心操作实现

##### (a) 重新生成（Regenerate）

```typescript
// use-chat-stream.ts 新增
const handleRegenerate = useCallback(
  (targetAssistantId: string) => {
    const msgs = messagesRef.current;
    const targetIndex = msgs.findIndex((m) => m.id === targetAssistantId);
    if (targetIndex < 1) return;

    // 向前找到配对的用户消息
    const userMsg = msgs
      .slice(0, targetIndex)
      .reverse()
      .find((m) => m.role === "user");
    if (!userMsg) return;

    // 截断消息到目标 AI 消息之前
    const truncated = msgs.slice(0, targetIndex);
    setMessages(truncated);
    persistMessages(sessionId, truncated);

    // 重新发送用户消息
    handleSend(
      userMsg.content,
      userMsg.parts?.filter((p) => p.type === "image") as ImageAttachment[],
    );
  },
  [messagesRef, setMessages, sessionId, handleSend],
);
```

##### (b) 编辑用户消息（Edit & Resend）

```typescript
// 在 Message 组件（用户消息）中
const [editing, setEditing] = useState(false);
const [editContent, setEditContent] = useState(message.content);

const handleSubmitEdit = () => {
  if (!editContent.trim() || editContent === message.content) {
    setEditing(false);
    return;
  }
  // 截断当前用户消息及之后的所有消息
  const msgIndex = messages.findIndex((m) => m.id === message.id);
  const truncated = messages.slice(0, msgIndex);
  setMessages(truncated);
  // 用新内容重发
  handleSend(editContent);
  setEditing(false);
};
```

UI：编辑态将消息气泡替换为 `<textarea>` + 确认/取消按钮。

##### (c) 回撤（Rollback）

**回撤涉及两个层面**：

1. **消息层**：截断本轮问答
2. **文件层**：恢复工作空间文件到本轮 AI 操作前的状态

```typescript
// use-chat-stream.ts 新增
const handleRollback = useCallback(
  async (targetAssistantId: string) => {
    const msgs = messagesRef.current;
    const targetIndex = msgs.findIndex((m) => m.id === targetAssistantId);
    if (targetIndex < 1) return;

    // 1. 调用后端 rollback 恢复文件
    try {
      await fetch(`/api/agent/${agentSessionId}/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assistantMessageId: targetAssistantId }),
      });
      // 触发文件刷新
      onSnapshotReady?.();
    } catch (e) {
      console.warn("[Rollback] File rollback failed:", e);
    }

    // 2. 截断消息
    const truncated = msgs.slice(0, targetIndex);
    setMessages(truncated);
    await persistMessages(sessionId, truncated);
  },
  [messagesRef, setMessages, sessionId, agentSessionId, onSnapshotReady],
);
```

**后端改造**：当前 `agent-service` 的 `/rollback` 是空实现，需补充：

- 接收 `assistantMessageId` 参数
- 通过 `SnapshotService` 恢复到该消息生成前的文件状态
- 如果项目使用 `project-workspace-manager` 的版本快照（`SNAPSHOTS_DIR`），可调用 `restoreVersion`

**回撤条件判断**：

- 仅当 AI 消息关联了文件修改（`files` 字段非空）时显示回撤按钮
- 如果 AI 消息只是纯文本回复（无工具调用），仅显示"重新生成"即可

#### 3.3.4 用户消息操作栏

用户消息 hover 时显示"编辑"按钮：

```
                                        ┌─────────────────┐
                                        │ 用户消息内容     │ [✏️ 编辑]
                                        └─────────────────┘
```

点击后进入编辑态，气泡变为 textarea + 确认/取消按钮。

#### 3.3.5 文件改动汇总

| 文件                            | 改动                                          |
| ------------------------------- | --------------------------------------------- |
| `assistant-message.tsx`         | 新增 `MessageActionBar`（复制/重新生成/回撤） |
| `message.tsx`                   | 用户消息新增编辑按钮和编辑态                  |
| `use-chat-stream.ts`            | 新增 `handleRegenerate`、`handleRollback`     |
| `message-service.ts`            | 无改动（`persistMessages` 已支持覆盖写）      |
| `agent-service/routes/agent.ts` | 补全 `/rollback` 端点实现                     |

---

### 3.4 方案 3：代码块简化展示（P1）

#### 3.4.1 目标

面向非专业用户，代码块应**默认折叠**，仅显示一行摘要：

```
┌─ 💻 已生成 42 行 TypeScript 代码 · 点击展开 ─┐
└──────────────────────────────────────────────┘
```

点击后展开完整代码块（保留语法高亮）。

#### 3.4.2 实现方案

`@streamdown/code` 插件不支持折叠配置，需通过**自定义 Markdown 渲染**在 `Streamdown` 外层拦截代码块。

**方案 A（推荐）：后处理 DOM 包裹**

在 `AssistantMessage` 的 text block 渲染后，通过 CSS 选择器找到代码块并包裹：

```tsx
// 自定义 Hook：折叠代码块
function useCodeBlockFolding(containerRef: RefObject<HTMLDivElement>) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new MutationObserver(() => {
      container.querySelectorAll("pre:not([data-foldable])").forEach((pre) => {
        pre.setAttribute("data-foldable", "true");
        const lineCount = pre.textContent?.split("\n").length ?? 0;
        if (lineCount > 5) {
          pre.classList.add("code-block-collapsed");
        }
      });
    });
    observer.observe(container, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
}
```

**方案 B：自定义 Streamdown 组件**

使用 Streamdown 的 `components` 自定义渲染，将 `code` 节点替换为自定义折叠组件：

```tsx
<Streamdown
  plugins={{ code, mermaid, math, cjk }}
  components={{
    code: (props) => <CollapsibleCodeBlock {...props} />,
  }}
>
  {block.content}
</Streamdown>
```

> 需确认 Streamdown 是否暴露 `components.code` 插槽（v1.0 文档未明确说明，实施前需验证）。

#### 3.4.3 视觉设计

**折叠态**：

```
┌─ 💻 42 行 TypeScript · index.tsx ──────────────── [展开 ▸] ─┐
└──────────────────────────────────────────────────────────────┘
```

**展开态**：

```
┌─ 💻 42 行 TypeScript · index.tsx ──────────────── [折叠 ▾] ─┐
│  1 │ import { useState } from 'react';                      │
│  2 │                                                        │
│  3 │ export function App() {                                │
│  ...                                                       │
└──────────────────────────────────────────────────────────────┘
```

**样式要点**：

- 折叠态高度固定为单行（`h-10`），隐藏溢出
- 文件路径从代码围栏元信息或上下文推断
- 行数从代码内容计算

#### 3.4.4 文件改动

| 文件                              | 改动                            |
| --------------------------------- | ------------------------------- |
| 新增 `collapsible-code-block.tsx` | 折叠代码块组件                  |
| `assistant-message.tsx`           | text 渲染块使用自定义代码块组件 |

---

### 3.5 方案 5：执行过程限高滚动（P2）

#### 3.5.1 优化目标

仅通过**限高 + 滚动区域**，让 `ExecutionPhase` 展开后的内容区视觉上可控、滚动体验良好。**不改变现有内容渲染逻辑**：

- 思考内容直接展示 AI 原始英文思考文本（不做摘要、不做翻译）
- 多次连续思考不做视觉区分（无步骤编号、无分割线）
- 标题栏保持当前格式，不添加额外信息

#### 3.5.2 视觉设计

```
执行过程（3 次思考、1 次工具调用）
┌─ 限高 max-h-72，超出时内部滚动 ──────────┐
│ ✨ The user wants me to optimize...     │
│ ✨ Wait, looking more carefully...      │
│ ✨ Actually, I already have...          │
│ 📄 memory.md                             │
│ [滚动条]                                 │
└──────────────────────────────────────┘
```

> **关键设计**：内容区设置 `max-h-72`（288px）+ `overflow-y-auto`，超出时内容滚动。避免多次思考+多次工具调用把页面拉得很长。

#### 3.5.3 核心改动

**仅修改 `CollapsibleContent` 内部包裹 `div` 的样式**：

```tsx
<CollapsibleContent className="overflow-hidden transition-all data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
  <div
    className={cn(
      "pl-4 border-l border-border/20 ml-[5px] mt-0.5 space-y-0.5",
      // 限高 288px，超出时内部滚动
      "max-h-72 overflow-y-auto",
      // 自定义滚动条样式
      "scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-thumb-rounded-full",
      "scrollbar-track-transparent hover:scrollbar-thumb-muted-foreground/30",
    )}
  >
    {parts.map((part, i) => {
      // ...原有渲染逻辑保持不变
    })}
  </div>
</CollapsibleContent>
```

#### 3.5.4 为什么是 max-h-72（288px）

| 高度方案   | 像素      | 显示行数   | 评估                                 |
| ---------- | --------- | ---------- | ------------------------------------ |
| max-h-48   | 192px     | ~4 行      | 太短，频繁滚动                       |
| max-h-60   | 240px     | ~5-6 行    | 够用，但滚动感过强                   |
| **max-h-72** | **288px** | **~7 行**  | **✅ 推荐，足以显示 3-4 次思考+1-2 次工具调用** |
| max-h-80   | 320px     | ~8 行      | 略高，短内容时显空旷                 |
| max-h-96   | 384px     | ~10 行     | 太高，失去限高意义                   |

> **动态调整**：如内容过少（不足 4 行），自然展开不滚动，不显示滚动条。

#### 3.5.5 滚动条样式

使用 Tailwind 的 `scrollbar-*` 工具类，保持滚动条与暗色主题协调：

```css
/* globals.css 或内联样式 */
.execution-phase-scroll::-webkit-scrollbar {
  width: 4px;
}
.execution-phase-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.execution-phase-scroll::-webkit-scrollbar-thumb {
  background: hsl(var(--muted-foreground) / 0.2);
  border-radius: 9999px;
}
.execution-phase-scroll:hover::-webkit-scrollbar-thumb {
  background: hsl(var(--muted-foreground) / 0.3);
}
```

> 如 `scrollbar-*` 工具类未内置，需安装 `tailwind-scrollbar` 插件或在 `tailwind.config.ts` 中自定义。

#### 3.5.6 文件改动

| 文件                    | 改动                                                     |
| ----------------------- | -------------------------------------------------------- |
| `assistant-message.tsx` | `ExecutionPhase` 内层 `div` 新增 `max-h-72` + 滚动样式    |
| `globals.css` 或 tailwind config | 新增自定义滚动条样式（可选）                      |

---

### 3.6 方案 6：流式指示器动画优化（P2）

#### 3.6.1 当前行为

- 初始加载（`renderBlocks` 为空）：显示空 `Reasoning` 骨架
- 有内容后：底部显示 "AI 工作中..." 小字 + `Loader2` 旋转图标
- 显示信息保持简洁，**不增加耗时/阶段等额外信息**

#### 3.6.2 优化方向

当前 `Loader2 animate-spin` 是均匀旋转，视觉效果生硬。优化为更有节奏感的动画，让 AI 的工作状态更具视觉反馈：

**优化 1：三点跳动动画**（推荐）

```tsx
function StreamingDots() {
  return (
    <span className="inline-flex items-center gap-0.5">
      <span className="h-1 w-1 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0ms]" />
      <span className="h-1 w-1 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
      <span className="h-1 w-1 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
    </span>
  );
}

// 使用
<div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 py-0.5">
  <StreamingDots />
  <span>AI 工作中</span>
</div>;
```

**优化 2：脉冲光晕**

在 `Loader2` 外层加一圈脉冲光晕，提示"正在输出"：

```tsx
<div className="relative flex items-center justify-center">
  <span className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
  <Loader2 className="h-3 w-3 animate-spin relative z-10" />
</div>
```

> **选择哪个？** 推荐优化 1（三点跳动），更轻量、更贴合"正在打字"的隐喻，与 AI 文本流式输出场景匹配度最高。

#### 3.6.3 文件改动

| 文件                    | 改动                                      |
| ----------------------- | ----------------------------------------- |
| `assistant-message.tsx` | 新增 `StreamingDots` 组件，替换底部指示器 |

---

### 3.7 方案 7：间距微调（P2）

#### 3.7.1 当前状态

外层 `ConversationContent` 已有 `gap-4 p-4`，消息间距已统一。AI 消息内部折叠触发器字号偏小。

#### 3.7.2 调整

| 元素               | 当前          | 调整为               |
| ------------------ | ------------- | -------------------- |
| 折叠触发器 padding | `py-0.5`      | `py-1.5`             |
| 折叠触发器字号     | `text-[11px]` | `text-xs`（12px）    |
| 工具图标           | `h-3 w-3`     | 保持（与触发器协调） |

> **不做的事**：不修改 `ConversationContent` 的 `gap-4`，不在 `chat-messages.tsx` 中额外包裹 `mb-4`。

#### 3.7.3 文件改动

| 文件                    | 改动                                            |
| ----------------------- | ----------------------------------------------- |
| `assistant-message.tsx` | 微调 `ToolCallGroup` 和 `ExecutionPhase` 触发器 |
| `reasoning.tsx`         | 同步调整 `ReasoningTrigger`                     |

---

## 四、实施计划

### 4.1 Phase 1：核心能力（P0，6-7h）

| 任务                                              | 预估   | 优先级 |
| ------------------------------------------------- | ------ | ------ |
| 智能滚动控制 + “回到底部”按钮                     | 2h     | P0     |
| `MessageActionBar` 组件（复制 + 重新生成 + 回撤） | 2h     | P0     |
| 用户消息编辑重发                                  | 1.5h   | P0     |
| 回撤功能（前端 + 后端 `/rollback` 补全）          | 2-2.5h | P0     |

### 4.2 Phase 2：体验优化（P1-P2，3.5h）

| 任务                       | 预估 | 优先级 |
| -------------------------- | ---- | ------ |
| 代码块简化展示（默认折叠） | 1.5h | P1     |
| 执行过程限高滚动           | 1h   | P2     |
| 流式指示器动画优化         | 0.5h | P2     |
| 间距微调                   | 0.5h | P2     |

---

## 五、验证标准

### Phase 1 验证

- [ ] 用户向上滚动时自动滚动停止，显示“回到底部”按钮
- [ ] 点击“回到底部”后恢复自动跟随
- [ ] AI 消息 hover 时显示操作栏（复制/重新生成/回撤）
- [ ] 点击“重新生成”：原 AI 回复被替换，新回复正常流式输出
- [ ] 有文件修改的 AI 消息显示“回撤”按钮
- [ ] 点击“回撤”：文件恢复到 AI 操作前状态 + 本轮问答消失
- [ ] 用户消息 hover 时显示“编辑”按钮
- [ ] 编辑用户消息并提交：后续消息全部删除，新回复正常生成

### Phase 2 验证

- [ ] 代码块默认折叠，显示行数和语言
- [ ] 点击展开后显示完整语法高亮代码
- [ ] 执行过程内容区 `max-h-72`（288px），超出时内部滚动
- [ ] 执行过程滚动条样式与暗色主题协调（细滚动条，hover 时变深）
- [ ] 短内容（< 4 行）时自然展开不显示滚动条
- [ ] 流式指示器使用三点跳动动画，替代原有 Loader2 旋转
- [ ] 折叠触发器字号和点击区域明显增大

---

## 六、风险评估

### 6.1 技术风险

| 风险                                       | 影响                   | 缓解措施                                                           |
| ------------------------------------------ | ---------------------- | ------------------------------------------------------------------ |
| ScrollArea 替换为原生滚动                  | 滚动条样式变化         | 通过 Tailwind `scrollbar` 工具类或自定义 CSS 保持风格一致          |
| `/rollback` 端点补全依赖 `SnapshotService` | 快照可能不存在或已过期 | 添加 `try-catch`，失败时仅截断消息并提示"文件恢复失败，请手动操作" |
| 回撤后文件刷新                             | 预览区可能不同步       | 回撤后调用 `onSnapshotReady` 触发预览刷新                          |
| Streamdown `components.code` 插槽          | 可能不暴露             | 实施前验证，不可用则降级为 DOM 后处理方案                          |
| 消息编辑触发重新生成                       | 可能与流式状态冲突     | 编辑按钮仅在 `!isStreaming` 时可用                                 |
| 执行过程限高滚动                           | 内容过少时滚动区空白   | 仅当内容超过 max-h-72 时显示滚动条，否则自然展开                   |

### 6.2 用户体验风险

| 风险                       | 影响           | 缓解措施                                                               |
| -------------------------- | -------------- | ---------------------------------------------------------------------- |
| 回撤功能误操作             | 文件被意外恢复 | 回撤前弹出确认对话框："确定撤销本轮修改？文件将恢复到 AI 操作前的状态" |
| 代码块折叠后用户找不到代码 | 调试困难       | 折叠摘要明确显示行数+语言，展开操作一键可达                            |
| 操作栏 hover 才可发现      | 功能可发现性差 | 操作栏使用低透明度常驻（而非完全隐藏），PC 端鼠标移入即高亮            |

---

## 七、设计细节

### 7.1 视觉规范（PC 端专用）

| 元素            | 规范                                                                        |
| --------------- | --------------------------------------------------------------------------- |
| 操作栏按钮      | `p-1.5 rounded opacity-40 hover:opacity-100 hover:bg-muted/50`              |
| 操作栏间距      | `gap-1`，距消息内容 `mt-1`                                                  |
| 回撤确认弹窗    | 使用现有 `AlertDialog` 组件                                                 |
| 代码块折叠摘要  | `bg-muted/30 rounded-md px-3 py-2 text-xs cursor-pointer hover:bg-muted/50` |
| 编辑态 textarea | `w-full rounded-md border border-input bg-background px-3 py-2 text-sm`     |

### 7.2 交互规范

| 操作     | 行为                                         |
| -------- | -------------------------------------------- |
| 复制     | 点击后图标变为 ✅ “已复制”，2s 后恢复        |
| 重新生成 | 禁用状态：`isStreaming` 时不可点击           |
| 回撤     | 点击 → 弹出确认对话框 → 确认后执行           |
| 编辑     | 气泡 → textarea（保留原内容），确认/取消按钮 |

---

## 八、后续优化方向

- **消息搜索**：在对话历史中搜索关键词并高亮
- **消息导出**：导出对话为 Markdown/PDF
- **批量操作**：长按/右键菜单触发更多操作
- **回撤版本浏览**：可视化文件变更 diff

---

## 九、相关文档

- [AI对话核心问题分析报告](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/docs/plans/已完成/AI对话/AI对话核心问题分析报告.md)
- [AI对话消息智能聚合展示优化方案](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/docs/plans/已完成/AI对话/AI对话消息智能聚合展示优化方案.md)
- [AI对话区连续思考与工具调用折叠优化方案](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/docs/plans/已完成/AI对话区连续思考与工具调用折叠优化方案.md)
- [ai-chat.tsx](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/author-site/src/components/ai-elements/ai-chat.tsx)
- [assistant-message.tsx](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/author-site/src/components/ai-elements/assistant-message.tsx)
- [use-chat-stream.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/author-site/src/components/ai-elements/chat/hooks/use-chat-stream.ts)
- [snapshot-service.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/agent-service/src/session/snapshot-service.ts)

---

**文档维护者**：AI 辅助生成  
**最后更新**：2026-06-04  
**文档状态**：v2.0 方案评审中
