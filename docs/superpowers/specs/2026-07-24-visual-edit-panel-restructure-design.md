# 创作端可视化编辑面板重构设计

> 日期：2026-07-24
> 状态：设计已确认，待编写实现计划
> 范围：`packages/author-site` 项目编辑页单页面模式（普通 HTML/CSS/原型页）

## 1. 目标

重构项目编辑页单页面模式下的可视化编辑面板交互：

- 右侧栏默认展示编辑栏（`VisualPropertyPanel`），编辑栏与配置栏（`PageConfigPanel`）通过顶部 tab 切换
- 图层栏（`LayerTreeMenu`）从左侧栏 overlay 改为预览区右键上下文菜单
- "选择"按钮从预览区头部移至 AI 对话区底部工具栏，功能改为"点击元素后插入 AI 对话输入框"
- 编辑模式始终开启，元素选择能力不再需要手动切换
- 待保存操作栏（`VisualDraftActionBar`）从预览区头部移至编辑栏底部固定

## 2. 范围

### 受影响

- `packages/author-site/src/app/demo/[id]/edit/page.tsx` — 主编辑页布局与状态
- `packages/author-site/src/app/demo/[id]/edit/components/VisualPropertyPanel.tsx` — 编辑栏组件（新增空状态和底部操作栏）
- `packages/author-site/src/app/demo/[id]/edit/components/VisualDraftActionBar.tsx` — 操作栏组件（位置变更）
- `packages/author-site/src/app/demo/[id]/edit/hooks/useVisualEditState.ts` — 可视化编辑状态 hook
- `packages/demo-ui/src/PreviewPanel.tsx` — 预览面板（右键图层菜单增强）
- `packages/ai-chat-shared/src/chat/chat-input.tsx` — AI 对话输入区（新增"选择"按钮）
- `packages/ai-chat-shared/src/ai-chat.tsx` — AI 对话组件（新增 props 透传）

### 不受影响

- 草图页（sketch-scene）— 保持现有 `SketchEditorEngine` 交互不变
- 画布模式（`previewMode === "canvas"`）— 布局和行为完全不变
- 左侧栏 tab 内容（AI/页面/文件/版本）— 不变，仅移除图层 overlay
- `PageConfigPanel` 组件本身 — 不变，仅外层包裹 tab

## 3. 架构与布局变更

### 当前布局

```
ResizablePanelGroup (horizontal)
├── Left Panel
│   ├── Tabs: ai | pages | code | history
│   └── [layerDrawerMounted] → absolute overlay z-20 → LayerTreeMenu
├── Middle Panel (preview)
│   └── Header: 单页/画布 toggle + 选择(MousePointer2) button / VisualDraftActionBar
└── [isConfigPanelVisible] Right Panel
    └── PageConfigPanel
        └── [visualPropertyDrawerMounted] → absolute overlay z-20 → VisualPropertyPanel
```

### 新布局（单页面模式，普通页）

```
ResizablePanelGroup (horizontal)
├── Left Panel [不变]
│   └── [图层 overlay 移除]
├── Middle Panel (preview)
│   └── Header: 单页/画布 toggle [选择按钮和操作栏移除]
│       └── PreviewPanel (visualEditMode 始终开启，非查看文档时)
│           └── 右键 → 完整 LayerTreeMenu 上下文菜单
└── [isConfigPanelVisible] Right Panel
    └── Tabs: 编辑 (默认) | 配置
        ├── TabsContent "编辑" → VisualPropertyPanel
        │   ├── [空状态: "点击预览区元素查看属性" 引导提示]
        │   └── [底部固定: VisualDraftActionBar (有待保存修改时)]
        └── TabsContent "配置" → PageConfigPanel
```

### 结构变更清单

| 变更 | 位置 | 说明 |
|------|------|------|
| 移除 VisualPropertyPanel overlay | page.tsx ~L7542 | 不再作为 absolute overlay，改为 tab 内容直接渲染 |
| 移除 LayerTreeMenu overlay | page.tsx ~L6882 | 左侧栏图层 overlay 完全移除 |
| 新增右栏 Tabs | page.tsx 右 panel 内 | shadcn Tabs，编辑(默认)/配置 |
| 移除预览区选择按钮 | page.tsx ~L7158 | MousePointer2 按钮从预览区头部移除 |
| 移除预览区操作栏 | page.tsx ~L7116 | VisualDraftActionBar 从预览区头部移除 |
| 新增 AI 工具栏选择按钮 | chat-input.tsx PromptInputTools | MousePointer2 按钮，切换"选中+插入AI"模式 |
| 编辑栏底部操作栏 | VisualPropertyPanel.tsx | VisualDraftActionBar 固定在编辑栏底部 |

## 4. 右栏 Tab 系统

### 新增状态

| 状态 | 类型 | 默认值 | 位置 | 用途 |
|------|------|--------|------|------|
| `rightPanelTab` | `"edit" \| "config"` | `"edit"` | page.tsx | 控制右栏活动 tab |

### Tab 行为

- 使用 shadcn `Tabs` 组件（与左侧栏现有 tab 模式一致）
- 用户可随时自由切换编辑/配置 tab
- 切换 tab **不清除**待保存的属性修改、**不取消**当前选中元素
- 选中元素时**不自动切换**到编辑 tab（编辑已是默认，用户自主控制）
- 切换页面或切换到画布模式时，`rightPanelTab` 重置为 `"edit"`

### 编辑 tab 空状态

未选中任何元素时，编辑 tab 显示引导提示：

```
[图标: MousePointer2]
点击预览区元素查看属性
```

居中显示，使用 `text-muted-foreground` 样式。

### 配置 tab

`PageConfigPanel` 原样渲染，保持现有 `hideDetailHeader` 逻辑。配置 tab 内容不因本次改动而变化。

## 5. 状态变更

### 移除的状态

| 状态 | 原位置 | 原用途 | 移除原因 |
|------|--------|--------|----------|
| `visualPropertyDrawerOpen` | page.tsx L1631 | 切换编辑栏 overlay | 编辑模式始终开启 |
| `visualPropertyDrawerMounted` | page.tsx L1633 | 编辑栏 mount/unmount 动画 | 无 overlay 无需动画 |
| `visualLayerTreeOpen` | page.tsx L2548 | 切换图层栏 overlay | 图层栏改为右键菜单 |
| `visualLayerDrawerMounted` | page.tsx L2549 | 图层栏 mount/unmount 动画 | 同上 |

### 移除/简化的派生值

| 派生值 | 原位置 | 替代方案 |
|--------|--------|----------|
| `propertyPanelActive` | page.tsx L2559 | 替换为 `previewMode === "single"` |
| `visualLayerDrawerActive` | page.tsx L5332 | 移除，普通页不再有图层 overlay |
| `layerDrawerMounted` | page.tsx L5348 | 简化为 `sketchLayerDrawerActive`（仅草图页保留 overlay） |
| `layerDrawerActive` | page.tsx L5351 | 简化为 `sketchLayerDrawerActive` |

### 保留不变的状态

- `visualLayerTreeRequestKey` — 仍需触发 iframe 节点树收集，但触发时机改为页面加载/切换时自动递增
- `visualLayerTreeNodes` — 节点树数据，仍通过 postMessage 填充，供右键菜单使用
- `selectedVisualNode`、`visualNodeStack`、`visualPanelHoverNodeId` — 选择状态，不变
- `visualPropertyChanges`、`visualConfigMarks` — 待保存修改，不变
- `visualAnnotationMode`、`visualAnnotations`、`visualPatches` — 标注和内联编辑，不变

### 移除的 handler

| Handler | 原位置 | 替代方案 |
|---------|--------|----------|
| `handleOpenVisualEditMode` | page.tsx L5379 | 移除，编辑模式始终开启 |
| `handleCloseVisualEditMode` | page.tsx L5386 | 移除，不再需要关闭编辑模式 |

### 新增状态

| 状态 | 类型 | 默认值 | 位置 | 用途 |
|------|------|--------|------|------|
| `rightPanelTab` | `"edit" \| "config"` | `"edit"` | page.tsx | 右栏活动 tab |
| `aiPickerActive` | `boolean` | `false` | page.tsx | "选择"按钮激活状态（选中+插入AI模式） |
| `chatInputInsert` | `string \| null` | `null` | page.tsx | 待插入 AI 输入框的文本 |

### 节点树收集触发

编辑模式始终开启后，`visualLayerTreeRequestKey` 在以下时机递增：
- 活动页面变化（现有 effect 保留）
- 预览 iframe 加载完成

这确保右键菜单始终有完整节点树数据可用。

## 6. 图层栏 → 右键上下文菜单

### 现有机制

`PreviewPanel.tsx` 已有右键图层选择器：
- iframe 内 `contextmenu` 事件触发，发送 `VISUAL_SELECT` 消息（`openLayerPicker: true`，`contextMenuPoint`）
- `PreviewPanel` 处理消息，通过 `getVisualContextMenuPosition` 计算位置
- 在点击位置渲染 `LayerTreeMenu`（标题"预览区图层"），`z-30`
- 当前显示的是右键元素子树（`buildVisualNodeTree`），非完整页面树

### 增强方案

将右键菜单从"显示右键元素子树"改为"显示完整页面节点树"：

- 右键菜单数据源从 iframe 返回的 `nodeTree` 改为使用 `visualLayerTreeNodes`（完整页面树）
- 如果 `visualLayerTreeNodes` 为空（尚未收集），回退到 iframe 返回的子树
- 菜单位置仍用 `getVisualContextMenuPosition` 计算，保持在视口内
- 菜单样式增加 `max-height`（如 `320px`）和 `overflow-y: auto`，支持长树滚动
- 选中节点：调用 `onVisualSelect` + `onVisualSelectStack`，关闭菜单，同步 iframe 编辑状态
- 关闭菜单：外部点击、Escape 键、选中节点后自动关闭

### 移除的左侧 overlay（普通页）

- 移除 page.tsx ~L6882 overlay 中 `LayerTreeMenu`（普通页）的渲染分支
- **保留** overlay div 本身和 `SketchEditorEngineLayerPanel`（草图页）的渲染分支
- `layerDrawerMounted` 简化为 `sketchLayerDrawerActive`，仅草图页激活时 overlay 可见
- 草图页的图层面板行为完全不变

## 7. "选择"按钮 → AI 对话工具栏

### 按钮位置

`packages/ai-chat-shared/src/chat/chat-input.tsx` 的 `PromptInputTools` 区域（~L345-377），在 `PromptInputAddMenu` 和 `ModelSelectWithGuard` 之间新增"选择"按钮：

```tsx
<PromptInputTools>
  <PromptInputAddMenu ... />
  {onTogglePicker && (
    <Button
      variant={pickerActive ? "default" : "ghost"}
      size="icon"
      onClick={onTogglePicker}
      title="选择页面元素插入对话"
    >
      <MousePointer2 className="h-4 w-4" />
    </Button>
  )}
  {supportsHistory && (...)}
  <ModelSelectWithGuard ... />
</PromptInputTools>
```

### 新增 props

`ChatInputProps`（chat-input.tsx ~L206）新增：
- `pickerActive?: boolean` — "选择"按钮是否激活
- `onTogglePicker?: () => void` — 切换"选择"模式

`AIChatProps`（ai-chat.tsx ~L100）新增同名 props，透传给 `ChatInput`。

`page.tsx` 中 `<AIChat>` 渲染处（~L6239）传入 `pickerActive={aiPickerActive}` 和 `onTogglePicker` 回调。

### 交互流程

1. 用户点击 AI 工具栏"选择"按钮 → `aiPickerActive` 切换为 `true`，按钮高亮
2. 用户点击预览区元素 → 同时执行：
   - 选中元素到编辑栏（现有 `handleVisualSelect` 逻辑）
   - 将元素引用文本插入 AI 对话输入框（新增机制）
3. 插入后 `aiPickerActive` 保持 `true`（可持续选择多个元素），用户可再次点击按钮退出

### 元素引用插入机制

不同于 `handleSendSelectionToAI`（直接 `setTriggerAutoSend` 自动发送），"选择"按钮插入到输入框供用户编辑后手动发送：

- 新增 `chatInputInsert` 状态（`string | null`）
- 点击元素时，构建元素引用文本（复用 `handleSendSelectionToAI` 的格式化逻辑，提取为独立函数 `buildVisualSelectionPrompt`）
- 设置 `chatInputInsert` 为引用文本
- `AIChat` 组件新增 `chatInputInsert` prop，通过 `useEffect` 将文本追加到输入框末尾（不覆盖已有内容），然后清除 `chatInputInsert`
- 用户可在输入框中编辑引用文本、添加更多上下文，然后手动发送

### 元素引用格式

复用 `handleSendSelectionToAI`（useVisualEditState.ts L1490-1507）的格式化逻辑，提取为 `buildVisualSelectionPrompt(node, projectId)`：

```
请只针对当前可视化选区提出修改建议，不要静默扩大范围。

【当前选区】
- 元素：<${node.tagName}>
- DOM 路径：${node.domPath}
- className：${node.className || "无"}
- 文本：${node.textContent || "无"}
- 页面文件：demos/${projectId}/index.tsx

请给出可审阅的局部修改建议；如果必须修改选区外代码，请明确说明影响范围。
```

### 预览区点击处理

`PreviewPanel` 的 `onVisualSelect` 回调在 `page.tsx` 中需要修改：
- 始终执行元素选中（显示到编辑栏）
- 当 `aiPickerActive` 为 `true` 时，额外执行元素引用插入

## 8. VisualDraftActionBar 重新定位

### 当前

`VisualDraftActionBar` 在预览区头部替换"选择"按钮显示（page.tsx ~L7116），当 `visualPropertyChanges.length > 0` 时可见。

### 新位置

固定在 `VisualPropertyPanel` 底部：

- `VisualPropertyPanel` 组件底部增加固定区域
- 当 `visualPropertyChanges.length > 0` 时渲染 `VisualDraftActionBar`
- 操作栏内容不变："N 项修改" + 保存 / 发送给AI / 取消
- "发送给AI" 调用 `handleSendVisualPropertiesToAI`，切换左侧栏到 AI tab（现有行为）
- "保存" 调用直接写入逻辑（现有行为）
- "取消" 调用 `handleClearVisualProperties`（现有行为）

### 实现方式

`VisualPropertyPanel` 新增 props：
- `pendingChangeCount?: number` — 待保存修改数
- `onSaveChanges?: () => void` — 保存回调
- `onSendToAI?: () => void` — 发送给 AI 回调
- `onDiscardChanges?: () => void` — 取消回调

在属性编辑内容区域下方渲染固定底栏，仅当 `pendingChangeCount > 0` 时可见。

## 9. 预览区头部变更

### 移除

- "选择"（MousePointer2）按钮（page.tsx ~L7158）
- `VisualDraftActionBar`（page.tsx ~L7116）

### 保留

- "单页/画布"切换按钮
- 页面标题/名称显示
- 其他现有头部元素（如预览尺寸、刷新等）

### `visualEditMode` 传参

`PreviewPanel` 的 `visualEditMode` prop 改为 `previewMode === "single" && !singlePreviewViewingDocument`（普通页），不再由按钮切换控制。查看文档时元素选择关闭。草图页保持现有逻辑。

## 10. 边缘情况与错误处理

| 场景 | 处理 |
|------|------|
| 切换单页 → 画布模式 | `rightPanelTab` 重置为 `"edit"`，清除可视化选择，`aiPickerActive` 重置为 `false` |
| 切换页面 | `rightPanelTab` 重置为 `"edit"`，清除可视化选择（现有行为） |
| 查看文档（`singlePreviewViewingDocument`） | 右栏隐藏（`isConfigPanelVisible` 为 `false`），与现有行为一致 |
| 草图页（sketch-scene） | 完全不受影响，保持 `SketchEditorEngine` 交互 |
| 待保存修改时切换 tab | 不清除修改，操作栏仅在编辑 tab 可见 |
| 待保存修改时切换页面 | 现有确认逻辑保留（`hasPendingVisualPropertyWork` 检查） |
| 右键菜单已打开时再次右键 | 新右键位置替换旧菜单 |
| `visualLayerTreeNodes` 为空时右键 | 回退到 iframe 返回的子树数据 |
| `aiPickerActive` 时切换页面 | `aiPickerActive` 重置为 `false`，清除选择 |
| AI 对话输入框已有内容时插入 | 追加到末尾（换行分隔），不覆盖已有内容 |

## 11. 测试与验证

### 类型检查

```bash
pnpm check:author
```

### 单元测试

```bash
pnpm --filter @workbench/author-site test -- --testPathPattern="visual-edit"
```

补充测试用例：
- 右栏 tab 切换不清除待保存修改
- 编辑栏空状态渲染
- `buildVisualSelectionPrompt` 格式化输出
- `aiPickerActive` 状态切换

### E2E 测试

```bash
pnpm test:e2e -- edit-page-regression.spec.ts
```

补充 E2E 用例：
- 单页面模式右栏默认显示编辑 tab
- tab 切换编辑 ↔ 配置
- 右键预览区弹出完整图层菜单
- AI 工具栏"选择"按钮切换激活态
- 激活时点击元素插入 AI 输入框
- 编辑栏底部操作栏显示和操作

### 手动验证

- 草图页编辑不受影响
- 画布模式不受影响
- 左侧栏 tab（AI/页面/文件/版本）正常工作
- 预览区元素选中 → 编辑栏属性显示
- 右键菜单节点选中 → 编辑栏同步
- 待保存修改 → 保存/发送给AI/取消功能正常

## 12. 实现顺序

1. **状态变更**：在 page.tsx 中新增 `rightPanelTab`、`aiPickerActive`、`chatInputInsert` 状态，移除旧 overlay 状态和 handler
2. **右栏 tab 布局**：替换右 panel 内容为 Tabs + 条件渲染，移除 VisualPropertyPanel overlay
3. **编辑栏空状态**：在 VisualPropertyPanel 中新增空状态渲染
4. **移除左侧图层 overlay**：移除 page.tsx 中的 layerDrawerMounted overlay
5. **右键图层菜单增强**：修改 PreviewPanel 右键菜单数据源为完整节点树
6. **预览区头部清理**：移除"选择"按钮和 VisualDraftActionBar
7. **编辑栏底部操作栏**：在 VisualPropertyPanel 底部新增 VisualDraftActionBar
8. **AI 工具栏"选择"按钮**：在 chat-input.tsx 新增按钮，透传 props
9. **元素引用插入机制**：提取 `buildVisualSelectionPrompt`，实现 `chatInputInsert` 插入逻辑
10. **预览区点击处理**：修改 `onVisualSelect` 回调，`aiPickerActive` 时额外插入
11. **边缘情况处理**：页面切换/模式切换时重置状态
12. **验证**：类型检查 + 单元测试 + E2E + 手动验证
