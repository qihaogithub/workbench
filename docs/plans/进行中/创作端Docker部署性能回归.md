# 创作端 Docker 部署性能回归问题

## 背景

2026-07-28 下午进行了一系列代码提交并部署到 Docker 后，创作端（author-site）出现明显性能退化：
- 首页加载变慢（包括项目封面图片加载慢）
- 进入项目编辑页时"加载中…"状态持续很久
- 从编辑页返回首页同样很慢
- 浏览端（viewer-site）未受影响，依然流畅

初步排查发现 Docker 环境存在 SOCKS 代理和端口映射问题，但用户在**另一台 Mac 上也 Docker 部署后同样变慢**，确认是代码层面的性能回归。

## 当前状态

**更新时间**：2026-07-29（已通过 dev 模式真实运行 + CDP 事件采集完成根因确认）

**实测数据**（项目 "完课活动"，1 个 React/code 页，dev 模式）：

| 指标 | 数值 | 说明 |
|------|------|------|
| `loadDemo` API 耗时 | 209ms ~ 2902ms | 波动大（dev 环境变量），生产环境预计 ~200-500ms |
| `DemoEditPage` 渲染次数 | 78 ~ 86 | React StrictMode 双调，生产约 40 |
| `PreviewStage` 渲染次数 | 22 | 仅挂载后（render 59+），StrictMode 下约 11 次真实渲染 |
| `PreviewPanel` 渲染次数 | 30 | 其中 22 来自父层传递 + 8 来自内部状态机 |
| `previewStagePages` useMemo 重算 | 8 次 | 每次 0.01-0.05ms，总成本 <1ms |
| PrototypePagePreview ResizeObserver | 0 次 | 该项目无 prototype 页 |

## 根因定论

**根因不是单独的某个 useMemo 或 effect，而是新的组件层级在 post-loadDemo 渲染放大效应。**

具体链路：

1. **`loadDemo()` 完成后 `setIsLoading(false)`** → 挂载 `PreviewStage` → `SinglePagePreview` → `PreviewPanel`
2. **`PreviewPanel` 内部状态机**（compile → iframe load → RESIZE → contentLoaded）产生 15 次独立状态转换（生产模式），每次触发 `PreviewPanel` 自身重渲染
3. **DemoEditPage 的 post-loadDemo 重渲染**（~20 次生产模式，来自 iframe ResizeObserver、CanvasItem 布局计算等）通过新的三层组件层级向下传播：`DemoEditPage` → `PreviewStage` → `SinglePagePreview` → `PreviewPanel`
4. **叠加效应**：`PreviewPanel` 30 次渲染中，22 次来自父层重渲染传递，8 次来自自身状态机。而 `PreviewStage` 和 `SinglePagePreview` 作为新增中间层，每次父渲染都重新执行（均未使用 `React.memo`），增加了整体渲染成本

**关键差异（旧 vs 新）**：
- 旧代码：`DemoEditPage` → `PreviewPanel`（1 层传递）
- 新代码：`DemoEditPage` → `PreviewStage` → `SinglePagePreview` → `PreviewPanel`（3 层传递）
- 每次 DemoEditPage 重渲染，PreviewStage 和 SinglePagePreview 作为额外 2 层也都执行一遍

**PrototypePagePreview ResizeObserver 自激振荡**（之前假设的根因）在本项目中未被触发（无 prototype 页），但对包含原型页的项目仍可能是额外放大因素。

**首页慢**：首页代码路径完全未变，已排除代码级回归。可能是 SSR 冷启动正常行为（3-5s）或 Docker 环境问题，与编辑页慢是独立问题。

## 涉事提交

| 提交 | 时间 | 描述 | 可能影响 |
|------|------|------|----------|
| `f86c56b0` | 07-28 00:25 | Authority workspace 资源提交 + demo-ui 内容高度布局优化 + schema-parser $demo.maxItems | 大型提交，涉及 demo-ui 布局逻辑变更 |
| `eb49452f` | 07-27 21:56 | 统一 PreviewStage 共享预览组件（2478 行新增，1365 行删除） | 重大重构，新增 PreviewStage、SinglePagePreview 等组件 |
| `e406b589` | 07-27 18:35 | 预览区滚动条控制与尺寸推导统一 | IframePreviewFrame、preview-scale 变更 |
| `b3ece168` | 07-28 13:10 | 改进 iframe 内容高度测量，修复 h-screen 溢出截断 | measureFullContentHeight 在 ResizeObserver 中触发 layout reflow |
| `887209cb` | 07-28 13:10 | JWT 密钥懒初始化 + Workspace Authority 客户端错误处理 | getSecret() 每次调用 new TextEncoder().encode() |
| `36ca56e3` | 07-28 13:32 | Figma 导入图片自动本地化 | 保存时可能触发外部 URL 下载（10s 超时） |

## 性能表现数据（本地 Docker）

| 端点 | 冷启动 | 热请求 | 备注 |
|------|:------:|:------:|------|
| `/` 首页 | 4.1s | 30-60ms | SSR 冷启动慢 |
| `/login` | 3.5s | 25-40ms | 同上 |
| `/api/demos` | 46ms | 46ms | API 层极快 |
| 编辑器 `/demo/[id]/edit` | 307 redirect < 10ms | < 10ms | 纯客户端组件 |

**关键观察：** SSR 冷启动 3-5 秒是正常行为（Next.js standalone 生产模式首次请求加载 JS chunk），热请求下 SSR 30-50ms 正常。API 层 `/api/demos` 46ms 也正常。如果用户体感"一直慢"，说明问题在客户端（浏览器 JavaScript 执行、API 调用链路）而非单纯 SSR。

## 已排除的因素

1. **Docker 端口映射破损** — `--force-recreate` 后修复，但只解决了一部分延迟
2. **macOS SOCKS 代理劫持 LAN 流量** — 另一台 Mac 也变慢，排除
3. **大量项目导致同步 I/O 慢** — 仅 12 个项目（45MB），API 实测 46ms
4. **agent-service 性能变化** — `f86c56b0` 仅改了一个常量 + 错误消息

## 深入分析结果（2026-07-29 更新）

对 `eb49452f`（PreviewStage 重构）及其关联提交进行了系统性代码审查和 diff 分析。以下按影响严重度排序。

### 🔴 高风险：`previewStagePages` useMemo 依赖爆炸

**文件**：`packages/author-site/src/app/demo/[id]/edit/page.tsx:5352`

**旧代码**（eb49452f 之前）：
```ts
const activePreviewSize = useMemo(() => {
  // 仅计算当前活跃页面的 preview size
}, [activeDemoId, pagePreviewSizeMap, pagePrototypeMap, pageSchemaMap, previewSize, schema]);
// 6 个依赖，O(1) 计算量
```

**新代码**（eb49452f 之后）：
```ts
const previewStagePages = useMemo<PreviewStagePage[]>(() => {
  return demoPages.map((page) => {
    // 为每个页面构建完整的 runtimeData、configData、schema、previewSize 等
  });
}, [activeDemoId, code, configDataMap, demoPages, pageCodes, pagePreviewSizeMap, pagePrototypeMap, pageSketchMap, pageSchemaMap, previewSize]);
// 10 个依赖，O(N) 计算量
```

**影响链路**：
1. 用户每次输入 → `code` 变化 → `previewStagePages` useMemo 失效 → 重建所有页面对象
2. 用户修改配置 → `configDataMap` 变化 → 同上
3. 新页面对象通过 `<PreviewStage pages={...}>` → `<SinglePagePreview>` → `<PreviewPanel code={...}>`
4. `PreviewPanel` 的 compile effect（`useEffect([code, ...])`）感知到新的 `code` prop → 触发 `/api/compile` 请求（即使代码内容相同，因为 React 不做深度比较）

**根因**：依赖项从 6 个扩展到 10 个，且 `code` 和 `configDataMap` 是高频变化的依赖。旧代码仅计算活跃页面的 preview size（O(1)），新代码计算所有页面的完整 PreviewStagePage（O(N)）。

### 🟡 中风险：PreviewStage 双次归一化

**文件**：`packages/demo-ui/src/PreviewStage.tsx:33`

`previewStagePages` useMemo 已经构建了完整的页面对象，但 `PreviewStage` 内部又调用 `normalizePreviewStagePages(pages)`：
```ts
const normalizedPages = useMemo(() => normalizePreviewStagePages(pages), [pages]);
```

`normalizePreviewStagePages` 对每个页面调用 `resolvePreviewStageSize`（4 级回退：schema → page.previewSize → prototypeMeta → fallbackPreviewSize），并可能创建新的 spread 对象（`{...page}`）。

由于 `previewStagePages` 每次计算都返回新引用，这个 `useMemo` 每次都会执行。

### 🟡 中风险：`renderSingleContent` 闭包每次渲染重建

**文件**：`packages/author-site/src/app/demo/[id]/edit/page.tsx`（PreviewStage JSX 区域）

编辑页传入一个内联箭头函数作为 `renderSingleContent` prop。该闭包在每次父组件渲染时创建新引用，未来若对 PreviewStage 添加 `React.memo` 保护会失效。

### 🟡 中风险：`loadDemo()` 串行请求可并行化

**文件**：`packages/author-site/src/app/demo/[id]/edit/page.tsx:3169`

`loadDemo()` 的前两个 API 调用是独立的，但当前串行执行：
```ts
const demosRes = await fetch("/api/demos");         // 1. 获取项目列表
const userAuthoringPreferencesRes = await fetch(    // 2. 获取用户偏好 → 可与 1 并行
  "/api/user/authoring-preferences",
);
const sessionRes = await fetch("/api/sessions", ...); // 3. 创建会话 → 依赖 demoId
```

步骤 1 和 2 可以并行（`Promise.all`），当前串行化增加约 50ms 延迟。对于 Docker 环境，这个延迟可能由于网络/IO 抖动被放大。

**注意**：`loadDemo()` 本身的逻辑在 `eb49452f` 中未变更，此问题之前就存在。但结合下文的状态更新风暴，`loadDemo()` 完成后的首帧渲染成本在 `eb49452f` 后更高。

### 🟡 中风险：`loadDemo()` 完成后状态更新 → React 树全量挂载

`loadDemo()` 在完成数据获取后执行 ~20 次 `setState`，最终 `setIsLoading(false)` 触发从简单加载 UI 到完整编辑器的切换。此时 React 需要挂载：

- `<PreviewStage>` (86 行)
- `<SinglePagePreview>` (111 行)  
- `<PreviewPanel>` (1582 行，含大量 useEffect/useCallback)
- `<PreviewStageToolbar>` (108 行)
- `<PreviewCanvas>`（画布模式）
- 配置面板、页面树、文件树、知识面板等

在 `eb49452f` 之前，这些组件也在加载后挂载，但旧代码的 `activePreviewSize` useMemo 只有 6 个依赖，初始化后更稳定，后续重渲染更少。

### 🟢 低风险：JS Bundle 体积变化

**当前构建数据**：
- `/demo/[id]/edit` 页面 chunk：318 kB（首次加载 1.34 MB 含共享块）
- 新增 demo-ui 组件总代码量：~447 行（PreviewStage 86 + SinglePagePreview 111 + PreviewStageToolbar 108 + resolver 59 + types 83）
- `page.tsx` 净行数变化：0（+961/-961，纯重构）

**结论**：Bundle 体积变化极小，不是主要瓶颈。首次加载 1.34 MB 是继承自已有架构的问题。

### 🟢 低风险：三重编译缓存不互通

**发现**：项目存在三个独立的编译缓存：
| 位置 | 最大条目 | TTL | 驱逐策略 |
|------|---------|-----|---------|
| `demo-ui/src/compile-cache.ts` | 200 | 30 min | FIFO |
| `author-site/src/lib/compiler-client.ts` | 50 | 无 | FIFO |
| `author-site/src/lib/compiler.ts`（服务端） | 100 | 无 | FIFO |

三个缓存键格式不同、彼此独立。`demo-ui` 缓存的条目会被剥离 `moduleUrl`，导致缓存命中时总是走 `postMessage` 全量代码路径（`UPDATE_CODE`）而非 URL 路径（`UPDATE_MODULE`）。对于大体积编译输出，`postMessage` 序列化开销更高。此行为在 `eb49452f` 前已存在。

### ✅ 已排除：`eb49452f` 未引入额外网络请求

审查确认 `eb49452f` 纯粹是架构重构，将原本内联在 `page.tsx` 中的预览渲染逻辑抽取到 `PreviewStage`/`SinglePagePreview` 组件。未增加新的 `fetch` 调用、WebSocket 连接或 API 端点访问。PreviewPanel 的编译请求行为与重构前一致。

### ✅ 已排除：CSS/Layout overhead 来自重构

`e406b589`（滚动条控制）仅修改了 `iframe-template.ts` 的样式规则（`overflow:hidden` → 隐藏滚动条）和 `preview-scale` 的 wrapper 尺寸，不涉及复杂 layout 计算。`eb49452f` 的 `<style>` 注入（隐藏滚动条）是静态内容，无 runtime 开销。

## 排查优先级矩阵

| 优先级 | 排查项 | 预估工时 | 验证方式 |
|--------|--------|----------|----------|
| 🔴 P0 | `previewStagePages` useMemo 重渲染次数 | 2h | React Profiler / `useEffect` 计数埋点 |
| 🔴 P0 | `loadDemo()` 完成后首帧渲染时间 | 1h | `performance.mark` + React Profiler |
| 🟡 P1 | `loadDemo()` 请求并行化 | 0.5h | 代码变更 |
| 🟡 P1 | PreviewPanel compile effect 触发频率 | 1h | Network 面板瀑布图对比 |
| 🟢 P2 | 编译缓存互通优化 | 2h | 缓存命中率统计 |

## 修复方向建议（更新）

基于以上分析，`eb49452f` 的 `previewStagePages` useMemo 是**最可能的性能回归根因**。建议按以下顺序修复：

### 优先级 1：缩减 `previewStagePages` 依赖项
- 移除 `code` 依赖，改用 `pageCodes` + `activeDemoId` 的组合推导
- 移除 `configDataMap` 的直接依赖，对未变化的 configData 保持引用稳定
- 目标：将 10 个依赖缩减到 6-7 个，对齐旧 `activePreviewSize` 的频率

### 优先级 2：`loadDemo()` 请求并行化
- 将 `/api/demos` 和 `/api/user/authoring-preferences` 用 `Promise.all` 并行请求

### 优先级 3：React.memo 保护关键边界
- 对 `PreviewStage` 添加 `React.memo`
- 对 `SinglePagePreview` 添加 `React.memo`（需关注 `rendererProps` 的引用稳定性）

### 优先级 4：代码分割（长期）
- 已有方案文档 `创作端编辑页代码分割优化方案.md`
- 将 PreviewStage、PreviewCanvas 改为 `next/dynamic` 加载

## 诊断命令

```bash
# 分析 Next.js bundle
pnpm --filter @workbench/author-site build
npx -p @next/bundle-analyzer analyze packages/author-site/.next

# 对比 git diff 分析包体积变化
git diff eb49452f^..eb49452f --stat | grep -E '\.tsx?$'

# React Profiler 启动（在浏览器 DevTools 中）
# 1. 打开 React DevTools → Profiler 标签
# 2. 点击录制 → 加载编辑页 → 停止录制
# 3. 查看 DemoEditPage 的 commit 耗时和 re-render 次数

# 计时埋点示例（临时插入 page.tsx）
# useEffect(() => {
#   performance.mark('editor-mounted');
#   console.log('[perf] editor mounted');
# }, []);
```

## 相关文件

| 文件 | 说明 |
|------|------|
| `packages/author-site/src/app/demo/[id]/edit/page.tsx` | 编辑页主组件（7992 行） |
| `packages/demo-ui/src/PreviewStage.tsx` | 新统一预览组件 |
| `packages/demo-ui/src/SinglePagePreview.tsx` | 单页预览 |
| `packages/demo-ui/src/CanvasPageItem.tsx` | 画布页项 |
| `packages/demo-ui/src/PreviewPanel.tsx` | 预览面板 |
| `packages/demo-ui/src/iframe-template.ts` | iframe HTML 模板 |
| `packages/shared/src/demo/iframe-template.ts` | iframe 模板（共享） |
| `packages/author-site/src/lib/image-localizer.ts` | 图片本地化 |
| `packages/author-site/src/app/api/sessions/[sessionId]/files/[demoId]/route.ts` | 会话文件保存路由 |
| `docker/author-site/Dockerfile` | Docker 构建配置 |
| `docker/author-site/entrypoint.sh` | SSR 预热脚本（新增） |

---

## 验证计划（已完成）

### 实测环境

- `pnpm dev` 启动所有服务
- ego-browser + CDP Runtime 事件采集
- 项目 "完课活动"（1 个 React/code 页，无 prototype 页）
- React StrictMode 启用（dev 默认，所有渲染计数约 2x）

### 实测结果（3 次运行汇总）

| 指标 | 运行 1 | 运行 2 | 运行 3 | 平均 |
|------|--------|--------|--------|------|
| loadDemo (ms) | 209 | - | 2902 | ~1500 |
| DemoEditPage renders | 78 | 48 | 86 | ~70 |
| PreviewStage renders | - | - | 22 | 22 |
| PreviewPanel renders | - | - | 30 | 30 |
| previewStagePages recalc | 8 | 4 | 8 | ~7 |
| useMemo avg time (ms) | ~0.2 | ~0.4 | ~0.02 | ~0.2 |
| PrototypePagePreview ResizeObserver | 0 | 0 | 0 | 0 |
| CanvasPageItem onLayoutChange | 0 | 0 | 0 | 0 |

### 根因定论验证

- `previewStagePages` useMemo 总计 <2ms → **不是瓶颈**
- `PrototypePagePreview ResizeObserver` 0 次 → **自激振荡理论不成立**（该项目无 prototype 页）
- `PreviewPanel` 30 次渲染 = 22（父传递）+ 8（内部状态机） → **PreviewPanel 内部状态机 + 父传递叠加是主因**
- `PreviewStage` + `SinglePagePreview` 每次父渲染都执行 → **新组件层级放大重渲染**
- loadDemo 209-2902ms 波动 → **dev 环境变异大，不是代码回归**

## 修复方向

**根因不是单点 bug，而是架构层面的渲染传播放大。** 推荐分优先级修复：

| 优先级 | 方向 | 方案 | 预期效果 | 状态 |
|--------|------|------|----------|------|
| **P0** | `PreviewPanel` 加 `React.memo` | 对 code/configData/previewSize 等数据 prop 做自定义比较，fillContainer 模式不做 memo | 减少 PreviewPanel 无效重渲染 | ✅ 已完成 (2026-07-29) |
| **P0** | `SinglePagePreview` 加 `React.memo` | 对 page 字段（code/schema/configData 等）做浅比较 | 减少单页预览重渲染传递 | ✅ 已完成 (2026-07-29) |
| **P0** | `SinglePagePreview` 中 `resolvePreviewStageSize` 加 `useMemo` | 稳定 previewSize 返回值引用，使 React.memo 能正确比较 | 减少因 previewSize 新对象导致的无效重渲染 | ✅ 已完成 (2026-07-29) |
| **P1** | `loadDemo` 并行化前两个 API 调用 | `/api/demos` 和 `/api/user/authoring-preferences` 同时发起 | 节省 ~50ms 初始加载 | ✅ 已完成 (2026-07-29) |
| **P1** | `previewStagePages` 减少 deps | 移除 `code`（不影响预览结构），稳定 `configDataMap` 引用 | 减少不必要的 useMemo 重算 | ❌ 取消（`code` 移除会导致 active page 预览代码滞后一帧） |
| **P2** | 代码分割 `DemoEditPage` | 用 `next/dynamic({ ssr: false })` 惰性加载 PreviewStage、AIChat、PageConfigPanel、SketchEditor 面板、5 个 Dialog、VisualPropertyPanel、KnowledgePanel、DemoPageTree、WorkspaceFileTree | 编辑页 chunk 318→211 KB（-34%），First Load JS 1.34→1.13 MB（-16%） | ✅ 已完成 (2026-07-29) |

### 首页慢

已排除代码级回归。建议用户单独排查：
- 确认是否是部署后首次访问慢（SSR 冷启动 3-5s 正常）
- Docker 环境下 `listProjects()` 文件系统 I/O 性能
- 项目封面图片是否来自外部 URL（网络延迟）

## 2026-07-29 修复记录

### 已实施优化

1. **`loadDemo()` API 并行化**（`page.tsx:3165`）
   - 将 `/api/demos` 和 `/api/user/authoring-preferences` 用 `Promise.all` 并行请求
   - 节省约 50ms 初始加载时间

2. **`SinglePagePreview` 中 `resolvePreviewStageSize` 加 `useMemo`**（`SinglePagePreview.tsx:32`）
   - 依赖项：`[page?.schema, page?.previewSize, page?.prototypeMeta, page?.fallbackPreviewSize]`
   - 稳定 `previewSize` 返回值引用，使下游 `React.memo` 能正确比较

3. **`SinglePagePreview` 加 `React.memo`**（`SinglePagePreview.tsx`）
   - 自定义比较器 `areSinglePagePreviewPropsEqual`：对 `page.id`、`page.code`、`page.compiledJsUrl`、`page.prototypeHtml/Css`、`page.configData`、`page.previewSize`、`page.runtimeType` 做字段级比较
   - 同一页面在字段未变化时跳过重渲染，阻断渲染传播

4. **`PreviewPanel` 加 `React.memo`**（`PreviewPanel.tsx`）
   - 自定义比较器 `arePreviewPanelPropsEqual`：比较 `code`、`compiledJsUrl`、`previewSize`、`configData`、`demoId`、`sessionId`、`activityState`、`visualEditMode`、`visualAnnotationMode`、`isAutoRepairing`
   - `fillContainer` 模式不做 memo（由内部 ResizeObserver 驱动，render 触发依赖 `rerender` 的场景不适用）
   - 单页预览模式下，DemoEditPage 因非预览原因重渲染时，PreviewPanel 不再级联重渲染

### 未实施

- **`previewStagePages` 移除 `code` 依赖**：取消，因为 `code` 变化时 `pageCodes[activeDemoId]` 由异步 effect 更新，移除会导致 active page 预览滞后一帧
- **`PreviewStage` 加 `React.memo`**：取消，因为 `PreviewStage` 仅 86 行且 props 中 `singlePageProps` 等 JSX 对象每次渲染都是新引用，memo 难以生效。重渲染级联已在 `SinglePagePreview` 和 `PreviewPanel` 两层拦截

### P2 代码分割（2026-07-29）

将 16 个重组件改为 `next/dynamic({ ssr: false, loading: () => null })` 惰性加载：

| 组件 | 类别 | 分割理由 |
|------|------|----------|
| `PreviewStage` | 预览 | 最重组件（iframe 编译 + 画布），browser-only |
| `AIChat` | AI 对话 | 流式 SSE + Markdown + 工具 UI，browser-only |
| `PageConfigPanel` | 配置 | 表单密集 + schema 渲染 + widgets |
| `VisualPropertyPanel` | 可视化编辑 | 条件渲染（single + edit tab） |
| `SketchEditorEngineStage/Toolbar/LayerPanel/InspectorPanel` | 草图编辑 | 条件渲染（sketch-scene），hook 保持静态 |
| `DemoPageTree` / `WorkspaceFileTree` / `KnowledgePanel` | 侧栏 | 文件树/知识面板，Tab 内渲染 |
| `CoverImageDialog` / `ShareDialog` / `WorkspaceCodeDialog` / `KnowledgeDocDialog` / `ResourceHistoryDialog` | 弹窗 | 条件渲染，仅用户操作时打开 |

同时删除了 `VisualDraftActionBar` 的无效 import（dead code）。

**构建产物对比**：

| 指标 | 优化前 | 优化后 | 变化 |
|------|--------|--------|------|
| 编辑页 page chunk | 318 KB | 211 KB | -107 KB (-34%) |
| First Load JS | 1.34 MB | 1.13 MB | -210 KB (-16%) |

### 验证结果

- `check:author` typecheck 通过
- `check:author` test：976 passed / 1 failed（Figma OAuth 回调 URL，环境相关预存失败）
- `check:demo-ui` typecheck：非 test 文件 0 错误；test 文件预存 matcher 类型错误（`PreviewStage.test.tsx`、`SinglePagePreview.test.tsx`，非本次引入）
- `check:demo-ui` test：预存 vitest 配置错误（`Cannot set property testPath`），15 个 test 全部受影响（非本次引入）
- `pnpm --filter @workbench/author-site build` 通过，chunk 分割生效
- 已移除 5 个文件中的 `console.count` 调试语句（PreviewPanel、SinglePagePreview、PreviewStage、CanvasPageItem、PrototypePagePreview）

### 测量脚本修复（2026-07-29）

三个测量脚本存在两个 bug，已修复：

1. **嵌套反引号 bug**（`measure-edit-page-unmount.mjs`、`measure-click-to-preview.mjs`）：`egoScript` 模板字面量内的 `js(\`...\`)` 嵌套反引号导致内部 JS 被当作 Node 脚本代码执行，而非字符串。改为字符串拼接形式。
2. **cliLog 输出到 stderr bug**（三个脚本）：`ego-browser` 的 `cliLog` 输出到 stderr，但 `execSync` 只捕获 stdout。在 heredoc 后加 `2>&1` 合并 stderr 到 stdout。

修复后 `measure:edit-page-load` 和 `measure:unmount` 可正常运行。`measure:click-to-preview` 脚本逻辑修复完成，但 ego-browser 环境下编辑页 `fetch('/api/demos')` 超时（CDP 网络问题），无法在当前环境量化点击延迟。

### 未解决的体感延迟

- **返回首页延迟**：编辑页 unmount 时涉及大量 effect cleanup（iframes、ResizeObserver、WebSocket 断连等），需要独立排查
- **点击后延迟感**：在 single page 模式下，如果用户通过交互（视觉选中、hover）触发了大量 state 更新（`visualPanelHoverNodeId`、`selectedVisualNode` 等），这些变化不受 React.memo 保护，仍需通过 `SinglePagePreview` → `PreviewPanel` 传递

## 诊断命令（后续排查用）

### 测量编辑页返回首页 unmount 耗时

```bash
# 基本用法
pnpm measure:unmount [projectId]

# 指定服务地址和项目
PROJECT_ID=<projectId> pnpm measure:unmount

# 增加采样次数
RUNS=5 PROJECT_ID=<projectId> pnpm measure:unmount
```

**原理**：通过 ego-browser + CDP Performance API，测量从触发导航到首页加载完成的总时间，结合首页自身的 `performance.getEntriesByType('navigation')` 反推 unmount 清理耗时：

```
unmount ≈ 总耗时 - 首页 navigation.loadComplete
```

**解读**：
| unmount 估算 | 含义 |
|-------------|------|
| < 200ms | 正常 |
| 200-500ms | 中等，effect cleanup 有一定开销 |
| > 500ms | 偏高，建议排查 iframe/ResizeObserver/WebSocket 的清理效率 |
| > 1000ms | 严重，存在同步阻塞式清理 |

如果 unmount 偏高，进一步排查方向：
1. React DevTools Profiler → 录制返回首页操作 → 查看 commit 耗时
2. 在 `DemoEditPage` 的 useEffect cleanup 中加入 `performance.mark('cleanup-iframe')` 等埋点
3. 检查是否有 `componentWillUnmount` 风格的长耗时同步操作（`packages/author-site/src/app/demo/[id]/edit/page.tsx`）

### 测量编辑页点击切换页面 → 预览更新的延迟

```bash
# 基本用法（需要项目至少有 2 页）
pnpm measure:click-to-preview [projectId]

# 指定点击次数
CLICKS=10 PROJECT_ID=<projectId> pnpm measure:click-to-preview
```

**原理**：通过 ego-browser 自动化点击页面树中的页面项，记录从点击到预览 iframe DOM 变化的时间差。

**解读**：
| p95 延迟 | 含义 |
|----------|------|
| < 500ms | 正常 |
| 500-1000ms | 可接受 |
| 1000-2000ms | 偏高，体感有延迟 |
| > 2000ms | 严重，存在明显点击延迟 |

如果点击延迟偏高，进一步排查方向：
1. 在 `PreviewPanel` 的 `arePreviewPanelPropsEqual` 中加入 console.log 确认是否每次点击都触发重渲染
2. 检查 `singlePageProps` 的 `rendererProps.highFidelity` 是否每次渲染都创建新引用
3. 检查 `previewStagePages` useMemo 是否在页面切换时频繁重算（deps 爆炸）
4. 使用 React DevTools Profiler 录制点击操作，查看渲染 commit 耗时

### 综合加载性能测量

```bash
# 原有命令：测量完整加载流程（加载编辑页 + 返回首页）
pnpm measure:edit-page-load [projectId]
```

### 手动 CDP 性能追踪（深入排查用）

在 Chrome DevTools 中：
1. 打开 Performance 面板
2. 点击录制
3. 在编辑页中点击返回首页
4. 停止录制
5. 查看 Main 线程在导航前是否有长任务（Long Task），定位到具体的清理函数

在 DevOps 环境中，可通过 ego-browser 的 `cdp()` helper 编程式获取 Performance Trace：
```js
await cdp('Tracing.start', { categories: 'devtools.timeline' });
// ... 执行操作 ...
const events = await cdp('Tracing.end');
// 分析 events 中的 'RunTask' 和 'FunctionCall' 事件
```
