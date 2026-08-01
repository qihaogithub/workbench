# 元素自由定位 — 可拖动范围约束设计

> 日期: 2026-08-01

## 背景

当前元素自由定位模式中，所有 `[data-pos-key]` 元素的拖拽边界硬编码为 `#root` 容器的全区域 (`[0, containerWidth - elementWidth]` × `[0, containerHeight - elementHeight]`)。创作端 agent 无法控制或限制元素的拖动范围。

用户需要支持"模块容器"场景：页面中放置多个 DOM 容器 div，每个容器内的元素只能在各自容器区域内拖动。

## 目标

- 元素自由定位模式支持按元素指定拖动边界
- 支持两种边界模式：绝对坐标（相对 root 容器）和 padding（相对 root 容器边缘）
- 边界在进入编辑模式时一次性传入，编辑期间不变
- 完全向后兼容（不传边界 = 当前全容器行为）
- Agent 侧后续可通过工具指定边界值

## 非目标

- 不自动检测元素父级 DOM 容器
- 不实现编辑期间动态变更边界
- 不在此次设计中实现 agent 位置编辑工具（后续单独设计）

## 设计

### 类型定义

**文件: `packages/demo-ui/src/types.ts`**

```typescript
export interface PositionEditBoundaryAbsolute {
  mode: "absolute";
  /** 允许区域左边界（相对 root 容器），可为负 */
  left: number;
  /** 允许区域上边界（相对 root 容器），可为负 */
  top: number;
  /** 允许区域右边界（相对 root 容器），可为负 */
  right: number;
  /** 允许区域下边界（相对 root 容器），可为负 */
  bottom: number;
}

export interface PositionEditBoundaryPadding {
  mode: "padding";
  /** 距 root 容器上边缘内缩量，可为负（负值 = 允许超出容器） */
  top: number;
  /** 距 root 容器右边缘内缩量 */
  right: number;
  /** 距 root 容器下边缘内缩量 */
  bottom: number;
  /** 距 root 容器左边缘内缩量 */
  left: number;
}

export type PositionEditBoundary =
  | PositionEditBoundaryAbsolute
  | PositionEditBoundaryPadding;

export interface PositionEditMode {
  enabled: boolean;
  items: string[];
  positions: Record<string, { x: number; y: number }>;
  /** 按 position key 指定的拖动边界。未在 map 中的 key 退化为全容器约束。整体缺省时所有元素退化为全容器约束。 */
  boundary?: Record<string, PositionEditBoundary>;
}
```

**语义说明：**

- **absolute 模式**：`(left, top)` 和 `(right, bottom)` 定义 root 容器坐标系下的矩形区域。元素中心/左上角必须约束在此矩形内（元素宽度从 right 中扣除）。
- **padding 模式**：`top/right/bottom/left` 是距 root 容器四条边的内缩距离。等价于 absolute 模式中 `left=padding.left, top=padding.top, right=containerWidth-padding.right, bottom=containerHeight-padding.bottom`。容器尺寸变化时自动重新计算。
- **负值**：不做校验。允许元素超出 root 可视区域。
- **缺省行为**：`boundary` 为 `undefined` 或 key 不在 map 中 → 约束为 `[0, containerWidth - elementWidth]` × `[0, containerHeight - elementHeight]`，与当前行为一致。

### 消息传递

**文件: `packages/demo-ui/src/PreviewPanel.tsx`** — `ENTER_POSITION_EDIT` effect

当前发送：
```typescript
iframe.contentWindow.postMessage(
  { type: "ENTER_POSITION_EDIT", items, positions },
  "*",
);
```

改为：
```typescript
iframe.contentWindow.postMessage(
  { type: "ENTER_POSITION_EDIT", items, positions, boundary },
  "*",
);
```

其中 `boundary` 取自 `positionEditMode.boundary`，可能为 `undefined`。

### Iframe 脚本变更

**文件: `packages/demo-ui/src/iframe-template.ts`**

#### 1. 存储边界

```javascript
var editBoundaries = null; // { [posKey]: PositionEditBoundary } | null

function enter(items, positions, boundary) {
  // ... 现有逻辑 ...
  editBoundaries = boundary || null;
}

function exit() {
  // ... 现有逻辑 ...
  editBoundaries = null;
}
```

#### 2. message handler 传参

```javascript
if (data.type === 'ENTER_POSITION_EDIT') {
  enter(data.items, data.positions, data.boundary);
}
```

#### 3. 约束函数替换

删除 `constrainToContainer`，新增 `constrainToBoundary`：

```javascript
function constrainToBoundary(key, targetRect, deltaX, deltaY) {
  var container = getContainer();
  var containerRect = container.getBoundingClientRect();
  var newLeft = dragOrigLeft + deltaX;
  var newTop = dragOrigTop + deltaY;

  var b = editBoundaries ? editBoundaries[key] : null;

  if (!b) {
    // 退化为全容器约束
    newLeft = Math.max(0, Math.min(newLeft, containerRect.width - targetRect.width));
    newTop = Math.max(0, Math.min(newTop, containerRect.height - targetRect.height));
    return { constrainedLeft: newLeft, constrainedTop: newTop };
  }

  var minLeft, maxLeft, minTop, maxTop;

  if (b.mode === 'absolute') {
    minLeft = b.left;
    maxLeft = b.right - targetRect.width;
    minTop = b.top;
    maxTop = b.bottom - targetRect.height;
  } else {
    // padding mode
    minLeft = b.left;
    maxLeft = containerRect.width - targetRect.width - b.right;
    minTop = b.top;
    maxTop = containerRect.height - targetRect.height - b.bottom;
  }

  newLeft = Math.max(minLeft, Math.min(newLeft, maxLeft));
  newTop = Math.max(minTop, Math.min(newTop, maxTop));
  return { constrainedLeft: newLeft, constrainedTop: newTop };
}
```

#### 4. pointermove handler 适配

```javascript
// 改前
var result = constrainToContainer(targetRect, deltaX, deltaY);

// 改后
var key = dragTarget.getAttribute('data-pos-key');
var result = constrainToBoundary(key, targetRect, deltaX, deltaY);
```

#### 5. pointerup handler 适配

当前 pointerup 中 `finalX/finalY` 硬编码 `Math.max(0, ...)` 会错误裁剪边界为负值时的合法位置。改为边界感知的 clamping：

```javascript
// 改前
var finalX = Math.round(Math.max(0, finalRect.left - containerRect.left));
var finalY = Math.round(Math.max(0, finalRect.top - containerRect.top));

// 改后
var finalX = Math.round(finalRect.left - containerRect.left);
var finalY = Math.round(finalRect.top - containerRect.top);
```

拖动过程中 `constrainToBoundary` 已确保 position 在有效范围内，pointerup 时直接读取即可，无需二次 clamping。

#### 6. exit 清理

`exit()` 中将 `editBoundaries` 置为 `null`，确保退出后残留状态不污染下一次进入。

### 数据流总览

```
Agent / UI
  → handleEnterPositionEdit(items, positions, boundary)
    → setPositionEditMode({ enabled, items, positions, boundary })
      → PreviewPanel useEffect
        → postMessage({ type: "ENTER_POSITION_EDIT", items, positions, boundary })
          → iframe: enter(items, positions, boundary)
            → editBoundaries = boundary
              → pointermove: constrainToBoundary(key, ...)
```

### 边界用例

| 场景 | 行为 |
|------|------|
| `boundary` 未传入 | 所有元素全容器约束（当前行为） |
| key 不在 boundary map 中 | 该元素全容器约束 |
| absolute 模式下 left > right | 约束结果不可预测（调用方责任，不做校验） |
| padding 模式下负值 | 允许元素超出容器对应边 |
| 容器 resize（padding 模式） | `containerRect` 每次 pointermove 重新获取，自动适应 |
| 容器 resize（absolute 模式） | 绝对坐标不变，不从容器位置推导，不自动适应 |
| 退出编辑模式 | `exit()` 重置 `editBoundaries = null` |

## 改动清单

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `packages/demo-ui/src/types.ts` | 新增类型 + 扩展现有接口 | 新增 `PositionEditBoundaryAbsolute`、`PositionEditBoundaryPadding`、`PositionEditBoundary`；`PositionEditMode` 增加 `boundary` 字段 |
| `packages/demo-ui/src/PreviewPanel.tsx` | 修改 | `ENTER_POSITION_EDIT` 消息携带 `boundary` 字段 |
| `packages/demo-ui/src/iframe-template.ts` | 修改 | 存储/使用/清理 `editBoundaries`；`constrainToContainer` 替换为 `constrainToBoundary`；`enter`/`exit`/message handler 适配 |

消费者变更：

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `packages/author-site/src/app/demo/[id]/edit/page.tsx` | 修改 | `handleEnterPositionEdit` 签名新增 `boundary` 参数 |
| `packages/demo-ui/src/ConfigForm.tsx` | 可能修改 | `onEnterPositionEdit` 类型定义可能需要同步，视具体类型定义方式而定 |

## 验证

### demo-ui

```bash
pnpm check:demo-ui
```

核心验证点：
1. `arePreviewPanelPropsEqual` 中 `boundary` 纳入比较（已在 `positionEditMode` 整体比较中覆盖）
2. 现有位置编辑测试全部通过（未改行为，boundary 缺省）

### author-site

```bash
pnpm check:author
```

核心验证点：
1. `handleEnterPositionEdit` 类型检查通过
2. 现有端到端测试通过

### 手动验证时序

1. 进入编辑模式，传入 boundary → iframe 收到 boundary 后拖拽受约束
2. 进入编辑模式，不传 boundary → 全容器拖拽（向后兼容）
3. 退出编辑模式 → 重新进入，boundary 正确重置

## 风险

- `iframe-template.ts` 已经约 2660 行，位置编辑脚本函数分散，后续需考虑拆分
- Padding 模式下 `containerRect` 每次 pointermove 都读取 `getBoundingClientRect()`，性能影响可忽略（拖拽事件频率约 60Hz，单次调用 <0.1ms）
