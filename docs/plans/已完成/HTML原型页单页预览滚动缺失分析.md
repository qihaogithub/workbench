# HTML 原型页单页预览模式滚动缺失——实施方案

## 背景

创作端当前有两种主要页面类型：**HTML 原型页**（`prototype-html-css`）和 **React 高保真页**（`high-fidelity-react`）。在单页预览模式下，React 高保真页可以上下滑动查看超出视口的内容，但 HTML 原型页无法滚动——当页面内容高度超过 `previewSize` 定义的设计画板高度时，超出部分被裁剪、不可见。

受影响场景：

- **viewer-site 只读预览**：`packages/viewer-site/src/components/ViewerApp.tsx` 单页模式
- **author-site 编辑页预览**：`packages/author-site/src/app/demo/[id]/edit/page.tsx` 单页预览区
- **author-site viewer 路由**：`packages/author-site/src/app/viewer/[projectId]/page.tsx` 单页模式

> embed 路由（`packages/author-site/src/app/embed/[demoId]/page.tsx`）未引用 `PrototypePagePreview`，不受影响。

## 目标

单页预览模式下 HTML 原型页可滚动查看超出 `previewSize` 设计高度的内容，画布模式和截图服务不受影响。

## 根因：三层 overflow:hidden 叠加

HTML 原型页的渲染链路涉及三层独立的 `overflow: hidden`，任何一层都足以阻止滚动。

### 渲染层级

```
外层滚动容器 (overflow-y:auto，但内容 h-full 不触发滚动)
  └─ containerRef (flex, h-full, 居中布局)
      └─ wrapper (overflow:hidden) ← 第二层
          └─ contentStyle div (transform:scale, 固定 designWidth×designHeight)
              └─ Shadow DOM host (overflow:auto，但无内容溢出)
                  └─ :host (overflow:hidden, height:designHeight) ← 第一层（根因）
                      └─ .prototype-root (overflow:hidden, height:designHeight) ← 第一层（根因）
                          └─ 用户 HTML 内容（超出部分被裁剪）
```

### 第一层（根因）：Shadow DOM 根节点

文件：`packages/shared/src/demo/prototype-preview.ts`，`buildPrototypePreviewHtmlFragment` 函数。

当传入 `previewSize` 时，`:host` 和 `.prototype-root` 的 overflow 被设为 `hidden`：

```typescript
// L281-285
const shouldScaleToPreviewSize = previewSize != null;
const rootOverflow = shouldScaleToPreviewSize ? "hidden" : "visible";
```

**设计意图**：`previewSize` 模式下设计画板为固定尺寸（如 375×812），`overflow: hidden` 确保内容严格在设计框内，与设计工具的画板行为一致。

### 第二层：缩放 wrapper

文件：`packages/demo-ui/src/preview-scale.ts`，`computePreviewScale` 函数。所有返回分支中 `wrapperStyle.overflow` 均为 `"hidden"`（L52/84/108/133/172）。

**设计意图**：wrapper 容纳 `transform: scale()` 缩放后的内容，`overflow: hidden` 防止变换区域溢出。

### 第三层：外层容器未形成有效滚动

外层容器（如编辑页的 `preview-single-scroll`）虽有 `overflow-y-auto`，但 `PrototypePagePreview` 通过 `h-full` 填满容器高度，不触发外层滚动。Shadow DOM 宿主 div 有 `overflow-auto`（`PrototypePagePreview.tsx` L450），但被前两层压制——内部内容已裁剪到 `designHeight`，不会溢出宿主。

### 行为对比

| 场景 | React 高保真页 | HTML 原型页 |
|------|--------------|------------|
| 渲染方式 | `<iframe>` 独立文档 | Shadow DOM + `transform:scale` |
| 滚动能力 | 有（iframe 原生滚动） | 无（三层 overflow:hidden） |
| 内容超出设计高度 | 可滚动查看 | 被裁剪不可见 |

## 方案：`allowScroll` 参数 + 仅修改 Shadow DOM 根节点

### 核心思路

通过 `allowScroll` 参数按场景控制 Shadow DOM 根节点的 overflow：单页预览传 `true` 启用 `overflow: auto`，画布/截图不传保持 `hidden`。

**关键精简点：wrapper（第二层）不需要改。** 原因：

1. Shadow DOM 宿主 div 有固定 `height: designHeight`，`overflow: auto` 后内部产生滚动，但宿主的 **布局高度不变**。
2. wrapper 的 `overflow: hidden` 裁剪的是 `transform: scale()` 的视觉变换区域。宿主布局高度 = `designHeight`，缩放后视觉高度 = `designHeight × scale`，仍在 wrapper 边界内。
3. 用户滚动的是 Shadow DOM 内部内容（在缩放帧内滚动），与 React 高保真页 iframe 内滚动行为一致。

### 方案对比

| 维度 | 全局改 overflow（A/B） | `allowScroll` 参数控制（选定） |
|------|----------------------|------------------------------|
| 画布模式 | 无法隔离，全局生效 | 完全隔离，默认 `false` 保持现状 |
| 截图服务 | 无法隔离 | 完全隔离，截图调用不传参数 |
| 视觉编辑 | 无法控制 | `visualEditMode` 时不启用 |
| 改动层数 | 需同时改 Shadow DOM + wrapper | 仅改 Shadow DOM 一层 |

### 安全保障

- **截图服务**：不传 `allowScroll`，默认 `false`，保持 `overflow: hidden`。
- **画布模式**：`CanvasPageItem.tsx` 不传 `allowScroll`，保持 `overflow: hidden`。
- **视觉编辑坐标**：`getNodeInfo` 使用 `getBoundingClientRect()`，滚动会影响视口坐标。通过 `allowScroll && !visualEditMode` 守卫规避——视觉编辑模式不启用滚动。
- **`effectiveHeight` 分支**：`computePreviewScale` 的全宽缩放与 `allowScroll` 的内部滚动互补——缩放确保宽度适配，滚动确保高度可浏览。

## 实施计划

### 改动 1：`packages/shared/src/demo/prototype-preview.ts`

`PrototypePreviewDocumentInput` 接口增加 `allowScroll?: boolean` 字段。

`buildPrototypePreviewHtmlFragment` 解构新增参数，修改 `rootOverflow` 逻辑：

```typescript
const rootOverflow = shouldScaleToPreviewSize
  ? (allowScroll ? "auto" : "hidden")
  : "visible";
```

`:host` 和 `.prototype-root` 已使用 `rootOverflow` 变量，无需额外修改。

### 改动 2：`packages/demo-ui/src/PrototypePagePreview.tsx`

组件增加 `allowScroll?: boolean` prop，构建 Shadow DOM HTML 时传入：

```typescript
const shadowHtml = buildPrototypePreviewHtmlFragment({
  html, css, configData, previewSize, assetRewrite,
  allowScroll: allowScroll && !visualEditMode,
});
```

### 改动 3：调用方按场景传入

| 调用场景 | 文件 | `allowScroll` |
|---------|------|--------------|
| 编辑页单页预览 | `packages/author-site/src/app/demo/[id]/edit/page.tsx` | `true` |
| author-site viewer 路由 | `packages/author-site/src/app/viewer/[projectId]/page.tsx` | `true` |
| viewer-site 单页预览 | `packages/viewer-site/src/components/ViewerApp.tsx` | `true` |
| 画布模式 | `packages/demo-ui/src/CanvasPageItem.tsx` | 不传（默认 `false`） |
| 截图服务 | `packages/screenshot-service/` | 不传（默认 `false`） |

## 风险与待验证

1. **`transform: scale()` 内滚动体验**：Shadow DOM 在缩放容器内滚动，滚轮灵敏度可能因缩放比例不线性。需实测不同缩放比例下的滚动体验。
2. **视觉编辑坐标**：已通过 `!visualEditMode` 守卫规避，视觉编辑模式不启用滚动。
3. **事件坐标映射**：Shadow DOM 内的 `pointermove`/`click` 事件监听在滚动状态下的坐标映射需实测验证（仅在 `allowScroll` 启用时相关）。

## 任务清单

- [ ] `shared` 包：`PrototypePreviewDocumentInput` 接口增加 `allowScroll` 字段
- [ ] `shared` 包：`buildPrototypePreviewHtmlFragment` 根据 `allowScroll` 控制 `rootOverflow`
- [ ] `demo-ui` 包：`PrototypePagePreview` 组件增加 `allowScroll` prop
- [ ] `demo-ui` 包：`PrototypePagePreview` 构建 Shadow DOM 时传入 `allowScroll`
- [ ] `author-site`：编辑页单页预览传入 `allowScroll={true}`
- [ ] `author-site`：viewer 路由传入 `allowScroll={true}`
- [ ] `viewer-site`：ViewerApp 单页预览传入 `allowScroll={true}`
- [ ] 验证：画布模式无滚动回归
- [ ] 验证：截图服务无影响
- [ ] 验证：单页预览滚动功能正常
- [ ] 验证：视觉编辑模式无滚动

## 关键文件清单

| 文件 | 角色 |
|------|------|
| `packages/shared/src/demo/prototype-preview.ts` | Shadow DOM 根节点 overflow 控制（**需修改**） |
| `packages/demo-ui/src/PrototypePagePreview.tsx` | 原型页预览组件（**需修改**） |
| `packages/demo-ui/src/preview-scale.ts` | 缩放 wrapper overflow 控制（不改，保留参考） |
| `packages/demo-ui/src/PreviewPanel.tsx` | React 高保真页 iframe 预览（对比参照） |
| `packages/demo-ui/src/CanvasPageItem.tsx` | 画布模式页面渲染（不传 `allowScroll`，保持现状） |
| `packages/author-site/src/app/demo/[id]/edit/page.tsx` | 编辑页单页预览调用方（**需修改**） |
| `packages/author-site/src/app/viewer/[projectId]/page.tsx` | viewer 路由调用方（**需修改**） |
| `packages/viewer-site/src/components/ViewerApp.tsx` | viewer-site 调用方（**需修改**） |
| `packages/screenshot-service/` | 截图服务（不改，保持现状） |
