# 创作端-预览区视图重构：单页/画布迁移到Header与新增文档视图

## 背景

预览区当前只有「单页」「画布」两种模式，切换按钮位于预览区顶部工具栏（`PreviewStageToolbar`）。需求要求：

1. 把单页/画布切换迁移到 Header 栏中间，创作端与浏览端统一。
2. 新增「文档」视图，作为预览区第三种视图模式。

## 目标

- 单页/画布/文档三种视图的切换统一放在 Header 中间，创作端与浏览端共用同一套切换组件。
- 新增文档视图：
  - 右侧栏只显示评论（不显示配置/编辑）。
  - 左侧栏不显示页面。
  - 左侧「文件」栏的 文档/代码 子视图取消，文件 tab 名称改为「代码」，只显示代码文件树。
  - 原文档列表（KnowledgePanel）改为文档视图下中间栏的目录。
  - 文档视图下中间栏不是预览区，而是文档编辑/浏览区；左 1/4 是目录，右 3/4 是文档。

## 范围

| 包 | 改动 |
| --- | --- |
| `packages/demo-ui` | `PreviewMode` 增加 `document`；新增共享 `PreviewModeSwitcher` 组件；从 `PreviewStageToolbar` 移除模式切换按钮；更新 `PreviewStage` 与测试 |
| `packages/author-site` | Header 中间加视图切换；新增文档视图（中间栏文档工作台 + 右侧仅评论 + 左侧隐藏页面）；文件 tab 改名「代码」并移除 文档/代码 子切换；创作端 `/viewer/[projectId]` 独立预览路由同期迁移到 Header |
| `packages/viewer-site` | Header 中间加视图切换（单页/画布，发布数据无文档则不显示文档） |

## 方案

### demo-ui

1. `types.ts`：`PreviewMode = "single" | "canvas" | "document"`。
2. 新增 `PreviewModeSwitcher.tsx`：渲染 单页/画布/文档 分段按钮。Props：`mode`、`onModeChange`、`modes?`（显示哪些，默认全部）、`className`。
3. `PreviewStageToolbar.tsx`：移除模式切换按钮组（保留页面选择器与 trailing slot）。
4. `PreviewStage.tsx`：`previewMode === "document"` 时中间区域渲染文档内容（由宿主经 `renderSingleContent` 或新 prop 提供），或保持由宿主替换整个中间栏。
5. `index.ts` 导出 `PreviewModeSwitcher`。
6. `PreviewStage.test.tsx` 同步更新（移除对工具栏「画布」按钮的点击断言）。

### author-site

1. Header（`page.tsx` ~6781）：在中间插入 `PreviewModeSwitcher`，`onModeChange` 复用现有单页/画布切换逻辑并增加 document 分支。
2. 文件 tab：`tabValue === "code"` 的 TabsTrigger 文案「文件」→「代码」；移除 `fileView` 文档/代码子切换，直接渲染 `WorkspaceFileTree`。
3. 文档视图：`previewMode === "document"` 时中间栏渲染 `DocumentView`（左 1/4 目录 + 右 3/4 文档编辑），右侧栏只渲染评论，左侧栏隐藏「页面」tab。
   - 新增 `DocumentView` 组件：目录列出知识库文档，右侧 `DocumentEditor` 就地编辑并保存。

### viewer-site

- Header 增加视图切换（单页/画布），复用 `PreviewModeSwitcher`，`modes={["single","canvas"]}`。

### author-site `/viewer/[projectId]` 独立预览路由

- 原单页/画布切换在设置弹层内，本次同期迁移到 Header（`PreviewModeSwitcher`，`modes={["single","canvas"]}`），移除弹层切换与相关未用导入。

## 任务清单

- [x] demo-ui：PreviewMode / PreviewModeSwitcher / 工具栏改造 / 测试
- [x] author-site：Header 切换 + document 分支
- [x] author-site：文件 tab 改名「代码」+ 移除子切换
- [x] author-site：DocumentView 组件与布局
- [x] viewer-site：Header 切换
- [x] author-site `/viewer/[projectId]`：切换迁移到 Header
- [x] 文档更新
- [x] 验证（author typecheck/test、viewer typecheck 通过；demo-ui typecheck/test 为预存环境故障）
- [x] 修复：文档视图目录「始终在加载中」（`DocumentView` 不稳定回调导致无限重取，见下）

## Bug 修复记录：文档视图目录始终在加载中

- 现象：切换到文档视图后，目录区一直显示加载 spinner，不出现文档列表。
- 根因：`DocumentView` 的 `fetchItems` `useCallback` 依赖 `onItemsLoaded`（父组件传入的内联箭头函数，每次渲染新身份）。父编辑页渲染频繁，导致 `fetchItems` 每次渲染都重建，挂载 effect 与 `knowledge-updated` 监听 effect 随之反复执行，`setLoading(true)` 被不断重置，目录始终停在加载态。
- 修复：`DocumentView` 用 `useRef` 持有 `onItemsChange`/`onItemsLoaded`，`fetchItems` 只依赖 `[workingDir, projectId, sessionId]`，回调变化不再触发重取。
- 验证：浏览器实测切换文档视图，目录正常渲染（空库显示「暂无文档」），仅 StrictMode 双请求，不再无限重取。

## 验证方式

- `pnpm check:demo-ui`
- `pnpm check:author`
- `pnpm check:viewer`
- 手动/回归：`pnpm test:e2e`（如环境允许）

## 风险与待确认

- 文档视图的编辑能力：复用 demo-ui `DocumentEditor`，保存走 `/api/knowledge/[docId]`。
- 浏览端发布数据当前不含知识文档，文档视图主要面向创作端。
- 「代码」tab 语义：展示 AGENT 实际工作目录（`showKnowledge=true`，含 `knowledge/`），不做二次过滤。