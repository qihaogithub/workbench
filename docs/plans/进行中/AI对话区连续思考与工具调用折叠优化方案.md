# AI对话区连续思考与工具调用折叠优化方案

> 版本：v1.0  
> 创建日期：2026-05-28  
> 关联问题：AI对话区连续的思考过程、工具调用显得冗长，需要进一步折叠  
> 状态：方案设计阶段

---

## 一、问题描述

### 1.1 当前现象

从用户截图可以看到，AI对话区存在以下问题：

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

当前实现已经做了部分聚合：

```typescript
// 第 157-216 行：renderBlocks 生成逻辑
- 连续的 reasoning parts → 合并为 reasoning-group
- 连续的相同类型 tool parts → 合并为 tool-group
- 不同类型之间会被 text 或其他类型打断
```

**聚合规则**：

| 内容类型      | 聚合条件                             | 当前行为            |
| ------------- | ------------------------------------ | ------------------- |
| 思考过程      | 连续的 reasoning parts               | ✅ 合并为一个折叠块 |
| 工具调用      | 连续的相同 kind（read/edit/execute） | ✅ 合并为一个折叠块 |
| 思考+工具交替 | reasoning → tool → reasoning         | 不合并，分别渲染    |

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

---

## 三、优化方案

### 3.1 方案概述

**核心思路**：将连续的"思考过程 + 工具调用"视为一个**执行阶段（Execution Phase）**，统一折叠。

```
当前：
┌─ 思考过程 ─┐
───────────┘
┌─ 读取文件 (2个) ─┐
─────────────────┘
┌─ 思考过程 ─┐
└───────────┘
┌─ 读取文件 (6个) ─┐
└─────────────────┘

优化后：
┌─ 执行过程（思考 + 工具）▼ ─┐
│  ├─ 思考过程               │
│  ├─ 读取文件 (2个)         │
│  ├─ 思考过程               │
│  └─ 读取文件 (6个)         │
──────────────────────────┘
```

### 3.2 方案 A：阶段级折叠（推荐）

#### 3.2.1 核心逻辑

将 AI 响应划分为三种阶段：

1. **思考阶段**：纯 reasoning parts（无工具调用）
2. **执行阶段**：reasoning 和 tool 交替出现
3. **输出阶段**：text 类型（最终回复）

**聚合规则**：

```
Parts 序列：[R, R, T, R, T, T, R, Text, R, T, Text]
           ↓
Blocks:    [{思考阶段}, {执行阶段}, {输出阶段}, {执行阶段}, {输出阶段}]
```

#### 3.2.2 实现改动

**文件**：`assistant-message.tsx`

**修改 1**：扩展 `RenderBlock` 类型（第 64-70 行）

```typescript
type RenderBlock =
  | { type: "text"; content: string }
  | { type: "reasoning-group"; reasonings: ReasoningPart[] }
  | { type: "tool-group"; parts: ToolPart[]; toolKind: string }
  | { type: "tool-single"; part: ToolPart }
  | { type: "image"; url: string; alt?: string }
  | { type: "file"; name: string; url: string; size?: number }
  // 新增
  | { type: "execution-phase"; parts: MessagePart[] }; // 执行阶段
```

**修改 2**：重写 `renderBlocks` 生成逻辑（第 157-216 行）

```typescript
const renderBlocks: RenderBlock[] = useMemo(() => {
  const blocks: RenderBlock[] = [];
  let currentExecution: MessagePart[] = []; // 当前执行阶段
  let currentReasonings: ReasoningPart[] = []; // 纯思考阶段

  const flushExecution = () => {
    if (currentExecution.length > 0) {
      blocks.push({ type: "execution-phase", parts: currentExecution });
      currentExecution = [];
    }
  };

  const flushReasonings = () => {
    if (currentReasonings.length > 0) {
      blocks.push({ type: "reasoning-group", reasonings: currentReasonings });
      currentReasonings = [];
    }
  };

  normalizedParts.forEach((part) => {
    if (part.type === "reasoning") {
      flushReasonings();
      currentExecution.push(part);
    } else if (part.type === "tool") {
      flushReasonings();
      currentExecution.push(part);
    } else if (part.type === "text") {
      flushExecution();
      if (part.content?.trim()) {
        blocks.push({ type: "text", content: part.content });
      }
    } else if (part.type === "image" || part.type === "file") {
      flushExecution();
      blocks.push({ type: part.type, ...part });
    }
  });

  flushExecution();
  flushReasonings();
  return blocks;
}, [normalizedParts]);
```

**修改 3**：新增 `ExecutionPhase` 渲染组件

```typescript
function ExecutionPhase({ parts }: { parts: MessagePart[] }) {
  const [open, setOpen] = useState(false);
  const hasReasoning = parts.some(p => p.type === "reasoning");
  const hasTools = parts.some(p => p.type === "tool");

  // 统计信息
  const reasoningCount = parts.filter(p => p.type === "reasoning").length;
  const toolCount = parts.filter(p => p.type === "tool").length;

  const summary = [];
  if (reasoningCount > 0) summary.push(`${reasoningCount} 次思考`);
  if (toolCount > 0) summary.push(`${toolCount} 次工具调用`);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-2 py-1 text-[11px] transition-colors select-none min-w-0 group/phase">
        <Wrench className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
        <span className="text-muted-foreground/60">
          执行过程（{summary.join('、')}）
        </span>
        <ChevronDown
          className={cn(
            "h-3 w-3 text-muted-foreground/30 transition-transform duration-200 flex-shrink-0",
            open && "rotate-180"
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pl-4 border-l border-border/20 ml-[5px] mt-1 space-y-1">
          {parts.map((part, i) => {
            if (part.type === "reasoning") {
              return (
                <div key={i} className="text-[11px] text-muted-foreground/70">
                  <Streamdown plugins={{ code, cjk }}>
                    {part.content}
                  </Streamdown>
                </div>
              );
            }
            if (part.type === "tool") {
              const Icon = getToolIcon(getToolKind(part.toolName));
              return (
                <div key={i} className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
                  <Icon className="h-3 w-3 flex-shrink-0" />
                  <span>{getToolActionText(part)}</span>
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

#### 3.2.3 优势

- ✅ 大幅减少垂直空间占用（N 个折叠块 → 1 个）
- ✅ 保留完整的执行链上下文
- ✅ 用户可一键展开查看完整过程
- ✅ 向后兼容（text 输出部分不受影响）

#### 3.2.4 风险

- ️ 执行阶段过长时，展开后内容较多（可通过默认折叠缓解）
- ️ 用户可能错过某些工具调用的细节（可提供悬停提示）

---

### 3.3 方案 B：时间窗口聚合（备选）

#### 3.3.1 核心逻辑

基于时间戳将相邻的思考/工具调用聚合（如 30 秒内的操作视为一个阶段）。

**适用场景**：当 `MessagePart` 包含 `timestamp` 字段时。

#### 3.3.2 实现思路

```typescript
const TIME_WINDOW = 30000; // 30秒

const renderBlocks = useMemo(() => {
  const blocks: RenderBlock[] = [];
  let currentPhase: MessagePart[] = [];
  let lastTimestamp: number | null = null;

  normalizedParts.forEach((part) => {
    const ts = part.timestamp ?? Date.now();

    if (lastTimestamp && ts - lastTimestamp > TIME_WINDOW) {
      // 时间间隔超过窗口，创建新阶段
      if (currentPhase.length > 0) {
        blocks.push({ type: "execution-phase", parts: currentPhase });
      }
      currentPhase = [];
    }

    currentPhase.push(part);
    lastTimestamp = ts;
  });

  // flush 最后一个阶段
  if (currentPhase.length > 0) {
    blocks.push({ type: "execution-phase", parts: currentPhase });
  }

  return blocks;
}, [normalizedParts]);
```

#### 3.3.3 优势

- ✅ 更精确地反映 AI 的执行节奏
- ✅ 自动识别"停顿"（如等待用户输入）

#### 3.3.4 劣势

- ❌ 需要 `timestamp` 字段支持（当前部分 parts 缺失）
- ❌ 时间窗口阈值需要调优
- ❌ 可能将本应分离的操作错误聚合

---

### 3.4 方案 C：混合折叠（渐进式）

#### 3.4.1 核心逻辑

结合方案 A 和现有聚合逻辑：

1. **第一层**：执行阶段折叠（方案 A）
2. **第二层**：执行阶段内部，相同类型工具继续聚合（现有逻辑）

```
┌─ 执行过程（3次思考、8次工具调用）▼ ┐
│  ├─ 思考过程（2次）                  │
│  ├─ 读取文件（4个）                  │
│  ├─ 思考过程（1次）                  │
│  └─ 编辑文件（4个）                  │
└────────────────────────────────────┘
```

#### 3.4.2 实现改动

在 `ExecutionPhase` 组件内部，对 `parts` 进行二次聚合：

```typescript
function ExecutionPhase({ parts }: { parts: MessagePart[] }) {
  // 二次聚合逻辑
  const innerBlocks = useMemo(() => {
    const blocks: InnerBlock[] = [];
    let currentReasonings: ReasoningPart[] = [];
    let currentToolGroup: { parts: ToolPart[]; toolKind: string } | null = null;

    parts.forEach((part) => {
      if (part.type === "reasoning") {
        // flush tool group
        currentReasonings.push(part);
      } else if (part.type === "tool") {
        // 同类型工具聚合
        const toolKind = getToolKind(part.toolName);
        if (currentToolGroup?.toolKind === toolKind) {
          currentToolGroup.parts.push(part);
        } else {
          // flush
          currentToolGroup = { parts: [part], toolKind };
        }
      }
    });

    return blocks;
  }, [parts]);

  // 渲染逻辑...
}
```

#### 3.4.3 优势

- ✅ 兼顾简洁性和可读性
- ✅ 执行阶段内部仍有结构
- ✅ 用户可逐层展开

#### 3.4.4 劣势

- ⚠️ 实现复杂度较高
- ️ 嵌套折叠可能增加交互认知负担

---

## 四、方案对比

| 维度           | 方案 A：阶段级折叠 | 方案 B：时间窗口 | 方案 C：混合折叠 |
| -------------- | ------------------ | ---------------- | ---------------- |
| **空间节省**   | ⭐⭐⭐⭐           | ⭐⭐⭐⭐         | ⭐⭐⭐⭐         |
| **实现复杂度** | ⭐⭐               | ⭐⭐⭐           | ⭐⭐⭐⭐         |
| **可读性**     | ⭐⭐⭐⭐           | ⭐⭐⭐           | ⭐⭐⭐⭐⭐       |
| **依赖条件**   | 无                 | 需要 timestamp   | 无               |
| **向后兼容**   | ✅                 | ✅               | ✅               |
| **推荐度**     | **首选**           | 备选             | 长期优化         |

---

## 五、实施计划

### 5.1 阶段 1：方案 A 实现（P0）

**工作量**：2-3 小时

**任务清单**：

- [ ] 扩展 `RenderBlock` 类型定义
- [ ] 重写 `renderBlocks` 生成逻辑
- [ ] 实现 `ExecutionPhase` 组件
- [ ] 更新 `assistant-message.tsx` 渲染逻辑
- [ ] 添加单元测试（聚合规则验证）
- [ ] 手动测试（截图场景验证）

**验证标准**：

- ✅ 截图中的 4 个思考块 + 3 个工具组 → 折叠为 1-2 个执行阶段
- ✅ 点击展开后，内部结构清晰
- ✅ 最终 text 输出不受影响
- ✅ 流式输出时，执行阶段动态扩展

### 5.2 阶段 2：方案 C 优化（P1，可选）

**工作量**：3-4 小时

**前置条件**：方案 A 已上线并验证

**任务清单**：

- [ ] 实现 `ExecutionPhase` 内部二次聚合
- [ ] 优化嵌套折叠的视觉层次
- [ ] 添加阶段摘要统计（思考次数、工具调用次数）
- [ ] A/B 测试（用户反馈收集）

### 5.3 阶段 3：数据埋点（P2）

**工作量**：1-2 小时

**任务清单**：

- [ ] 记录执行阶段的平均长度（parts 数量）
- [ ] 记录用户展开率（多少用户会点击查看细节）
- [ ] 记录滚动深度变化（优化后是否减少滚动）

---

## 六、设计细节

### 6.1 视觉规范

**执行阶段标题**：

```
执行过程（2 次思考、5 次工具调用）▼
```

- 字体：11px muted-foreground
- 图标：Wrench（工具）或 Sparkles（思考）
- 高度：28px（与现有折叠块一致）

**执行阶段内容**：

```
─ 思考过程（15 秒）
├─ 读取文件（3 个）
├─ 思考过程（8 秒）
└─ 编辑文件（2 个）
```

- 缩进：16px
- 左侧边框：border-l border-border/20
- 子项间距：4px

### 6.2 交互规范

| 操作       | 行为                                 |
| ---------- | ------------------------------------ |
| 点击标题   | 展开/折叠执行阶段                    |
| 流式输出中 | 自动展开（isStreaming=true）         |
| 流式结束   | 延迟 800ms 后自动折叠                |
| 鼠标悬停   | 标题高亮（text-muted-foreground/80） |

### 6.3 边界情况

| 场景                      | 处理方式                      |
| ------------------------- | ----------------------------- |
| 纯思考（无工具）          | 保持现有 reasoning-group 渲染 |
| 纯工具（无思考）          | 保持现有 tool-group 渲染      |
| 单个 part                 | 不聚合，直接渲染              |
| 超长执行阶段（>20 parts） | 添加"显示更多"按钮            |
| 流式输出中断              | 保留已生成的执行阶段          |

---

## 七、测试计划

### 7.1 单元测试

**文件**：`packages/author-site/src/components/ai-elements/__tests__/assistant-message.test.tsx`

**测试用例**：

```typescript
describe("renderBlocks 聚合逻辑", () => {
  test("连续的 reasoning 和 tool 应合并为 execution-phase", () => {
    const parts: MessagePart[] = [
      { type: "reasoning", content: "思考 1" },
      { type: "tool", toolName: "read", status: "completed" },
      { type: "reasoning", content: "思考 2" },
      { type: "tool", toolName: "edit", status: "completed" },
      { type: "text", content: "最终回复" },
    ];

    const blocks = renderBlocks(parts);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe("execution-phase");
    expect(blocks[1].type).toBe("text");
  });

  test("纯 reasoning 应保持 reasoning-group", () => {
    const parts: MessagePart[] = [
      { type: "reasoning", content: "思考 1" },
      { type: "reasoning", content: "思考 2" },
    ];

    const blocks = renderBlocks(parts);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("reasoning-group");
  });

  test("text 应打断执行阶段", () => {
    const parts: MessagePart[] = [
      { type: "reasoning", content: "思考" },
      { type: "text", content: "中间输出" },
      { type: "tool", toolName: "read", status: "completed" },
    ];

    const blocks = renderBlocks(parts);
    expect(blocks).toHaveLength(3);
  });
});
```

### 7.2 集成测试

**测试场景**：

1. **截图场景**：4 个思考块 + 3 个工具组 → 1-2 个执行阶段
2. **流式输出**：执行阶段动态扩展，不影响已渲染内容
3. **权限请求**：`awaiting-approval` 状态的工具正确显示
4. **错误处理**：tool status = 'error' 时，执行阶段不崩溃

### 7.3 手动测试

**测试步骤**：

1. 启动 `pnpm dev`
2. 进入创作端编辑页面
3. 发送复杂指令（如"分析当前项目结构并优化配置"）
4. 观察 AI 响应：
   - [ ] 执行阶段折叠正确
   - [ ] 展开后内容完整
   - [ ] 流式输出流畅
   - [ ] 最终回复清晰可见

---

## 八、风险评估

### 8.1 技术风险

| 风险                 | 影响             | 缓解措施                              |
| -------------------- | ---------------- | ------------------------------------- |
| `parts` 数据结构变更 | 聚合逻辑失效     | 添加类型守卫，兼容旧格式              |
| 流式输出时序问题     | 执行阶段错误分割 | 使用 `useMemo` 依赖 `normalizedParts` |
| 性能问题（长消息）   | 渲染卡顿         | 虚拟滚动（长期优化）                  |

### 8.2 用户体验风险

| 风险                   | 影响     | 缓解措施                    |
| ---------------------- | -------- | --------------------------- |
| 用户找不到工具调用细节 | 调试困难 | 提供悬停提示、一键展开全部  |
| 折叠过于激进           | 信息丢失 | 保留纯思考/纯工具的独立渲染 |
| 视觉层级混乱           | 认知负担 | 严格遵循设计稿，A/B 测试    |

---

## 九、后续优化方向

### 9.1 智能摘要

**思路**：为执行阶段自动生成摘要（如"分析了 3 个文件，修改了 2 个配置"）。

**实现**：调用 LLM 生成摘要，或基于 tool parameters 提取关键信息。

### 9.2 执行链可视化

**思路**：用时间线或流程图展示 AI 的执行链。

**参考**：VSCode Copilot Chat 的执行步骤可视化。

### 9.3 用户偏好记忆

**思路**：记住用户对执行阶段的展开/折叠偏好，自动应用。

**实现**：localStorage 存储 `executionPhaseDefaultOpen` 配置。

---

## 十、相关文档

- [01\_对话组件设计.md](./技术/01_对话组件设计.md)
- [assistant-message.tsx](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/author-site/src/components/ai-elements/assistant-message.tsx)
- [reasoning.tsx](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/author-site/src/components/ai-elements/reasoning.tsx)
- [message.tsx](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/author-site/src/components/ai-elements/message.tsx)

---

**文档维护者**：AI 辅助生成  
**最后更新**：2026-05-28  
**文档状态**：方案设计阶段，待评审
