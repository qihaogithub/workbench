# viewer-site 与 author-site 预览视图显示差异分析报告

> 分析 viewer-site（使用端）与 author-site（创作端）预览视图的显示效果差异，定位根因并提出解决方案

---

## 一、问题背景

### 问题描述

viewer-site 的预览视图在多个维度上与 author-site 存在显示差异，包括：宫格布局列宽分配、配置面板功能、缩放逻辑、加载状态、错误处理等。这些差异导致同一组件在两个站点上的预览体验不一致。

### 预期行为

viewer-site 作为 author-site 的预览展示端，应与 author-site 的预览效果保持一致，确保用户在 viewer-site 看到的效果与创作端完全相同。

### 实际行为

两个站点在 iframe 渲染架构、缩放策略、配置面板、宫格布局等方面存在系统性差异。

---

## 二、根因分析

### 根因一：iframe 内容源架构差异（A级证据）

**这是最核心的架构差异，是其他差异的根源。**

#### author-site 的 iframe 渲染流程

```
用户代码 (TSX)
  → compiler.ts (sucrase 编译)
  → 编译后 JS (ESM + CDN imports)
  → generateIframeHtml() 生成 HTML
  → Blob URL 加载到 iframe
  → postMessage(UPDATE_CODE) 动态注入代码
  → postMessage(UPDATE_CONFIG) 动态更新配置
```

- **PreviewPanel**：先创建空 iframe（`generateIframeHtml()` 无参数），iframe 就绪后通过 `postMessage` 发送 `UPDATE_CODE` 消息动态注入编译后代码
- **PreviewGrid**：在 `generateIframeHtml()` 中直接传入 `compiledCode` + `configData`，生成包含初始代码的完整 HTML，通过 Blob URL 加载

**证据来源**：
- [PreviewPanel.tsx:349-361](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/author-site/components/demo/PreviewPanel.tsx#L349-L361) — Blob URL 创建
- [PreviewPanel.tsx:139-166](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/author-site/components/demo/PreviewPanel.tsx#L139-L166) — sendUpdateCode 发送 UPDATE_CODE
- [PreviewGrid.tsx:237-258](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/author-site/components/demo/PreviewGrid.tsx#L237-L258) — mountIframe 生成含初始代码的 HTML

#### viewer-site 的 iframe 渲染流程

```
HTTP 请求 author-site /api/embed/:projectId/iframe?page=xxx
  → author-site 服务端编译代码
  → generateIframeHtml() 生成完整 HTML
  → 返回 HTML 响应（Cache-Control: max-age=300）
  → iframe src 直接加载 HTTP URL
  → postMessage(UPDATE_CONFIG) 动态更新配置
```

- **IframeRenderer**：通过 HTTP URL（`src` 属性）直接加载 author-site 的 embed API 端点返回的完整 HTML
- **ViewerPreviewGrid**：每个宫格卡片也通过 HTTP URL 加载

**证据来源**：
- [iframe-renderer.tsx:128-131](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/viewer-site/src/components/iframe-renderer.tsx#L128-L131) — iframe src={src}
- [api.ts:78-86](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/viewer-site/src/lib/api.ts#L78-L86) — getEmbedIframeUrl 生成 HTTP URL
- [embed iframe route.ts:115-126](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/author-site/src/app/api/embed/[projectId]/iframe/route.ts#L115-L126) — 服务端生成 HTML

#### 差异影响

| 维度 | author-site | viewer-site |
|------|------------|-------------|
| 代码注入方式 | Blob URL + postMessage | HTTP URL 直接加载 |
| 代码更新机制 | postMessage(UPDATE_CODE) 实时更新 | 需要重新请求 HTTP URL |
| 初始配置 | 通过 postMessage 传递或嵌入 HTML | 服务端 mergeConfigToProps 合并后嵌入 |
| 缓存策略 | 客户端 compile-cache（TTL 5min） | HTTP 缓存（max-age=300） |
| 跨域限制 | Blob URL 无跨域问题 | 需 author-site 允许跨域嵌入 |

---

### 根因二：宫格布局列宽分配策略不同（A级证据）

#### author-site — 按宽高比分配列宽

author-site 的 PreviewGrid 根据每个页面的宽高比动态计算列宽，使不同尺寸的页面在宫格中保持正确的视觉比例。

```typescript
// PreviewGrid.tsx:419-423
const ratios = row.map((p) => {
  const size = p.id === activePageId ? previewSize : (p.previewSize ?? previewSize)
  return getAspectRatioValue(size)
})
const columnTemplate = ratios.map((r) => `${r}fr`).join(" ")
```

例如，一个 375×812 的页面和一个 768×1024 的页面在同一行时，列宽比例为 `(375/812)fr (768/1024)fr`，即约 `0.46fr 0.75fr`。

#### viewer-site — 等宽分配列宽

viewer-site 的 ViewerPreviewGrid 使用等宽分配，所有列宽度相同。

```typescript
// viewer-preview-grid.tsx:200-204
style={{
  display: "grid",
  gridTemplateColumns: `repeat(${gridColumns}, 1fr)`,
  gap: "16px",
}}
```

#### 差异影响

当项目中存在不同 `previewSize` 的页面时，viewer-site 的宫格会导致：
- 宽页面被压缩到与窄页面相同的宽度
- 窄页面被拉伸到与宽页面相同的宽度
- 页面内容变形或留白不均匀

---

### 根因三：宫格模式配置传递缺失（A级证据）

#### author-site

PreviewGrid 接收 `configData` prop，并传递给每个 GridIframe 子组件。GridIframe 在 iframe 就绪后通过 postMessage 发送 UPDATE_CONFIG。

```typescript
// PreviewGrid.tsx:456-463
<GridIframe
  sessionId={sessionId}
  page={page}
  visible={visiblePages.has(page.id)}
  hasChanges={changedPageIds?.has(page.id) ?? false}
  configData={configData}
  previewSize={effectiveSize}
/>
```

#### viewer-site

在 [projectId]/page.tsx 中使用 ViewerPreviewGrid 时，**未传递 configData**：

```typescript
// [projectId]/page.tsx:245-251
<ViewerPreviewGrid
  projectId={projectId}
  demoPages={demoPages}
  activePageId={activeDemoId || demoPages[0].id}
  gridColumns={gridColumns}
  onCardClick={handleGridCardClick}
  // ❌ 缺少 configData prop
/>
```

虽然 ViewerPreviewGrid 组件本身定义了 `configData` prop 并支持传递给子 iframe，但页面级调用时未传入。

#### 差异影响

- 宫格模式下修改配置面板的值，所有宫格卡片的 iframe 不会收到 UPDATE_CONFIG 消息
- 宫格模式下的预览始终显示服务端 embed API 返回的初始配置值，无法实时更新

---

### 根因四：缩放逻辑差异（A级证据）

#### author-site PreviewPanel — buildPreviewStyle()

```typescript
// PreviewPanel.tsx:12-65
function buildPreviewStyle(size?, iframeHeight?, containerWidth?): React.CSSProperties {
  const effectiveSize = size ?? DEFAULT_PREVIEW_SIZE;
  const style = { width: effectiveSize.width, maxWidth: "100%", margin: "0 auto", background: "#fff" };

  // 固定高度 or 自适应高度
  if (effectiveSize.height !== undefined) style.height = effectiveSize.height;
  else if (iframeHeight && iframeHeight > 0) style.height = iframeHeight;
  else style.minHeight = effectiveSize.minHeight ?? "400px";

  if (effectiveSize.maxHeight !== undefined) style.maxHeight = effectiveSize.maxHeight;

  // 自动缩放：容器宽度 < 预览宽度时按比例缩小
  if (containerWidth && containerWidth > 0 && containerWidth < previewWidth) {
    const scale = containerWidth / previewWidth;
    style.transform = `scale(${scale})`;
    style.transformOrigin = "top center";
    style.height = typeof style.height === "number" ? style.height * scale : style.height;
    style.minHeight = typeof style.minHeight === "number" ? style.minHeight * scale : style.minHeight;
  } else if (effectiveSize.scale !== undefined) {
    style.transform = `scale(${effectiveSize.scale})`;
    style.transformOrigin = "top center";
  }
}
```

特点：
- 支持 `minHeight` / `maxHeight`
- 缩放时同步调整 height 和 minHeight，避免布局溢出
- 支持 `previewSize.scale` 用户自定义缩放
- 使用 `transformOrigin: "top center"` 居中对齐

#### viewer-site IframeRenderer

```typescript
// iframe-renderer.tsx:100-142
if (hasPreviewSize) {
  const iframeWidth = typeof previewSize!.width === "number" ? previewSize!.width : 375;
  const iframeHeightVal = typeof previewSize!.height === "number" ? previewSize!.height : 812;
  const userScale = previewSize!.scale ?? 1;
  const effectiveWidth = iframeWidth * userScale;
  const effectiveHeight = iframeHeightVal * userScale;

  let scale = 1;
  if (containerWidth > 0 && effectiveWidth > containerWidth) {
    scale = containerWidth / effectiveWidth;
  }

  return (
    <div style={{ width: effectiveWidth * scale, height: effectiveHeight * scale, overflow: "hidden" }}>
      <iframe style={{ width: effectiveWidth, height: effectiveHeight, transform: `scale(${scale})`, transformOrigin: "top left" }} />
    </div>
  );
}
```

特点：
- 先计算 userScale，再计算 containerScale，两层缩放
- 使用外层 div 包裹控制溢出
- 使用 `transformOrigin: "top left"` 左上对齐
- 不支持 `minHeight` / `maxHeight`
- 无 previewSize 时使用动态高度模式（默认 600px）

#### 差异影响

| 维度 | author-site | viewer-site |
|------|------------|-------------|
| transformOrigin | top center | top left |
| minHeight/maxHeight | 支持 | 不支持 |
| 缩放后高度调整 | 同步调整避免溢出 | 外层 div overflow:hidden 裁剪 |
| 无 previewSize 时 | 使用默认 375×812 | 动态高度（600px + RESIZE 消息） |
| userScale 处理 | 作为额外缩放叠加 | 先乘到 effectiveWidth 再计算 |

---

### 根因五：配置面板功能差异（A级证据）

#### author-site — ConfigFormNew（1035 行）

- **智能分组**：`parseSchemaToFields()` 根据字段名前缀自动分组（颜色配置、尺寸设置、文本内容、图片资源、显示选项、动画效果、布局设置、基础配置）
- **可折叠分组**：`FieldGroupSection` 每组带图标，可展开/折叠
- **拖拽排序**：`OrderControl` 基于 `@dnd-kit` 实现组件排序控制
- **文件上传**：`FileUploadWidget` 支持图片上传、尺寸校验、拖拽
- **图片列表**：`ImageListWidget` 支持批量上传、拖拽、尺寸校验、放大预览
- **富文本**：`RichTextWidget` 多行富文本编辑
- **备注编辑**：`NoteButton` + `NoteDialog` 支持添加/编辑/删除备注（富文本）
- **Schema 变更**：`onSchemaChange` 回调支持运行时修改 Schema

#### viewer-site — ConfigPanel（479 行）

- **扁平列表**：无分组，项目配置和页面配置仅用分隔线区分
- **无折叠**：所有字段始终展开
- **无拖拽排序**：不支持 `__order` 字段
- **无文件上传**：不支持 `ui:widget: "file"` / `"image"` / `"imageList"`
- **无富文本**：长文本使用 Textarea
- **只读备注**：`NoteButtonReadonly` + `NoteDialogReadonly` 只能查看，不能编辑
- **无 Schema 变更**：不支持运行时修改 Schema

**证据来源**：
- [ConfigFormNew.tsx:98-144](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/author-site/components/demo/ConfigFormNew.tsx#L98-L144) — 智能分组
- [config-panel.tsx:53-77](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/viewer-site/src/components/config-panel.tsx#L53-L77) — 扁平解析

---

### 根因六：iframe 内滚动条处理差异（A级证据）

#### author-site PreviewGrid

```typescript
// PreviewGrid.tsx:150-157
function disableIframeScrollbar(iframe: HTMLIFrameElement) {
  try {
    const doc = iframe.contentDocument
    if (!doc) return
    doc.documentElement.style.overflow = "hidden"
    doc.body.style.overflow = "hidden"
  } catch {}
}
```

在 iframe 加载完成后调用，隐藏 iframe 内的滚动条，避免宫格卡片内出现滚动条影响视觉效果。

#### viewer-site ViewerPreviewGrid

无此处理。宫格卡片内的 iframe 可能显示滚动条。

---

### 根因七：对齐模式缺失（A级证据）

#### author-site PreviewGrid

```typescript
// PreviewGrid.tsx:88-124
function useAlignmentMode(containerRef, gridRef): AlignmentMode {
  // 内容不足一屏时居中，超出时顶部对齐
  const check = () => {
    const containerHeight = container.clientHeight
    const gridHeight = grid.scrollHeight
    const padding = 32
    if (gridHeight + padding < containerHeight) setMode("center")
    else setMode("top")
  }
}
```

#### viewer-site ViewerPreviewGrid

无对齐模式。宫格内容始终从顶部开始排列，当页面数量少时不会居中显示。

---

### 根因八：消息来源验证差异（B级证据）

#### author-site

```typescript
// PreviewPanel.tsx:281
if (!iframe || event.source !== iframe.contentWindow) return;
```

验证 postMessage 来源，只处理来自自身 iframe 的消息。

#### viewer-site

```typescript
// iframe-renderer.tsx:66-88
const handleMessage = useCallback((event: MessageEvent<IframeMessage>) => {
  const { type } = event.data;
  switch (type) { ... }
}, [onReady, onLoaded, onError, onResize]);
```

无消息来源验证。当页面中有多个 iframe 时，可能收到其他 iframe 的消息。

---

### 根因九：错误处理差异（A级证据）

#### author-site PreviewPanel

- **编译错误**：调用 `/api/compile` 失败时显示红色错误面板
- **运行时错误**：iframe 回传 `RUNTIME_ERROR` 时显示红色错误面板
- **无效代码检测**：`isValidCode()` 检测文件路径等无效代码
- **加载状态**：编译中显示旋转动画

#### viewer-site IframeRenderer

- **无编译错误**：embed API 返回 404/500 时 iframe 显示空白或浏览器默认错误页
- **运行时错误**：仅通过 `onError` 回调通知，无内置错误展示 UI
- **无无效代码检测**
- **无加载状态**

---

### 根因十：尺寸解析差异（A级证据）

#### author-site PreviewGrid

```typescript
// PreviewGrid.tsx:18-25
function parseSizeValue(value: string | number | undefined): number | null {
  if (typeof value === "number") return value
  if (typeof value === "string") {
    const num = parseFloat(value.replace(/px$/, ""))
    return isNaN(num) ? null : num
  }
  return null
}
```

支持字符串尺寸（如 `"375px"`），自动去除 `px` 后缀。

#### viewer-site ViewerPreviewGrid / IframeRenderer

```typescript
// viewer-preview-grid.tsx:132-139
const iframeWidth = page.previewSize && typeof page.previewSize.width === "number"
  ? page.previewSize.width : 375;
```

仅支持数字类型，字符串尺寸被忽略，回退到默认值 375。

---

## 三、解决方案

### 方案一：对齐宫格布局列宽分配（推荐，高优先级）

**做法**：将 author-site 的按宽高比分配列宽逻辑移植到 viewer-site 的 ViewerPreviewGrid。

**具体修改**：
1. 在 ViewerPreviewGrid 中引入 `getAspectRatioValue()` 函数
2. 将 `gridTemplateColumns: repeat(${gridColumns}, 1fr)` 改为按比例分配
3. 按行分组计算列宽模板

**为何有效**：直接解决宫格中不同尺寸页面变形的问题。

**影响范围**：仅 `viewer-preview-grid.tsx`。

**风险**：低。纯布局计算变更。

---

### 方案二：修复宫格模式配置传递（推荐，高优先级）

**做法**：在 [projectId]/page.tsx 中将 configData 传递给 ViewerPreviewGrid。

**具体修改**：
1. 在页面组件中维护 configData 状态
2. ConfigPanel 的 onChange 回调更新 configData
3. 将 configData 传递给 ViewerPreviewGrid

**为何有效**：宫格模式下配置变更能实时传递到所有 iframe。

**影响范围**：`[projectId]/page.tsx` 和可能的 `ViewerPreviewGrid`。

**风险**：低。补全缺失的 prop 传递。

---

### 方案三：对齐缩放逻辑（推荐，中优先级）

**做法**：统一 viewer-site IframeRenderer 的缩放逻辑与 author-site PreviewPanel。

**具体修改**：
1. 添加 `minHeight` / `maxHeight` 支持
2. 统一 `transformOrigin` 为 `top center`
3. 缩放后同步调整高度避免溢出
4. 添加 `parseSizeValue()` 支持字符串尺寸

**为何有效**：确保缩放行为与创作端一致。

**影响范围**：`iframe-renderer.tsx` 和 `viewer-preview-grid.tsx`。

**风险**：中。缩放逻辑变更可能影响现有布局。

---

### 方案四：添加 iframe 滚动条隐藏（推荐，低优先级）

**做法**：在 ViewerGridCard 中添加 `disableIframeScrollbar()` 逻辑。

**为何有效**：宫格卡片内不显示滚动条，视觉效果更干净。

**影响范围**：`viewer-preview-grid.tsx`。

**风险**：低。

---

### 方案五：添加对齐模式（推荐，低优先级）

**做法**：将 author-site 的 `useAlignmentMode` hook 移植到 viewer-site。

**为何有效**：页面数量少时宫格居中显示，视觉更美观。

**影响范围**：`viewer-preview-grid.tsx`。

**风险**：低。

---

### 方案六：增强配置面板功能（可选，低优先级）

**做法**：将 author-site ConfigFormNew 的部分功能移植到 viewer-site ConfigPanel。

**优先移植**：
1. 智能分组 + 可折叠
2. 文件上传 / 图片列表支持（需要跨域 API 调用）

**暂不移植**：
1. 拖拽排序（viewer-site 是只读预览，不需要修改顺序）
2. 备注编辑（viewer-site 只需要查看备注）
3. Schema 变更（viewer-site 不需要修改 Schema）

**为何有效**：提升配置面板的可用性和一致性。

**影响范围**：`config-panel.tsx` 及可能新增的组件。

**风险**：中。文件上传需要处理跨域 API 调用。

---

### 方案七：添加消息来源验证（推荐，低优先级）

**做法**：在 IframeRenderer 的 handleMessage 中添加 `event.source` 验证。

**为何有效**：防止多个 iframe 场景下消息串扰。

**影响范围**：`iframe-renderer.tsx`。

**风险**：低。

---

### 方案八：增强错误处理（可选，低优先级）

**做法**：在 IframeRenderer 中添加错误展示 UI。

**为何有效**：embed API 请求失败时用户能看到明确的错误提示。

**影响范围**：`iframe-renderer.tsx`。

**风险**：低。

---

## 四、相关代码路径

### viewer-site 关键文件

| 文件 | 作用 |
|------|------|
| [iframe-renderer.tsx](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/viewer-site/src/components/iframe-renderer.tsx) | 单页预览 iframe 渲染器 |
| [viewer-preview-grid.tsx](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/viewer-site/src/components/viewer-preview-grid.tsx) | 宫格预览组件 |
| [config-panel.tsx](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/viewer-site/src/components/config-panel.tsx) | 配置面板 |
| [api.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/viewer-site/src/lib/api.ts) | API 客户端 |
| [[projectId]/page.tsx](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/viewer-site/src/app/[projectId]/page.tsx) | 项目预览页 |
| [[projectId]/[demoId]/page.tsx](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/viewer-site/src/app/[projectId]/[demoId]/page.tsx) | Demo 预览页 |
| [globals.css](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/viewer-site/src/app/globals.css) | 全局样式 |

### author-site 关键文件

| 文件 | 作用 |
|------|------|
| [PreviewPanel.tsx](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/author-site/components/demo/PreviewPanel.tsx) | 单页预览面板 |
| [PreviewGrid.tsx](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/author-site/components/demo/PreviewGrid.tsx) | 宫格预览面板 |
| [ConfigFormNew.tsx](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/author-site/components/demo/ConfigFormNew.tsx) | 配置表单（当前使用版本） |
| [iframe-template.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/author-site/src/lib/iframe-template.ts) | iframe HTML 模板生成 |
| [compiler.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/author-site/src/lib/compiler.ts) | 代码编译器 |
| [runtime-props.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/author-site/src/lib/runtime-props.ts) | 运行时 Props 合并 |
| [embed iframe route.ts](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/author-site/src/app/api/embed/[projectId]/iframe/route.ts) | embed API 端点 |
| [globals.css](file:///e:/重要文件/Programming/1_Work/opencode工作台/packages/author-site/src/app/globals.css) | 全局样式（含 .preview-scope） |

### 调用链对比

#### author-site 单页预览

```
DemoEditPage
  → PreviewPanel(code, sessionId, demoId, configData, previewSize)
    → fetch("/api/compile") 编译代码
    → generateIframeHtml() 生成空 iframe HTML
    → URL.createObjectURL(blob) 创建 Blob URL
    → iframe.src = blobUrl
    → iframe 就绪后 postMessage(UPDATE_CODE, {code, configData, cssImports})
    → configData 变化时 postMessage(UPDATE_CONFIG, {configData})
```

#### viewer-site 单页预览

```
ProjectPreviewPage
  → getEmbedIframeUrl(projectId, demoId) 生成 HTTP URL
  → IframeRenderer(src=HTTP_URL, previewSize)
    → iframe.src = http://localhost:3200/api/embed/:projectId/iframe?page=xxx
    → author-site 服务端编译 + 生成 HTML + 返回
    → configData 变化时 postMessage(UPDATE_CONFIG, {configData})
```

#### author-site 宫格预览

```
DemoEditPage
  → PreviewGrid(sessionId, demoPages, configData, previewSize)
    → 按行分组，按宽高比分配列宽
    → GridIframe(sessionId, page, configData)
      → fetch("/api/compile") 编译代码
      → generateIframeHtml({compiledCode, configData, cssImports}) 生成完整 HTML
      → URL.createObjectURL(blob) 创建 Blob URL
      → iframe.src = blobUrl
      → disableIframeScrollbar(iframe)
      → configData 变化时 postMessage(UPDATE_CONFIG, {configData})
```

#### viewer-site 宫格预览

```
ProjectPreviewPage
  → ViewerPreviewGrid(projectId, demoPages)  // ❌ 缺少 configData
    → 等宽分配列宽
    → ViewerGridCard(projectId, page, configData=undefined)
      → iframe.src = getEmbedIframeUrl(projectId, page.id)
      → 无 disableIframeScrollbar
      → configData=undefined，不发送 UPDATE_CONFIG
```

---

## 五、差异汇总表

| # | 差异项 | 影响程度 | 优先级 | 对应方案 |
|---|--------|---------|--------|---------|
| 1 | iframe 内容源架构不同 | 高（架构差异） | — | 架构层面，无需对齐 |
| 2 | 宫格列宽分配策略不同 | 高（视觉变形） | 高 | 方案一 |
| 3 | 宫格模式配置传递缺失 | 高（配置不生效） | 高 | 方案二 |
| 4 | 缩放逻辑差异 | 中（显示不一致） | 中 | 方案三 |
| 5 | 配置面板功能差异 | 中（功能缺失） | 低 | 方案六 |
| 6 | iframe 滚动条未隐藏 | 低（视觉瑕疵） | 低 | 方案四 |
| 7 | 对齐模式缺失 | 低（视觉瑕疵） | 低 | 方案五 |
| 8 | 消息来源未验证 | 低（潜在 Bug） | 低 | 方案七 |
| 9 | 错误处理缺失 | 低（体验不佳） | 低 | 方案八 |
| 10 | 尺寸解析不支持字符串 | 低（边界情况） | 中 | 方案三 |

---

## 六、建议实施顺序

1. **第一阶段（高优先级）**：方案二（配置传递）→ 方案一（列宽分配）
2. **第二阶段（中优先级）**：方案三（缩放逻辑 + 尺寸解析）
3. **第三阶段（低优先级）**：方案四（滚动条）→ 方案五（对齐模式）→ 方案七（消息验证）→ 方案八（错误处理）
4. **第四阶段（可选）**：方案六（配置面板增强）
