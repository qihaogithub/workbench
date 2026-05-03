# AI对话区 Markdown 渲染优化

> 项目代号：AI对话区 Markdown 渲染优化
> 维护者：前端团队
> 状态：进行中

---

## 一、背景与目标

### 1.1 项目背景

AI 对话区的 Markdown 渲染原先生成纯文本，无法区分代码关键字、字符串、注释，也没有复制按钮、图表渲染等交互能力。用户阅读体验较差。

### 1.2 优化目标

| 维度 | 现状 | 目标 |
|------|------|------|
| 代码块 | 纯文本 | 语法高亮 + 复制/下载按钮 |
| Mermaid | 显示源码 | 渲染为流程图/时序图 |
| 数学公式 | 显示 LaTeX 源码 | 渲染为数学符号 |
| 流式输出 | 无反馈 | 闪烁光标提示 |
| 表格 | 样式类似代码块 | 常规 Markdown 表格样式 |

---

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

| 文件 | 作用 |
|------|------|
| [packages/web/package.json](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/web/package.json) | 依赖管理 |
| [packages/web/src/app/globals.css](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/web/src/app/globals.css) | 全局样式 + Tailwind 扫描配置 |
| [packages/web/src/components/ai-elements/assistant-message.tsx](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/web/src/components/ai-elements/assistant-message.tsx) | AI 消息渲染主组件 |
| [packages/web/src/components/ai-elements/reasoning.tsx](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/web/src/components/ai-elements/reasoning.tsx) | 推理内容渲染组件 |

### 2.3 组件调用链路

```
AIChat (ai-chat.tsx)
└── AssistantMessage (assistant-message.tsx)
    ├── 文本块 → Streamdown (plugins + controls + caret)
    ├── 推理块 → Reasoning → ReasoningContent → Streamdown (plugins + controls)
    └── 工具块 → 自定义渲染
```

---

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

---

## 四、待优化的问题

基于实测截图，发现以下 9 个可优化项：

| 序号 | 问题 | 优先级 | 影响 |
|------|------|--------|------|
| 1 | 代码块上下间距过大 | P1 | 两个代码块像独立卡片，阅读不连贯 |
| 2 | 语言标签无独立背景 | P2 | `typescript` 标签和代码区融为一体 |
| 3 | 行内代码无样式 | P2 | "`行内代码`" 与普通文字几乎一样 |
| 4 | 列表嵌套缩进过浅 | P2 | 子项和父项几乎对齐，层级感弱 |
| 5 | 引用块无左侧边框/背景 | P2 | 引用文字和普通段落无区别 |
| 6 | 链接无下划线/悬停效果 | P3 | 用户不知道能点击 |
| 7 | 分隔线几乎不可见 | P3 | `---` 对比度太低 |
| 8 | 表格单元格内边距偏小 | P3 | 文字贴着边框，阅读累 |
| 9 | 工具栏按钮无交互反馈 | P3 | 鼠标悬停无变化 |

### 4.1 问题与修复思路

| 问题 | 修复思路 | 涉及文件 |
|------|---------|---------|
| 代码块间距 | 覆盖 `[data-streamdown="code-block"]` 的 `margin` | globals.css |
| 语言标签样式 | 自定义 `[data-streamdown="code-language"]` 背景色、圆角 | globals.css |
| 行内代码样式 | 添加 `[data-streamdown="code-inline"]` 背景/圆角 | globals.css |
| 列表嵌套缩进 | 覆盖 `ul ul` / `ol ol` 的 `padding-left` | globals.css |
| 引用块样式 | 添加 `[data-streamdown="blockquote"]` 左侧竖线 + 背景 | globals.css |
| 链接样式 | 覆盖 `a` 标签的 `text-decoration` 和 `color` | globals.css |
| 分隔线样式 | 提高 `[data-streamdown="hr"]` 的 `border-color` 对比度 | globals.css |
| 表格内边距 | 增加 `th, td` 的 `padding` | globals.css |
| 工具栏交互 | 添加复制/下载按钮的 `hover` 状态样式 | globals.css |

---

## 五、开发计划

### 阶段一：排版与间距（P1-P2）

| 任务 | 具体修改 |
|------|---------|
| 缩小代码块间距 | `[data-streamdown="code-block"] { margin: 0.5rem 0; }` |
| 美化语言标签 | `[data-streamdown="code-language"]` 添加独立背景、圆角、字号 |
| 添加行内代码样式 | `[data-streamdown="code-inline"]` 添加背景色、圆角、边框 |
| 加深列表嵌套缩进 | `ul ul, ol ol { padding-left: 1.5rem; }` |
| 美化引用块 | `[data-streamdown="blockquote"]` 添加左侧竖线 + 轻微背景 |

### 阶段二：细节打磨（P2-P3）

| 任务 | 具体修改 |
|------|---------|
| 链接样式增强 | `a` 添加下划线 + hover 颜色变化 |
| 分隔线加粗 | `[data-streamdown="hr"]` 提高 `border-top` 对比度 |
| 表格内边距增大 | `th, td { padding: 0.5rem 0.75rem; }` |
| 工具栏按钮交互 | 复制/下载按钮添加 `hover:bg-muted` 反馈 |

### 阶段三：高级功能（可选）

| 任务 | 状态 |
|------|------|
| 配置链接安全（`linkSafety`） | ⚠️ 待实施 |
| 自定义代码高亮主题 | ⚠️ 待实施 |
| 代码块折叠/展开 | ⚠️ 待实施 |
| 图片懒加载与点击放大 | ⚠️ 待实施 |

---

## 六、进度总结

### 已完成

| 任务 | 完成时间 |
|------|---------|
| 安装 streamdown 插件（code、mermaid、math、cjk） | - |
| 配置 Tailwind 扫描路径 | - |
| 配置 Streamdown 组件（plugins + controls + caret） | - |
| 修复表格样式（去掉卡片包装器） | - |
| 配置流式光标指示 | - |

### 进行中

| 任务 | 状态 |
|------|------|
| 排版与间距优化（阶段一） | ⚠️ 待实施 |
| 细节打磨（阶段二） | ⚠️ 待实施 |
