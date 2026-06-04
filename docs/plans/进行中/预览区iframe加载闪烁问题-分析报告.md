# 预览区 iframe 加载闪烁问题 — 问题分析报告

## 1. 问题背景

### 问题描述

单页预览模式和画布预览模式下，iframe 在内容加载完成之前，会显示一个底部很矮的白色条（默认 375×812 尺寸的白色矩形），加载完成后 iframe 尺寸才更新为适配容器的大小，导致画面闪烁、尺寸"弹跳"，加载体验不佳。

### 发生场景

- **环境**：开发/生产环境，author-site 中的单页预览（PreviewPanel）和画布预览（CanvasPageItem → PreviewPanel）
- **触发条件**：每次进入预览区域、切换预览模式、或页面首次加载时均会触发

### 预期行为

iframe 在加载期间应与最终渲染尺寸一致，或使用占位/骨架屏平滑过渡，不出现尺寸弹跳和白条闪烁。

### 实际行为

1. iframe 先以默认尺寸 375×812 渲染（白色背景），与容器实际可用空间不匹配
2. 短暂延迟后（ResizeObserver 触发 + 尺寸计算），iframe 重新缩放为适配容器的正确尺寸
3. 用户看到"短白条"→"弹跳到正确尺寸"的闪烁效果

---

## 2. 根因分析

### 调查过程

1. 定位预览区域入口：`packages/author-site/src/app/demo/[id]/edit/page.tsx` 中根据 `previewMode` 渲染 `PreviewPanel`（单页）或 `PreviewCanvas`（画布）
2. 追踪 `PreviewPanel` 的 iframe 创建与尺寸计算逻辑
3. 检查 `computePreviewScale` 在容器尺寸未知时的行为
4. 检查 iframe 模板的初始样式与内容加载时序
5. 验证 ResizeObserver 与 React 状态更新的时序关系

### 证据链

| 证据 | 级别 | 来源 | 说明 |
|------|------|------|------|
| `containerWidth`/`containerHeight` 初始值为 0 | A | `PreviewPanel.tsx:208-209` | 首次渲染时容器尺寸尚未测量 |
| `computePreviewScale` 在宽高为 0 时返回 375×812 + scale=1 | A | `PreviewPanel.tsx:40-60` | 容器的 fallback 尺寸与最终实际尺寸不符 |
| iframe 在 `iframeSrcUrl` 非空时立即渲染，无尺寸占位 | A | `PreviewPanel.tsx:542-551` | iframe 以 fallback 尺寸出现在 DOM 中 |
| ResizeObserver 在首次渲染后才触发 | A | `PreviewPanel.tsx:447-459` | 容器尺寸测量滞后于 iframe 渲染 |
| iframe 模板默认 body 背景为白色 | A | `iframe-template.ts:129` | iframe 内容加载前显示白色背景 |
| `computePreviewScale` 随 container 尺寸更新重新计算 | B | `PreviewPanel.tsx:473-477` | 每次渲染都重新计算，React 重渲染后 iframe 从 375×812 snap 到实际尺寸 |
| 画布模式下 `CanvasPageItem` 用固定宽高包裹 `PreviewPanel` | A | `CanvasPageItem.tsx:93-99` | 画布模式已指定 layout 尺寸，但 `PreviewPanel` 内部仍然先以默认值渲染 |
| 画布模式根据 `IFRAME_ZOOM_THRESHOLD` 决定是否显示真实 iframe | A | `CanvasPageItem.tsx:109` | 缩放低于 0.55 时不使用 PreviewPanel，但高于阈值时仍有闪烁 |

### 根本原因

**根因一（主要）：容器尺寸测量滞后导致 iframe 初始尺寸错误**

`PreviewPanel` 使用 `ResizeObserver` 测量容器尺寸，但初始渲染时尺寸尚未获取，`computePreviewScale` 返回 375×812 的 fallback 尺寸。iframe 以此尺寸渲染后，ResizeObserver 才触发状态更新，触发 React 重渲染并重新计算缩放比例，导致 iframe 尺寸从 375×812 弹跳到实际适配尺寸。

时序链：
```
组件挂载 → containerWidth=0, containerHeight=0
         → computePreviewScale(0,0) → return { scale:1, width:375, height:812 }
         → iframe 渲染为 375×812 白色矩形
         → ResizeObserver 触发 → setContainerWidth(w) → React re-render
         → computePreviewScale(w,h) → return { scale:0.xx, displayWidth:dw, displayHeight:dh }
         → iframe 尺寸变化 → 用户看到闪烁
```

**根因二（次要）：iframe 内容加载前无过渡状态**

即使尺寸正确，iframe 内页加载也需要时间（创建 blob URL、`import()` 动态模块、渲染组件），此期间 iframe 显示空白的白色背景。`PreviewPanel` 中的 `isCompiling` loading spinner 在编译完成后就消失，不覆盖 iframe 内容加载阶段。

**根因三（画布特有）：`PreviewPanel` 内部依然存在初始尺寸问题**

画布模式通过 `CanvasPageItem` 的 `layout.width`/`layout.height` 设定了固定容器尺寸，但 `PreviewPanel` 内部的 `ResizeObserver` 仍需一个 tick 获取这些尺寸，首次渲染时仍然使用 375×812 的 fallback。

### 代码执行路径

```
编辑页面 page.tsx
  ├─ previewMode === "single"
  │   └─ <PreviewPanel />            ← 容器尺寸未知
  │       ├─ useState: containerWidth=0, containerHeight=0
  │       ├─ computePreviewScale(0,0) → scale:1, 375×812
  │       ├─ 渲染 <iframe style={width:375, height:812}>
  │       └─ ResizeObserver → setContainerWidth(h) → 重新计算 → iframe snap 到实际尺寸
  │
  └─ previewMode === "canvas"
      └─ <PreviewCanvas>
          └─ <CanvasViewport>
              └─ <CanvasPageItem>    ← 固定 layout.width/layout.height
                  └─ <PreviewPanel>  ← 内部 ResizeObserver 仍需一个 tick
                      └─ 同上流程
```

---

## 3. 解决方案

### 方案一：提前注入容器尺寸，消除初始 mismatch（推荐）

- **描述**：修改 `PreviewPanel`，将容器尺寸通过 props 或 ref 从父组件传入，或在 iframe 渲染之前先确保 `ResizeObserver` 已触发一次。具体做法：
  1. 在 `containerRef` 挂载后（`useLayoutEffect` 中）立即读取 `getBoundingClientRect()`，同步设置 `containerWidth`/`containerHeight`，而非等待 ResizeObserver 异步回调
  2. 在 `containerWidth === 0` 时不渲染 iframe，而是渲染一个占位/骨架屏，避免白色矩形出现
- **原理**：消除初始尺寸 fallback 到实际尺寸的 snap 过程。iframe 首次渲染时尺寸即正确。
- **影响范围**：`packages/shared/src/demo/PreviewPanel.tsx`
- **风险**：低。`useLayoutEffect` 是同步执行的，不会导致布局震荡
- **复杂度**：低

### 方案二：iframe 渲染前添加尺寸骨架屏

- **描述**：当 `containerWidth === 0` 时，不渲染 iframe，而是渲染一个与最终尺寸比例一致的灰色/中性色骨架占位，骨架尺寸根据 `previewSize` 属性计算比例
- **原理**：完全避免白色矩形的出现，用中性色骨架替代加载过程的视觉空白
- **影响范围**：`packages/shared/src/demo/PreviewPanel.tsx`
- **风险**：极低。纯视觉改进，不修改业务逻辑
- **复杂度**：低

### 方案三：iframe 内容加载前保持尺寸隐藏，渲染完成后显露

- **描述**：在 iframe 的 `load` 事件或收到 `LOADED`/`COMPONENT_READY` 消息前，将 iframe 设为 `visibility: hidden` 或 `opacity: 0`，内容渲染完成后再显示。
- **原理**：白色背景的闪烁不是因为尺寸，而是因为白色可见。如果内容未加载前保持透明，用户不会感知到闪烁。
- **影响范围**：`PreviewPanel.tsx` + 消息处理逻辑
- **风险**：低。需注意设置合适的最小显示时间避免闪现
- **复杂度**：低

### 方案四：组合方案（推荐最终方案）

1. **`useLayoutEffect` + 同步读取容器尺寸**，消除初始尺寸 fallback
2. **内容加载前 iframe 设为 `opacity: 0`**，收到 `LOADED` 或 `COMPONENT_READY` 消息后渐变显示
3. 配合一个与 `previewSize` 比例一致的骨架占位

- **原理**：尺寸正确 + 内容不可见 + 加载后渐显 = 用户无感知的平滑加载
- **影响范围**：`PreviewPanel.tsx`（核心修改）、`iframe-template.ts`（消息类型已支持，无需修改）
- **风险**：极低
- **复杂度**：中（涉及状态管理调整）

### 后续建议

- 验证 canvas 模式下 `CanvasPageItem` 的 `PreviewPanel` 是否也需要相同修复
- 考虑 `PreviewGrid` 是否也有类似问题（grid 模式已有 `isLoading` 状态，闪烁不显著）
- 添加 `opacity` 过渡动画（`transition: opacity 0.2s`）提升视觉体验

---

## 4. 相关代码路径

### 涉及文件

| 文件路径 | 行号 | 说明 |
|---------|------|------|
| `packages/shared/src/demo/PreviewPanel.tsx` | L208-L209 | `containerWidth`/`containerHeight` 初始化为 0 |
| `packages/shared/src/demo/PreviewPanel.tsx` | L31-L101 | `computePreviewScale` 的 fallback 逻辑 |
| `packages/shared/src/demo/PreviewPanel.tsx` | L447-L459 | ResizeObserver 异步测量容器尺寸 |
| `packages/shared/src/demo/PreviewPanel.tsx` | L542-L551 | iframe 在 `iframeSrcUrl` 非空时立即渲染 |
| `packages/shared/src/demo/iframe-template.ts` | L127-L131 | iframe 模板默认白色背景 |
| `packages/shared/src/demo/iframe-template.ts` | L129 | `body { background-color: #ffffff; }` |
| `packages/shared/src/demo/CanvasPageItem.tsx` | L109-L118 | 画布模式下 PreviewPanel 的渲染条件 |
| `packages/author-site/src/app/demo/[id]/edit/page.tsx` | L1491-L1568 | 编辑页单页/画布模式渲染入口 |
| `packages/author-site/src/app/viewer/[projectId]/page.tsx` | L440-L476 | 查看页单页/画布模式渲染入口 |

### 调用链

```
page.tsx (edit/viewer)
  └─ [previewMode === "single"] → <PreviewPanel>
       ├─ useRef(containerRef) + ResizeObserver
       ├─ computePreviewScale(size, 0, 0) → 375×812 (fallback)
       ├─ render <iframe style={375×812}) ← 白条出现
       └─ ResizeObserver fires → computePreviewScale(size, w, h) → re-render → iframe snap

  └─ [previewMode === "canvas"] → <PreviewCanvas>
       └─ <CanvasViewport>
            └─ <CanvasPageItem layout={w, h}>
                 └─ <PreviewPanel>  ← 同上流程
```

### 关键状态流转

```
初始状态:
  containerWidth=0, containerHeight=0
  → computePreviewScale → { scale:1, designWidth:375, designHeight:812 }
  → iframe: width=375, height=812

ResizeObserver 触发后:
  containerWidth=800, containerHeight=600
  → computePreviewScale → { scale:0.42, displayWidth:337, displayHeight:600 }
  → iframe: width=375, height=812, transform: scale(0.42)
  → 用户看到尺寸弹跳
```
