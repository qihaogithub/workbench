# Streamdown 集成经验

> 从 AI 对话区 Markdown 渲染优化项目中提取的 streamdown 库踩坑经验

---

## 一、Tailwind v3/v4 指令混用导致 streamdown class 失效

### 问题现象

streamdown 渲染的 `<ul>` 没有项目符号，`<ol>` 没有数字编号，代码块布局错乱。即使 streamdown 内部组件已设置 `list-disc`、`list-decimal`、`flex` 等 class，最终 CSS 中也找不到这些规则。

### 根因分析

❌ 错误写法（globals.css，Tailwind v4 语法用在 v3 项目）：

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@source "../node_modules/streamdown/dist/*.js";
@source "../node_modules/@streamdown/code/dist/*.js";
```

`@source` 是 **Tailwind v4** 的指令，在 **v3.4** 项目中被静默忽略。结果 streamdown 包内部 JS 中字符串形式的 className 不会被 Tailwind JIT 扫描，对应的工具类不会出现在最终 CSS 里。

✅ 正确写法（tailwind.config.ts，v3 标准做法）：

```ts
const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './node_modules/streamdown/dist/**/*.js',
    './node_modules/@streamdown/code/dist/**/*.js',
    './node_modules/@streamdown/mermaid/dist/**/*.js',
    './node_modules/@streamdown/math/dist/**/*.js',
    './node_modules/@streamdown/cjk/dist/**/*.js',
  ],
}
```

同时移除 globals.css 中所有 `@source` 指令。

### 核心原则

集成第三方运行时生成 className 的库（如 streamdown、shadcn/ui 类似的 dist 产物）时，**必须把库的 dist 路径加到 Tailwind 的 content 数组**（v3）或 `@source`（v4），二选一不能混用。先确认项目 Tailwind 版本再下笔。

---

## 二、streamdown 的 data-streamdown 属性值不能凭直觉猜

### 问题现象

为 streamdown 的元素写 CSS 覆盖样式时，规则毫无效果。检查 DOM 才发现选择器与实际属性值不匹配。

### 根因分析

❌ 错误写法（凭直觉/类比常见 HTML 标签命名）：

```css
[data-streamdown="code"] > div:first-child { /* ... */ }
[data-streamdown="code-inline"] { /* ... */ }
[data-streamdown="hr"] { /* ... */ }
.prose a { /* 试图覆盖链接样式 */ }
```

✅ 正确写法（查证 streamdown v2.5.0 源码后的实际属性值）：

```css
[data-streamdown="code-block-header"] { /* 代码块头部 */ }
[data-streamdown="code-block-body"] { /* 代码块内容 */ }
[data-streamdown="code-block-actions"] { /* 操作按钮容器 */ }
[data-streamdown="inline-code"] { /* 行内代码 */ }
[data-streamdown="horizontal-rule"] { /* 分隔线 */ }
[data-streamdown="link"] { /* 链接，注意是 button 元素而非 a */ }
[data-streamdown="unordered-list"] { /* 无序列表 */ }
[data-streamdown="ordered-list"] { /* 有序列表 */ }
[data-streamdown="list-item"] { /* 列表项 */ }
```

streamdown 的 link 元素在启用 link safety 时是 **`<button type="button">`** 而非 `<a>`，所以 `.prose a` 选择器不会匹配到它。

### 核心原则

写 streamdown 样式覆盖前，先到 `node_modules/streamdown/dist/chunk-*.js` 中检索 `"data-streamdown":"..."` 字符串，列出实际使用的属性值清单再写选择器。不要根据 HTML 元素名猜（`code` ≠ `code-block`，`hr` ≠ `horizontal-rule`）。

---

## 三、深色主题下 text-primary 与 text-foreground 视觉同色

### 问题现象

streamdown 的链接已应用 `text-primary underline` class，但在对话区中链接看上去与正文颜色完全一致，下划线也不明显。

### 根因分析

streamdown 默认链接 className：

```js
"wrap-anywhere font-medium text-primary underline"
```

宿主主题（globals.css `:root` 块）的变量定义：

```css
--primary: 0 0% 90%;       /* 浅灰白 */
--foreground: 0 0% 98%;    /* 白 */
```

两个 HSL 值仅相差 8% 亮度，肉眼几乎不可分辨。`text-primary` 在浅色主题下能区分（语义为强调色），但在此深色主题下与正文同色。

✅ 修复方案：为链接显式指定与正文不同的颜色（如蓝色），而不是依赖语义 token。

```css
[data-streamdown="link"] {
  color: hsl(217 91% 65%) !important;
  text-decoration: underline !important;
  text-underline-offset: 2px !important;
  font-weight: 500 !important;
}

[data-streamdown="link"]:hover {
  color: hsl(217 91% 75%) !important;
}
```

### 核心原则

设计系统的语义颜色 token（primary、accent 等）在某些主题下可能与正文颜色冲突。**链接、引用等需要"和正文区分"的元素，应使用与正文 hue 不同的颜色**（蓝/绿/橙），而不是依赖 primary 这种主题相关的语义色。

---

## 四、flex/grid 子元素需要双重保险防止内容溢出

### 问题现象

代码块、表格在窄宽对话气泡中超出父容器边界，破坏整体布局。即使 streamdown 的 code-block-body 已设置 `overflow-x-auto`，外层依然溢出。

### 根因分析

CSS 布局陷阱：flex/grid 子元素的 `min-width` 默认值为 `auto`（约等于内容固有宽度），不是 `0`。当内容很宽（长代码行、宽表格）时，子元素会撑破父容器，`overflow` 属性此时无法发挥作用。

❌ 仅依赖单层 overflow：

```css
[data-streamdown="code-block-body"] {
  overflow-x: auto;  /* streamdown 自带，但被父级撑大无效 */
}
```

✅ 双重保险（外层限宽 + 内层滚动）：

```css
[data-streamdown="code-block"] {
  max-width: 100% !important;
  min-width: 0 !important;        /* 关键：覆盖 flex 子元素的 min-width: auto */
}

[data-streamdown="code-block-body"] {
  max-width: 100% !important;
  min-width: 0 !important;
  overflow-x: auto !important;
}

[data-streamdown="table-wrapper"] {
  max-width: 100% !important;
  overflow-x: auto !important;
}

[data-streamdown="image"],
[data-streamdown="image-wrapper"] {
  max-width: 100% !important;
  height: auto !important;
}
```

父容器（如 AssistantMessage 的 `<div>`）也要带 `min-w-0`：

```tsx
<div className="prose prose-sm dark:prose-invert max-w-none min-w-0">
  <Streamdown>{content}</Streamdown>
</div>
```

### 核心原则

在 flex/grid 上下文中渲染可能很宽的内容（代码块、表格、图片）时，**父子链路上每一层都需要 `min-width: 0`**，外层用 `max-width: 100%` 限宽，内层用 `overflow-x: auto` 启用滚动。任何一层缺失，溢出就会发生。

---

## 五、Radix ScrollArea Viewport 内部 `display: table` 撑破容器

### 问题现象

streamdown 的代码块、长行内容会把整个对话气泡横向撑开，连带把对话区被外层 flex 父容器裁切。即使代码块自身设置了 `max-width: 100%; overflow-x: auto`，依然不生效。

### 根因分析

`@radix-ui/react-scroll-area` 的 `Viewport` 内部源码（dist/index.js）：

```js
jsx("div", {
  ref: context.onContentChange,
  style: { minWidth: "100%", display: "table" },
  children
})
```

Radix 用 `display: table` 是为了让内容自然撑开宽度从而触发横向滚动。但 `display: table` 会**按子元素内在宽度（intrinsic width）shrink-to-fit**，长代码行会让这个 table 撑到内容实际宽度，再传染给外层 flex 容器（min-width: auto 的默认值）—— 所有 streamdown 自己加的 `max-width: 100%` 都救不回来。

❌ 错误尝试（在 streamdown 子节点上加各种 `min-width: 0`）：

```css
[data-streamdown="code-block"] { min-width: 0 !important; max-width: 100% !important; }
[data-streamdown="code-block-body"] { min-width: 0 !important; overflow-x: auto !important; }
/* 都不生效，因为 Radix 的 display:table 在更外层 */
```

✅ 正确写法（在 ScrollArea 组件上覆盖 Radix 内部 div 的 display）：

```tsx
// components/ui/scroll-area.tsx
<ScrollAreaPrimitive.Viewport
  className="h-full w-full rounded-[inherit] [&>div]:!block"
>
  {children}
</ScrollAreaPrimitive.Viewport>
```

`[&>div]:!block` 是 Tailwind 的 arbitrary variant,表示「Viewport 的直接子 div(就是 Radix 内部那个 table 包裹)使用 `display: block`」。改成 block 后,子元素正常按容器宽度排版,内层 `overflow-x: auto` 才能工作。

### 核心原则

集成 `@radix-ui/react-scroll-area` 后,如果发现内容(代码块、宽表格等)会撑破容器,**第一反应就是去 `node_modules/@radix-ui/react-scroll-area/dist/index.js` 检查 Viewport 内部的 wrapper div**。Radix 默认的 `display: table` 在大多数富文本场景下是反模式,需要在项目级 ScrollArea 组件里用 `[&>div]:!block` 覆盖一次。这是项目级的基础修复,优先于在 streamdown 节点上加 `min-width: 0`。
