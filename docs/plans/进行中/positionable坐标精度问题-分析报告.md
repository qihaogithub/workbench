# positionable 坐标精度问题 — 问题分析报告

## 1. 问题背景

### 问题描述
`$demo.positionable` 的迷你画布拖拽定位存在精度问题。用户将四个徽章拖拽到迷你画布的四个边角后，左侧预览区中徽章并未到达父容器的实际边角位置。

### 发生场景
- **时间**：2026-06-06
- **环境**：开发环境，author-site 配置面板的「元素定位」区域
- **触发条件**：在迷你画布上拖拽徽章标记到画布边角

### 预期行为
拖拽徽章到迷你画布边角时，坐标值应能达到容器尺寸的最大值（如 `x=686, y=220`），预览区中徽章应出现在父容器的对应边角。

### 实际行为
拖拽徽章到画布边角时，坐标值无法达到最大值。例如拖到右下角时，坐标可能只有 `(646, 180)` 而非 `(686, 220)`，导致预览区中徽章距离容器边角仍有明显间隙。

### 错误信息
无运行时错误，属于逻辑精度问题。

---

## 2. 根因分析

### 调查过程
1. 审查 `ConfigForm.tsx` 中 `PositionControl` 组件的拖拽逻辑
2. 分析 `handleCanvasMouseDown` 和 `handleCanvasMouseMove` 的坐标计算
3. 追踪从画布坐标到容器坐标的转换链路

### 证据链

| 证据 | 级别 | 来源 | 说明 |
|------|------|------|------|
| mousedown 记录鼠标在标签内的偏移量 offsetX/offsetY | A | ConfigForm.tsx:953-966 | 拖拽起始时捕获偏移 |
| mousemove 中 rawX = e.clientX - rect.left - offsetX | A | ConfigForm.tsx:973 | 偏移量被减入坐标计算 |
| canvasX = Math.max(0, Math.min(rawX, CANVAS_WIDTH)) | A | ConfigForm.tsx:975 | 夹紧范围为 [0, CANVAS_WIDTH] |
| 标签宽度约 60-80px，offsetX 通常为 20-40px | B | 标签含 Move 图标 + 文字 + padding | 偏移量不可忽略 |

### 根本原因

**拖拽偏移量（offsetX/offsetY）被错误地纳入坐标计算。**

当用户点击标签中间位置开始拖拽时，`offsetX ≈ labelWidth/2 ≈ 30px`。在 mousemove 中：

```
rawX = e.clientX - rect.left - offsetX
```

当鼠标到达画布右边缘时（`e.clientX - rect.left = CANVAS_WIDTH`）：

```
rawX = CANVAS_WIDTH - 30
```

因此坐标最大只能达到 `(CANVAS_WIDTH - 30) / scaleFactor`，而非预期的 `containerWidth`。

**根因说明**：offset 机制的初衷是防止 mousedown 时标签跳变（保持鼠标与标签的相对位置），但副作用是将标签的左上角坐标向内收缩了 offset 距离，导致坐标永远无法到达容器边界。

### 代码执行路径

```
用户点击标签（mousedown）
  → handleCanvasMouseDown(key, e)
  → offsetX = e.clientX - labelRect.left    // 记录鼠标在标签内的偏移
  → setDraggingKey(key)

用户拖拽（mousemove）
  → handleCanvasMouseMove(e)
  → rawX = e.clientX - rect.left - offsetX  // 偏移量被减入！
  → canvasX = clamp(rawX, 0, CANVAS_WIDTH)  // 最大值 = CANVAS_WIDTH - offsetX
  → x = canvasX / scaleFactor               // 坐标 < containerWidth
  → onPositionsChange({ [key]: { x, y } })
```

---

## 3. 解决方案

### 方案一：移除拖拽偏移量（推荐）
- **描述**：删除 mousedown 中的 offsetX/offsetY 记录，mousemove 直接用鼠标位置作为标签位置
- **原理**：鼠标位置直接映射为坐标，坐标范围完整覆盖 [0, containerWidth] × [0, containerHeight]
- **影响范围**：仅修改 ConfigForm.tsx 的 PositionControl 组件
- **风险**：mousedown 时标签会跳变到光标位置（瞬移），但这是大多数拖拽 UI 的标准行为
- **复杂度**：低

### 方案二：保留偏移但修正夹紧范围
- **描述**：保留 offset 机制，但在夹紧时补偿 offset：`canvasX = clamp(rawX, 0, CANVAS_WIDTH)` → `canvasX = clamp(rawX + offsetX, 0, CANVAS_WIDTH)` 再减回 offsetX
- **原理**：保持无跳变拖拽的同时允许坐标到达边界
- **影响范围**：仅修改 ConfigForm.tsx
- **风险**：逻辑复杂，边界行为可能不直观
- **复杂度**：中

### 后续建议
- 考虑在迷你画布四角添加"吸附到边角"的快捷按钮，方便精确定位

---

## 4. 相关代码路径

### 涉及文件
| 文件路径 | 行号 | 说明 |
|---------|------|------|
| packages/shared/src/demo/ConfigForm.tsx | L953-966 | handleCanvasMouseDown — 记录偏移量 |
| packages/shared/src/demo/ConfigForm.tsx | L968-982 | handleCanvasMouseMove — 使用偏移量计算坐标 |
| packages/shared/src/demo/ConfigForm.tsx | L1058-1078 | 迷你画布标签渲染 |

### 调用链
handleCanvasMouseDown → setDraggingKey → handleCanvasMouseMove → onPositionsChange → ConfigForm.onChange

### 相关配置
- `$demo.positionable.size`：定义容器坐标空间尺寸
- `$demo.positionable.defaults`：定义默认坐标
