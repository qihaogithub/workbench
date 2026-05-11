---
covers:
  - packages/plugin-ui/src/PluginUI.tsx
  - packages/plugin-ui/src/components/Preview.tsx
  - packages/plugin-ui/src/components/PreviewToolbar.tsx
  - packages/plugin-ui/src/components/TaggingPanel.tsx
  - packages/plugin-ui/src/components/SelectionEmptyState.tsx
  - packages/plugin-ui/src/components/Loading.tsx
  - packages/plugin-ui/src/components/CopyButton.tsx
  - packages/plugin-ui/src/components/SelectableToggle.tsx
  - packages/plugin-ui/src/components/CustomPrefixInput.tsx
  - packages/plugin-ui/src/components/ExpandIcon.tsx
  - packages/plugin-ui/src/components/Modal.tsx
  - packages/plugin-ui/src/components/TailwindSettings.tsx
  - packages/plugin-ui/src/lib/designerSuggestions.ts
  - packages/plugin-ui/src/codegenPreferenceOptions.ts
---

# UI 组件与交互

> 插件前端界面实现，基于 React + Tailwind CSS

---

## 界面架构

插件 UI 采用**标签页导航**设计，包含两个核心视图：

```
┌─────────────────────────────────────────────────┐
│  [预览]  [更多]                                   │  ← Tab 导航栏
├─────────────────────────────────────────────────┤
│                                                 │
│              内容区域                            │
│        (根据选中 Tab 切换)                       │
│                                                 │
└─────────────────────────────────────────────────┘
```

- **预览页**：包含代码预览区域、底部工具栏（标记操作、导出功能）
- **更多页**：包含优化建议、高级设置（代码格式、样式细项、Tailwind 配置）

---

## 核心组件

### PluginUI - 主容器

`PluginUI.tsx` 是整个插件 UI 的入口组件，负责：

- **Tab 状态管理**：管理当前激活的标签页 (`preview` | `tagging`)
- **预览锁定**：支持锁定当前预览，锁定后文档变化会自动触发重转换
- **数据分发**：接收来自 Figma 主线程的代码、预览、警告信息
- **主题适配**：支持深色/浅色模式切换

**Props 接口**：
```typescript
type PluginUIProps = {
  code: string;                    // 生成的代码
  htmlPreview: HTMLPreview;        // HTML 预览数据
  warnings: Warning[];             // 警告信息
  selectedFramework: Framework;    // 选中的框架
  setSelectedFramework: (f) => void;
  settings: PluginSettings | null; // 插件设置
  onPreferenceChanged: (key, value) => void;
  isLoading: boolean;              // 加载状态
  onCopyRequest?: () => Promise<string>;
  onExportHTMLRequest?: () => Promise<string>;
};
```

### 预览面板 (Preview)

实时展示生成的 HTML 效果，支持：

- **自适应缩放**：根据容器尺寸自动计算合适的缩放比例
- **背景切换**：支持白/黑背景切换，检验设计在不同背景下的表现
- **预览锁定**：点击锁定按钮可固定当前预览，文档变化时自动更新
- **图层名称显示**：底部状态栏显示当前选中图层名称

### 底部工具栏 (PreviewToolbar)

固定在预览页底部的操作栏，提供：

- **切图标记**：一键将图层标记为 `#static`
- **配置项标记**：支持 `#slot` 资源标记（图片、文本、视频、Lottie、Svga、Unity、色值）
- **动态布局标记**：支持 `#list` 纵向/横向列表、`#canvas` 自由画布
- **提示词**：添加 AI 指令注释
- **导出功能**：支持 JSX / HTML 格式切换，可复制到剪贴板或下载为文件
- **互斥检测**：配置项和动态布局不能同时存在，切换时弹出确认对话框

### 更多面板 (TaggingPanel)

详见 [标记系统](./标记系统.md) 文档。

### 设置面板 (TailwindSettings)

配置代码生成的各项参数：

```
┌─────────────────────────────┐
│ 代码生成设置                 │
├─────────────────────────────┤
│ ☐ Tailwind 4 模式            │
│ ☐ 显示图层名称               │
│ ☐ 嵌入图片 (Base64)          │
│ ☐ 嵌入矢量图                 │
│ ☐ 自动上传图片               │
├─────────────────────────────┤
│ 代码格式                     │
├─────────────────────────────┤
│ [React (JSX)] [HTML]         │
├─────────────────────────────┤
│ 自定义前缀                   │
│ [____________]               │
└─────────────────────────────┘
```

---

## 组件清单

| 组件 | 文件 | 功能 |
|------|------|------|
| `PluginUI` | `PluginUI.tsx` | 主容器，Tab 导航，预览锁定管理 |
| `Preview` | `components/Preview.tsx` | 代码预览，自适应缩放，背景切换 |
| `PreviewToolbar` | `components/PreviewToolbar.tsx` | 底部工具栏，标记操作，导出功能 |
| `TaggingPanel` | `components/TaggingPanel.tsx` | 优化建议，高级设置 |
| `TailwindSettings` | `components/TailwindSettings.tsx` | Tailwind 专属设置面板 |
| `Loading` | `components/Loading.tsx` | 加载动画 |
| `CopyButton` | `components/CopyButton.tsx` | 复制按钮 |
| `SelectionEmptyState` | `components/SelectionEmptyState.tsx` | 空状态提示 |
| `SelectableToggle` | `components/SelectableToggle.tsx` | 带帮助提示的开关组件 |
| `CustomPrefixInput` | `components/CustomPrefixInput.tsx` | 自定义前缀输入（带实时预览） |
| `ExpandIcon` | `components/ExpandIcon.tsx` | 展开/折叠图标 |
| `Modal` | `components/Modal.tsx` | 通用弹窗和确认对话框 |

---

## 状态管理

插件 UI 采用**本地状态管理**（React useState），主要状态：

```typescript
// PluginUI 级别状态
const [activeTab, setActiveTab] = useState<'preview' | 'tagging'>('preview');
const [previewBgColor, setPreviewBgColor] = useState<'white' | 'black'>('black');
const [isPreviewLocked, setIsPreviewLocked] = useState(false);
const [lockedHtmlPreview, setLockedHtmlPreview] = useState<HTMLPreview | null>(null);
const [lockedNodeId, setLockedNodeId] = useState<string | null>(null);

// PreviewToolbar 级别状态
const [slotType, setSlotType] = useState('img');
const [slotId, setSlotId] = useState('');
const [listId, setListId] = useState('');
const [aiInstruction, setAiInstruction] = useState('');
const [isStatic, setIsStatic] = useState(false);
const [currentTagType, setCurrentTagType] = useState('');
const [autoLayoutMode, setAutoLayoutMode] = useState('NONE');

// TaggingPanel 级别状态
const [checkWarnings, setCheckWarnings] = useState<Warning[]>([]);
const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
```

**状态流向**：
```
Figma 主线程
    │ postMessage
    ▼
PluginUI (接收数据)
    │ props
    ▼
子组件 (展示/交互)
    │ postMessage
    ▼
Figma 主线程 (执行操作)
```

### 预览锁定机制

预览锁定是 PluginUI 的核心功能之一：

1. **锁定**：用户点击锁定按钮后，当前预览内容被固定
2. **文档变化监听**：锁定状态下，Figma 文档变化会触发 `document-changed` 消息
3. **节流重转换**：500ms 内不重复触发，通过 `reconvert-node` 消息请求主线程重新生成
4. **更新预览**：主线程返回 `locked-preview-update` 消息后更新锁定预览内容

---

## 样式系统

基于 Tailwind CSS，支持深色模式：

```css
/* 深色模式自动适配 */
.dark .bg-card { background-color: #1a1a1a; }
.dark .text-white { color: #ffffff; }
```

**设计令牌**：
- `bg-primary` - 主色调背景
- `text-primary-foreground` - 主色调文字
- `border-border` - 边框颜色
- `rounded-lg` - 圆角大小
