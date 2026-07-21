# HTML 原型页单页预览模式滚动缺失——分析与实施记录

> 状态：**已实施并验证**（2026-07-17）。规范行为已同步至 `docs/项目文档/创作端/04-配置与预览/技术/02_实时预览机制.md`（L102）。本文保留根因分析与验证证据，供同类问题复用。

## 背景

创作端页面分两类：**HTML 原型页**（`prototype-html-css`）和 **React 高保真页**（`high-fidelity-react`）。单页预览下 React 高保真页可上下滚动查看超出视口的内容（iframe 原生滚动），但 HTML 原型页无法滚动——内容高度超过 `previewSize` 设计画板高度时，超出部分被裁剪、不可见。

真实受影响入口（渲染单页 `PrototypePagePreview` 的地方）只有两处：

- **author-site 编辑页单页预览**：`packages/author-site/src/app/demo/[id]/edit/page.tsx`（L7237，`runtimeType === "prototype-html-css"` 分支）
- **viewer-site 单页预览**：`packages/viewer-site/src/components/ViewerApp.tsx`（L1082 分支）

> 校正：`packages/author-site/src/app/viewer/[projectId]/page.tsx` **不是**受影响入口。该路由单页模式只渲染 `PreviewPanel`（React iframe），对所有页面走 `code` 属性，不渲染 `PrototypePagePreview`，因此与本问题无关。embed 路由同样未引用 `PrototypePagePreview`。

## 目标

单页预览下 HTML 原型页可滚动查看超出 `previewSize` 设计高度的内容，行为向 React 高保真页看齐；画布工作台与截图服务不受影响（保持裁剪到设计高度）。

## 根因：Shadow DOM 设计画板根节点固定高度 + overflow:hidden

### 渲染层级

```
外层滚动容器 preview-single-scroll (overflow-y:auto，但子内容 h-full 不产生溢出，故不滚动)
  └─ containerRef (flex, h-full, 居中)
      └─ wrapper (overflow:hidden，裁剪 transform:scale 视觉区域)
          └─ contentStyle div (transform:scale，固定 designWidth×designHeight)
              └─ Shadow host div (Tailwind overflow-auto，但内部无溢出)
                  └─ :host (height:designHeight)
                      └─ .prototype-root (height:designHeight, overflow:hidden) ← 根因
                          └─ 用户 HTML 内容（超出 designHeight 部分被裁剪）
```

### 真正根因是单一元素

关键结论：**唯一决定"裁剪还是滚动"的是 `.prototype-root`（固定 `height: designHeight` + `overflow: hidden`）**，其余各层不是独立阻断点：

- **Shadow host** 本就带 Tailwind `overflow-auto`（`PrototypePagePreview.tsx` L450），且外层文档样式在同优先级下压过 `:host` 规则，所以宿主一直可滚动——它从不滚动，只是因为唯一的子节点 `.prototype-root` 已把内容裁剪到 `designHeight`，宿主没有可滚内容。
- **wrapper (overflow:hidden)** 裁剪的是 `transform: scale()` 的视觉区域。只要 `.prototype-root` 改为内部滚动，宿主布局高度仍为 `designHeight`、缩放后视觉高度 `designHeight × scale` 仍在 wrapper 边界内，wrapper 不构成阻断。
- **外层容器** 有 `overflow-y-auto`，但子内容 `h-full` 填满、不产生溢出，故不触发外层滚动。

因此修复只需改一个地方：把 `.prototype-root`（连带同变量驱动的 `:host`）的 `overflow` 从 `hidden` 改为 `auto`。文件：`packages/shared/src/demo/prototype-preview.ts`，`buildPrototypePreviewHtmlFragment` 的 `rootOverflow`（原 L285）。

> 修正历史稿"三层 overflow:hidden 叠加、任一层都足以阻止滚动"的表述：wrapper 与外层容器并非独立阻断点，这也正是"仅改 Shadow DOM 一层"即可生效的原因。

### 行为对比

| 场景 | React 高保真页 | HTML 原型页（修复前 → 修复后） |
|------|--------------|------------------------------|
| 渲染方式 | `<iframe>` 独立文档 | Shadow DOM + `transform:scale` |
| 超出设计高度 | iframe 内原生滚动 | 裁剪不可见 → 设计画板内部纵向滚动 |

## 方案：`allowScroll` 参数控制 Shadow DOM 根节点 overflow

### 核心思路

在共享的 `buildPrototypePreviewHtmlFragment` 增加 `allowScroll` 参数，按场景控制设计画板根节点 overflow：单页预览传 `true` → `overflow: auto`（可滚动）；画布/截图不传，默认 `false` → `overflow: hidden`（裁剪）。滚动时隐藏滚动条，与预览容器、React 页的无滚动条观感一致。

**只改 Shadow DOM 根节点，wrapper 与 preview-scale 不动**：宿主布局高度恒为 `designHeight`，用户滚动的是 Shadow DOM 内部内容（在缩放帧内滚动），与 React iframe 内滚动同构。

### 关于视觉编辑模式：不做 `!visualEditMode` 门控（相对历史稿的修正）

历史稿计划用 `allowScroll && !visualEditMode` 关闭视觉编辑时的滚动。实测代码后改为**不门控**，`allowScroll` 作为纯静态 prop，理由：

1. **门控会引入真实的级联 bug**：`visualEditMode` 若参与"重建 Shadow innerHTML"的 effect 依赖，切换视觉编辑会重建 DOM，而临时隐藏图层（`hiddenVisualNodeIds`）与选中/悬停高亮由**其他 effect 按各自依赖**管理，重建后不会自动复原，导致隐藏图层被误显示、选中高亮丢失。
2. **滚动对原型视觉编辑无害**：选中/悬停高亮基于 Shadow DOM 内 `data-prototype-selected/hovered` 的 CSS outline，跟随元素、与滚动无关；事件用 `event.composedPath()[0]` 取真实目标，滚动不影响。
3. **`rect` 无滚动敏感定位消费**：`VisualNodeInfo.rect` 的坐标定位消费全部在 `iframe-template.ts`（React iframe 内部坐标系，与原型无关）。原型路径唯一相关消费是 `VisualPropertyPanel` 显示选中节点 x/y 数值——它是 select 时快照、且本就受 `scale` 影响，滚动带来的偏差属边缘且非新引入。
4. **不门控 UX 更好**：视觉编辑长原型时可滚动到折叠下方元素再编辑，而非维持"够不到"。

### 安全隔离

| 场景 | 入口 | `allowScroll` | 结果 |
|------|------|--------------|------|
| 编辑页单页预览 | `edit/page.tsx` | `true` | 内部滚动 |
| viewer-site 单页预览 | `ViewerApp.tsx` | `true` | 内部滚动 |
| 画布工作台 | `CanvasPageItem.tsx` | 不传（默认 `false`） | 裁剪，靠 `effectiveHeight` 全宽缩放显示全部内容 |
| 截图服务 | `screenshots.ts` 调 `buildPrototypePreviewDocumentHtml` | 不传（默认 `false`） | 裁剪到设计高度 |

## 已实施改动

- **`packages/shared/src/demo/prototype-preview.ts`**
  - `PrototypePreviewDocumentInput` 增加 `allowScroll?: boolean`。
  - `buildPrototypePreviewHtmlFragment` 解构 `allowScroll = false`；`allowRootScroll = shouldScaleToPreviewSize && allowScroll`；`rootOverflow` 在 `allowRootScroll` 时取 `auto`，否则 `hidden`（非 previewSize 仍为 `visible`）。
  - 滚动时给 `:host`/`.prototype-root` 加 `scrollbar-width: none; -ms-overflow-style: none;` 并追加 `::-webkit-scrollbar { display: none }`，隐藏滚动条。
- **`packages/demo-ui/src/PrototypePagePreview.tsx`**：增加 `allowScroll?: boolean` prop（默认 `false`），构建 Shadow DOM 时透传；`allowScroll` 加入重建 effect 依赖数组（静态值，不触发额外重建）。
- **`packages/author-site/src/app/demo/[id]/edit/page.tsx`**：原型页 `PrototypePagePreview` 传 `allowScroll`。
- **`packages/viewer-site/src/components/ViewerApp.tsx`**：原型页 `PrototypePagePreview` 传 `allowScroll`。
- **`packages/author-site/src/components/demo/prototype-page-preview.test.ts`**：新增两条用例，验证 `allowScroll` 时根节点 `overflow: auto`、默认时 `overflow: hidden`。
- **`docs/项目文档/创作端/04-配置与预览/技术/02_实时预览机制.md`**：同步单页原型内部滚动规范（L102）。

## 验证

| 验证项 | 命令 | 结果 |
|--------|------|------|
| 原型预览单测（含新用例） | `pnpm --filter @workbench/author-site test -- --testPathPatterns=prototype-page-preview` | 11/11 通过 |
| author-site 类型 | `pnpm --filter @workbench/author-site typecheck` | 通过 |
| viewer-site 类型（含 ViewerApp） | `pnpm --filter @workbench/viewer-site typecheck` | 通过 |
| screenshot-service 类型（用 shared 文档函数） | `pnpm --filter @workbench/screenshot-service typecheck` | 通过 |
| agent-service 类型（依赖 shared） | `pnpm --filter @workbench/agent-service typecheck` | 通过 |
| lint | `pnpm lint` | 通过（仅既有无关告警，改动行无新增） |

> Jest 27+ 的路径过滤 flag 为 `--testPathPatterns`（复数）；AGENTS.md 示例中的 `--testPathPattern` 已过期。

## 待人工确认（非阻断）

- **缩放帧内滚动手感**：`transform: scale()` 内滚动，滚轮/触控灵敏度随缩放比不完全线性，建议在不同 `previewSize` 与超高内容下实机体验一次。
- **隐藏滚动条的可发现性**：为与 React 页/预览容器保持一致而隐藏了滚动条，桌面端靠滚轮/触控滚动；若产品希望原型页显示滚动条，仅需去掉 `rootScrollbarStyle`/`rootScrollbarWebkitCss` 两处即可。

## 关键文件清单

| 文件 | 角色 |
|------|------|
| `packages/shared/src/demo/prototype-preview.ts` | Shadow DOM 根节点 overflow 控制（已改） |
| `packages/demo-ui/src/PrototypePagePreview.tsx` | 原型页预览组件，透传 `allowScroll`（已改） |
| `packages/demo-ui/src/preview-scale.ts` | 缩放 wrapper（未改，参考） |
| `packages/demo-ui/src/CanvasPageItem.tsx` | 画布模式，不传 `allowScroll`（未改） |
| `packages/author-site/src/app/demo/[id]/edit/page.tsx` | 编辑页单页预览调用方（已改） |
| `packages/viewer-site/src/components/ViewerApp.tsx` | viewer-site 调用方（已改） |
| `packages/screenshot-service/src/routes/screenshots.ts` | 截图服务，`buildPrototypePreviewDocumentHtml` 默认裁剪（未改） |
