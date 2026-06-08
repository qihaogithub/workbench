# 代码块折叠渲染方案：从 DOM 后处理到预拆分渲染

> 版本：v3.0  
> 创建日期：2026-06-03  
> 更新：2026-06-03 — 视觉升级为 GitHub 风格统一卡片，利用 Streamdown 公开 DOM API 隐藏内部标题  
> 关联方案：[AI对话区消息展示效果优化方案](./AI对话区消息展示效果优化方案.md) 3.4 方案 3：代码块简化展示（P1）  
> 状态：已实施

---

## 一、背景

### 1.1 当前方案

在「AI对话区消息展示效果优化方案」Phase 2 中，代码块折叠通过**DOM 后处理**实现（`collapsible-code-block.tsx` 的 `CodeBlockFolder` 组件）：

1. 外层渲染：文本 block → `<CodeBlockFolder>` → `<Streamdown>`（`@streamdown/code` 插件正常生效）
2. 渲染完成后：`useLayoutEffect` + `MutationObserver` 扫描 DOM，找到 `<pre>` 元素
3. 包裹处理：创建 `cb-visual-wrapper` 包裹 summary 摘要栏 + Streamdown 代码块容器
4. 状态切换：通过 `display: none` + CSS class 实现折叠/展开

### 1.2 当前问题

**流式输出结束后存在明显的折叠闪烁**：用户先看到完整代码块，约 50-500ms 后才变为折叠样式。

根因有三层：

| 层级 | 问题 | 影响 |
|------|------|------|
| Shiki 异步加载 | `@streamdown/code` 的语法高亮引擎需异步获取主题和语言包，渲染分两阶段（骨架 → 高亮完成） | `useLayoutEffect` 在第一阶段执行时 DOM 尚未就绪 |
| MutationObserver 延迟 | 观察器在 paint 之后才触发回调 | 用户必然看到至少一帧未折叠代码 |
| 摘要栏动态创建 | 每次流式结束需要创建/销毁 DOM 元素 | 操作成本不可见，但时序不可控 |

---

## 二、Streamdown 代码块渲染链路分析

### 2.1 内部渲染流程

```
Markdown 解析
    ↓ (remark/rehype 识别围栏代码块)
代码块 AST 节点
    ↓ (@streamdown/code 插件)
Shiki codeHighlighter.highlight()
    ↓ (异步：加载主题、语言语法)
返回 HighlightResult（含 tokenized 数组）
    ↓
Streamdown 内部 CodeBlock 组件
    ↓
CodeBlockContainer → CodeBlockHeader + <pre><code> + CopyButton + DownloadButton
```

关键特征：
- **异步渲染**：Shiki 主题和语言包均为异步加载，初始 render 可能返回骨架或 `null`
- **多层嵌套**：CodeBlockContainer 是 `<div>`，内含 header（语言标签 + 按钮）+ `<pre>`（高亮内容）
- **上下文依赖**：代码块依赖 `StreamdownContext`（`shikiTheme`、`controls`、`lineNumbers`），外部单独渲染需完整 context
- **自定义 CSS**：暗色主题配色、行号定位、按钮布局均由 Streamdown 内部控制

### 2.2 为什么 DOM 后处理不可靠

Streamdown 的渲染结果被 React 视为一个快照。异步主题加载完成后，Shiki 会触发 React 重渲染，但这一步对 DOM 后处理而言是「不可预知的二次变更」。`MutationObserver` 虽然能捕获，但：

1. 首次 paint 已在观察器回调之前发生
2. `display: none` 的内联样式和多层 CSS class 切换产生的过渡效果不稳定
3. 清理回调在依赖变化时可能误删正在流式输出的代码块

---

## 三、方案：Markdown 预拆分渲染

### 3.1 核心思路

**在 React 渲染之前，用状态机把 Markdown 按围栏代码块边界拆分为文本段和代码段。文本段完整交给 Streamdown 渲染，代码段独立用 CollapsibleCodeBlock 组件控制折叠/展开。**

```
原始 AI 输出 Markdown
        │
        ▼
splitByFencedCode(markdown)  ← 自写状态机，按围栏代码块边界拆分
        │
  ┌─────┼──────┐
  ▼     ▼      ▼
文本段   代码段  文本段
  │     │       │
  ▼     ▼       ▼
Streamdown   CollapsibleCode  Streamdown
(完整渲染)    (React组件)     (完整渲染)
               │
         内部用 mini Streamdown
         做语法高亮 + 行号
```

**关键决策：不用 `parseMarkdownIntoBlocks`**

Streamdown 暴露的 `parseMarkdownIntoBlocks` 按**空行边界**拆分 Markdown。这意味着含空行的代码块会被切成多段（例如 `const x = 1;\n\nconst y = 2;` 被拆为两块），之后的围栏匹配正则永远无法命中。因此必须用**自写的状态机**只按围栏代码块边界拆分。

### 3.2 优势

| 对比维度 | DOM 后处理（当前） | Markdown 预拆分（新方案） |
|----------|-------------------|--------------------------|
| 第一帧状态 | 展开 → 闪烁 → 折叠 | 直接以折叠态渲染 |
| 组件归属 | 非 React（DOM 操作） | 纯 React 组件 |
| 代码高亮 | Streamdown 自带（保留） | mini Streamdown 自带（保留） |
| 功能按钮 | Streamdown 自带复制/下载 | 复用 Streamdown 内置按钮 |
| 状态管理 | DOM class 切换 | React state（`useState`） |
| 流式兼容 | 需 isStreaming 跳过 | 天然兼容（流式时仍实时展开） |
| 代码块含空行 | — | 状态机正确识别完整代码块 |

### 3.3 核心依赖

- **`splitByFencedCode()`**：自写的状态机函数，按围栏代码块边界将 Markdown 拆分为 `FencedBlock[]` 数组。
- **`Streamdown` 组件**：本身支持 `children` 为任意字符串，且可通过 `controls` 控制代码块按钮显隐。

---

## 四、实现设计

### 4.1 拆分逻辑：状态机 `splitByFencedCode()`

#### 为什么不直接用 `parseMarkdownIntoBlocks`

| 方法 | 分割依据 | 含空行代码块的处理 |
|------|----------|-------------------|
| `parseMarkdownIntoBlocks` | 空行 | **错误分割**：代码块内空行导致被切为多个片段 |
| `splitByFencedCode`（新） | 围栏标记 ` ``` ` | **正确识别**：代码块内空行不影响边界判断 |

#### 状态机设计

```
状态: inText（文本中）
      inFence（代码块中，已遇到开标记 ```）

输入: Markdown 字符串，逐行处理

inText 状态:
  遇到以 ``` 开头的行 → 切换到 inFence，开始收集代码块内容
  其他行 → 继续累积到当前文本段

inFence 状态:
  遇到以 ``` 开头的行（闭合标记）→ 切换到 inText，完成一个代码段
  其他行 → 继续累积到当前代码段（包括空行）
```

#### 返回值类型

```typescript
type FencedBlock =
  | { type: "text"; content: string }
  | { type: "code"; language: string; code: string };
```

#### 示例

```typescript
// 输入
"这是段落。\n\n```tsx\nconst x = 1;\n\nconst y = 2;\n```\n\n更多文本。"

// splitByFencedCode 输出
[
  { type: "text", content: "这是段落。" },
  { type: "code", language: "tsx", code: "const x = 1;\n\nconst y = 2;" },
  { type: "text", content: "更多文本。" },
]
```

对比 `parseMarkdownIntoBlocks` 的错误输出：
```
["这是段落。", "```tsx", "const x = 1;", "const y = 2;", "```", "更多文本。"]
// 代码块被切成 4 段，无法正确识别
```

#### 边界情况处理

| 边界情况 | 处理方式 |
|----------|----------|
| 未闭合的代码块（流式输出中） | 最后一个 block 如果是未闭合的代码片段，整段交给 Streamdown 渲染（不折叠） |
| 嵌套代码块在引用/列表中（`> ```tsx`） | 状态机只检查行首的 ` ``` `，缩进或前缀的 ` ``` ` 不触发状态切换，整个引用/列表作为文本段 |
| 3个以上反引号（` ````` `） | 状态机匹配到第一个反引号串，后续同样长度的反引号串作为闭合；长度不匹配则不闭合 |
| 连续多个代码块 | 正常：inFence → inText → inFence，中间的空文本段渲染为空（不会产生多余的 Streamdown 实例） |

### 4.2 新组件：`CollapsibleCodeBlock`

```tsx
"use client";

interface CollapsibleCodeBlockProps {
  code: string;       // 纯代码内容（不含围栏标记）
  language: string;   // 语言标识，如 "tsx"、"python"
  isStreaming: boolean;
}
```

**折叠态**：
```
┌──────────────────────────────────────────────┐
│ </>  已生成 42 行 TypeScript 代码              │
│      点击展开查看                               │
└──────────────────────────────────────────────┘
```

**展开态**：
```
┌──────────────────────────────────────────────┐
│ </>  已生成 42 行 TypeScript 代码              │
│      点击折叠                              ▾  │
├──────────────────────────────────────────────┤
│ [tsx]  [copy] [download]                     │  ← Streamdown 自带
│  1 │ import { useState } from 'react';       │
│  2 │                                         │
│  3 │ export function App() {                 │
│ ...│                                         │
└──────────────────────────────────────────────┘
```

组件内部使用一个独立的 `<Streamdown>` 实例，只带 `code` 和 `cjk` 插件，用 `controls={{ table: false, code: true }}` 保留复制/下载按钮。

> **关于多 Streamdown 实例**：由于拆分粒度是「代码块 vs 文本段」（而不是每个空行段落），实例数量等于代码块数量 + 文本段段数，实际场景中通常不会超过 10 个，性能开销可控。

### 4.3 集成位置

在 `assistant-message.tsx` 的 text block 渲染处（当前约 372 行），将原来的：

```tsx
<Streamdown plugins={{ code, mermaid, math, cjk }} ...>
  {block.content}
</Streamdown>
```

替换为：

```tsx
<SplitContentRenderer content={block.content} isStreaming={...} />
```

`SplitContentRenderer` 内部逻辑：

```typescript
function SplitContentRenderer({ content, isStreaming }: SplitContentRendererProps) {
  const blocks = useMemo(() => splitByFencedCode(content), [content]);

  return blocks.map((block, i) => {
    if (block.type === "code") {
      return (
        <CollapsibleCodeBlock
          key={`code-${i}`}
          code={block.code}
          language={block.language}
          isStreaming={isStreaming}
        />
      );
    }
    // 文本段 → 完整交给 Streamdown
    return (
      <div key={`text-${i}`} className="prose prose-sm dark:prose-invert max-w-none min-w-0 text-[14px]">
        <Streamdown
          plugins={{ code, mermaid, math, cjk }}
          isAnimating={isStreaming}
          caret="block"
          controls={{ table: false, code: true, mermaid: true }}
        >
          {block.content}
        </Streamdown>
      </div>
    );
  });
}
```

### 4.4 不再需要 Regex 围栏代码块识别

新方案放弃正则匹配方法（`^```(\w*)\n([\s\S]*?)```$`），因为在 `parseMarkdownIntoBlocks` 拆分后代码块已被打碎，正则永远匹配不到。状态机方案从源头保证了代码块完整性。

### 4.5 流式过程中的行为

| 阶段 | 行为 |
|------|------|
| 代码块正在流式写入 | 折叠栏不出现，Streamdown 正常实时显示（让用户看到 AI 在写代码） |
| 流式结束 | 自动折叠，显示摘要 |
| 用户手动点击 | 展开/折叠切换 |

**流式检测策略**：

不依赖正则检测未闭合的 ` ``` `（可能受内联代码或文本中反引号干扰），而是利用状态机自身的输出：

- **`splitByFencedCode` 流式结果特征**：流式写入过程中，最后一个 block 可能是 `type: "text"` 但内容以未闭合的围栏标记开头（如 `"```tsx\nconst x = 1;\n"`）。此时将该 block 直接交由 Streamdown 渲染（不传 `CollapsibleCodeBlock`），Streamdown 会自行处理未闭合的围栏代码块。
- **`isStreaming` prop**：如果父组件传入 `isStreaming=true`，`SplitContentRenderer` 中对**最后一个代码块**不折叠，让它实时展示。
- **流式结束时机**：依赖 `assistant-message.tsx` 已有的 `isStreaming` 状态（来自 `useMessage`），不需要自行判断。

### 4.6 删除现有 `CodeBlockFolder` / `collapsible-code-block.tsx`

新方案完全不需要 DOM 后处理。删除文件 `collapsible-code-block.tsx` 和 `globals.css` 中 `cb-*` 相关样式。`assistant-message.tsx` 中移除 `CodeBlockFolder` 包装和 `CollapsiblePre` 导入。

---

## 五、文件改动

| 文件 | 操作 | 说明 |
|------|------|------|
| **新增** `split-by-fenced-code.ts` | 创建 | 导出 `splitByFencedCode()` 状态机函数 |
| **新增** `split-content-renderer.tsx` | 创建 | `SplitContentRenderer` + `CollapsibleCodeBlock` 组件 |
| `assistant-message.tsx` | 修改 | text block 渲染替换为 `SplitContentRenderer`，移除 `CodeBlockFolder` 包装 |
| `collapsible-code-block.tsx` | **删除** | DOM 后处理方案不再需要 |
| `globals.css` | 修改 | 移除 `cb-*` 相关样式，新增折叠组件样式 |

---

## 六、验证标准

- [ ] 已完成的消息中，所有代码块默认折叠，显示摘要栏（行数 + 语言）
- [ ] 点击摘要栏展开，代码高亮正常显示
- [ ] 展开后再次点击折叠，代码块消失
- [ ] 流式输出过程中，代码块正常实时展示（不折叠）
- [ ] 流式结束后，代码块自动折叠
- [ ] 无闪烁：页面加载/流式结束时，折叠态直接出现
- [ ] 文本中的内联代码、链接、列表渲染不受影响
- [ ] **含空行的代码块**能正确识别并折叠（不被错误拆分）
- [ ] **连续多个代码块**之间文本段正常渲染
- [ ] **引用/列表中的代码块**不被错误拆分（整体交给 Streamdown）

---

## 七、相关文档

- [AI对话区消息展示效果优化方案](./AI对话区消息展示效果优化方案.md) — 方案 3.4
- [Streamdown 源码](file:///packages/author-site/node_modules/streamdown/dist/index.d.ts)
- [collapsible-code-block.tsx](file:///packages/author-site/src/components/ai-elements/collapsible-code-block.tsx) — 当前实现（待替换）
