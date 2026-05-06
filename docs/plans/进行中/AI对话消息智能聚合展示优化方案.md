# AI 对话消息智能聚合展示优化方案

> 目标：优化 AI 对话消息的展示体验，将连续的思考和工具调用进行智能聚合，提供更清晰的视觉层次。

## 一、现状分析

### 1.1 现有组件结构

| 组件 | 文件 | 功能 | 备注 |
|------|------|------|------|
| `AssistantMessage` | `ai-elements/assistant-message.tsx` | 消息渲染主组件 | 连续 reasoning 已合并（纯文本拼接），tool 为极简一行渲染（未使用 Tool 组件），image/file 类型未处理 |
| `Reasoning` | `ai-elements/reasoning.tsx` | 单个思考气泡，支持折叠 | 含 Context 机制和自动折叠逻辑（流式展开→结束后 800ms 折叠） |
| `Tool` | `ai-elements/tool.tsx` | 工具调用卡片，支持展开详情 | 已支持 `entries: ToolEntry[]` 多工具合并，但 **AssistantMessage 未使用此组件** |
| `AgentProcessGroup` | `ai-elements/agent-process-group.tsx` | 已有的折叠组 | 传给 Reasoning 的 content prop 不被接收，存在 Bug，可能未在实际页面中使用 |

### 1.1.1 类型定义现状

项目中存在**两套 MessagePart 定义**，需在本次优化中统一：

| 位置 | 类型风格 | 说明 |
|------|---------|------|
| `message.tsx` 第 25-55 行 | discriminated union（导出版） | 规范的类型定义，通过 index.ts 导出 |
| `assistant-message.tsx` 第 23-33 行 | 扁平 interface（局部版） | 所有字段可选，仅内部使用，与导出版不一致 |

应统一使用 `message.tsx` 中的导出版 discriminated union，删除 `assistant-message.tsx` 中的局部重复定义。

### 1.2 存在的问题

1. **思考合并方式粗糙**：连续 reasoning 已被合并为单块，但仅用 `\n\n` 纯文本拼接，无法区分不同阶段的思考，缺少视觉层次
2. **工具调用零散**：每个 tool 独立成块（极简一行渲染），无法形成完整的操作流程感知；且未使用已有的 `Tool` 组件（支持多工具合并和详情展开）
3. **缺少整体概览**：用户无法快速了解 AI 做了哪些操作
4. **信息层级不清**：思考、工具调用、最终回复混杂在一起
5. **类型定义不一致**：`message.tsx` 和 `assistant-message.tsx` 各有一套 `MessagePart` 定义，结构不统一
6. **image/file 类型未处理**：`renderBlocks` 逻辑完全忽略了 image 和 file 类型的渲染
7. **AgentProcessGroup 存在 Bug**：传给 Reasoning 组件的 content prop 不被接收，该组件可能无法正常工作

## 二、优化方案设计

### 2.1 整体架构

```
AssistantMessage
├── AIProcessSummary (重构自 AgentProcessGroup)  ← 顶部汇总条
│   ├── StatusIndicator        ← 状态指示器 (●)
│   ├── ToolCallSummary       ← 工具调用统计
│   ├── ReasoningSummary      ← 思考次数统计
│   └── Duration              ← 耗时统计
│
├── ReasoningGroup (新增，内部复用 Reasoning)  ← 聚合的思考块
│   ├── ReasoningTrigger       ← 复用现有触发器（自定义 getThinkingMessage）
│   └── ReasoningContent[]    ← 复用现有内容组件（带分割线）
│
├── Tool (直接使用现有组件)    ← 聚合的工具块
│   ├── Tool 头部              ← 已有 getAggregateInfo 逻辑
│   └── ToolEntry[]            ← 已有多条目渲染
│
└── TextContent                ← 最终回复（Streamdown）
```

**组件复用策略**：
- `ReasoningGroup`：新增外层容器组件，内部组合使用 `Reasoning` + `ReasoningTrigger` + `ReasoningContent`，复用 Context 机制和自动折叠逻辑
- `ToolCallGroup`：**不新建**，直接在 `assistant-message.tsx` 中使用现有 `Tool` 组件（已支持 `entries: ToolEntry[]` 多工具合并），配合新的分组逻辑传入合并后的 entries
- `AIProcessSummary`：基于现有 `AgentProcessGroup` 重构，修复 Bug 并优化视觉，替换原组件

### 2.2 连续 Reasoning 智能聚合

**聚合策略**：将连续的多个思考合并为一个 `ReasoningGroup` 组件（当前代码已用 `\n\n` 拼接合并，但缺少阶段区分，本次改为分组展示）

**视觉设计**：
```
┌─ 思考中... (3 阶段) ▾ ┐
│                      │
│  阶段 1: 分析任务... │
│  ─────────────────── │
│  阶段 2: 制定计划... │
│  ─────────────────── │
│  阶段 3: 优化方案... │
└──────────────────────┘
```

**组件设计**：
- 新增 `ReasoningGroup` 外层容器，内部复用 `Reasoning` + `ReasoningTrigger` + `ReasoningContent` 组件
- 通过 `ReasoningTrigger` 的 `getThinkingMessage` 回调自定义显示文案（如 "思考中... (3 阶段)"）
- 内部用水平分割线区分不同阶段的思考
- 复用 `Reasoning` 的 Context 机制和自动折叠逻辑（流式展开→结束后 800ms 折叠）
- 最新思考自动展开，历史思考折叠

### 2.3 连续工具调用聚合

**聚合策略**：将连续同类型工具调用合并展示，直接使用现有 `Tool` 组件（已支持 `entries: ToolEntry[]` 多工具合并）

**视觉设计**：
```
┌─ 📖 读取文件 (3 个) ▾ ┐
│                      │
│  ├─ src/utils/helper.ts     ✓
│  ├─ src/components/Button.tsx    ✓
│  └─ src/hooks/useAuth.ts        ✓
└──────────────────────┘
```

**分组规则**：
- 按工具类型（read/edit/execute）分组，通过 `getToolKind(toolName)` 从工具名推断类型
- 同类型连续工具调用合并，传入 `Tool` 组件的 `entries` 数组
- `Tool` 组件已有 `getAggregateInfo()` 逻辑，自动显示图标 + 类型标签 + 数量
- 折叠后显示摘要，展开后显示详情

**`getToolKind` 映射规则**（需新增）：
```typescript
function getToolKind(toolName?: string): "read" | "edit" | "execute" | "other" {
  if (!toolName) return "other";
  const name = toolName.toLowerCase();
  if (name.includes("read") || name.includes("get") || name.includes("search") || name.includes("glob") || name.includes("grep")) return "read";
  if (name.includes("edit") || name.includes("write") || name.includes("create") || name.includes("delete")) return "edit";
  if (name.includes("bash") || name.includes("exec") || name.includes("run") || name.includes("command")) return "execute";
  return "other";
}
```

### 2.4 AI 处理过程汇总条（重构自 AgentProcessGroup）

**位置**：在 AI 回复内容上方，所有过程块之后

**与现有组件关系**：基于 `AgentProcessGroup` 重构，修复其 Bug（传给 Reasoning 的 content prop 不被接收），优化视觉设计，替换原组件

**视觉设计**：
```
┌────────────────────────────────────────────────────────┐
│ ● 完成   │   🔧 3 个工具调用   │   🧠 2 次思考   │  12s  │
│                                          [展开详情 ▾] │
└────────────────────────────────────────────────────────┘
```

**功能**：
- 显示整体状态（完成/处理中）
- 工具调用数量和类型统计
- 思考次数统计
- 总耗时统计
- 点击可展开/折叠详情

## 三、组件详细设计

### 3.1 AIProcessSummary 组件（新增）

**Props 接口**：
```typescript
interface AIProcessSummaryProps {
  reasoningCount: number;
  toolCallGroups: Array<{
    type: 'read' | 'edit' | 'execute' | 'other';
    count: number;
  }>;
  status: 'completed' | 'running' | 'error';
  duration?: number; // 毫秒
  onExpandToggle: () => void;
  isExpanded: boolean;
}
```

**样式规范**：
- 高度：32px
- 背景：`bg-muted/30`
- 字体：text-[11px]
- 圆角：`rounded-md`
- 间距：gap-3

### 3.2 ReasoningGroup 组件（新增，内部复用 Reasoning）

**Props 接口**：
```typescript
interface ReasoningGroupProps {
  reasonings: Array<{
    content: string;
    duration?: number;
    timestamp?: number;
  }>;
  isStreaming?: boolean;
  defaultOpen?: boolean;
  className?: string;
}
```

**内部结构**（复用现有组件）：
- 使用 `Reasoning` 组件作为外层 Collapsible 容器，复用其 Context 机制和自动折叠逻辑
- 使用 `ReasoningTrigger` 组件，通过 `getThinkingMessage(isStreaming: boolean, duration?: number)` 回调自定义显示 "思考中... (N 阶段)" 或 "思考了 X 秒 (N 阶段)"
- 使用 `ReasoningContent` 组件渲染每个阶段的思考内容，之间用 `border-t border-dashed` 分割
- 计算总 duration：取最后一个 reasoning 的 duration（与当前逻辑一致）

### 3.3 Tool 组件（直接使用现有组件，无需新建 ToolCallGroup）

现有 `Tool` 组件已支持 `entries: ToolEntry[]` 多工具合并，无需新建 `ToolCallGroup`。

**使用的 Props**：
```typescript
interface ToolProps {
  path?: string;
  entries: ToolEntry[];  // 已有，直接传入合并后的工具条目
  className?: string;
}

interface ToolEntry {
  name: string;
  kind?: "read" | "edit" | "execute";
  status: "running" | "completed" | "error" | "awaiting-approval";
  parameters?: Record<string, unknown>;
  result?: unknown;
}
```

**需要做的改动**：
- 在 `assistant-message.tsx` 中导入并使用 `Tool` 组件（当前未使用）
- 分组逻辑将同类型连续 tool 的 `MessagePart` 转换为 `ToolEntry[]` 传入
- `kind` 字段通过 `getToolKind(toolName)` 推断

## 四、核心代码改动点

### 4.1 assistant-message.tsx

**改动 0：统一 MessagePart 类型**

删除 `assistant-message.tsx` 中的局部 `MessagePart` 定义，改为从 `message.tsx` 导入：

```typescript
import { type MessagePart } from "./message";
```

**改动 1：新增 getToolKind 函数**

从 `toolName` 推断工具类型（`MessagePart` 中没有 `kind` 字段，只有 `toolName`）：

```typescript
function getToolKind(toolName?: string): "read" | "edit" | "execute" | "other" {
  if (!toolName) return "other";
  const name = toolName.toLowerCase();
  if (name.includes("read") || name.includes("get") || name.includes("search") || name.includes("glob") || name.includes("grep")) return "read";
  if (name.includes("edit") || name.includes("write") || name.includes("create") || name.includes("delete")) return "edit";
  if (name.includes("bash") || name.includes("exec") || name.includes("run") || name.includes("command")) return "execute";
  return "other";
}
```

**改动 2：重构 renderBlocks 逻辑**

将原来的"连续 reasoning 拼接内容 + 每个 tool 独立成块"改为"智能分组"：

```typescript
type RenderBlock =
  | { type: "text"; content: string }
  | { type: "reasoning-group"; reasonings: MessagePart[] }
  | { type: "tool-group"; parts: MessagePart[]; toolKind: string }
  | { type: "image"; url: string; alt?: string }
  | { type: "file"; name: string; url: string; size?: number };

const renderBlocks: RenderBlock[] = useMemo(() => {
  const blocks: RenderBlock[] = [];
  let currentReasonings: MessagePart[] = [];
  let currentToolGroup: { parts: MessagePart[]; toolKind: string } | null = null;

  const flushReasonings = () => {
    if (currentReasonings.length > 0) {
      blocks.push({ type: "reasoning-group", reasonings: currentReasonings });
      currentReasonings = [];
    }
  };

  const flushTools = () => {
    if (currentToolGroup && currentToolGroup.parts.length > 0) {
      blocks.push({ type: "tool-group", ...currentToolGroup });
      currentToolGroup = null;
    }
  };

  normalizedParts.forEach((part) => {
    if (part.type === "reasoning") {
      flushTools();
      currentReasonings.push(part);
    } else if (part.type === "tool") {
      flushReasonings();
      const toolKind = getToolKind(part.toolName);
      if (currentToolGroup && currentToolGroup.toolKind === toolKind) {
        currentToolGroup.parts.push(part);
      } else {
        flushTools();
        currentToolGroup = { parts: [part], toolKind };
      }
    } else if (part.type === "text") {
      flushReasonings();
      flushTools();
      if (part.content?.trim()) {
        blocks.push({ type: "text", content: part.content });
      }
    } else if (part.type === "image") {
      flushReasonings();
      flushTools();
      blocks.push({ type: "image", url: part.url, alt: part.alt });
    } else if (part.type === "file") {
      flushReasonings();
      flushTools();
      blocks.push({ type: "file", name: part.name, url: part.url, size: part.size });
    }
  });

  flushReasonings();
  flushTools();
  return blocks;
}, [normalizedParts]);
```

**改动 3：渲染逻辑适配新块类型**

```typescript
{renderBlocks.map((block, index) => {
  if (block.type === "reasoning-group") {
    return (
      <ReasoningGroup
        key={`reasoning-group-${index}`}
        reasonings={block.reasonings.map(r => ({
          content: r.content ?? "",
          duration: r.duration,
          timestamp: r.timestamp,
        }))}
        isStreaming={isStreaming && index === renderBlocks.length - 1}
      />
    );
  }
  if (block.type === "tool-group") {
    return (
      <Tool
        key={`tool-group-${index}`}
        entries={block.parts.map(p => ({
          name: p.toolName || "",
          kind: block.toolKind as "read" | "edit" | "execute",
          status: p.status || "completed",
          parameters: p.parameters,
          result: p.result,
        }))}
      />
    );
  }
  if (block.type === "image") {
    return (
      <img key={`image-${index}`} src={block.url} alt={block.alt} className="max-w-full rounded-md" />
    );
  }
  if (block.type === "file") {
    return (
      <a key={`file-${index}`} href={block.url} className="text-sm text-blue-500 underline">
        📎 {block.name}
      </a>
    );
  }
  // text 渲染（使用 Streamdown）
})}
```

### 4.2 reasoning.tsx

**新增 ReasoningGroup 组件**（与 Reasoning 并列，内部复用 Reasoning 组件）：

```typescript
function ReasoningGroup({
  reasonings,
  isStreaming = false,
  className,
}: ReasoningGroupProps) {
  const totalDuration = reasonings[reasonings.length - 1]?.duration;

  return (
    <Reasoning isStreaming={isStreaming} duration={totalDuration} defaultOpen={true}>
      <ReasoningTrigger
        getThinkingMessage={(streaming, duration) => (
          <span>
            {streaming ? "思考中..." : duration ? `思考了 ${Math.round(duration / 1000)} 秒` : "思考过程"}
            {" "}({reasonings.length} 阶段)
          </span>
        )}
      />
      <div className="space-y-2">
        {reasonings.map((r, i) => (
          <div key={i}>
            <ReasoningContent>{r.content}</ReasoningContent>
            {i < reasonings.length - 1 && (
              <div className="border-t border-dashed border-muted/30 my-2" />
            )}
          </div>
        ))}
      </div>
    </Reasoning>
  );
}
```

**关键点**：
- 使用 `Reasoning` 作为外层容器，复用其 Collapsible + Context + 自动折叠逻辑
- `getThinkingMessage` 签名为 `(isStreaming: boolean, duration?: number) => ReactNode`，需传两个参数
- `ReasoningContent` 的 children 必须是 string 类型（现有约束）
- 总 duration 取最后一个 reasoning 的 duration（与当前逻辑一致）

### 4.3 tool.tsx

**无需新增 ToolCallGroup 组件**，直接使用现有 `Tool` 组件。

现有 `Tool` 组件已具备所需功能：
- `entries: ToolEntry[]` 支持多工具合并
- `getAggregateInfo(entries)` 自动计算图标、标签、状态
- 展开/折叠显示详情

**唯一需要的改动**：确保 `assistant-message.tsx` 导入并使用 `Tool` 组件：

```typescript
import { Tool } from "./tool";
```

分组逻辑在 4.1 改动 3 中已实现，将同类型连续 tool 转换为 `ToolEntry[]` 传入 `Tool` 组件。

## 五、文件清单

| 操作 | 文件路径 | 说明 |
|------|---------|------|
| 修改 | `packages/web/src/components/ai-elements/assistant-message.tsx` | 统一 MessagePart 类型、新增 getToolKind、重构 renderBlocks 分组逻辑、导入并使用 Tool 组件 |
| 修改 | `packages/web/src/components/ai-elements/reasoning.tsx` | 新增 ReasoningGroup 组件（内部复用 Reasoning） |
| 修改 | `packages/web/src/components/ai-elements/agent-process-group.tsx` | 重构为 AIProcessSummary，修复 Bug |
| 修改 | `packages/web/src/components/ai-elements/message.tsx` | 确认 MessagePart 导出供 assistant-message 使用 |

## 六、设计风格规范

遵循现有 shadcn/ui + Tailwind 风格：

| 属性 | 规范 |
|------|------|
| 颜色 | `muted-foreground`、`border`、`violet-500`（思考）、`yellow-500`（运行中） |
| 字体 | 11px-14px：`text-[11px]` 到 `text-sm` |
| 图标 | lucide-react（`Sparkles`、`Brain`、`Wrench`、`FileText` 等） |
| 动画 | `transition-all duration-200`、`animate-pulse`（流式状态） |
| 间距 | 2px-4px：`gap-1` 到 `gap-2` |

## 七、用户体验预期

### 优化前
```
[思考中... (3阶段内容用\n\n拼接，无法区分)]
[工具: Read file1.ts ▻]
[工具: Read file2.ts ▻]
[工具: Read file3.ts ▻]
[最终回复内容...]
```

### 优化后
```
┌─ 思考中... (3 阶段) ▾ ─┐
│ 阶段 1: 分析...       │
│ 阶段 2: 计划...       │
│ 阶段 3: 优化...       │
└───────────────────────┘
┌─ 读取文件 (3 个) ▾ ────┐
│ ├─ file1.ts    ✓      │
│ ├─ file2.ts    ✓      │
│ └─ file3.ts    ✓      │
└───────────────────────┘
[最终回复内容...]
```

## 八、待确认事项

1. 汇总条是否需要始终显示，还是仅在有思考/工具调用时显示？
2. 连续工具调用合并的阈值是多少？（如连续 2 个及以上才合并？单个 tool 是否也用 Tool 组件渲染？）
3. 展开/折叠的默认状态如何设置？
4. 流式输出时，各组件的动画效果是否需要调整？（新块加入时旧块 isStreaming 突变可能导致展开状态闪烁）
5. `AIProcessSummary` 重构后是否替换 `AgentProcessGroup`，还是两者共存？
6. `image`/`file` 类型的渲染方案是否需要更丰富的组件（如图片预览、文件大小显示）？
7. 旧格式兼容性：`reasonings`/`tools`/`content` 等 deprecated props 的 `normalizedParts` 转换逻辑是否需要保留？
