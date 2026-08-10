# HTML 原型页面可视化编辑增强方案

> 日期：2026-08-04
> 状态：最终设计
> 目标：实现对 HTML 原型页面和 React 高保真页面的 GrapesJS/Puck 级可视化编辑体验，编辑交互一致，保存路径不同

---

## 一、核心架构

### 1.1 编辑体验统一，持久化路径不同

```
┌──────────────────────────────────────────────────┐
│                 编辑交互层 (共用)                   │
│                                                    │
│  ├── 双击改文字：预览内 contenteditable            │
│  ├── 属性编辑栏：Figma 风格控件，两种页面共用 UI   │
│  ├── 变更日志：记录每次修改 { 属性, 旧值, 新值 }   │
│  └── 即时预览：Shadow DOM / iframe 直接应用变更    │
└──────────────┬───────────────────────────────────┘
               │
        ┌──────┴──────┐
        │             │
        ▼             ▼
┌───────────────┐  ┌──────────────────┐
| HTML 原型页    |  | React 高保真页   |
| 编辑期间：      |  | 编辑期间：       |
| 直接操作        |  | 直接操作        |
| Shadow DOM     |  | iframe DOM      |
| 保存时：        |  | 保存时：         |
| serializeShadow |  | captureChanges() |
| DomForSave()   |  | → VisualChangeSet |
| → 写回文件      |  | → 发送给 AI 实现 |
| 取消：          |  | 取消：           |
| 丢弃 Shadow DOM |  | 重新编译 iframe  |
└───────────────┘  └──────────────────┘
```

### 1.2 两种页面类型对比

| 环节 | HTML 原型页 | React 高保真页 |
|------|------------|---------------|
| 渲染方式 | Shadow DOM | 编译后 iframe |
| 编辑操作 | 直接操作 Shadow DOM | 直接操作 iframe DOM |
| 即时预览 | 直接修改 Shadow DOM 元素 | 直接修改 iframe DOM 元素 |
| 保存路径 | 序列化 Shadow DOM → 写回文件 | 捕获变更日志 → 发送给 AI |
| 取消编辑 | 丢弃 Shadow DOM 重新渲染 | 丢弃 iframe 重新编译渲染 |
| 属性面板 | 共用同一套 UI 组件 | 共用同一套 UI 组件 |
| 双击改文字 | 共用同一套逻辑 | 共用同一套逻辑 |

### 1.3 编辑流程

```
选中元素 → 预览高亮 + 属性栏展示当前属性
  → 用户改属性（或双击改文字）
  → 即时反映到预览（Shadow DOM / iframe 直接修改 style/textContent）
  → 记录变更到 ChangeLog
  → 用户点保存/发送
    - HTML：清理 Shadow DOM 编辑痕迹 → serialize → 写回 prototype.html
    - React：提取 ChangeLog → 组装 prompt → 发送 AI
```

---

## 二、操作一：双击改文字

### 2.1 交互

```
用户双击选中元素（无子元素）
  → 设置 contenteditable="plaintext-only"
  → 全选文本
  → 用户编辑
  → 按 Enter 或 blur → 移除 contenteditable
  → 写入 ChangeLog：{ type: "text", domPath, oldText, newText }
  → 标记 dirty

用户按 Esc → 恢复原始文本 → 不写入 ChangeLog
```

### 2.2 实现

纯 DOM 操作，不依赖 React，同时适用于 Shadow DOM 和 iframe：

```typescript
function startInlineTextEdit(
  element: Element,
  onFinish: (oldText: string, newText: string) => void,
): void {
  if (element.children.length > 0) return;

  const originalText = element.textContent ?? "";
  element.setAttribute("contenteditable", "plaintext-only");
  element.focus();

  const selection = window.getSelection();
  if (selection) {
    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  const finish = () => {
    element.removeAttribute("contenteditable");
    const newText = element.textContent?.trim() ?? "";
    if (newText && newText !== originalText) {
      onFinish(originalText, newText);
    }
  };

  element.addEventListener("blur", finish, { once: true });
  element.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      element.textContent = originalText;
      element.blur();
    } else if (e.key === "Enter") {
      e.preventDefault();
      element.blur();
    }
  });
}
```

---

## 三、操作二：属性编辑栏

### 3.1 控件体系

#### 颜色控件

```
┌─────────────────────────────────────┐
│ ● #2563EB  ┌─────────────────┐      │
│       明度   100% │████████████████│      │
│                └─────────────────┘      │
│  [最近使用] ● ● ● ● ● ● ● ● ● ●     │
│  [预设]     ● ● ● ● ● ● ● ● ● ●     │  ← 可折叠
└─────────────────────────────────────┘
```

- 色块展示当前颜色，点击展开取色器（非弹窗，inline 展开）
- Hex 输入框（自动补 `#`，大小写归一化）
- 明度滑块（100% = 纯色，0% = 黑色，用 `color-mix` 实现）
- 最近使用颜色列表（localStorage 存储，全局跨页面）
- 预设颜色：主题色、中性色、语义色
- 透明度支持：当 `rgba` 或 `opacity < 1` 时显示 alpha 通道

#### 数字控件（带拖拽微调）

```
┌──────┐
│  16  │ ◄── 鼠标左右拖拽微调
└──────┘ px
```

- 点击精确输入数字
- 左右拖拽数字标签微调（drag to scrub）
- 聚焦时键盘上下键 ±1，Shift+上下键 ±10
- 单位固定显示在输入框右侧（px、%、em 等）

#### 间距可视化图

```
┌──────────────────────┐
│       ↑ 12           │
│  ← 16 ┌──────┐ 16 → │
│        │ 内容  │      │
│       └──────┘       │
│       ↓ 12           │
└──────────────────────┘
```

- 四边各自独立输入
- 悬停高亮对应的边
- 中间的锁图标：锁定时四边同步
- 适用于 margin 和 padding

#### 布局控件

```
┌────┬────┬────┬────┐
│ 自 │ 横 │ 纵 │ 网 │  ← 分段按钮
└────┴────┴────┴────┘

横向排列时展示：
  ┌─────────────────┐
  │ 对齐:            │
  │ ┌─┬─┬─┐  垂直:  │  ← 九宫格 + 下拉
  │ ├─┼─┼─┤  [居中] │
  │ └─┴─┴─┘         │
  │ 间距: [12]        │
  └─────────────────┘
```

- 排列方式：自由/横向/纵向/网格（分段按钮）
- 对齐九宫格：点击切换水平 + 垂直对齐
- 间距 gap

#### 边框控件（渐进式展开）

```
无边框时：
  [ + 添加边框 ]

点击后展开：
  ┌─────────────────────┐
  │ 宽度: [1]  样式:[实线▾]│
  │ 颜色: ● #E5E7EB      │
  │ 圆角: [8]  ↖↗↘↙     │  ← 点击展开四角独立输入
  └─────────────────────┘
```

- 无边框时只显示添加按钮
- 点击后展开宽度、样式、颜色
- 圆角默认四角同步，点击展开独立四角

#### 阴影控件（渐进式展开）

```
无阴影时：
  [ + 添加阴影 ]

点击后展开：
  ┌─────────────────────┐
  │ X: [0]  Y: [4]      │
  │ 模糊: [6]  扩展: [0] │
  │ 颜色: ● rgba(0,0,0,.25)│
  │                     │
  │ [ + 添加多层阴影]    │
  └─────────────────────┘
```

- 无阴影时只显示添加按钮
- 点击后展开 X/Y 偏移、模糊、扩展、颜色
- 支持多层阴影

#### 排版控件

```
┌─────────────────────────────┐
│ 字体: [Inter          ▾]   │
│ 大小: [16]  字重: [600 ▾]  │
│ 行高: [24]  字距: [0]      │
│ 颜色: ● #111827            │
│ [左] [中] [右] [齐]         │  ← 分段按钮
└─────────────────────────────┘
```

- 一行两个相关属性，紧凑排版
- 字体选择器：常见系统字体列表
- 字重：下拉选择（300-900）
- 对齐方式：分段按钮带图标

### 3.2 面板布局

```
┌─────────────────────────┐
│ 选中: 按钮 "立即体验"    │ ← 顶部对象标识
│ [标签] [类名]     [隐藏] │ ← 快速操作
├─────────────────────────┤
│                         │
│ 🔍 快速搜索属性...       │ ← 搜索过滤（长面板时）
│                         │
│ ▸ 位置                  │
│  W: [120]  H: [48]      │ ← 一行两个
│  X: 100    Y: 200       │ ← 只读坐标
│                         │
│ ▸ 布局                  │
│  ┌────┬────┬────┬────┐  │
│  │ 自 │ 横 │ 纵 │ 网 │  │
│  └────┴────┴────┴────┘  │
│  [九宫格对齐]  [间距:12] │
│                         │
│ ▸ 外观                  │
│  不透明度:[100]% 圆角:[8]│
│                         │
│ ▸ 文本                  │
│  字体: [Inter ▾]        │
│  大小: [16] 字重: [600] │
│  行高: [24] 字距: [0]   │
│  颜色: ● #111827        │
│  [左] [中] [右] [齐]    │
│                         │
│ ▸ 背景 [+ 添加背景]      │
│  （无背景时不展开）       │
│                         │
│ ▸ 边框 [+ 添加边框]      │
│  （无边框时不展开）       │
│                         │
│ ▸ 阴影与模糊 [+ 添加]    │
│  （无阴影时不展开）       │
│                         │
│ ▸ 链接                  │
│  地址: [______________]  │
│                         │
│ ─────────────────────── │
│ 💬 修改说明:             │
│ [______________________] │
│                         │
│  [保存/发送给AI] (3处修改)│
└─────────────────────────┘
```

### 3.3 布局原则

| 原则 | 说明 |
|------|------|
| 高信息密度 | 一行放 2 个相关属性，减少纵向滚动 |
| 可折叠分组 | 每个分组标题可点击折叠，默认展开有值的 |
| 渐进式展开 | 背景/边框/阴影无值时只显示添加按钮，不占空间 |
| 顶部对象标识 | 显示选中元素名称、标签名、类名 |
| 搜索过滤 | 面板较长时快速定位属性 |
| 修改计数 | 底部按钮显示当前待保存修改数量 |

### 3.4 变更日志（ChangeLog）

```typescript
interface ChangeLogEntry {
  type: "text" | "style" | "attribute";
  domPath: string;
  nodeId: string;
  property: string;
  oldValue: string;
  newValue: string;
  timestamp: number;
}
```

每次属性修改或文字编辑时追加一条。保存时：
- **HTML 原型页**：无需 ChangeLog，直接序列化 Shadow DOM 完整状态
- **React 高保真页**：提取 ChangeLog 组装为结构化 prompt 发送给 AI

---

## 四、保存路径

### 4.1 HTML 原型页：序列化 DOM → 写回文件

```typescript
function serializeShadowDomForSave(shadowRoot: ShadowRoot): string {
  const root = shadowRoot.querySelector<HTMLElement>(".prototype-root");
  if (!root) return "";

  const clone = root.cloneNode(true) as HTMLElement;

  // 清理编辑痕迹
  clone.querySelectorAll<HTMLElement>(
    "[data-prototype-selected], [data-prototype-hovered], " +
    "[data-prototype-hidden], [contenteditable]",
  ).forEach((el) => {
    el.removeAttribute("data-prototype-selected");
    el.removeAttribute("data-prototype-hovered");
    el.removeAttribute("data-prototype-hidden");
    el.removeAttribute("contenteditable");
  });

  return clone.innerHTML.trim();
}
```

序列化保真度：

| 内容 | 是否受影响 |
|------|-----------|
| 普通 HTML 元素 | 完整保留 |
| `data-ow-id` | 完整保留 |
| `data-bind-*` | 完整保留 |
| 内联样式 | 完整保留 |
| 注释 `<!-- -->` | 保留 |
| `<script>` 等 | 已被 sanitize 移除 |
| 格式化（缩进、引号） | 浏览器标准化，接受差异 |

### 4.2 React 高保真页：变更日志 → 发送 AI

```typescript
interface VisualChangeSet {
  pageId: string;
  changes: ChangeLogEntry[];
  pageType: "high-fidelity-react";
  /** 编辑后的预览截图，辅助 AI 定位 */
  screenshot?: string;
  /** 用户提交时的补充说明 */
  userDescription?: string;
}
```

AI prompt 结构：

```
用户对页面进行了以下可视化编辑修改：

1. 文字修改：
   - 元素 "立即体验"（路径：div.button > span）：
     "立即体验" → "免费试用"

2. 样式修改：
   - 元素 "立即体验"（路径：div.button > span）：
     color: #111827 → #FFFFFF
     backgroundColor: transparent → #2563EB
   - 元素 "了解更多"（路径：div.button:nth-of-type(2)）：
     borderRadius: 4px → 8px

3. 结构修改：
   - 元素 "操作区"（路径：div.actions）：
     移动 "按钮2" 到 "按钮3" 之后

请修改页面源码实现以上变更，只修改涉及的组件，不改变其他内容。
```

---

## 五、分阶段实施

### Phase 1：双击改文字（1-2 天）

| 文件 | 改动 |
|------|------|
| `packages/demo-ui/src/PrototypePagePreview.tsx` | 新增 `dblclick` → `contenteditable` → 回调 |
| `packages/demo-ui/src/iframe-template.ts` (visualEditScript) | 新增 `dblclick` → `contenteditable` → `VISUAL_INLINE_EDIT` |
| `packages/author-site/src/app/demo/[id]/edit/page.tsx` | 处理 `VISUAL_INLINE_EDIT`，写入 ChangeLog |

### Phase 2：属性编辑栏重写（3-5 天）

| 文件 | 改动 |
|------|------|
| `packages/author-site/src/app/demo/[id]/edit/components/VisualPropertyPanel.tsx` | 全面重写控件库和布局 |
| `packages/author-site/src/components/ui/color-picker.tsx` | 新建颜色控件 |
| `packages/author-site/src/components/ui/number-scrub.tsx` | 新建带拖拽微调的数字控件 |
| `packages/author-site/src/components/ui/spacing-diagram.tsx` | 新建间距可视化控件 |
| `packages/author-site/src/components/ui/layout-control.tsx` | 新建布局控件 |

### Phase 3：React 高保真页集成（2-3 天）

| 文件 | 改动 |
|------|------|
| `packages/demo-ui/src/iframe-template.ts` (visualEditScript) | 新增 ChangeLog 记录 |
| `packages/author-site/src/app/demo/[id]/edit/page.tsx` | 提取 ChangeLog → 发送 AI |
| `packages/author-site/src/lib/agent/prompts/visual-change-prompt.ts` | 组装变更 prompt |

### Phase 4：HTML 原型页保存（1-2 天）

| 文件 | 改动 |
|------|------|
| `packages/shared/src/demo/serialize-prototype.ts` | 新建，序列化 Shadow DOM |
| `packages/author-site/src/app/demo/[id]/edit/page.tsx` | 保存时调用 serialize → 写回 |

---

## 六、边界与约束

| 约束 | 说明 |
|------|------|
| 预览内拖拽 | 不实现。结构编辑通过图层树完成，当前阶段不纳入 |
| React 页的 DOM 操作不持久 | 编辑只在 iframe 中可见，刷新后丢失，必须通过 AI 落地 |
| 序列化格式化差异 | 浏览器 `innerHTML` 会标准化属性顺序和引号，不影响功能 |
| `data-*` 属性 | 所有 `data-ow-id`、`data-bind-*` 在序列化中完整保留 |
| 幽灵元素 | 不需要，因为没有预览内拖拽 |

---

## 七、验证方式

```bash
# 包级验证
pnpm check:author
pnpm check:demo-ui
pnpm check:shared

# 跨包验证
pnpm typecheck
```

| 阶段 | 验证 |
|------|------|
| Phase 1 | 双击文本 → 编辑 → blur → 检查 ChangeLog 和预览更新 |
| Phase 2 | 选中元素 → 属性栏展示 → 修改 → 检查预览即时反映 |
| Phase 3 | React 页编辑 → 发送 AI → 检查 prompt 结构完整 |
| Phase 4 | HTML 页编辑 → 保存 → 检查 prototype.html 内容正确 |

---

## 八、相关文档

- [可视化批注与编辑机制](../项目文档/创作端/04-配置与预览/技术/06_可视化批注与编辑机制.md)
- [实时预览机制](../项目文档/创作端/04-配置与预览/技术/02_实时预览机制.md)
- `packages/demo-ui/src/PrototypePagePreview.tsx`
- `packages/demo-ui/src/PreviewPanel.tsx`
- `packages/demo-ui/src/iframe-template.ts`
- `packages/author-site/src/app/demo/[id]/edit/components/VisualPropertyPanel.tsx`
- `packages/author-site/src/lib/prototype-visual-editor.ts`