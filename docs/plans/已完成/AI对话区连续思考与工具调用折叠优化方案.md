# AI对话区连续思考与工具调用折叠优化方案

> 版本：v1.1  
> 创建日期：2026-05-28  
> 关联问题：AI对话区连续的思考过程、工具调用显得冗长，需要进一步折叠  
> 状态：待实施

---

## 一、问题描述

### 1.1 当前现象

1. **连续思考过程分散**：多个"思考过程"折叠块依次排列，用户需要逐个点击展开
2. **工具调用未聚合**：相同类型的工具调用（如多次"读取文件"）虽然有聚合，但与思考过程交替出现，视觉噪音大
3. **信息密度低**：一个完整的AI响应可能包含 3-5 个思考块 + 2-3 个工具组，占据大量垂直空间

### 1.2 用户痛点

- **阅读效率低**：用户关心的是最终结果，中间的思考过程通常是验证性的
- **视觉疲劳**：大量折叠块的标题行（"思考过程"、"读取文件 (2个)"）重复出现
- **缺乏上下文关联**：思考→工具→思考→工具的交替模式被打散，难以理解AI的决策链

---

## 二、现有实现分析

### 2.1 当前渲染逻辑

**核心文件**：`packages/author-site/src/components/ai-elements/assistant-message.tsx`

当前实现已做部分聚合（第 157-216 行 `renderBlocks` 生成逻辑）：

| 内容类型      | 聚合条件                             | 当前行为            |
| ------------- | ------------------------------------ | ------------------- |
| 思考过程      | 连续的 reasoning parts               | ✅ 合并为一个折叠块 |
| 工具调用      | 连续的相同 kind（read/edit/execute） | ✅ 合并为一个折叠块 |
| 思考+工具交替 | reasoning → tool → reasoning         | ❌ 不合并，分别渲染 |

### 2.2 问题根源

**代码位置**：`assistant-message.tsx` 第 183-211 行

```typescript
normalizedParts.forEach((part) => {
  if (part.type === "reasoning") {
    flushTools(); // 遇到 reasoning，先 flush 工具
    currentReasonings.push(part);
  } else if (part.type === "tool") {
    flushReasonings(); // 遇到 tool，先 flush 思考
    // ... 工具聚合逻辑
  }
});
```

**关键问题**：`flushReasonings()` 和 `flushTools()` 在类型切换时立即调用，导致连续的 reasoning-group 和 tool-group 交替出现，无法进一步合并。

### 2.3 相关类型定义

**文件**：`packages/author-site/src/components/ai-elements/message.tsx`

```typescript
export type MessagePart =
  | { type: "text"; content: string }
  | {
      type: "reasoning";
      content: string;
      duration?: number;
      timestamp?: number;
    }
  | {
      type: "tool";
      toolCallId: string;
      toolName: string;
      status: "running" | "completed" | "error" | "awaiting-approval";
      parameters?: Record<string, unknown>;
      result?: unknown;
      duration?: number;
    }
  | { type: "image"; url: string; alt?: string }
  | { type: "file"; name: string; url: string; size?: number };
```

**文件**：`assistant-message.tsx` 第 64-70 行

```typescript
type RenderBlock =
  | { type: "text"; content: string }
  | { type: "reasoning-group"; reasonings: ReasoningPart[] }
  | { type: "tool-group"; parts: ToolPart[]; toolKind: string }
  | { type: "tool-single"; part: ToolPart }
  | { type: "image"; url: string; alt?: string }
  | { type: "file"; name: string; url: string; size?: number };
```

---

## 三、优化方案：阶段级折叠

### 3.1 核心思路

将连续的"思考过程 + 工具调用"视为一个**执行阶段（Execution Phase）**，统一折叠。

```
当前：
┌─ 思考过程 ─┐
└────────────┘
┌─ 读取文件 (2个) ─┐
└──────────────────┘
┌─ 思考过程 ─┐
└────────────┘
┌─ 读取文件 (6个) ─┐
└──────────────────┘

优化后：
┌─ 执行过程（2次思考、8次工具调用）▼ ─┐
│  ├─ 思考过程                         │
│  ├─ 读取文件 (2个)                   │
│  ├─ 思考过程                         │
│  └─ 读取文件 (6个)                   │
└─────────────────────────────────────┘
```

### 3.2 聚合规则

将 AI 响应划分为三种内容阶段：

1. **纯思考阶段**：仅有 reasoning parts（无工具调用跟随）
2. **执行阶段**：reasoning 和 tool 交替出现，统一聚合
3. **输出阶段**：text / image / file 类型（最终回复），打断执行阶段

**聚合示例**：

```
Parts 序列：[R, R, T, R, T, T, R, Text, R, T, Text]
           ↓
Blocks:    [{reasoning-group(R,R)}, {execution-phase(T,R,T,T,R)}, {text}, {execution-phase(R,T)}, {text}]
```

**边界规则**：

- 连续的纯 reasoning 且后面不跟 tool → 保持 `reasoning-group`
- 单独的 tool 且前后无 reasoning → 保持 `tool-single` / `tool-group`
- reasoning 后紧跟 tool（或 tool 后紧跟 reasoning）→ 进入 `execution-phase`
- text / image / file → 始终打断执行阶段

---

## 四、实现改动

### 4.1 修改 1：扩展 `RenderBlock` 类型

**文件**：`assistant-message.tsx` 第 64-70 行

```typescript
type RenderBlock =
  | { type: "text"; content: string }
  | { type: "reasoning-group"; reasonings: ReasoningPart[] }
  | { type: "tool-group"; parts: ToolPart[]; toolKind: string }
  | { type: "tool-single"; part: ToolPart }
  | { type: "image"; url: string; alt?: string }
  | { type: "file"; name: string; url: string; size?: number }
  // 新增：执行阶段（reasoning + tool 交替聚合）
  | { type: "execution-phase"; parts: MessagePart[] };
```

### 4.2 修改 2：重写 `renderBlocks` 生成逻辑

**文件**：`assistant-message.tsx` 第 157-216 行

替换整个 `renderBlocks` 的 `useMemo` 逻辑：

```typescript
const renderBlocks: RenderBlock[] = useMemo(() => {
  const blocks: RenderBlock[] = [];
  let currentExecution: MessagePart[] = []; // 当前执行阶段（reasoning + tool 混合）
  let currentReasonings: ReasoningPart[] = []; // 纯思考阶段暂存
  let currentToolGroup: { parts: ToolPart[]; toolKind: string } | null = null; // 纯工具阶段暂存

  const flushExecution = () => {
    if (currentExecution.length > 0) {
      blocks.push({ type: "execution-phase", parts: [...currentExecution] });
      currentExecution = [];
    }
  };

  const flushReasonings = () => {
    if (currentReasonings.length > 0) {
      blocks.push({
        type: "reasoning-group",
        reasonings: [...currentReasonings],
      });
      currentReasonings = [];
    }
  };

  const flushTools = () => {
    if (!currentToolGroup || currentToolGroup.parts.length === 0) return;
    if (currentToolGroup.parts.length >= 2) {
      blocks.push({
        type: "tool-group",
        parts: [...currentToolGroup.parts],
        toolKind: currentToolGroup.toolKind,
      });
    } else {
      blocks.push({ type: "tool-single", part: currentToolGroup.parts[0] });
    }
    currentToolGroup = null;
  };

  normalizedParts.forEach((part) => {
    if (part.type === "reasoning") {
      // 如果有纯工具暂存，说明之前没有 reasoning，先 flush 掉
      // 然后将它们都纳入执行阶段
      if (currentToolGroup && currentToolGroup.parts.length > 0) {
        currentToolGroup.parts.forEach((t) => currentExecution.push(t));
        currentToolGroup = null;
      }
      flushReasonings(); // flush 掉之前未跟 tool 的纯 reasoning
      currentExecution.push(part);
    } else if (part.type === "tool") {
      flushReasonings(); // flush 掉之前未跟 tool 的纯 reasoning
      // 如果已经有执行阶段，直接加入
      if (currentExecution.length > 0) {
        currentExecution.push(part);
      } else {
        // 没有执行阶段，走原有的纯工具聚合逻辑
        const toolKind = getToolKind(part.toolName);
        if (currentToolGroup && currentToolGroup.toolKind === toolKind) {
          currentToolGroup.parts.push(part);
        } else {
          flushTools();
          currentToolGroup = { parts: [part], toolKind };
        }
      }
    } else if (part.type === "text") {
      // text 打断执行阶段和纯聚合
      flushExecution();
      flushReasonings();
      flushTools();
      if (part.content?.trim()) {
        blocks.push({ type: "text", content: part.content });
      }
    } else if (part.type === "image") {
      flushExecution();
      flushReasonings();
      flushTools();
      blocks.push({ type: "image", url: part.url, alt: part.alt });
    } else if (part.type === "file") {
      flushExecution();
      flushReasonings();
      flushTools();
      blocks.push({
        type: "file",
        name: part.name,
        url: part.url,
        size: part.size,
      });
    }
  });

  flushExecution();
  flushReasonings();
  flushTools();
  return blocks;
}, [normalizedParts]);
```

### 4.3 修改 3：新增 `ExecutionPhase` 渲染组件

**文件**：`assistant-message.tsx`（在 `ToolCallGroup` 组件附近新增）

```typescript
function ExecutionPhase({
  parts,
  isStreaming,
}: {
  parts: MessagePart[];
  isStreaming: boolean;
}) {
  const [open, setOpen] = useState(false);

  // 流式输出时自动展开，结束后延迟 800ms 折叠（与 Reasoning 组件行为一致）
  useEffect(() => {
    if (isStreaming) {
      setOpen(true);
    } else {
      const timer = setTimeout(() => setOpen(false), 800);
      return () => clearTimeout(timer);
    }
  }, [isStreaming]);

  // 对内部 parts 进行二次聚合：连续同类工具合并显示
  const innerBlocks = useMemo(() => {
    type InnerBlock =
      | { type: "reasoning"; content: string; duration?: number }
      | { type: "tool-group"; parts: ToolPart[]; toolKind: string }
      | { type: "tool-single"; part: ToolPart };

    const result: InnerBlock[] = [];
    let toolGroup: { parts: ToolPart[]; toolKind: string } | null = null;

    const flushToolGroup = () => {
      if (!toolGroup || toolGroup.parts.length === 0) return;
      if (toolGroup.parts.length >= 2) {
        result.push({ type: "tool-group", parts: toolGroup.parts, toolKind: toolGroup.toolKind });
      } else {
        result.push({ type: "tool-single", part: toolGroup.parts[0] });
      }
      toolGroup = null;
    };

    parts.forEach((p) => {
      if (p.type === "reasoning") {
        flushToolGroup();
        result.push({ type: "reasoning", content: p.content, duration: p.duration });
      } else if (p.type === "tool") {
        const toolKind = getToolKind(p.toolName);
        if (toolGroup && toolGroup.toolKind === toolKind) {
          toolGroup.parts.push(p);
        } else {
          flushToolGroup();
          toolGroup = { parts: [p], toolKind };
        }
      }
    });
    flushToolGroup();
    return result;
  }, [parts]);

  // 统计信息
  const reasoningCount = parts.filter((p) => p.type === "reasoning").length;
  const toolCount = parts.filter((p) => p.type === "tool").length;

  const summaryParts: string[] = [];
  if (reasoningCount > 0) summaryParts.push(`${reasoningCount} 次思考`);
  if (toolCount > 0) summaryParts.push(`${toolCount} 次工具调用`);

  const hasRunning = parts.some(
    (p) => p.type === "tool" && p.status === "running"
  );

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-1.5 py-0.5 text-[11px] transition-colors select-none min-w-0 group/phase">
        <Wrench className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
        <span className="text-muted-foreground/60 truncate">
          执行过程（{summaryParts.join("、")}）
        </span>
        {hasRunning && (
          <Loader2 className="h-3 w-3 animate-spin flex-shrink-0 text-muted-foreground/50" />
        )}
        <ChevronDown
          className={cn(
            "h-3 w-3 text-muted-foreground/30 transition-transform duration-200 flex-shrink-0 group-hover/phase:text-muted-foreground/50",
            open && "rotate-180",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden transition-all data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <div className="pl-4 border-l border-border/20 ml-[5px] mt-0.5 space-y-0.5">
          {innerBlocks.map((block, i) => {
            if (block.type === "reasoning") {
              return (
                <div
                  key={`exec-reasoning-${i}`}
                  className="flex items-start gap-1.5 text-[11px] text-muted-foreground/70 py-0.5"
                >
                  <Sparkles className="h-3 w-3 text-muted-foreground/50 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1 leading-relaxed">
                    <Streamdown plugins={{ code, cjk }} controls={{ table: false, code: true }}>
                      {block.content}
                    </Streamdown>
                  </div>
                </div>
              );
            }

            if (block.type === "tool-single") {
              const part = block.part;
              const Icon = getToolIcon(getToolKind(part.toolName));
              return (
                <div
                  key={`exec-tool-${i}`}
                  className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 py-0.5"
                >
                  <Icon className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">{getToolActionText(part)}</span>
                  {part.status === "running" && (
                    <Loader2 className="h-3 w-3 animate-spin flex-shrink-0" />
                  )}
                  {part.status === "error" && (
                    <span className="text-red-400 text-[10px]">失败</span>
                  )}
                  {part.status === "awaiting-approval" && (
                    <span className="text-yellow-400 text-[10px]">等待确认</span>
                  )}
                </div>
              );
            }

            if (block.type === "tool-group") {
              const Icon = getToolIcon(block.toolKind);
              const label = getToolGroupLabel(block.toolKind);
              return (
                <div
                  key={`exec-tool-group-${i}`}
                  className="text-[11px] text-muted-foreground/60 py-0.5"
                >
                  <div className="flex items-center gap-1.5">
                    <Icon className="h-3 w-3 flex-shrink-0" />
                    <span>{label}（{block.parts.length} 个）</span>
                  </div>
                  <div className="pl-4 mt-0.5 space-y-0.5">
                    {block.parts.map((p, j) => (
                      <div
                        key={j}
                        className="flex items-center gap-1.5 text-muted-foreground/50"
                      >
                        <span className="truncate">{getToolActionText(p)}</span>
                        {p.status === "running" && (
                          <Loader2 className="h-3 w-3 animate-spin flex-shrink-0" />
                        )}
                        {p.status === "error" && (
                          <span className="text-red-400 text-[10px]">失败</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            }

            return null;
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
```

> **注意**：需要在文件顶部的 import 中确认 `useEffect` 已导入（当前第 4 行仅导入了 `useState, useMemo`）。

### 4.4 修改 4：更新渲染逻辑

**文件**：`assistant-message.tsx` 第 251-370 行的 `renderBlocks.map` 中，新增 `execution-phase` 分支：

```typescript
// 在 renderBlocks.map((block, index) => { ... }) 中，添加：

if (block.type === "execution-phase") {
  return (
    <ExecutionPhase
      key={`execution-phase-${index}`}
      parts={block.parts}
      isStreaming={isStreaming && index === renderBlocks.length - 1}
    />
  );
}
```

此分支应放在 `reasoning-group` 分支之后、`text` 分支之前。

### 4.5 修改 5：补充 import

**文件**：`assistant-message.tsx` 第 4 行

```typescript
// 修改前
import { useState, useMemo } from "react";
// 修改后
import { useState, useMemo, useEffect } from "react";
```

---

## 五、实施计划

### 5.1 实施步骤

**工作量**：2-3 小时

**任务清单**：

- [ ] 补充 `useEffect` import
- [ ] 扩展 `RenderBlock` 类型定义（添加 `execution-phase`）
- [ ] 重写 `renderBlocks` 生成逻辑（聚合 reasoning + tool 为执行阶段）
- [ ] 实现 `ExecutionPhase` 组件（含内部二次聚合、状态处理）
- [ ] 在 `renderBlocks.map` 中添加 `execution-phase` 渲染分支
- [ ] 手动测试（多种 parts 序列组合验证）

### 5.2 验证标准

- [ ] 截图中 4 个思考块 + 3 个工具组 → 折叠为 1-2 个执行阶段
- [ ] 纯 reasoning（无 tool 跟随）仍渲染为 `reasoning-group`
- [ ] 纯 tool（无 reasoning 跟随）仍渲染为 `tool-single` / `tool-group`
- [ ] text / image / file 正确打断执行阶段
- [ ] 点击展开后，内部结构清晰（思考用 Sparkles 图标，工具用对应图标）
- [ ] 最终 text 输出不受影响
- [ ] 流式输出时，执行阶段自动展开；结束后延迟 800ms 自动折叠
- [ ] tool status 为 `running` / `error` / `awaiting-approval` 时正确显示

---

## 六、设计细节

### 6.1 视觉规范

**执行阶段标题**：

```
🔧 执行过程（2 次思考、5 次工具调用）▼
```

- 字体：11px `text-muted-foreground/60`（与现有折叠块一致）
- 图标：`Wrench`（lucide-react）
- 高度：与现有 `ToolCallGroup` 一致（`py-0.5`）

**执行阶段展开内容**：

- 思考项：`Sparkles` 图标 + Streamdown 渲染内容
- 工具项：对应图标（`Eye`/`Edit3`/`Terminal`/`Wrench`）+ 操作文本
- 同类工具 ≥2 个时，内部仍聚合为子组显示
- 缩进：`pl-4`，左侧边框 `border-l border-border/20`

### 6.2 交互规范

| 操作       | 行为                                               |
| ---------- | -------------------------------------------------- |
| 点击标题   | 展开/折叠执行阶段                                  |
| 流式输出中 | 自动展开（`isStreaming=true`）                     |
| 流式结束   | 延迟 800ms 后自动折叠（与 `Reasoning` 组件一致）   |
| 鼠标悬停   | 标题区域 `group-hover/phase` 高亮 ChevronDown 图标 |

### 6.3 边界情况

| 场景                       | 处理方式                                                           |
| -------------------------- | ------------------------------------------------------------------ |
| 纯思考（无后续工具）       | 保持 `reasoning-group` 渲染，不进入执行阶段                        |
| 纯工具（无关联思考）       | 保持 `tool-single` / `tool-group` 渲染                             |
| 单个 reasoning + 单个 tool | 合并为一个执行阶段（最小聚合单元）                                 |
| 超长执行阶段（>20 parts）  | 内部二次聚合减少视觉噪音，暂不做虚拟滚动                           |
| 流式输出中断               | `renderBlocks` 基于 `normalizedParts` 重算，已生成内容保留         |
| tool status 异常           | `error` 显示红色"失败"标签，`awaiting-approval` 显示黄色"等待确认" |

---

## 七、测试计划

### 7.1 聚合逻辑验证（手动）

在浏览器中验证以下 parts 序列的渲染结果：

| 输入 Parts 序列          | 预期 Blocks                                            |
| ------------------------ | ------------------------------------------------------ |
| `[R, R, T, R, T, Text]`  | `[execution-phase(R,R,T,R,T), text]`                   |
| `[R, R]`（无 tool）      | `[reasoning-group(R,R)]`                               |
| `[T, T]`（无 reasoning） | `[tool-group(T,T)]`                                    |
| `[R, Text, T]`           | `[reasoning-group(R), text, tool-single(T)]`           |
| `[R, T, R, T, R, T]`     | `[execution-phase(R,T,R,T,R,T)]`                       |
| `[T, R, T, Text, R, T]`  | `[execution-phase(T,R,T), text, execution-phase(R,T)]` |
| `[R, T, Image, R, T]`    | `[execution-phase(R,T), image, execution-phase(R,T)]`  |

> 注：R = reasoning, T = tool, Text = text, Image = image

### 7.2 集成测试场景

1. **截图场景**：4 个思考块 + 3 个工具组 → 1-2 个执行阶段
2. **流式输出**：执行阶段动态扩展，不影响已渲染内容
3. **权限请求**：`awaiting-approval` 状态的工具正确显示"等待确认"
4. **错误处理**：tool `status = 'error'` 时，执行阶段不崩溃，显示"失败"标签

### 7.3 手动测试步骤

1. 启动 `pnpm dev`
2. 进入创作端编辑页面
3. 发送复杂指令（如"分析当前项目结构并优化配置"）
4. 观察 AI 响应：
   - [ ] 执行阶段折叠正确
   - [ ] 展开后内容完整（思考 + 工具交替可见）
   - [ ] 流式输出流畅，执行阶段自动展开
   - [ ] 流式结束后自动折叠
   - [ ] 最终回复清晰可见

---

## 八、风险评估

### 8.1 技术风险

| 风险                 | 影响             | 缓解措施                                           |
| -------------------- | ---------------- | -------------------------------------------------- |
| `parts` 数据结构变更 | 聚合逻辑失效     | 添加类型守卫，`normalizedParts` 层做兼容处理       |
| 流式输出时序问题     | 执行阶段错误分割 | `useMemo` 依赖 `normalizedParts`，每次重算保证一致 |
| `useEffect` 副作用   | 折叠状态竞争     | `isStreaming` 变化时才触发，手动操作不受影响       |

### 8.2 用户体验风险

| 风险                   | 影响           | 缓解措施                                  |
| ---------------------- | -------------- | ----------------------------------------- |
| 用户找不到工具调用细节 | 调试困难       | 执行阶段内部保留完整工具列表，含状态标签  |
| 折叠过于激进           | 信息丢失       | 纯思考/纯工具保持独立渲染，仅混合时才聚合 |
| 执行阶段过长           | 展开后阅读困难 | 内部二次聚合（同类工具合并）减少视觉噪音  |

---

## 九、后续优化方向

### 9.1 智能摘要

为执行阶段自动生成摘要（如"分析了 3 个文件，修改了 2 个配置"），基于 tool parameters 提取关键信息。

### 9.2 执行链可视化

用时间线或流程图展示 AI 的执行链（参考 VSCode Copilot Chat 的执行步骤可视化）。

### 9.3 用户偏好记忆

记住用户对执行阶段的展开/折叠偏好，通过 `localStorage` 存储 `executionPhaseDefaultOpen` 配置。

---

## 十、相关文档

- [assistant-message.tsx](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/author-site/src/components/ai-elements/assistant-message.tsx)
- [reasoning.tsx](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/author-site/src/components/ai-elements/reasoning.tsx)
- [message.tsx](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/author-site/src/components/ai-elements/message.tsx)
- [tool.tsx](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/author-site/src/components/ai-elements/tool.tsx)

---

**文档维护者**：AI 辅助生成  
**最后更新**：2026-05-28  
**文档状态**：待实施
