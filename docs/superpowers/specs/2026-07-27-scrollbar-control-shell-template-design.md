# 滚动条控制权归还：从运行时注入转移到 iframe Shell 模板

## 背景

预览系统的滚动条控制经历了一个演进过程：

1. 最初通过 `hideIframeScrollbar()` 在 iframe 加载后运行时注入 `!important` CSS，强制隐藏所有 iframe 内部滚动条
2. 后补充了 iframe 元素级 scrollbar 隐藏，解决 scale 变换导致的视觉滚动条
3. 浏览端布局补充了 `overflow:hidden`，防止 body 级滚动

但运行时 `!important` 注入剥夺了 Agent 页面代码对滚动条的控制权——Agent 无法启用滚动，也无法美化滚动条样式。

## 目标

1. 默认无滚动条（大部分页面不需要）
2. Agent 可通过页面代码自由控制是否启用滚动
3. 启用时滚动条自动美观（iOS 风格：细、圆角、半透明）
4. 创作端和浏览端预览效果一致

## 方案

**核心原则**：滚动条控制权从运行时注入移到 iframe Shell 模板。Shell 预设默认值和美化样式，Agent 页面代码按需覆盖。

### 1. iframe Shell 模板（`iframe-template.ts`）

在 Shell 的 `<style>` 中新增：

```css
/* 默认：body 不滚动，Agent 覆盖 overflow 即可启用 */
html, body {
  overflow: hidden;
}

/* 美化滚动条 — iOS 风格 */
::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 2px;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.35);
}

/* Firefox 细滚动条 */
* {
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
}
```

Shell 模板同时被 `data:text/html` 内联模式和 `/api/preview-runtime/shell` 路由使用，改一处生效全局。

### 2. 删除运行时注入

#### `PreviewPanel.tsx`

- 删除 `hideIframeScrollbar()` 函数（第 136-152 行）
- 删除 `handleLoad` 中对它的调用

#### `IframePreviewFrame.tsx`

- 删除 `handleLoad` 中注入 `<style>` 到 iframe document 的代码块（第 148-162 行）
- 保留 `onLoad?.()` 和 `syncIframeConfig()` 调用

### 3. 保持不变

| 层 | 处理 | 原因 |
|---|---|---|
| iframe 元素 scrollbar | `scrollbarWidth: none` + webkit CSS | scale 变换技术产物，与页面代码无关 |
| wrapper `overflow:hidden` | `computePreviewScale` | 必需，裁剪 pre-transform 尺寸的 iframe |
| `.preview-single-scroll` | 外层滚动容器 | 预览区整体滚动，隐藏滚动条 |
| 布局容器 | body/root `overflow:hidden` | 防止页面级意外滚动 |

---

## 改动范围

| 文件 | 改动 |
|------|------|
| `packages/demo-ui/src/iframe-template.ts` | Shell `<style>` 新增 `html,body { overflow: hidden }` + 美化滚动条 |
| `packages/demo-ui/src/PreviewPanel.tsx` | 删除 `hideIframeScrollbar()` 函数及调用 |
| `packages/demo-ui/src/IframePreviewFrame.tsx` | 删除 `handleLoad` 中的 style 注入 |

---

## 验证

- `pnpm typecheck` — 全仓类型检查
- `pnpm check:viewer` — 浏览端验证
- 手动验证：
  - 创作端编辑页：预览区默认无滚动条，美观的细滚动条
  - 浏览端：同上，与创作端一致
  - Agent 生成的页面通过 `body { overflow-y: auto }` 可启用滚动
