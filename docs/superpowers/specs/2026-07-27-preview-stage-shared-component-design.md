# PreviewStage 共享预览区组件设计

## 背景与目标

创作端（author-site）和浏览端（viewer-site）各自独立维护了中央预览面板的渲染逻辑，包括模式切换、runtime 组件选择分发、previewSize 推导、滚动/缩放处理等。这导致同一预览 bug 需要在两处修复（如 2026-07-27 发现的滚动条和尺寸差异问题）。

**目标：** 将整个中央预览面板提取为 `demo-ui` 中的 `PreviewStage` 共享组件，确保两端渲染输出和容器行为完全一致，以后预览渲染 bug 只需改一处。

**范围：** 仅包含预览区本身（模式切换栏 + 单页渲染 + 画布渲染），不包含左栏（页面树/AI 对话）和右栏（配置面板/属性面板）。

---

## 组件拆分

```
PreviewStage                          # 顶层容器，props 驱动
│
├── PreviewStageToolbar               # 模式切换栏
│   ├── ModeToggle ( [单页] [画布] )
│   └── PageSelector (单页模式下的下拉选页)
│
├── SinglePagePreview                 # 单页模式渲染
│   └── RuntimeDispatch               # 按 runtime 类型分发组件
│       ├── IframePreviewFrame        # 已有，保持不变
│       ├── PrototypePagePreview      # 已有，保持不变
│       ├── SketchPagePreview         # 已有，保持不变
│       └── PreviewPanel              # 已有，需调整接口以支持 PageSource
│
└── CanvasPreview                     # 画布模式渲染
    └── PreviewCanvas                 # 已有，interactionMode 由 props 控制
```

### 新增组件

| 组件 | 来源 | 说明 |
|------|------|------|
| `PreviewStage` | 新建 | 顶层容器，组合 Toolbar + SinglePage/Canvas 渲染 |
| `PreviewStageToolbar` | 从 `page.tsx` 和 `ViewerApp.tsx` 内联逻辑提取 | 模式切换 + 页面选择器 |
| `SinglePagePreview` | 从 `page.tsx` 和 `ViewerApp.tsx` 内联逻辑提取 | 单页模式下 runtime 分发 + 滚动容器 + 交互注入 |
| `RuntimeDispatch` | 新建内部组件 | 统一 iframe/prototype/sketch/compiled 选择逻辑 |

### 已有组件调整

| 组件 | 调整 |
|------|------|
| `PreviewPanel` | props 从 `{code?, compiledJsUrl?}` 改为 `{source: PageSource \| PageSource[]}` |
| `IframePreviewFrame` | 保持不变 |
| `PrototypePagePreview` | 保持不变 |
| `PreviewCanvas` | 保持不变 |

---

## Props 设计

```typescript
interface PreviewStageProps {
  // ─── 数据 ───
  pages: PagePreviewData[];
  activePageId: string;
  onActivePageChange: (id: string) => void;
  previewMode: "single" | "canvas";
  onPreviewModeChange: (mode: "single" | "canvas") => void;

  // ─── 画布状态 ───
  canvasState: CanvasState;
  onCanvasStateChange: (state: CanvasState) => void;

  // ─── 交互模式 ───
  interactionMode: "editor" | "viewer";

  // ─── 创作端专有（可选） ───
  visualEditing?: VisualEditingConfig;
  canvasEditing?: CanvasEditingConfig;

  // ─── 配置面板联动 ───
  onPageConfigEdit?: (pageId: string) => void;

  // ─── 容器样式覆盖（可选） ───
  className?: string;
}

interface VisualEditingConfig {
  editMode: VisualEditMode;
  hoverNodeId?: string | null;
  onNodeSelect?: (nodeId: string | null) => void;
  onPropertyChange?: (changes: VisualChanges) => void;
}

interface CanvasEditingConfig {
  sessionId?: string;
  screenshotUrls?: Record<string, string>;
  knowledgeDocuments?: KnowledgeDocument[];
  onRequestDeletePages?: (pageIds: string[]) => void;
  onRequestPastePages?: (pageIds: string[], targetGroupId?: string) => void;
  onCreateKnowledgeDocument?: (doc: KnowledgeDocument) => void;
  onConsoleEntry?: (entry: ConsoleEntry) => void;
  onError?: (error: Error) => void;
}
```

### PagePreviewData 类型

```typescript
interface PagePreviewData {
  id: string;
  title: string;
  source: PageSource;
  previewSize?: PreviewSize;
  prototypeMeta?: { previewSize?: { width: number; height: number } };
  configData?: Record<string, unknown>;
}
```

### PageSource 统一数据源

```typescript
type PageSource =
  | { type: "iframe-html"; url: string }
  | { type: "prototype-html-css"; html: string; css: string }
  | { type: "sketch-scene"; scene: SketchScene }
  | { type: "compiled-js"; code?: string; compiledUrl?: string };
```

- 创作端传 `{ type: "compiled-js", code: page.code }`
- 浏览端传 `{ type: "compiled-js", compiledUrl: cdnUrl }`
- `PreviewPanel` 内部根据 `code` 或 `compiledUrl` 决定渲染路径

---

## 数据流

### previewSize 推导（统一 4 级 fallback）

```
page.schema → page.previewSize → page.prototypeMeta.previewSize → undefined
```

该逻辑内聚在 `SinglePagePreview` 内部，两端不再各自维护推导逻辑。

### Shell 模板统一

使用 `iframe-template.ts` 动态生成 iframe Shell（创作端和浏览端统一），移除浏览端对静态 `iframe.html` 文件的依赖。

### 两端调用方式

**创作端：**
```tsx
<PreviewStage
  pages={demoPages.map(p => ({
    id: p.id, title: p.title,
    source: { type: "compiled-js", code: p.code },
    previewSize: p.previewSize,
    prototypeMeta: p.prototypeMeta,
    configData: p.configData,
  }))}
  activePageId={activePageId}
  onActivePageChange={setActivePageId}
  previewMode={previewMode}
  onPreviewModeChange={setPreviewMode}
  canvasState={canvasState}
  onCanvasStateChange={setCanvasState}
  interactionMode="editor"
  visualEditing={{ editMode, hoverNodeId, onNodeSelect, onPropertyChange }}
  canvasEditing={{ sessionId, screenshotUrls, onRequestDeletePages, ... }}
  onPageConfigEdit={handleConfigEdit}
/>
```

**浏览端：**
```tsx
<PreviewStage
  pages={project.demoPages.map(p => ({
    id: p.id, title: p.title,
    source: { type: "compiled-js", compiledUrl: getCompiledJsUrl(projectId, p.compiledJsPath) },
    previewSize: p.previewSize,
    prototypeMeta: p.prototypeMeta,
    configData: configDataMap[p.id],
  }))}
  activePageId={activePageId}
  onActivePageChange={handlePageChange}
  previewMode={previewMode}
  onPreviewModeChange={setPreviewMode}
  canvasState={canvasState}
  onCanvasStateChange={setCanvasState}
  interactionMode="viewer"
  onPageConfigEdit={(pageId) => { handlePageChange(pageId); setConfigPanelDetailPageId(pageId); }}
/>
```

---

## 错误处理与边界情况

| 场景 | 处理方式 |
|------|---------|
| 数据加载中 | 由调用方（page.tsx / ViewerApp.tsx）的 Suspense 或 skeleton 处理，不属于 PreviewStage 职责 |
| 无页面 | 显示空状态占位 `NoPageSelected` |
| iframe 内 JS 报错 | 创作端通过 `onError` 回调处理，浏览端不传则静默忽略 |
| 编译产物加载失败 | PreviewPanel 内部已有错误展示 |
| 单页 ↔ 画布切换 | canvasState 保持 zoom/pan 位置；activePageId 保持不变 |
| visualEditing 未传 | 单页模式下不激活点击选中、hover 高亮、属性编辑 |
| canvasEditing 未传 | 画布模式下不渲染删除/粘贴/创建文档等操作按钮 |
| Shell 模板无 iframeUrl | 使用 iframe-template.ts 动态生成，不依赖静态文件 |
| 滚动行为 | 隐藏滚动条但保留滚动能力（统一 CSS：`::-webkit-scrollbar { display: none }` + `scrollbar-width: none`） |

---

## 不做的事

1. **不包含左栏和右栏** — 页面树、AI 对话、配置面板、属性面板不纳入 PreviewStage
2. **不改变现有组件内部实现** — PreviewPanel、PreviewCanvas 等核心组件只调整接口，不改内部渲染逻辑
3. **不要求两端统一数据模型** — 两端各自将 project/page 数据转换为 PagePreviewData 和 PageSource 后传入
4. **不引入新 UI 框架或状态管理** — 仅使用已有的 React + SWR + shadcn/ui

---

## 测试策略

### 单元测试（Vitest + Testing Library）

| 测试用例 | 覆盖点 |
|---------|--------|
| 渲染单页模式（iframe-html） | RuntimeDispatch 正确选择 IframePreviewFrame |
| 渲染单页模式（prototype-html-css） | RuntimeDispatch 正确选择 PrototypePagePreview |
| 渲染单页模式（sketch-scene） | RuntimeDispatch 正确选择 SketchPagePreview |
| 渲染单页模式（compiled-js） | RuntimeDispatch 正确选择 PreviewPanel |
| 渲染画布模式 | PreviewCanvas 正确挂载 |
| 模式切换 | 单页 ↔ 画布切换后 activePageId 和 canvasState 不变 |
| interactionMode="viewer" | 画布编辑按钮和单页选中交互不激活 |
| visualEditing 未传 | 不激活选中/高亮交互 |
| 空页面列表 | 显示 NoPageSelected 占位 |
| previewSize 4 级推导 | 各 fallback 优先级正确 |
| className 透传 | 容器样式可覆盖 |
| PageSource type="iframe-html" 带 url | 渲染 iframe |
| PageSource type="compiled-js" 带 compiledUrl | PreviewPanel 使用 compiledUrl |
| PageSource type="compiled-js" 带 code | PreviewPanel 使用代码字符串 |

### 集成测试

- 创作端：PreviewStage + 左栏（页面树）+ 右栏（VisualPropertyPanel + PageConfigPanel）联动
- 浏览端：PreviewStage + 左栏（PageManagerList）+ 右栏（PageConfigPanel）联动

### E2E 回归

现有 `test/创作端E2E回归测试/` 用例覆盖关键流程，PreviewStage 替换后这些用例应继续通过。

---

## 实施风险

| 风险 | 缓解措施 |
|------|---------|
| page.tsx（~8000 行）改动范围大 | 先提取 PreviewStage，逐步替换 page.tsx 中的内联代码，不一次性重构 |
| 已有 E2E 测试可能因 DOM 结构变化失败 | 保持 CSS class 和 data 属性不变，优先兼容现有选择器 |
| 画布模式的交互逻辑复杂（拖拽、缩放、分组） | PreviewCanvas 本身不变，仅调整外层容器和 props 传递路径 |
| PreviewPanel props 接口调整影响已有调用 | 先保持兼容旧接口，逐步迁移 |

---

## 迁移路径

1. 新建 `PreviewStage`、`PreviewStageToolbar`、`SinglePagePreview`、`RuntimeDispatch` 组件
2. 调整 `PreviewPanel` 接口支持 `PageSource`（保持旧接口兼容）
3. 浏览端 `ViewerApp.tsx` 替换为 `PreviewStage`（改动较小，风险低）
4. 创作端 `page.tsx` 替换为 `PreviewStage`（改动较大，分步进行）
5. 移除两端重复的内联渲染逻辑
6. 运行完整 E2E 回归验证
