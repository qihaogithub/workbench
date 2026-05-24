# PreviewPanel 单页预览区等比例缩放问题

> 状态：**已解决**，根因为 ResizeObserver 时序 Bug + iframe 布局溢出

---

## 一、问题描述

PreviewPanel 单页预览区的页面需要按 `$demo.previewSize` 定义的尺寸等比例显示，但当前实现存在**页面被裁切**的问题——页面在预览区内无法完整显示，左右或上下被截断。

---

## 二、目标行为

1. **比例固定**：页面显示比例始终等于 `$demo.previewSize` 定义的宽高比，不变形
2. **高度适配**：页面高度略小于预览区容器高度（留出间距）
3. **宽度等比缩放**：页面宽度根据宽高比由高度推算，且不超过预览区实际宽度
4. **宽度溢出时按宽度缩放**：当按高度推算的宽度超过容器宽度时，改按宽度约束等比缩小

---

## 三、当前代码状态

### 文件

`packages/author-site/components/demo/PreviewPanel.tsx`

### 核心函数 `computePreviewScale`

```typescript
interface PreviewScaleResult {
  designWidth: number;
  designHeight: number;
  scale: number;
  wrapperStyle: React.CSSProperties;
  iframeStyle: React.CSSProperties;
}

function computePreviewScale(
  size?: PreviewSize,
  containerWidth?: number,
  containerHeight?: number,
): PreviewScaleResult {
  const effectiveSize = size ?? DEFAULT_PREVIEW_SIZE;
  const designWidth = parseSizeValue(effectiveSize.width) ?? 375;
  const designHeight = parseSizeValue(effectiveSize.height) ?? 812;

  if (!containerWidth || !containerHeight) {
    return {
      designWidth,
      designHeight,
      scale: 1,
      wrapperStyle: {
        width: designWidth,
        height: designHeight,
        margin: "0 auto",
      },
      iframeStyle: {
        width: designWidth,
        height: designHeight,
        border: "none",
      },
    };
  }

  const availableHeight = containerHeight - CONTAINER_PADDING; // 48px
  const availableWidth = containerWidth;
  const aspectRatio = designWidth / designHeight;

  let displayWidth: number;
  let displayHeight: number;

  if (availableHeight * aspectRatio <= availableWidth) {
    displayWidth = availableHeight * aspectRatio;
    displayHeight = availableHeight;
  } else {
    displayWidth = availableWidth;
    displayHeight = availableWidth / aspectRatio;
  }

  const scale = displayWidth / designWidth;

  return {
    designWidth,
    designHeight,
    scale,
    wrapperStyle: {
      width: displayWidth,
      height: displayHeight,
      margin: "0 auto",
      overflow: "hidden",
    },
    iframeStyle: {
      width: designWidth,
      height: designHeight,
      transform: `scale(${scale})`,
      transformOrigin: "top left",
      border: "none",
    },
  };
}
```

### JSX 结构

```tsx
<div ref={containerRef} className="w-full h-full flex flex-col items-center">
  <div style={wrapperStyle} className="rounded-lg border border-border mt-4">
    <iframe
      ref={iframeRef}
      sandbox="allow-scripts allow-same-origin"
      src={iframeSrcUrl}
      style={iframeStyle}
      title="预览"
    />
  </div>
</div>
```

### 尺寸监听

```typescript
// containerRef 绑定在外层 flex 容器上
const [containerWidth, setContainerWidth] = useState<number>(0);
const [containerHeight, setContainerHeight] = useState<number>(0);

useEffect(() => {
  const el = containerRef.current;
  if (!el) return;

  const ro = new ResizeObserver((entries) => {
    for (const entry of entries) {
      setContainerWidth(entry.contentRect.width);
      setContainerHeight(entry.contentRect.height);
    }
  });
  ro.observe(el);
  return () => ro.disconnect();
}, []);
```

---

## 四、尝试过的方案

### 方案 1：`transform: scale()`（首次尝试，已回退）

**思路**：iframe 内部尺寸设为设计尺寸（如 768×1024），通过 `transform: scale()` 缩放到计算出的显示尺寸。

**结果**：页面仍被裁切，方案回退。

### 方案 2：双层 wrapper（已回退）

**思路**：
- 外层 wrapper：`width/height = displayWidth/displayHeight`（布局占位）
- 内层 scale 层：`width/height = designWidth/designHeight + transform: scale()`

**结果**：页面仍被裁切，方案回退。

### 方案 3：直接设尺寸（已回退）

**思路**：移除 `transform: scale()`，直接用 CSS `width`/`height` 设置 iframe 容器的布局尺寸为计算出的 `displayWidth`/`displayHeight`。

**结果**：问题依然存在。

### 方案 4：`transform: scale()` + 双层 wrapper（当前代码，问题仍存在）

**思路**：参考 PreviewGrid 中 `GridIframe` 的成功实现：
- iframe 保持设计稿原始尺寸（如 375×812）
- 通过 `transform: scale()` 缩放到容器大小
- 外层 wrapper 控制布局占位，`overflow: hidden` 裁剪溢出

**代码实现**：
- `computePreviewScale` 计算 `scale = displayWidth / designWidth`
- `wrapperStyle` 控制外层占位尺寸
- `iframeStyle` 设置 `width: designWidth, height: designHeight, transform: scale(${scale})`

**结果**：问题依然存在（见下方截图）。

![问题截图](PreviewPanel单页预览缩放问题.png)

---

## 五、父容器结构

PreviewPanel 被嵌入在以下父容器中：

### 编辑页面（`demo/[id]/edit/page.tsx`）

```tsx
<div className="flex-1 overflow-hidden">
  <div
    className="p-4 h-full overflow-y-auto preview-single-scroll"
    style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
  >
    <PreviewPanel previewSize={previewSize} />
  </div>
</div>
```

### Viewer 单页面（`viewer/[projectId]/[demoId]/page.tsx`）

```tsx
<div className="flex flex-1 overflow-hidden">
  <div className="flex-1 overflow-hidden" style={{ backgroundColor: previewBackground }}>
    <div
      className="p-4 h-full overflow-y-auto preview-single-scroll"
      style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
    >
      <PreviewPanel previewSize={previewSize} />
    </div>
  </div>
</div>
```

关键：`p-4` 意味着预览区有 16px 的 padding，容器实际可用宽度 < 100%。

---

## 六、待排查方向

### 可能原因 1：父容器 overflow 的影响

父容器 `flex-1 overflow-hidden` 可能影响了内部元素的渲染。即使 PreviewPanel 自身尺寸正确，父容器的 `overflow: hidden` 或其他样式仍可能造成裁切。

### 可能原因 2：Flex 布局中的百分比高度

`containerRef` 绑定的元素是 `flex flex-col items-center`，其 `h-full` 依赖父容器高度。父容器高度计算可能不准确。

### 可能原因 3：iframe 内部渲染尺寸问题

iframe 内部渲染的页面（通过 `generateIframeHtml` + Blob URL 加载）可能有自己的布局逻辑，与外层容器尺寸不匹配。

### 可能原因 4：p-4 padding 影响计算

父容器有 `p-4`（16px padding），但 `computePreviewScale` 的 `CONTAINER_PADDING = 48` 是否正确反映了实际间距？

### 可能原因 5：初始化时 containerWidth/Height 为 0

首次渲染时 `containerWidth` 和 `containerHeight` 都是 0，返回兜底样式（原始设计尺寸 375×812）。这可能导致 iframe 先以原始尺寸渲染，再缩小时出现问题。

### 可能原因 6：transform: scale() 导致内容溢出 wrapper

`transform: scale()` 缩放后的 iframe 可能超出 wrapper 的边界，而 wrapper 的 `overflow: hidden` 将溢出部分裁切。需要确认 `transformOrigin: "top left"` 是否正确，以及缩放后的实际占用空间是否被正确计算。

### 可能原因 7：iframe 内部视口（viewport）设置

iframe 内部 HTML 的 `<meta name="viewport">` 标签可能影响页面在 iframe 内的渲染方式，导致即使外部 scale 正确，内部页面仍按设备宽度渲染。

---

## 七、下一步行动建议

1. **在浏览器 DevTools 中验证 containerRef 的实际尺寸**：确认 ResizeObserver 获取的 `containerWidth` 和 `containerHeight` 是否与预期一致
2. **检查父容器的 flex 布局**：确认 `flex-1` 是否正确分配了高度
3. **验证 iframe 实际渲染尺寸**：在 DevTools 中检查 iframe 元素的 `offsetWidth`、`offsetHeight` 和 `getBoundingClientRect()`
4. **检查 transform: scale() 后的实际占用空间**：确认缩放后的 iframe 是否超出 wrapper 边界
5. **考虑不使用 ResizeObserver，改用其他方式获取容器尺寸**：例如通过父容器的 `getBoundingClientRect()` 或监听 `window.resize`
6. **参考 PreviewGrid 的缩放实现**：`PreviewGrid.tsx` 中 `GridIframe` 组件的缩放逻辑工作正常，可作为对比参考
7. **检查 iframe 内部 viewport 设置**：确认 `generateIframeHtml` 中的 viewport meta 标签是否影响渲染

---

## 八、相关文件

| 文件 | 说明 |
|------|------|
| `packages/author-site/components/demo/PreviewPanel.tsx` | 单页预览组件，当前问题所在 |
| `packages/author-site/components/demo/PreviewGrid.tsx` | 宫格预览组件，缩放逻辑正常 |
| `packages/author-site/components/demo/types.ts` | `PreviewSize` 类型定义 |
| `packages/author-site/src/lib/iframe-template.ts` | iframe HTML 生成逻辑 |
| `packages/author-site/src/app/demo/[id]/edit/page.tsx` | 编辑页面父容器 |
| `packages/author-site/src/app/viewer/[projectId]/[demoId]/page.tsx` | Viewer 单页面父容器 |
