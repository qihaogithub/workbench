# AI 对话消息智能聚合展示优化方案

> 目标：优化 AI 对话消息的展示体验，将连续的思考和工具调用进行智能聚合，提供更清晰的视觉层次。

## 一、现状分析

### 1.1 现有组件结构

| 组件 | 文件 | 功能 |
|------|------|------|
| `AssistantMessage` | `ai-elements/assistant-message.tsx` | 消息渲染主组件，每个 reasoning/工具独立成块 |
| `Reasoning` | `ai-elements/reasoning.tsx` | 单个思考气泡，支持折叠 |
| `Tool` | `ai-elements/tool.tsx` | 工具调用卡片，支持展开详情 |
| `AgentProcessGroup` | `ai-elements/agent-process-group.tsx` | 已有的折叠组，但功能较简单 |

### 1.2 存在的问题

1. **思考碎片化**：连续的多个思考各自独立成块，视觉上显得重复
2. **工具调用零散**：无法形成完整的操作流程感知
3. **缺少整体概览**：用户无法快速了解 AI 做了哪些操作
4. **信息层级不清**：思考、工具调用、最终回复混杂在一起

## 二、优化方案设计

### 2.1 整体架构

```
AssistantMessage
├── AIProcessSummary (新增)     ← 顶部汇总条
│   ├── StatusIndicator        ← 状态指示器 (●)
│   ├── ToolCallSummary       ← 工具调用统计
│   ├── ReasoningSummary      ← 思考次数统计
│   └── Duration              ← 耗时统计
│
├── ReasoningGroup (重构)      ← 聚合的思考块
│   ├── ReasoningGroupTrigger  ← 触发器（显示阶段数）
│   └── ReasoningContent[]    ← 多个思考内容（带分割线）
│
├── ToolCallGroup (重构)       ← 聚合的工具块
│   ├── ToolCallGroupTrigger   ← 触发器（显示类型+数量）
│   └── ToolCallEntry[]        ← 多个工具详情
│
└── TextContent                ← 最终回复（Streamdown）
```

### 2.2 连续 Reasoning 智能聚合

**聚合策略**：将连续的多个思考合并为一个 `ReasoningGroup` 组件

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
- 共享一个可折叠容器
- 内部用水平分割线区分不同阶段的思考
- 显示思考次数统计（如 "3 阶段"）
- 最新思考自动展开，历史思考折叠

### 2.3 连续工具调用聚合

**聚合策略**：将连续同类型工具调用合并展示

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
- 按工具类型（read/edit/execute）分组
- 同类型连续工具调用合并
- 显示数量统计（如 "读取 3 个文件"）
- 折叠后显示摘要，展开后显示详情

### 2.4 AI 处理过程汇总条（新增）

**位置**：在 AI 回复内容上方，所有过程块之后

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

### 3.2 ReasoningGroup 组件（重构自 Reasoning）

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
}
```

**内部结构**：
- `ReasoningGroupTrigger`：显示 "思考中... (N 阶段)" 或 "思考了 X 秒 (N 阶段)"
- `ReasoningGroupContent[]`：多个 `ReasoningContent`，之间用 `border-t border-dashed` 分割

### 3.3 ToolCallGroup 组件（重构自 Tool）

**Props 接口**：
```typescript
interface ToolCallGroupProps {
  path?: string;
  entries: Array<{
    name: string;
    kind?: 'read' | 'edit' | 'execute';
    status: 'running' | 'completed' | 'error';
    parameters?: Record<string, unknown>;
    result?: unknown;
  }>;
  isStreaming?: boolean;
}
```

**内部结构**：
- `ToolCallGroupTrigger`：显示图标 + 类型标签 + 数量（如 "📖 读取文件 (3 个)"）
- `ToolCallEntry[]`：多个工具条目，展开后显示详情

## 四、核心代码改动点

### 4.1 assistant-message.tsx

**改动 1：重构 renderBlocks 逻辑**

将原来的"每个 reasoning/tool 独立成块"改为"智能分组"：

```typescript
// 新的分组策略
type RenderBlock =
  | { type: "text"; content: string }
  | { type: "reasoning-group"; reasonings: MessagePart[] }
  | { type: "tool-group"; parts: MessagePart[]; toolKind: string };

// 智能分组逻辑
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
    }
  });

  flushReasonings();
  flushTools();
  return blocks;
}, [normalizedParts]);
```

**改动 2：渲染逻辑适配新块类型**

```typescript
{renderBlocks.map((block, index) => {
  if (block.type === "reasoning-group") {
    return (
      <ReasoningGroup
        key={`reasoning-group-${index}`}
        reasonings={block.reasonings}
        isStreaming={isStreaming && index === renderBlocks.length - 1}
      />
    );
  }
  if (block.type === "tool-group") {
    return (
      <ToolCallGroup
        key={`tool-group-${index}`}
        entries={block.parts.map(p => ({
          name: p.toolName || "",
          kind: block.toolKind as any,
          status: p.status || "completed",
          parameters: p.parameters,
          result: p.result,
        }))}
        isStreaming={isStreaming && index === renderBlocks.length - 1}
      />
    );
  }
  // ... text 渲染
})}
```

### 4.2 reasoning.tsx

**新增 ReasoningGroup 组件**（与 Reasoning 并列）：

```typescript
function ReasoningGroup({
  reasonings,
  isStreaming = false,
  className,
}: ReasoningGroupProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const latestReasoning = reasonings[reasonings.length - 1];

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <ReasoningTrigger
        getThinkingMessage={(streaming) => (
          <span>
            {streaming ? "思考中..." : `思考了 X 秒`}
            {" "}({reasonings.length} 阶段)
          </span>
        )}
      />
      <CollapsibleContent>
        <div className="space-y-2 pl-4 border-l border-dashed border-violet-500/30">
          {reasonings.map((r, i) => (
            <div key={i}>
              <ReasoningContent>{r.content}</ReasoningContent>
              {i < reasonings.length - 1 && (
                <div className="border-t border-dashed border-muted/30 my-2" />
              )}
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
```

### 4.3 tool.tsx

**重构 ToolCallGroup 组件**：

```typescript
function ToolCallGroup({
  path,
  entries,
  isStreaming = false,
  className,
}: ToolCallGroupProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { icon: ToolIcon, label, count } = getAggregateInfo(entries);

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <CollapsibleTrigger className="...">
        <ToolIcon className="h-4 w-4" />
        <span>{label}</span>
        <span className="text-muted-foreground">({entries.length} 个)</span>
        <ChevronDown className={cn("h-3 w-3", isExpanded && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t border-border/40 bg-muted/20">
          {entries.map((entry, index) => (
            <ToolEntry key={index} entry={entry} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
```

## 五、文件清单

| 操作 | 文件路径 | 说明 |
|------|---------|------|
| 修改 | `packages/web/src/components/ai-elements/assistant-message.tsx` | 重构 renderBlocks 逻辑 |
| 修改 | `packages/web/src/components/ai-elements/reasoning.tsx` | 新增 ReasoningGroup 组件 |
| 修改 | `packages/web/src/components/ai-elements/tool.tsx` | 新增 ToolCallGroup 组件 |
| 新增 | `packages/web/src/components/ai-elements/ai-process-summary.tsx` | 汇总条组件 |

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
[思考中...][思考中...][思考中...]
[工具调用][工具调用][工具调用]
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
2. 连续工具调用合并的阈值是多少？（如连续 2 个及以上才合并？）
3. 展开/折叠的默认状态如何设置？
4. 流式输出时，各组件的动画效果是否需要调整？
