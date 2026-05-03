# AI对话区 Markdown 渲染优化

> 项目代号：AI对话区 Markdown 渲染优化
> 维护者：前端团队
> 状态：进行中（阶段一、二已完成，进入阶段三）

***

## 一、背景与目标

### 1.1 项目背景

AI 对话区的 Markdown 渲染原先生成纯文本，无法区分代码关键字、字符串、注释，也没有复制按钮、图表渲染等交互能力。用户阅读体验较差。

### 1.2 优化目标

| 维度      | 现状          | 目标               |
| ------- | ----------- | ---------------- |
| 代码块     | 纯文本         | 语法高亮 + 复制/下载按钮   |
| Mermaid | 显示源码        | 渲染为流程图/时序图       |
| 数学公式    | 显示 LaTeX 源码 | 渲染为数学符号          |
| 流式输出    | 无反馈         | 闪烁光标提示           |
| 表格      | 样式类似代码块     | 常规 Markdown 表格样式 |

***

## 二、技术方案

### 2.1 技术选型

- **渲染库**：streamdown v2.5.0
- **插件**：
  - `@streamdown/code` — 代码高亮（Shiki 引擎）
  - `@streamdown/mermaid` — 图表渲染
  - `@streamdown/math` — LaTeX 数学公式
  - `@streamdown/cjk` — 中日韩文本优化
- **样式**：Tailwind CSS v4
- **UI 组件**：shadcn/ui + AI Elements

### 2.2 核心文件

| 文件                                                                                                                                                                                       | 作用                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| [packages/web/package.json](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/web/package.json)                                                                         | 依赖管理                 |
| [packages/web/src/app/globals.css](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/web/src/app/globals.css)                                                           | 全局样式 + 样式覆盖         |
| [packages/web/src/components/ai-elements/assistant-message.tsx](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/web/src/components/ai-elements/assistant-message.tsx) | AI 消息渲染主组件           |
| [packages/web/src/components/ai-elements/reasoning.tsx](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/web/src/components/ai-elements/reasoning.tsx)                 | 推理内容渲染组件             |

### 2.3 组件调用链路

```
AIChat (ai-chat.tsx)
└── AssistantMessage (assistant-message.tsx)
    ├── 文本块 → Streamdown (plugins + controls + caret)
    ├── 推理块 → Reasoning → ReasoningContent → Streamdown (plugins + controls)
    └── 工具块 → 自定义渲染
```

***

## 三、已完成的工作

### 3.1 依赖安装

已在 [package.json](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/web/package.json) 中添加：

```json
"@streamdown/code": "^1.1.1",
"@streamdown/mermaid": "^1.0.2",
"@streamdown/math": "^1.0.2",
"@streamdown/cjk": "^1.0.3"
```

### 3.2 Tailwind 扫描配置

已在 [globals.css#L5-L9](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/web/src/app/globals.css#L5-L9) 添加：

```css
@source "../node_modules/@streamdown/code/dist/*.js";
@source "../node_modules/@streamdown/mermaid/dist/*.js";
@source "../node_modules/@streamdown/math/dist/*.js";
@source "../node_modules/@streamdown/cjk/dist/*.js";
```

### 3.3 Streamdown 组件配置

**assistant-message.tsx** 中的文本块渲染（第 228-235 行）：

```tsx
<Streamdown
  plugins={{ code, mermaid, math, cjk }}
  isAnimating={isStreaming && index === renderBlocks.length - 1}
  caret="block"
  controls={{ table: false, code: true, mermaid: true }}
>
  {block.content}
</Streamdown>
```

**reasoning.tsx** 中的推理内容渲染（第 176 行）：

```tsx
<Streamdown plugins={{ code, cjk }} controls={{ table: false, code: true }}>
  {children}
</Streamdown>
```

### 3.4 表格样式修复

已在 [globals.css#L176-L205](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/web/src/app/globals.css#L176-L205) 添加样式覆盖，去掉表格的卡片式包装器，显示为常规 Markdown 表格。

### 3.5 阶段一：排版与间距优化 ✅

已于 [globals.css#L207-L240](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/web/src/app/globals.css#L207-L240) 实施：

| 任务         | 实现方式                                                | 状态 |
| ---------- | --------------------------------------------------- | -- |
| 代码块头部换行    | `[data-streamdown="code"] > div:first-child` 添加 `flex-wrap: nowrap` | ✅  |
| 行内代码样式     | `[data-streamdown="code-inline"]` 添加背景色、圆角、边框       | ✅  |
| 列表嵌套缩进     | `ul ul, ol ol, ul ol, ol ul` 添加 `padding-left: 1.5rem` | ✅  |
| 引用块美化      | `[data-streamdown="blockquote"]` 添加左侧竖线 + 轻微背景       | ✅  |

### 3.6 阶段二：细节打磨 ✅

已于 [globals.css#L242-L277](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/web/src/app/globals.css#L242-L277) 实施：

| 任务       | 实现方式                                                   | 状态 |
| -------- | ------------------------------------------------------ | -- |
| 链接样式增强   | `.prose a` 添加下划线 + hover 透明效果                      | ✅  |
| 分隔线加粗    | `[data-streamdown="hr"]` 提高 `border-top` 对比度       | ✅  |
| 表格内边距增大  | `[data-streamdown="table"] th, td` 添加 `padding: 0.5rem 0.75rem` | ✅  |
| 工具栏按钮交互  | `[data-streamdown="code"] button` 添加 hover 背景色过渡    | ✅  |

***

## 四、当前问题

阶段一、二实施后经实测，仍有以下 4 个问题待解决：

| 序号 | 问题               | 优先级 | 表现                          |
| -- | ---------------- | --- | --------------------------- |
| 1  | 内容超出对话框宽度         | P1  | 部分内容（代码长行、表格等）超出对话框边界，破坏布局 |
| 2  | 有序/无序列表无项目符号      | P1  | `<ul>` `<ol>` 列表没有圆点/数字前缀    |
| 3  | 代码块头部语言标签与按钮仍换行    | P1  | 阶段一已实施样式覆盖，但未生效（选择器可能不匹配）   |
| 4  | 链接样式与正文样式相同        | P2  | 阶段二已实施 `.prose a` 样式，但未生效     |

### 4.1 根因分析

| 问题         | 根因推测                                                    |
| ---------- | ------------------------------------------------------- |
| 内容超出对话框    | streamdown 生成的 `<pre>` / `<code>` 或 `<table>` 未设置 `overflow-x: auto` 或 `max-width` |
| 列表无项目符号    | Tailwind CSS 的 `@tailwind base` 重置了 `list-style`，或 streamdown 内部覆盖了列表样式 |
| 代码块头部换行    | 阶段一使用的选择器 `[data-streamdown="code"] > div:first-child` 可能不匹配 streamdown 实际生成的 DOM 结构。streamdown v2.5.0 内部使用 `CodeBlockContainer` + `CodeBlockHeader` + `CodeBlockCopyButton` 等独立组件，需要找到正确的 CSS 选择器 |
| 链接样式无差异    | `.prose a` 可能被 Tailwind Typography 插件或 streamdown 自身的样式覆盖，需要更高的选择器权重或改用 `!important` 配合正确的选择器 |

***

## 五、下一步计划：阶段三——样式修正

### 5.1 修复策略

所有修复集中在 [globals.css](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/web/src/app/globals.css)。

#### 问题 1：内容超出对话框宽度

| 修改位置        | 具体修改                                                                     |
| ----------- | ------------------------------------------------------------------------ |
| 代码块 `<pre>` | 为 streamdown 代码块容器添加 `overflow-x: auto` 或 `max-width: 100%`，使超长代码行可横向滚动而非溢出 |
| 表格          | 为 `[data-streamdown="table"]` 或其父容器添加 `overflow-x: auto`，确保宽表格可滚动         |
| 图片/其他       | 为 `.prose img` 添加 `max-width: 100%`，防止图片溢出                                |

#### 问题 2：列表无项目符号

| 修改位置 | 具体修改                                                              |
| ---- | ----------------------------------------------------------------- |
| 列表   | 为 `.prose ul` / `.prose ol` 或其内部元素显式设置 `list-style: disc` / `list-style: decimal`，并确保 `padding-left` 足够显示项目符号 |

#### 问题 3：代码块头部换行

| 步骤   | 操作                                                                                     |
| ---- | -------------------------------------------------------------------------------------- |
| 先调研  | 在浏览器开发者工具中检查 streamdown 代码块的实际 DOM 结构，确认 `CodeBlockContainer` 头部容器的 class/data 属性 |
| 再修复  | 根据实际 DOM 结构覆盖正确的 CSS 选择器，确保 `flex-wrap: nowrap` 和 `justify-content: space-between`      |

#### 问题 4：链接样式

| 步骤   | 操作                                                                |
| ---- | ----------------------------------------------------------------- |
| 先调研  | 在浏览器中检查 streamdown 渲染的 `<a>` 标签实际应用的 CSS 规则（计算样式），确认是什么覆盖了阶段二的样式 |
| 再修复  | 根据实际 DOM 结构，使用更精准的选择器（如 `.prose [data-streamdown] a`）添加 `!important` 样式  |

### 5.2 实施步骤

```
1. 启动 dev 环境，打开 AI 对话页面，产生一条含代码块、列表、链接、表格的 AI 回复
2. 打开浏览器 DevTools → Elements 面板，检查实际 DOM 结构
3. 记录正确的 CSS 选择器（class 名、data 属性）
4. 在 globals.css 添加修正样式
5. 刷新页面验证效果
6. 运行 pnpm lint && pnpm typecheck 确认无错误
```

***

## 六、进度总结

### 已完成

| 任务                                           | 阶段     | 状态 |
| -------------------------------------------- | ------ | -- |
| 安装 streamdown 插件（code、mermaid、math、cjk）      | 基础设施   | ✅  |
| 配置 Tailwind 扫描路径                             | 基础设施   | ✅  |
| 配置 Streamdown 组件（plugins + controls + caret） | 基础设施   | ✅  |
| 修复表格样式（去掉卡片包装器）                              | 基础设施   | ✅  |
| 配置流式光标指示                                     | 基础设施   | ✅  |
| 排版与间距优化（代码块头部、行内代码、列表缩进、引用块）                 | 阶段一    | ✅  |
| 细节打磨（链接、分隔线、表格内边距、按钮交互）                      | 阶段二    | ✅  |

### 进行中

| 任务                           | 阶段   | 状态     |
| ---------------------------- | ---- | ------ |
| 修复内容溢出对话框                    | 阶段三  | ⚠️ 待实施 |
| 修复列表无项目符号                    | 阶段三  | ⚠️ 待实施 |
| 修正代码块头部选择器（阶段一 CSS 未生效需调整）   | 阶段三  | ⚠️ 待实施 |
| 修正链接样式选择器（阶段二 CSS 未生效需调整）     | 阶段三  | ⚠️ 待实施 |
