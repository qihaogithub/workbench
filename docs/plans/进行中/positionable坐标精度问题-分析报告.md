# positionable 坐标精度问题 — 问题分析报告

## 1. 问题背景

### 问题描述
`$demo.positionable` 的迷你画布拖拽定位存在精度问题。当前坐标系统将 `(x, y)` 视为元素**左上角**在父容器中的位置，坐标范围固定为 `[0, containerWidth] × [0, containerHeight]`，完全不考虑元素自身尺寸。这导致：

1. **无法精确定位到容器边角**：拖拽元素到画布右下角时，元素左上角到达容器右下角，但元素本身溢出容器
2. **不同尺寸元素行为不一致**：小元素可以"拖得更远"，大元素更容易溢出；极端情况下，与容器等大的元素无法被拖动
3. **迷你画布标签遮挡**：拖拽标签本身有尺寸（约 60-80px 宽），标签左上角定位后，标签右下部分溢出画布可视区域

### 发生场景
- **时间**：2026-06-06（初报），2026-06-07（深化分析）
- **环境**：开发环境，author-site 配置面板的「元素定位」区域
- **触发条件**：在迷你画布上拖拽元素标记到画布边角

### 预期行为
- 拖拽元素到画布边角时，元素应能贴合容器边角而**不溢出**
- 不同尺寸的元素应有不同的有效拖拽范围：`x ∈ [0, containerWidth - elementWidth]`，`y ∈ [0, containerHeight - elementHeight]`
- 迷你画布上的拖拽标签应正确反映元素的实际可移动范围

### 实际行为
- 所有元素共享同一坐标范围 `[0, containerWidth] × [0, containerHeight]`
- 拖到右下角时，元素左上角坐标为 `(containerWidth, containerHeight)`，元素完全溢出容器
- 迷你画布标签在接近边缘时，标签右半部分溢出画布边界

### 错误信息
无运行时错误，属于逻辑精度问题。

---

## 2. 根因分析

### 历史问题（已修复）
初版报告中记录的"拖拽偏移量（offsetX/offsetY）被错误纳入坐标计算"问题已在代码中修复。当前 `handleCanvasMouseDown` 不再记录偏移量，`handleCanvasMouseMove` 直接使用鼠标位置映射坐标。

### 当前根因：坐标系统未考虑元素尺寸

**核心问题**：坐标 `(x, y)` 表示元素左上角在容器中的位置，但系统不知道每个元素的实际渲染尺寸，因此无法正确约束拖拽范围。

#### 数学模型

设容器尺寸为 `W × H`，元素尺寸为 `w × h`，要求元素不溢出容器：

```
有效 X 范围: [0, W - w]
有效 Y 范围: [0, H - h]
```

| 元素尺寸 | 有效 X 范围 | 有效 Y 范围 | 说明 |
|---------|------------|------------|------|
| 80 × 28 | [0, 606] | [0, 192] | 小徽章，可移动范围大 |
| 200 × 100 | [0, 486] | [0, 120] | 中等元素，可移动范围缩小 |
| 686 × 220 | [0, 0] | [0, 0] | 与容器等大，无法移动 |

当前代码对所有元素使用 `[0, W] × [0, H]`，这意味着：
- 小元素在 `x = W` 时溢出 `w` 像素
- 大元素在 `x = W` 时溢出更多
- 用户无法通过拖拽让元素的**右边缘**对齐容器的右边缘

#### 代码执行路径

```
用户拖拽（mousemove）
  → handleCanvasMouseMove(e)
  → canvasX = clamp(e.clientX - rect.left, 0, CANVAS_WIDTH)
  → canvasY = clamp(e.clientY - rect.top, 0, CANVAS_HEIGHT)
  → x = round(canvasX / scaleFactor)         // 无元素尺寸约束
  → y = round(canvasY / scaleFactor)
  → onPositionsChange({ [key]: { x, y } })

预览渲染（index.tsx）
  → <div style={{ position: 'absolute', left: pos.x, top: pos.y }}>
  → 元素左上角在 (pos.x, pos.y)，右下角在 (pos.x + w, pos.y + h)
  → 若 pos.x + w > containerWidth → 溢出！
```

---

## 3. 两种场景分析

### 场景一：固定尺寸元素（index.tsx 代码写死）

#### 特征
- 元素尺寸由页面代码决定，在编译时即可确定
- 典型例子：demo 中的 badge 徽章，尺寸由 `padding + fontSize + 文字内容` 决定
- 元素尺寸**不随配置变化**（或变化范围有限）

#### 当前 demo 的实际情况

```tsx
// index.tsx 中的 badge 渲染
<div style={{
  position: 'absolute',
  left: pos.x,        // 左上角定位
  top: pos.y,
  padding: '5px 14px',
  fontSize: '12px',
  whiteSpace: 'nowrap'
}}>
  {text} <span>(pos.x, pos.y)</span>
</div>
```

badge 的实际渲染尺寸取决于文字内容，例如 "NEW (80,50)" 约 80×28px，"HOT (260,50)" 约 75×28px。

#### 问题表现
- 拖拽 badge 到画布右下角 → 坐标变为 `(686, 220)` → badge 完全溢出容器
- 用户期望：badge 右边缘贴合容器右边缘 → 坐标应为 `(686 - 80, 220 - 28)` = `(606, 192)`
- 但当前系统无法表达这个约束

### 场景二：配置项元素（如通过配置面板配置的图片）

#### 特征
- 元素尺寸由配置值决定，在配置时可能未知
- 典型例子：用户通过配置面板设置图片 URL，图片尺寸在加载前不可知
- 元素尺寸**随配置变化**（换一张图就可能完全不同）

#### 问题表现
- 图片 URL 配置后，图片尺寸在预览渲染时才能确定
- 配置面板的迷你画布在用户配置图片时，可能还不知道图片的实际尺寸
- 如果图片有 `object-fit: contain/cover`，渲染尺寸还受容器和 CSS 影响

#### 额外复杂度
- 图片可能加载失败，此时尺寸为 0
- 图片可能受 CSS 约束（`max-width: 100%` 等），渲染尺寸 ≠ 原始尺寸
- 配置变更（换图）后尺寸可能变化，需要重新检测

### 两种场景的统一性

两种场景在 DOM 层面没有本质区别——都是渲染后的 DOM 节点，`getBoundingClientRect()` 一视同仁。区别仅在于"尺寸是否随配置变化"，而运行时 DOM 检测天然支持这一点：每次预览重渲染后重新测量即可。

---

## 4. 解决方案

### 方案一：运行时 DOM 尺寸检测（推荐）

**描述**：通过预览 iframe 的 DOM 测量，自动获取每个 positionable 元素的实际渲染尺寸，统一覆盖固定尺寸元素和配置项元素。

**已有基础设施**：

预览 iframe 和配置面板之间已有完整的 postMessage 双向通信机制（定义在 `iframe-types.ts`），且已有类似先例：

| 现有消息类型 | 方向 | 用途 |
|---|---|---|
| `COLLECT_THUMBNAIL_LAYOUT` | 父→iframe | 请求 iframe 收集页面布局信息 |
| `THUMBNAIL_LAYOUT_RESULT` | iframe→父 | 返回布局数据 |
| `UPDATE_CONFIG` | 父→iframe | 更新配置（热更新，不重载 iframe） |
| `LOADED` / `COMPONENT_READY` | iframe→父 | 组件渲染完成通知 |

新增消息类型可复用 `COLLECT_THUMBNAIL_LAYOUT` 的模式。

**实现步骤**：

1. **新增消息类型**（`iframe-types.ts`）：
   - `COLLECT_POSITIONABLE_SIZES`：父窗口请求 iframe 收集 positionable 元素尺寸
   - `POSITIONABLE_SIZES_RESULT`：iframe 返回各元素尺寸数据

2. **demo 模板添加标识属性**：positionable 元素添加 `data-pos-key="badge1"` 属性，使 iframe 内脚本可定位元素

3. **iframe-template.ts 添加尺寸收集逻辑**：
   ```
   收到 COLLECT_POSITIONABLE_SIZES 消息
     → 遍历 document.querySelectorAll('[data-pos-key]')
     → 对每个元素调用 getBoundingClientRect()
     → postMessage({ type: 'POSITIONABLE_SIZES_RESULT', sizes: { badge1: { width, height }, ... } })
   ```

4. **PreviewPanel.tsx 添加尺寸请求逻辑**：
   - 收到 `LOADED` / `COMPONENT_READY` 消息后，发送 `COLLECT_POSITIONABLE_SIZES`
   - 收到 `POSITIONABLE_SIZES_RESULT` 后，将尺寸数据传递给 ConfigForm
   - 配置变更触发 iframe 热更新后，重新请求尺寸

5. **ConfigForm.tsx 使用尺寸数据约束拖拽**：
   ```tsx
   const elementWidth = itemSizes[key]?.width ?? 0;
   const elementHeight = itemSizes[key]?.height ?? 0;
   const maxX = containerWidth - elementWidth;
   const maxY = containerHeight - elementHeight;
   // clamp(x, 0, maxX), clamp(y, 0, maxY)
   ```

**影响范围**：
- `iframe-types.ts`（新增 2 个消息类型）
- `iframe-template.ts`（新增尺寸收集逻辑）
- `PreviewPanel.tsx`（新增尺寸请求和接收逻辑）
- `ConfigForm.tsx`（接收尺寸数据、约束拖拽范围、迷你画布标签渲染）
- demo 模板（添加 `data-pos-key` 属性）

**优势**：
- **统一覆盖两种场景**：固定尺寸元素和配置项元素无需区分处理
- **始终准确**：测量的是实际渲染尺寸，不受声明误差影响
- **自动更新**：配置变更后 iframe 热更新，重新测量即可获取新尺寸
- **零配置负担**：demo 开发者无需手动测量和声明元素尺寸
- **已有先例**：`COLLECT_THUMBNAIL_LAYOUT` 消息模式可直接复用

**风险与应对**：

| 风险 | 应对 |
|------|------|
| 尺寸检测有延迟（需等预览渲染完成） | 首次加载时先使用无约束模式，收到尺寸后切换；延迟通常 < 100ms |
| 图片加载失败，尺寸为 0 | 回退到无约束模式；图片加载成功后重新测量 |
| 元素条件渲染，可能不存在 | 不存在的元素不返回尺寸，回退到无约束 |
| 迷你画布标签在尺寸到达前可能不准确 | 可接受，因为尺寸到达后会立即更新 |

**复杂度**：中（得益于已有 postMessage 基础设施）

### 方案二：声明式元素尺寸

**描述**：在 `positionable` 配置中新增 `itemSizes` 字段，由 demo 开发者显式声明每个元素的尺寸。

**配置格式**：
```json
{
  "$demo": {
    "positionable": {
      "items": ["badge1", "badge2", "badge3", "badge4"],
      "size": { "width": 686, "height": 220 },
      "itemSizes": {
        "badge1": { "width": 80, "height": 28 },
        "badge2": { "width": 75, "height": 28 }
      },
      "defaults": { ... }
    }
  }
}
```

**优势**：实现简单，不涉及跨 iframe 通信

**劣势**：
- demo 开发者需手动测量和声明尺寸，增加配置负担
- 元素尺寸随内容变化时声明值不准确
- 配置项元素（如图片）尺寸在配置时可能未知
- 仍需方案一的 DOM 检测来覆盖配置项元素场景

**复杂度**：低（但覆盖不完整）

### 方案三：坐标语义变更（不推荐）

**描述**：将坐标语义从"左上角"改为"中心点"。

**风险**：
- 破坏现有 demo 的坐标语义，需要所有 demo 更新
- 中心点定位在 CSS 中不直接支持（需 `transform: translate(-50%, -50%)`）
- 不解决根本问题（仍需知道元素尺寸）

**复杂度**：中（但破坏性大）

---

## 5. 推荐实施路径

### 单阶段实施：运行时 DOM 尺寸检测（方案一）

DOM 检测统一覆盖固定尺寸元素和配置项元素，无需分阶段。

1. **新增消息类型**（`iframe-types.ts`）
   - `COLLECT_POSITIONABLE_SIZES`
   - `POSITIONABLE_SIZES_RESULT`

2. **iframe-template.ts 添加尺寸收集逻辑**
   - 监听 `COLLECT_POSITIONABLE_SIZES` 消息
   - 查询 `[data-pos-key]` 元素，测量 `getBoundingClientRect()`
   - 返回 `POSITIONABLE_SIZES_RESULT`

3. **PreviewPanel.tsx 添加尺寸请求逻辑**
   - 组件渲染完成后发送 `COLLECT_POSITIONABLE_SIZES`
   - 接收 `POSITIONABLE_SIZES_RESULT`，将尺寸数据传递给 ConfigForm
   - 配置变更后重新请求

4. **ConfigForm.tsx 使用尺寸数据**
   - PositionControl 接收 `itemSizes` prop
   - 拖拽范围约束：`clamp(x, 0, containerWidth - elementWidth)`
   - 坐标输入框 max 值动态调整
   - 迷你画布标签按比例渲染为元素实际形状

5. **demo 模板添加 `data-pos-key` 属性**
   - 更新现有 demo 的 index.tsx
   - 在 positionable 元素上添加 `data-pos-key="badge1"` 等

### 后续建议
- 迷你画布标签改为按比例矩形渲染，直观展示元素实际形状和尺寸
- 考虑在迷你画布四角添加"吸附到边角"的快捷按钮
- 考虑拖拽时显示辅助线（对齐到容器边缘或其他元素）

---

## 6. 相关代码路径

### 涉及文件
| 文件路径 | 行号 | 说明 |
|---------|------|------|
| packages/shared/src/demo/ConfigForm.tsx | L909-1116 | PositionControl 组件完整实现 |
| packages/shared/src/demo/ConfigForm.tsx | L951-954 | handleCanvasMouseDown — 设置拖拽状态 |
| packages/shared/src/demo/ConfigForm.tsx | L956-967 | handleCanvasMouseMove — 坐标计算（无尺寸约束） |
| packages/shared/src/demo/ConfigForm.tsx | L973-981 | handleCoordChange — 坐标输入框（max 值为容器尺寸） |
| packages/shared/src/demo/ConfigForm.tsx | L1043-1062 | 迷你画布标签渲染（统一文字标签，无尺寸比例） |
| packages/shared/src/demo/types.ts | — | PositionableConfig 类型定义 |
| packages/shared/src/demo/validator.ts | L126-172 | getPositionable 解析函数 |
| packages/shared/src/demo/iframe-types.ts | — | iframe ↔ 父窗口消息类型定义 |
| packages/shared/src/demo/iframe-template.ts | — | iframe HTML 模板（含消息处理逻辑） |
| packages/shared/src/demo/PreviewPanel.tsx | L517-575 | postMessage 消息监听 |
| packages/shared/src/demo/PreviewPanel.tsx | L321-341 | sendUpdateCode — 发送 UPDATE_CODE |
| packages/shared/src/demo/PreviewPanel.tsx | L366-381 | sendUpdateConfig — 发送 UPDATE_CONFIG |
| packages/author-site/src/lib/config-merge.ts | L90-100 | 配置合并中 __positions 初始化 |
| packages/author-site/src/lib/fs-utils.ts | L448-486 | positionable 规范文档字符串 |

### 调用链
```
handleCanvasMouseDown → setDraggingKey
handleCanvasMouseMove → onPositionsChange → ConfigForm.onChange → 配置更新 → 预览热更新
handleCoordChange → onPositionsChange → ConfigForm.onChange → 配置更新 → 预览热更新

预览热更新后：
  PreviewPanel 发送 COLLECT_POSITIONABLE_SIZES → iframe 测量元素尺寸
  → iframe 返回 POSITIONABLE_SIZES_RESULT → ConfigForm 更新 itemSizes
  → PositionControl 重新约束拖拽范围
```

### 相关配置
- `$demo.positionable.size`：定义容器坐标空间尺寸
- `$demo.positionable.defaults`：定义默认坐标
