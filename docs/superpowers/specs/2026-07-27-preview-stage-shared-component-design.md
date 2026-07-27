# PreviewStage 共享预览舞台设计

> 状态：已按 2026-07-27 代码现状校正，可进入实施计划
>
> 适用范围：`@workbench/demo-ui`、创作端编辑页、创作端嵌入 viewer、独立 viewer-site

## 一、结论

提取共享预览舞台的方向合理，但不能把两端中央面板简单合并成一个巨型、固定行为的组件。当前各入口共享的是页面渲染、尺寸解析、单页滚动容器、模式切换骨架和画布组件；创作端编辑页还承担文档预览、草图编辑器、视觉编辑、历史、运行时转换、诊断、自动修复和切换前确认，这些职责必须继续留在宿主层。

本方案采用“共享规范化层 + 可组合 `PreviewStage`”：

1. 复用并扩展现有 `CanvasPageData`，不另建一套与画布模型重复的页面协议。
2. 在 `demo-ui` 统一页面尺寸解析和 runtime renderer 选择规则。
3. `SinglePagePreview` 统一默认单页渲染与滚动容器。
4. `PreviewStage` 组合模式切换骨架、`SinglePagePreview` 和现有 `PreviewCanvas`。
5. 通过精确的现有 props 透传与插槽保留宿主专有功能。
6. `PreviewPanel` 保持现有 `code` / `compiledJsUrl` 接口，不增加新旧接口并行兼容层。

该边界能减少真实重复，又不会把创作端业务状态塞进 `demo-ui`。

---

## 二、现状核验

### 2.1 当前不止两个预览入口

需要覆盖或明确复用边界的入口包括：

| 入口 | 当前职责 | 迁移目标 |
| --- | --- | --- |
| `packages/author-site/src/app/demo/[id]/edit/page.tsx` | 创作端编辑、单页/画布、文档、草图编辑、视觉编辑、诊断 | 使用完整 `PreviewStage`，宿主功能走插槽和精确 props |
| `packages/viewer-site/src/components/ViewerApp.tsx` | 发布项目浏览、单页/画布、配置联动 | 使用完整 `PreviewStage` |
| `packages/author-site/src/app/viewer/[projectId]/page.tsx` | 创作端嵌入式项目 viewer | 使用完整 `PreviewStage` |
| `packages/author-site/src/app/viewer/[projectId]/[demoId]/page.tsx` | 创作端嵌入式单页 viewer、app action | 直接复用 `SinglePagePreview` |

只有前两个入口迁移时，不能宣称“所有预览 bug 只需修改一处”。本次实施应覆盖上述四个入口；若实施计划决定缩小范围，验收描述也必须同步收窄。

### 2.2 已有共享边界

`@workbench/demo-ui` 已提供：

- `PreviewPanel`：源码编译模式和 `compiledJsUrl` 模式；
- `IframePreviewFrame`：发布 iframe 加载与尺寸缩放；
- `PrototypePagePreview`：HTML/CSS 原型页；
- `SketchPagePreview`：草图页；
- `PreviewCanvas` / `CanvasPagePreviewContent`：画布、资源调度与画布内 runtime 分发；
- `CanvasPageData`、`PreviewCanvasProps`、`CanvasState` 等完整类型；
- `getPreviewSize`、`getPrototypePreviewSize` 等尺寸工具。

因此本次应在既有边界上组合，不应重写这些 renderer 或复制它们的 props。

### 2.3 当前有意存在的差异

单页与画布不能追求“容器行为完全一致”：

- 单页允许纵向滚动、视觉选择和宿主工具栏；
- 画布使用 `fillContainer`、页面框尺寸、截图兜底、iframe 预算、休眠和内容高度回写；
- 画布页面默认不可直接操作 iframe 内容；
- 创作端模式切换有丢弃确认、状态清理和首次适应屏幕副作用；
- 创作端单页目标可以是页面，也可以是画布文档；
- 草图页在创作端可切换到专用编辑器，而 viewer 只读渲染。

本方案统一的是数据规范化、renderer 决策和可共享外壳，不抹平这些产品差异。

---

## 三、备选方案与选择

| 方案 | 优点 | 问题 | 结论 |
| --- | --- | --- | --- |
| 整个中央面板由一个巨型 `PreviewStage` 接管 | 表面重复最少 | props 会复制并漏掉大量真实契约，宿主业务侵入 `demo-ui` | 不采用 |
| 只抽 `resolvePreviewSize` 等纯函数 | 风险最低 | 工具栏、单页容器和 runtime 分发仍重复 | 不采用 |
| 共享规范化层 + 可组合 `PreviewStage` | 统一公共行为，同时保留宿主差异 | 需要插槽和宿主 adapter | 采用 |

---

## 四、目标与非目标

### 4.1 目标

1. 单页和画布消费同一份规范化页面数据。
2. 统一尺寸优先级和 runtime renderer 选择规则。
3. 统一单页滚动容器、空状态和基础模式切换样式。
4. 保留 `PreviewCanvas` 的现有完整能力和调用契约。
5. 保留创作端全部专有行为，不把异步加载、历史、诊断或编辑状态移入共享包。
6. 所有公共类型和组件从 `@workbench/demo-ui` 根入口导出，两端本地 facade 同步导出。

### 4.2 非目标

1. 不合并左栏、右栏、AI 对话或配置面板。
2. 不重写 `PreviewPanel`、`PreviewCanvas`、各 runtime renderer 的内部状态机。
3. 不改变发布数据结构或删除发布产物 `iframe.html`。
4. 不把单页和画布的资源调度、滚动、交互能力强行做成相同。
5. 不在本任务中统一 `@workbench/shared/demo/iframe-template` 与截图服务模板边界。
6. 不为未上线代码保留 `PreviewPanel` 新旧接口兼容层。

---

## 五、共享架构

```text
PreviewStage
├── PreviewStageToolbar
│   ├── PreviewModeToggle
│   ├── default page selector 或 selectorSlot
│   └── toolbarTrailing slot
├── renderSingleContent?                 # 宿主覆盖文档/草图编辑器等
│   └── SinglePagePreview                # 默认路径
│       ├── resolvePreviewSize
│       └── resolvePagePreviewRenderer
│           ├── IframePreviewFrame
│           ├── PrototypePagePreview
│           ├── SketchPagePreview
│           └── PreviewPanel
└── PreviewCanvas                        # 保持现有画布职责
    └── CanvasPagePreviewContent
        └── 复用 resolvePagePreviewRenderer 的决策语义
```

### 5.1 新增模块

| 模块 | 职责 |
| --- | --- |
| `preview-stage-types.ts` | `PreviewStagePage`、`PreviewStageProps` 和组合型 props |
| `preview-stage-resolver.ts` | 页面尺寸和 renderer 决策纯函数 |
| `SinglePagePreview.tsx` | 默认单页容器和 runtime 分发 |
| `PreviewStageToolbar.tsx` | 模式切换骨架、默认页面选择和插槽 |
| `PreviewStage.tsx` | 受控组合单页和画布 |

### 5.2 现有模块调整

| 模块 | 调整 |
| --- | --- |
| `CanvasPageItem.tsx` | 使用共享 renderer 决策函数，保留截图、休眠、内容高度和画布容器逻辑 |
| `index.ts` | 导出新增组件、类型、resolver，以及需要公开的 renderer props 类型 |
| `types.ts` | 补充公共组合类型所需导出，不改变 `PreviewPanelProps` 或 `CanvasPageData` 现有字段语义 |
| 两端本地 `components/demo/index.ts` | 同步 re-export，或调用方直接改为从 `@workbench/demo-ui` 导入 |

---

## 六、数据契约

### 6.1 页面模型

不要使用原方案中较弱的 `PagePreviewData`。它缺少 `order`、画布 runtime 字段和真实源码字段，也错误使用了不存在的 `title`。

在现有 `CanvasPageData` 上扩展：

```typescript
interface PreviewStagePage extends CanvasPageData {
  runtimeType: CanvasPageRuntimeType;
  schema?: string;
  fallbackPreviewSize?: PreviewSize;
}
```

字段语义：

- `name` 与现有 author/viewer 页面模型一致；
- `order` 供画布和选择器排序；
- `code`、`compiledJsUrl`、`iframeUrl`、`prototypeHtml`、`prototypeCss`、`sketchScene` 沿用 `CanvasPageData`；
- `schema` 用于解析 `$demo.previewSize`；
- `previewSize` 表示调用方已有的页面级缓存或发布尺寸；
- `fallbackPreviewSize` 仅承接创作端当前活动页的全局/历史默认尺寸，不得把活动页 fallback 复制给其它页面；
- `prototypeMeta` 保持 `Record<string, unknown>`，不能窄化为只含 `previewSize`，因为现有解析还支持顶层 `width` / `height`；
- `sketchScene` 沿用 `CanvasPageData` 的字符串字段；viewer adapter 将 `SketchSceneDocument` 序列化一次后传入，不能新造未导入的 `SketchScene` 类型。

### 6.2 页面 adapter

宿主负责把自己的状态转换成 `PreviewStagePage[]`：

- 创作端从 `demoPages` 元数据和 `pageCodes`、`pagePrototypeMap`、`pageSketchMap`、`pageSchemaMap`、`configDataMap` 组合；
- viewer-site 从 `PublishedDemoPage`、`pageSchemaMap`、`configDataMap` 组合，并把可选发布路径转换为 URL；
- 嵌入 viewer 从 `/api/viewer/[projectId]/data` 返回的 runtime 数据组合。

adapter 必须用 `useMemo` 或等价稳定策略，避免每次 render 都制造全新的页面数组和深层对象。

adapter 还必须遵守 runtime 字段约束：

- `high-fidelity-react` 可以同时携带 `iframeUrl` 和 `compiledJsUrl`，前者是当前发布入口，后者是数据缺少 iframe 路径时的构造期回退；
- `prototype-html-css` 只填充 prototype 字段；
- `sketch-scene` 只填充 sketch 字段；
- 不把 prototype 或 sketch 页面伪装成 `code` / `compiledJsUrl` 页面。

### 6.3 尺寸解析

新增纯函数：

```typescript
function resolvePreviewStageSize(page: PreviewStagePage): PreviewSize | undefined {
  return (
    (page.schema ? getPreviewSize(page.schema) : undefined) ??
    page.previewSize ??
    getPrototypePreviewSize(page.prototypeMeta) ??
    page.fallbackPreviewSize
  );
}
```

同一页解析出的尺寸同时用于：

- `SinglePagePreview`；
- 传入 `PreviewCanvas` 的规范化 `CanvasPageData.previewSize`；
- 需要尺寸的发布/宿主集成测试。

这能消除当前 viewer 单页读取 schema 尺寸、画布却只读取发布尺寸的偏差。

### 6.4 renderer 决策

新增纯函数 `resolvePagePreviewRenderer(page)`，统一决策语义：

1. `iframeUrl` 存在：`published-iframe`；
2. `runtimeType === "prototype-html-css"`：`prototype`；
3. `runtimeType === "sketch-scene"`：`sketch`；
4. `compiledJsUrl` 存在：`compiled-module`；
5. `code` 非空：`authoring-code`；
6. 其余：`empty`。

`SinglePagePreview` 与 `CanvasPagePreviewContent` 复用这一决策函数，但各自保留不同的容器和生命周期。发布 iframe 的优先级属于现有发布语义，不在本次纯重构中改变。

---

## 七、组件契约

### 7.1 SinglePagePreview

不要发明简化版 `VisualEditingConfig`。仓库不存在 `VisualEditMode`、`VisualChanges` 或统一的 `onPropertyChange`，三种 runtime 的编辑能力也不相同。

```typescript
interface SinglePageRendererProps {
  iframe?: Omit<
    IframePreviewFrameProps,
    "src" | "title" | "previewSize" | "configData"
  >;
  prototype?: Omit<
    PrototypePagePreviewProps,
    "html" | "css" | "previewSize" | "configData"
  >;
  sketch?: Omit<
    SketchPagePreviewProps,
    "scene" | "previewSize" | "configData"
  >;
  highFidelity?: Omit<
    PreviewPanelProps,
    "code" | "compiledJsUrl" | "previewSize" | "configData"
  >;
}

interface SinglePagePreviewProps {
  page?: PreviewStagePage;
  rendererProps?: SinglePageRendererProps;
  emptyState?: ReactNode;
  className?: string;
  onBackgroundClick?: () => void;
}
```

要求：

- `PreviewPanel` 继续接收 `code` 或 `compiledJsUrl`；
- `IframePreviewFrame` 继续接收发布 iframe URL；
- runtime 专有 props 使用现有组件类型派生，避免复制后漂移；
- `IframePreviewFrame` 当前没有运行时 `onError`，不得承诺捕获其 iframe 内 JS 错误；
- `PrototypePagePreview` 和 `SketchPagePreview` 只透传其真实支持的能力。

为使用上述公共类型，实施时需要从 `demo-ui` 根入口导出 `IframePreviewFrameProps`、`PrototypePagePreviewProps` 和 `SketchPagePreviewProps`。

### 7.2 PreviewStage

```typescript
interface PreviewStageRenderContext {
  activePage?: PreviewStagePage;
  resolvedPreviewSize?: PreviewSize;
  defaultContent: ReactNode;
}

interface PreviewStageProps {
  pages: PreviewStagePage[];
  activePageId?: string;
  onActivePageChange: (pageId: string) => void;

  previewMode: PreviewMode;
  onPreviewModeChange: (mode: PreviewMode) => void;

  canvasState: CanvasState;
  onCanvasStateChange: (state: CanvasState) => void;
  interactionMode: CanvasInteractionMode;

  singlePageProps?: Omit<SinglePagePreviewProps, "page">;
  canvasProps?: Omit<
    PreviewCanvasProps,
    | "pages"
    | "canvasState"
    | "onCanvasStateChange"
    | "interactionMode"
    | "activePageId"
  >;

  showToolbar?: boolean;
  showDefaultPageSelector?: boolean;
  selectorSlot?: ReactNode;
  toolbarTrailing?: ReactNode;
  renderSingleContent?: (
    context: PreviewStageRenderContext,
  ) => ReactNode | undefined;

  className?: string;
}
```

契约说明：

- `interactionMode` 复用现有 `"readonly" | "viewer" | "editor"`，不能缩减为两种；
- `onPreviewModeChange` 和 `onActivePageChange` 是“请求”回调，宿主可以执行确认、异步加载和副作用后再更新受控状态；
- `PreviewStage` 不接管页面加载、历史、配置面板或保存；
- `renderSingleContent` 返回非 `undefined` 时覆盖默认单页内容，用于文档目标和创作端草图编辑器；
- `selectorSlot` 用于创作端“页面 + 文档”选择器；传入时替换默认页面选择器；
- `toolbarTrailing` 用于草图编辑、历史和 runtime 转换状态；
- 单页空状态通过 `singlePageProps.emptyState` 定制，避免出现两个相互竞争的空状态入口；
- `PreviewCanvas` 当前不会消费顶层 `activePageId` 作为选中态；画布聚焦/编辑继续通过现有 `focusPageId`、`editingPageId` 和回调控制；
- 空页面不必然意味着空舞台：宿主仍可通过 `renderSingleContent` 渲染文档目标。

### 7.3 画布 props

删除原方案中的 `CanvasEditingConfig`。它遗漏了现有 `projectId`、截图 render box、runtime 转换、可见页上报、首次 fit、位置尺寸、知识文档读写等能力，且粘贴签名错误。

`PreviewStage` 直接派生并透传 `PreviewCanvasProps`。画布能力是否出现继续由 `CanvasInteractionMode` 和现有精确 callback 决定。

---

## 八、宿主接入

### 8.1 viewer-site

viewer adapter：

1. 用 `name`，不是 `title`；
2. 对 `compiledJsPath` 和 `iframeHtmlPath` 做空值保护；
3. 把 `pageSchemaMap[page.id]` 放入 `schema`；
4. 将发布路径转换后的 `iframeUrl` 和 `compiledJsUrl` 都放入页面模型；
5. 让共享 resolver 保持 `iframeUrl` 优先；
6. 左侧页面目录和右侧 `PageConfigPanel` 留在 `ViewerApp`。

模式切换、页面选择、配置联动继续由 viewer 的受控 state 处理。

### 8.2 创作端编辑页

创作端 adapter 从多个 map 组合页面，不能直接读取不存在的 `p.code`、`p.prototypeMeta` 或 `p.configData`。

宿主保留：

- 切换到画布前的视觉编辑丢弃确认和清理；
- 首次进入画布的 fit 请求；
- 画布页面点击后的文件加载、schema/config 切换和历史；
- 文档单页目标与 `CanvasDocumentContent`；
- 草图编辑器 Stage、Toolbar 和图层面板；
- 历史按钮、runtime 转换状态与重试；
- `PreviewPanel` 的诊断、自动修复、投影确认、视觉编辑和静态化回调。

这些能力分别通过受控回调、`selectorSlot`、`toolbarTrailing`、`renderSingleContent` 和 `singlePageProps.rendererProps` 接入。

### 8.3 创作端嵌入 viewer

项目级嵌入 viewer 使用完整 `PreviewStage`。其本地 `ViewerDemoPage` 类型需要与 `/api/viewer/[projectId]/data` 已返回的 `runtimeType`、prototype 和 sketch 字段对齐，不能继续假定只有 React code。

单页嵌入 viewer 直接使用 `SinglePagePreview`，并通过 `highFidelity` props 保留 `appState`、`routeParams` 和 `onAppAction`。

---

## 九、Shell 与发布产物

`PreviewStage` 不生成 iframe Shell，只负责选择 renderer。

现状已经共用 `packages/demo-ui/src/iframe-template.ts`：

- author-site `PreviewPanel` 优先使用 `/api/preview-runtime/shell` fixed shell；
- viewer-site 开发态也有 fixed shell route，静态导出时由 `PreviewPanel` 回退 inline shell；
- 发布流程用同一模板生成 `demos/<pageId>/iframe.html`，其中包含发布模块地址和 `cssImports`。

因此：

1. 不删除发布目录中的 `iframe.html`；
2. 发布数据有 `iframeHtmlPath` 时继续用 `IframePreviewFrame`；
3. `iframeHtmlPath` 缺失时才使用 `compiledJsPath`；
4. 不把三种传输形态误写为同一种动态 Shell；
5. 如果未来要移除发布 iframe，必须先扩展发布 manifest 承载 `cssImports` 并另立发布协议迁移任务。

---

## 十、错误与边界

| 场景 | 处理 |
| --- | --- |
| 宿主数据加载中 | 继续由宿主现有 loading 分支处理；当前并非统一 Suspense |
| 无页面且无自定义单页目标 | 渲染 `singlePageProps.emptyState` 或默认空状态 |
| `activePageId` 不存在 | 不自动改写受控状态，渲染空状态并保留选择器 |
| pages 更新后活动页被删除 | 宿主选择新活动页；共享组件不隐式写 state |
| React 源码/模块失败 | 沿用 `PreviewPanel` 的错误状态和 `onError` |
| 发布 iframe 加载或内部 JS 失败 | 当前 `IframePreviewFrame` 只能收到 load/resize；浏览器错误能力保持现状，不虚构 `onError` |
| 原型/草图内容缺失 | 由对应 renderer 的现有空内容语义处理 |
| 单页与画布切换 | `PreviewStage` 不修改 `activePageId` 或 `canvasState` |
| 单页滚动 | 外层隐藏滚动条但保留滚动能力 |
| 画布滚动/缩放 | 完全交给 `PreviewCanvas` |

---

## 十一、测试策略

### 11.1 demo-ui 测试基础设施

`demo-ui` 当前只有 `typecheck` 和 `lint`，没有可执行的 Vitest 测试环境。实施时新增：

- `vitest.config.ts`；
- jsdom 与 Testing Library setup；
- `vitest`、`jsdom`、`@testing-library/react`、`@testing-library/jest-dom`；
- `test` / `test:watch` scripts；
- 与现有 `tsconfig` 一致的 alias 或对子 renderer 的明确 mock；
- 根 `check:demo-ui` 改为 `typecheck + test`。

### 11.2 纯函数与组件测试

| 测试 | 断言 |
| --- | --- |
| 尺寸解析 | schema → page size → prototype meta → fallback |
| renderer 决策 | iframe → prototype/sketch → compiled URL → code → empty |
| 单页 runtime 分发 | 正确 renderer 和精确 props |
| 默认页面选择器 | 排序、选择回调、活动页缺失 |
| selector/trailing slot | 宿主内容正确挂载 |
| renderSingleContent | 可覆盖默认内容，返回 `undefined` 时回退 |
| controlled 模式切换 | 只调用回调，不改写 active page/canvas state |
| normalized pages | 同一 resolved size 同时传给单页和画布 |
| readonly/viewer/editor | 三种现有交互模式完整透传 |

子 renderer 应 mock，避免把 `PreviewPanel` 的编译状态机重复测进 `PreviewStage` 单测。

### 11.3 宿主集成测试

- viewer-site：`iframeHtmlPath` 优先、`compiledJsPath` 回退、配置更新、页面切换、单页/画布；
- 创作端：模式切换确认与清理、首次 fit、页面/文档选择、草图编辑覆盖、历史和 runtime 转换工具栏；
- 嵌入 viewer：多 runtime 项目和单页 app action；
- 发布流程：保留 `iframe.html`、module URL、cache bust 和 `cssImports` 回归。

### 11.4 E2E

现有 `test/创作端E2E回归测试/` 默认只覆盖 `localhost:3200`，不能声称已经覆盖 viewer-site。

实施时：

1. 保留并运行创作端相关 E2E；
2. 为 viewer-site 增加独立的发布数据 E2E 配置或命令，覆盖 3300 端口；
3. 至少覆盖单页、画布、发布 iframe、compiled fallback 和配置联动。

---

## 十二、迁移顺序

1. 冻结现有 runtime、尺寸、模式切换和发布产物行为矩阵。
2. 新增 `PreviewStagePage`、尺寸 resolver、renderer resolver 及其测试。
3. 建立 `demo-ui` 测试环境，调整 `check:demo-ui`。
4. 新增 `SinglePagePreview`、`PreviewStageToolbar`、`PreviewStage`，不修改 `PreviewPanel` 公共接口。
5. 让 `CanvasPagePreviewContent` 复用 renderer 决策语义，保留画布生命周期。
6. 先迁移 viewer-site，并补发布 iframe / compiled fallback 回归。
7. 迁移创作端项目级和单页嵌入 viewer。
8. 最后迁移创作端编辑页，通过插槽逐项保留专有行为。
9. 四个入口验证通过后删除重复内联外壳和分发逻辑。
10. 更新项目文档和模块索引。

项目未上线，不需要为 `PreviewPanel` 增加新旧接口兼容层。`iframeHtmlPath` 优先和 `compiledJsPath` 回退是本次需要保持的现有发布语义，不属于新增兼容代码。

---

## 十三、验收标准

1. 四个预览入口均使用共享 `PreviewStage` 或 `SinglePagePreview`。
2. 页面数据只规范化一次，并同时驱动单页和画布。
3. 尺寸和 renderer 决策有单一纯函数及完整测试。
4. viewer 发布 iframe、compiled fallback 和配置联动保持不变。
5. 创作端文档、草图编辑、视觉编辑、历史、诊断和切换保护无功能回退。
6. 发布 `iframe.html`、`cssImports` 和 cache bust 契约不变。
7. `PreviewPanelProps` 不增加 `source` 或 `source[]` 兼容入口。
8. 所有新增公共类型从 `@workbench/demo-ui` 根入口导出。
9. 以下命令通过：

```bash
corepack pnpm check:demo-ui
corepack pnpm check:author
corepack pnpm check:viewer
corepack pnpm build:viewer
corepack pnpm build:preview-runtime
```

并定向运行发布管理、preview runtime、创作端 PreviewStage E2E 和新增 viewer-site E2E。

---

## 十四、项目文档交付

代码实施完成后使用 `doc-maintainer` 更新：

- `docs/项目文档/创作端/04-配置与预览/技术/05_共享组件架构设计.md`；
- `docs/项目文档/创作端/04-配置与预览/技术/02_实时预览机制.md`；
- `docs/项目文档/使用端/02-预览与配置/技术/01_架构设计.md`；
- 创作端和使用端对应 `INDEX.md`。

只有 Shell 或发布契约实际变化时，才更新动态编译文档。本方案明确保持发布契约不变，不应顺带重写 Shell 或发布架构。

---

## 十五、实施风险

| 风险 | 缓解 |
| --- | --- |
| 创作端编辑页状态和回调过多 | 使用精确 props 派生和插槽，逐项迁移，不复制成简化配置对象 |
| 页面 adapter 每次 render 重建 | 使用稳定 memo，并通过集成测试检查无意义重挂载 |
| runtime 选择与画布调度再次分叉 | 单页和画布共用 resolver，容器生命周期分别保留 |
| 发布 iframe 被误删或绕过 | 发布测试锁定 iframeHtmlPath、cssImports 和 cache bust |
| demo-ui 新测试环境 alias 不正确 | 在 Vitest 配置显式对齐 alias，renderer 单测使用 mock |
| DOM 结构变化导致 E2E 失效 | 保留关键 class/data 属性，迁移前先冻结选择器 |
| 只迁两端而遗漏嵌入 viewer | 将四个入口列为验收硬条件 |
