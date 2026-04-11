# Assistant 消息渲染重构

## 概述

将 AI 返回消息的"思考过程 + 工具调用 + 正文内容"从三个独立区域合并为一个统一的消息卡片，实现与 Cursor/Trae 一致的体验。

---

## 当前问题

| # | 问题描述 | 影响 |
|---|---------|------|
| 1 | 正文消息和思考/工具调用拆成两个独立区域 | 视觉上消息先出来，过程后补，割裂感强 |
| 2 | 流式阶段和完成后的渲染顺序策略不一致 | 用户看到的内容位置会跳变 |
| 3 | 缺少统一的消息卡片容器 | 视觉层级混乱，密度不均 |
| 4 | `handleCancel` 取消流式时只保存 content | 丢失 reasonings 和 tools 数据 |
| 5 | `finish` 回调中的闭包捕获旧值 | reasonings/tools 可能读取到过期数据 |
| 6 | 流式卡片和加载指示器可能重复渲染 | 同一条消息渲染两次 |

## 根因分析

### 问题 1-3：架构层面
- **原有实现**：`Message`（正文） + `ChainOfThought`（思考/工具）各自独立渲染
- **渲染逻辑**：先渲染正文 Message，再在下面渲染 ChainOfThought 折叠面板
- **结果**：正文和过程在视觉和 DOM 上完全分离

### 问题 4：状态管理疏漏
```typescript
// 修复前：只保存了 content
setMessages((prev) => [
  ...prev,
  { id: `assistant-${Date.now()}`, role: "assistant", content: streamContent },
]);
```

### 问题 5：React 闭包陷阱
- `handleSend` 是 `useCallback` 创建的，捕获了创建时的 `currentMessage`
- 流式过程中 `currentMessage` 通过 `setCurrentMessage` 不断更新
- 但 `finish` 回调中读取的仍是 **handleSend 创建时的旧值**

### 问题 6：条件判断冗余
```typescript
// 修复前：两个独立的条件，可能同时满足
{((currentMessage.reasonings?.length || 0) > 0 || ...) && <AssistantMessage />}
{isStreaming && !currentMessage.content && ... && <AssistantMessage />}
```

---

## 修复方案

### 核心改动：新增 `AssistantMessage` 组件

**文件**: `packages/web/src/components/ai-elements/assistant-message.tsx`

**布局策略**（从上到下）：
```
┌─────────────────────────────────┐
│ ▼ 思考过程 (3)           1.2s   │ ← 流式时展开，完成后折叠
├─────────────────────────────────┤
│ ▼ 工具调用 (2)                  │ ← 默认折叠
├─────────────────────────────────┤
│                                 │
│   正文内容（始终可见）           │
│                                 │
│                    [📋 复制]    │ ← hover 显示
└─────────────────────────────────┘
```

**设计要点**：
1. 统一卡片容器 `rounded-lg border bg-card`
2. 各区域之间用 `border-b border-border/40` 分隔
3. 流式/完成走同一套布局，仅 `isStreaming` 属性不同
4. `useEffect` 监听 `isStreaming` 变化自动控制展开/折叠

### ai-chat.tsx 改动

| 改动项 | 修复前 | 修复后 |
|--------|--------|--------|
| 消息列表渲染 | 统一用 `<Message>` | 用户消息用 `<Message>`，Assistant 用 `<AssistantMessage>` |
| 流式响应渲染 | Message + ChainOfThought 分离 | 单一 `<AssistantMessage isStreaming />` |
| 加载指示器 | 独立的 ChainOfThought 组件 | `<AssistantMessage>` 内置空状态加载动画 |
| handleCancel | 只保存 content | 保存 content + reasonings + tools |
| finish 回调 | 读取闭包旧值 | 通过 `currentMessageRef.current` 读取最新值 |
| handleSend 依赖 | 包含 currentMessage 导致频繁重建 | 用 ref 避免依赖，消除 lint 警告 |

---

## 修复进度

| # | 修复项 | 状态 | 备注 |
|---|--------|------|------|
| 1 | 创建 `AssistantMessage` 组件 | ✅ 完成 | 统一卡片布局 |
| 2 | 修改 `ai-chat.tsx` 渲染逻辑 | ✅ 完成 | 消除重复渲染 |
| 3 | 修复 `handleCancel` 数据丢失 | ✅ 完成 | 保存 reasonings/tools |
| 4 | 修复 `finish` 闭包陷阱 | ✅ 完成 | 新增 `currentMessageRef` |
| 5 | 简化条件判断逻辑 | ✅ 完成 | 单一 `isStreaming` 条件 |
| 6 | reasoning 展开/折叠状态同步 | ✅ 完成 | `useEffect` 监听 `isStreaming` |
| 7 | 边框逻辑优化 | ✅ 完成 | 只在有正文时显示分隔线 |
| 8 | 补充复制按钮 | ✅ 完成 | hover 显示 |
| 9 | 类型安全检查 | ✅ 完成 | `tsc --noEmit` 通过 |
| 10 | Lint 检查 | ✅ 完成 | 无新增警告 |

---

## 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `assistant-message.tsx` | **新增** | 统一的 Assistant 消息卡片组件 |
| `ai-chat.tsx` | 修改 | 替换渲染逻辑，修复闭包问题 |
| `index.ts` | 修改 | 导出 `AssistantMessage` 和 `ToolEntry` 类型 |
| `agent-process-group.tsx` | 修改 | 修复 Tool 组件调用方式 |

---

## 技术细节

### 闭包陷阱修复

```typescript
// 新增 ref 追踪最新值
const currentMessageRef = useRef(currentMessage);
useEffect(() => {
  currentMessageRef.current = currentMessage;
}, [currentMessage]);

// finish 回调中读取最新值
stream.on("finish", async (event: StreamEvent) => {
  const currentMsg = currentMessageRef.current;  // 读取最新值
  const assistantMessage: ChatMessage = {
    id: `assistant-${Date.now()}`,
    role: "assistant",
    content: accumulatedContent || event.content || "抱歉，我没有收到有效的回复。",
    reasoning: currentMsg.reasoning,
    reasonings: currentMsg.reasonings,
    tools: currentMsg.tools,
  };
  // ...
});
```

### 自动展开/折叠

```typescript
// 流式时展开 reasoning，完成后折叠
useEffect(() => {
  if (!isStreaming) {
    setReasoningOpen(false);  // 完成后折叠
  } else {
    setReasoningOpen(true);   // 流式时展开
  }
}, [isStreaming]);
```

---

## 验证结果

- **TypeScript 类型检查**: ✅ 全部通过（`tsc --noEmit` exit code 0）
- **ESLint**: ✅ 无新增警告（ai-chat.tsx 和 assistant-message.tsx 零警告）
- **已有警告**: 均为其他文件的 img 标签和 hooks 依赖问题，与本次修改无关
