# Figma 导入页面显示内容与其他页面相同 — 问题分析报告

> **状态**: 已完成分析  
> **创建日期**: 2026-05-14  
> **问题简述**: 从 Figma 导入的页面，预览区显示的内容与其他页面相同，而非用户从 Figma 导入的页面内容

---

## 一、问题背景

### 1.1 问题描述

用户通过「从 Figma 导入」功能创建新页面后，该页面在预览区显示的内容与之前正在查看的页面内容完全相同，而非用户从 Figma 导入的实际设计内容。

### 1.2 预期行为

切换到 Figma 导入的页面时，预览区应显示该页面从 Figma 导入的组件代码渲染结果。

### 1.3 实际行为

切换到 Figma 导入的页面后，预览区仍然显示之前页面的渲染结果，看起来"内容与其他页面相同"。

### 1.4 复现条件

1. 在编辑模式中打开一个已有项目
2. 点击「添加」→「从 Figma 导入」
3. 粘贴 Figma 插件导出的 Markdown 格式内容
4. 导入成功后，切换到新创建的页面
5. 预览区显示的是之前页面的内容，而非 Figma 导入的内容

---

## 二、根因分析

### 2.1 调查过程

#### 第一步：检查项目数据

检查项目 `proj_1776526720347` 的 workspace 数据，发现 Figma 导入的页面 `demo_1778749341627_ecsne8` 的 `index.tsx` 内容为：

```tsx
<div className="w-[375px] h-[812px] relative" data-figma-id="3629:33921">
  <img className="w-[375px] h-[812px] left-0 top-0 absolute" data-figma-id="3629:33845" src="https://r2-asset-worker.qihaogo.workers.dev/figma/h_ab8789b1.png" />
</div>
```

**关键发现**：该代码是**纯 JSX 片段**，缺少 `import React` 和 `export default` 语句。

#### 第二步：对比正常页面代码

正常的 demo 页面（如 `demo_1778077850198_fjxwmf`）的 `index.tsx` 包含完整的 React 组件结构：

```tsx
import React from 'react';

interface DemoProps { ... }

export default function Demo({ ... }: DemoProps) {
  return ( ... );
}
```

系统默认模板 `DEFAULT_DEMO_CODE`（[fs-utils.ts:214](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/author-site/src/lib/fs-utils.ts#L214)）也包含 `export default`。

#### 第三步：追踪编译与渲染路径

追踪代码从 Figma 导入到预览渲染的完整路径：

```
Figma Markdown 内容
    │
    ▼
parseFigmaMarkdown() → 提取 code（纯 JSX）和 schema
    │
    ▼
createDemoPage() → 创建页面，写入 DEFAULT_DEMO_CODE
    │
    ▼
updateDemoPageFiles() → 覆盖写入纯 JSX 到 index.tsx
    │
    ▼
PreviewPanel → /api/compile → compileCode()
    │
    ▼
sucrase 编译（jsxRuntime: 'automatic'）
    │  编译结果：添加 import { jsx } from "react/jsx-runtime"
    │  但无 export default 语句
    ▼
iframe 加载编译后代码
    │
    ▼
import(moduleUrl) → module.default === undefined
    │
    ▼
renderComponent() → currentComponent 为空，直接 return
    │
    ▼
iframe 中保留之前页面的渲染结果（React 未清空 DOM）
```

### 2.2 证据链

| 证据编号 | 证据内容 | 来源 | 级别 |
|:---------|:---------|:-----|:-----|
| E1 | Figma 导入页面的 `index.tsx` 为纯 JSX，无 `export default` | [demo_1778749341627_ecsne8/index.tsx](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/data/projects/proj_1776526720347/workspace/demos/demo_1778749341627_ecsne8/index.tsx) | A |
| E2 | iframe 渲染逻辑：`currentComponent = module.default`，若为空则 `return` 不渲染 | [iframe-template.ts:98-103](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/author-site/src/lib/iframe-template.ts#L98-L103) | A |
| E3 | `renderComponent()` 不渲染时不清空 DOM，之前渲染结果保留 | [iframe-template.ts:98-118](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/author-site/src/lib/iframe-template.ts#L98-L118) | A |
| E4 | `compileCode()` 使用 sucrase 编译，不会自动添加 `export default` | [compiler.ts:160-202](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/author-site/src/lib/compiler.ts#L160-L202) | A |
| E5 | `DEFAULT_DEMO_CODE` 包含 `export default function Demo()` | [fs-utils.ts:214-229](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/author-site/src/lib/fs-utils.ts#L214-L229) | A |
| E6 | Figma 插件当前导出产物为纯 TSX 代码，无 Markdown 包装，无独立 JSON Schema | [Figma插件导出格式改造方案.md:1.2](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/docs/plans/进行中/Figma插件导出格式改造方案.md) | B |

### 2.3 根本原因

**直接原因**：Figma 导入页面的 `index.tsx` 为纯 JSX 片段（无 `export default`），导致 iframe 渲染时 `module.default` 为 `undefined`，`renderComponent()` 直接返回不渲染，而 iframe 中之前页面的渲染结果未被清空，用户看到的是之前页面的内容。

**根本原因**：Figma 插件当前导出的代码格式与系统渲染管线期望的格式不匹配：

| 维度 | 系统期望 | Figma 插件实际导出 |
|:-----|:---------|:-------------------|
| 代码结构 | 完整 React 组件（含 `export default`） | 纯 JSX 片段（无组件包装） |
| 导入声明 | `import React from 'react'` | 无 import 语句 |
| 默认导出 | `export default function Component()` | 无 export 语句 |

**深层原因**：[Figma插件导出格式改造方案](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/docs/plans/进行中/Figma插件导出格式改造方案.md)尚未实施。该方案计划让 Figma 插件导出包含完整 React 组件和独立 JSON Schema 的 Markdown Code Block 格式，但目前 Figma 插件仍导出纯 TSX 代码。

### 2.4 代码执行路径

```
用户粘贴 Figma 内容
  │
  ▼
ImportFromFigmaDialog.handleImport()
  │  [ImportFromFigmaDialog.tsx:44-81]
  │
  ├── parseFigmaMarkdown(content)  ← 成功解析，提取 code（纯 JSX）和 schema
  │
  ├── createDemoPage()             ← 创建页面，写入 DEFAULT_DEMO_CODE（有 export default）
  │
  └── updateDemoPageFiles()        ← 覆盖写入纯 JSX（无 export default）
                                     [fs-utils.ts:1066-1098]

用户切换到新页面
  │
  ▼
编辑页面加载页面代码
  │  [edit/page.tsx:855+]
  │
  ▼
PreviewPanel 发送 code 到 /api/compile
  │  [PreviewPanel.tsx]
  │
  ▼
compileCode() 使用 sucrase 编译
  │  编译结果：有 import { jsx } 语句，但无 export default
  │  [compiler.ts:160-202]
  │
  ▼
iframe 接收 UPDATE_CODE 消息
  │  import(moduleUrl) → module.default === undefined
  │  currentComponent = undefined
  │  renderComponent() → return（不渲染，不清空 DOM）
  │  [iframe-template.ts:98-103, 151-156]
  │
  ▼
用户看到之前页面的渲染结果（因为 DOM 未被清空）
```

---

## 三、解决方案

### 方案 A：编译层自动包装（推荐）

在 `compileCode()` 函数中，检测编译后的代码是否包含 `export default`。若不包含，自动将代码包装为一个 React 组件：

```typescript
// compiler.ts - compileCode() 末尾添加
if (!compiledCode.includes('export default') && !compiledCode.includes('export {')) {
  const wrappedCode = `
import React from 'react';
${compiledCode}
export default function FigmaImportedComponent() {
  return ${code.trim()};
}
`;
  // 用 wrappedCode 替换 compiledCode
}
```

**优点**：
- 改动最小，仅需修改 `compiler.ts` 一个文件
- 对所有缺少 `export default` 的代码生效，不限于 Figma 导入
- 不影响已有正常组件的编译

**缺点**：
- 包装后的组件无法接收 Props（但 Figma 导入的纯 JSX 本身就不需要 Props）
- 属于"补丁"方案，未解决 Figma 插件导出格式的根本问题

**影响范围**：`packages/author-site/src/lib/compiler.ts`

### 方案 B：iframe 渲染层容错

在 `iframe-template.ts` 的 `renderComponent()` 函数中，当 `currentComponent` 为空时，清空 DOM 并显示提示信息：

```typescript
function renderComponent() {
  const container = document.getElementById('root');
  if (!currentComponent) {
    if (currentRoot && container) {
      currentRoot.render(null);  // 清空之前的渲染结果
    }
    return;
  }
  // ... 正常渲染逻辑
}
```

**优点**：
- 修复了"不清空 DOM"的问题，用户不会再看到"内容相同"的假象
- 改动极小

**缺点**：
- 仅解决"显示错误内容"的问题，Figma 导入的页面仍然无法正常渲染
- 用户会看到空白页面，体验也不理想

**影响范围**：`packages/author-site/src/lib/iframe-template.ts`

### 方案 C：实施 Figma 插件导出格式改造（根本解决）

按照 [Figma插件导出格式改造方案](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/docs/plans/进行中/Figma插件导出格式改造方案.md) 的规划，让 Figma 插件导出包含完整 React 组件（含 `export default`）和独立 JSON Schema 的 Markdown Code Block 格式。

**优点**：
- 从根本上解决格式不匹配问题
- Figma 导入的页面可以正常接收 Props 和配置
- 与系统解析器完全对齐

**缺点**：
- 改动范围大，涉及 Figma 插件侧和系统侧
- 实施周期较长

**影响范围**：Figma 插件 + `packages/author-site/lib/markdown-parser.ts` + 相关组件

### 推荐方案

**短期（立即修复）**：方案 A + 方案 B 组合
- 方案 A 确保纯 JSX 代码可以正常渲染
- 方案 B 确保即使渲染失败也不会显示错误内容

**长期（根本解决）**：方案 C
- 实施 Figma 插件导出格式改造方案

---

## 四、相关代码路径

### 涉及文件

| 文件 | 职责 | 与本问题的关系 |
|:-----|:-----|:--------------|
| [compiler.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/author-site/src/lib/compiler.ts) | 代码编译（sucrase + CDN 重写） | 编译纯 JSX 时不会添加 `export default`，是问题链的关键环节 |
| [iframe-template.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/author-site/src/lib/iframe-template.ts) | iframe 渲染模板 | `module.default` 为空时不渲染且不清空 DOM，是用户看到"相同内容"的直接原因 |
| [ImportFromFigmaDialog.tsx](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/author-site/src/components/demo/ImportFromFigmaDialog.tsx) | Figma 导入对话框 | 导入流程正确，但未校验 code 是否包含 `export default` |
| [markdown-parser.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/author-site/lib/markdown-parser.ts) | Markdown 格式解析器 | 正确提取 code 和 schema，但不校验 code 格式 |
| [fs-utils.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/author-site/src/lib/fs-utils.ts) | 文件系统操作 | `DEFAULT_DEMO_CODE` 包含 `export default`，但被 Figma 导入的纯 JSX 覆盖 |
| [PreviewPanel.tsx](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/author-site/components/demo/PreviewPanel.tsx) | 预览面板 | 发送 code 到编译 API，但未处理 `module.default` 为空的情况 |

### 调用链

```
ImportFromFigmaDialog.handleImport()
  → parseFigmaMarkdown()          [markdown-parser.ts]
  → createDemoPage()              [demos/route.ts → fs-utils.ts]
  → updateDemoPageFiles()         [demos/[demoId]/files/route.ts → fs-utils.ts]

页面切换时：
  → fetch(/api/sessions/{sid}/files/{demoId})  [sessions/[sid]/files/[demoId]/route.ts]
  → getWorkspaceDemoPageFiles()                 [fs-utils.ts]
  → setCode() / setSchema()                     [edit/page.tsx]

预览渲染时：
  → PreviewPanel → /api/compile                 [compile/route.ts]
  → compileCode()                               [compiler.ts]
  → iframe UPDATE_CODE → import(moduleUrl)      [iframe-template.ts]
  → module.default === undefined → 不渲染        [iframe-template.ts:98-103]
```
