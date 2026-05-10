# PreviewPanel 单页预览区适配方案

> 针对预览区内页面比例、缩放和尺寸适配的重构设计

---

## 一、现状分析

### 当前渲染结构

```
外层容器 (containerRef, w-full h-full, ResizeObserver 监听宽度)
  └─ 预览样式容器 (style={previewStyle}, rounded-lg overflow-hidden border)
       └─ iframe (w-full h-full)
```

### 当前 `buildPreviewStyle` 逻辑

| 步骤 | 当前行为 | 问题 |
|------|---------|------|
| 宽度 | `width: previewSize.width`，`maxWidth: "100%"` | `maxWidth: "100%"` 会让宽度被压缩，但高度不变，**破坏宽高比** |
| 高度 | 固定 `previewSize.height`，或使用 iframe 回传的自适应高度 | 不考虑容器高度，页面可能溢出容器 |
| 缩放 | 仅当 `containerWidth < previewWidth` 时按宽度缩放 | 只考虑宽度溢出，不考虑高度溢出 |
| 缩放副作用 | 手动将 `height`/`minHeight` 乘以 scale | 脆弱，与 `transform: scale()` 语义重复 |

### 核心问题

1. **宽高比不固定**：`maxWidth: "100%"` 会压缩宽度但不调整高度，导致页面变形
2. **不考虑容器高度**：页面高度固定为 `previewSize.height`（如 812px），当容器高度不足时页面溢出
3. **缩放策略单一**：仅按宽度缩放，未考虑高度约束
4. **iframe 内部尺寸与外部尺寸混淆**：iframe 设为 `w-full h-full` 填满外层容器，但外层容器尺寸可能已被 `maxWidth` 压缩

---

## 二、设计目标

1. **比例固定**：页面在预览区内的显示比例始终等于 `$demo.previewSize` 定义的宽高比，不变形
2. **高度适配**：页面高度略小于预览区容器高度，留出上下间距
3. **宽度等比缩放**：页面宽度根据宽高比由高度推算，且不超过预览区实际宽度
4. **宽度溢出缩放**：当按高度推算的宽度超过容器宽度时，改按宽度约束等比缩小

---

## 三、算法设计

### 输入

| 参数 | 来源 | 说明 |
|------|------|------|
| `designWidth` | `previewSize.width` | 设计稿宽度，默认 375 |
| `designHeight` | `previewSize.height` | 设计稿高度，默认 812 |
| `containerWidth` | ResizeObserver | 预览区容器实际宽度 |
| `containerHeight` | ResizeObserver（新增） | 预览区容器实际高度 |
| `padding` | 常量 | 上下间距，建议 32px（上下各 16px） |

### 计算步骤

```
1. 计算设计宽高比
   aspectRatio = designWidth / designHeight

2. 计算可用高度（留出间距）
   availableHeight = containerHeight - padding

3. 按高度约束计算宽度
   widthByHeight = availableHeight * aspectRatio

4. 确定最终宽度和缩放比例
   if widthByHeight <= containerWidth:
     // 高度是约束瓶颈，按高度适配
     displayWidth = widthByHeight
     displayHeight = availableHeight
     scale = displayWidth / designWidth
   else:
     // 宽度是约束瓶颈，按宽度适配
     displayWidth = containerWidth
     displayHeight = containerWidth / aspectRatio
     scale = displayWidth / designWidth

5. 居中定位
   水平居中: margin: "0 auto"
   垂直居中: 在容器内垂直居中（flex 或计算 margin-top）
```

### 示例演算

**场景 1：手机竖屏（375×812），容器 600×800**

```
aspectRatio = 375 / 812 ≈ 0.462
availableHeight = 800 - 32 = 768
widthByHeight = 768 * 0.462 ≈ 355

355 <= 600 → 高度约束
displayWidth = 355, displayHeight = 768
scale = 355 / 375 ≈ 0.947
```

页面以 94.7% 缩放比显示，宽度 355px，高度 768px，宽高比不变。

**场景 2：手机竖屏（375×812），容器 300×800**

```
aspectRatio = 375 / 812 ≈ 0.462
availableHeight = 800 - 32 = 768
widthByHeight = 768 * 0.462 ≈ 355

355 > 300 → 宽度约束
displayWidth = 300, displayHeight = 300 / 0.462 ≈ 649
scale = 300 / 375 = 0.8
```

页面以 80% 缩放比显示，宽度 300px，高度 649px，宽高比不变。

**场景 3：桌面横屏（1440×900），容器 600×800**

```
aspectRatio = 1440 / 900 = 1.6
availableHeight = 800 - 32 = 768
widthByHeight = 768 * 1.6 = 1229

1229 > 600 → 宽度约束
displayWidth = 600, displayHeight = 600 / 1.6 = 375
scale = 600 / 1440 ≈ 0.417
```

页面以 41.7% 缩放比显示，宽度 600px，高度 375px，宽高比不变。

---

## 四、实现方案

### 4.1 修改 `buildPreviewStyle` 函数

**新签名**：

```typescript
function buildPreviewStyle(
  size?: PreviewSize,
  containerWidth?: number,
  containerHeight?: number,
): React.CSSProperties
```

**移除参数**：
- `iframeHeight`：不再使用 iframe 回传的自适应高度，页面高度完全由设计尺寸和缩放比例决定

**核心逻辑变更**：

```typescript
function buildPreviewStyle(
  size?: PreviewSize,
  containerWidth?: number,
  containerHeight?: number,
): React.CSSProperties {
  const effectiveSize = size ?? DEFAULT_PREVIEW_SIZE;
  const designWidth = parseSizeValue(effectiveSize.width) ?? 375;
  const designHeight = parseSizeValue(effectiveSize.height) ?? 812;
  const aspectRatio = designWidth / designHeight;

  const PADDING = 32;

  // 无容器尺寸信息时，使用设计尺寸（首渲染兜底）
  if (!containerWidth || !containerHeight) {
    return {
      width: designWidth,
      height: designHeight,
      maxWidth: "100%",
      margin: "0 auto",
      background: "#fff",
      display: "block",
    };
  }

  const availableHeight = containerHeight - PADDING;
  const widthByHeight = availableHeight * aspectRatio;

  let displayWidth: number;
  let displayHeight: number;

  if (widthByHeight <= containerWidth) {
    displayWidth = widthByHeight;
    displayHeight = availableHeight;
  } else {
    displayWidth = containerWidth;
    displayHeight = containerWidth / aspectRatio;
  }

  const scale = displayWidth / designWidth;

  return {
    width: designWidth,
    height: designHeight,
    transform: `scale(${scale})`,
    transformOrigin: "top center",
    margin: "0 auto",
    background: "#fff",
    display: "block",
  };
}
```

**关键变化**：
- iframe 内部尺寸始终为 `designWidth × designHeight`（原始设计尺寸）
- 通过 `transform: scale()` 缩放到 `displayWidth × displayHeight`
- 不再使用 `maxWidth` 压缩宽度（避免破坏宽高比）
- 不再手动调整 `height`/`minHeight`（scale 自动处理）

### 4.2 新增容器高度监听

当前仅监听容器宽度，需同时监听容器高度：

```typescript
// 现有：仅监听宽度
const [containerWidth, setContainerWidth] = useState<number>(0);

// 修改为：同时监听宽高
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

### 4.3 修改预览容器结构

当前结构中，外层容器 `containerRef` 是 `w-full h-full`，但 `previewStyle` 容器没有垂直居中。需要调整：

```tsx
{iframeSrcUrl && (
  <div
    ref={containerRef}
    className="w-full h-full flex flex-col items-center"
  >
    <div style={previewStyle} className="rounded-lg overflow-hidden border border-border mt-4">
      <iframe
        ref={iframeRef}
        sandbox="allow-scripts allow-same-origin"
        src={iframeSrcUrl}
        className="w-full h-full"
        title="预览"
      />
    </div>
  </div>
)}
```

**变化**：
- 外层容器添加 `flex flex-col items-center`，使预览页面水平居中
- 添加 `mt-4`（16px）作为顶部间距，与 `PADDING = 32` 的上部分对应
- 移除 `onWheel` 事件转发（缩放后的页面不需要外部滚动穿透）

### 4.4 移除 iframeHeight 相关逻辑

由于页面高度完全由设计尺寸和缩放比例决定，不再需要：

- `iframeHeight` state
- iframe 消息中 `RESIZE` 类型的处理（可保留但不使用，或移除）
- `buildPreviewStyle` 中的 `iframeHeight` 参数

### 4.5 处理 `previewSize` 缺失 height 的情况

当 `$demo.previewSize` 未定义 `height` 时（如只定义了 `width`），需要合理回退：

| 场景 | 处理方式 |
|------|---------|
| `width` 和 `height` 都有 | 正常计算宽高比和缩放 |
| 只有 `width` | `height` 回退到默认 812，按手机竖屏比例处理 |
| 只有 `height` | `width` 回退到默认 375，按手机竖屏比例处理 |
| 都没有 | 使用默认值 375×812 |

---

## 五、与 PreviewGrid 的对比

PreviewGrid 的 `GridIframe` 组件已有成熟的缩放方案：

```typescript
// PreviewGrid.tsx 第 335-338 行
const effective = getEffectivePreviewSize(previewSize);
const iframeWidth = parseSizeValue(effective.width) ?? 375;
const iframeHeight = parseSizeValue(effective.height) ?? 812;
const scale = cardWidth > 0 ? cardWidth / iframeWidth : 0.3;
```

Grid 模式只按宽度缩放（因为宫格卡片高度由列数和宽度决定），而单页模式需要同时考虑宽度和高度约束。本方案是 Grid 缩放逻辑的增强版。

---

## 六、影响范围

| 文件 | 修改内容 |
|------|---------|
| `components/demo/PreviewPanel.tsx` | 重写 `buildPreviewStyle`，新增 `containerHeight` 监听，调整容器结构，移除 `iframeHeight` 相关逻辑 |
| `components/demo/types.ts` | 无需修改（`PreviewSize` 接口不变） |

**不需要修改的文件**：
- `PreviewGrid.tsx`：宫格模式逻辑独立，不受影响
- `iframe-template.ts`：iframe 内部逻辑不变
- 编辑页面和 Viewer 页面：仅传递 `previewSize`，不涉及缩放逻辑

---

## 七、边界情况

| 情况 | 处理 |
|------|------|
| 容器尺寸为 0（首渲染未挂载） | 使用设计尺寸作为兜底，不应用缩放 |
| `previewSize.width` 或 `height` 为字符串（如 `"375px"`） | 使用 `parseSizeValue()` 解析（复用 PreviewGrid 的工具函数） |
| `previewSize.scale` 显式指定 | 忽略，缩放比例完全由容器尺寸和设计尺寸计算得出 |
| 极小容器（宽度 < 100px） | 仍然按算法缩放，页面会很小但比例正确 |
| 超大设计尺寸（如 3840×2160） | 缩放比例会很小，但比例正确 |
