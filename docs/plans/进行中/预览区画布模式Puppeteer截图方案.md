# 预览区画布模式 Puppeteer 截图方案

> **状态**：方案设计 | **日期**：2026-06-04 | **前置**：废弃 Thumbnail 采集方案（`docs/plans/进行中/预览区画布模式重构实施记录.md`）

---

## 〇、背景

### 0.1 当前状态

画布模式曾尝试使用 **iframe 内 DOM 采集 + ThumbnailRenderer** 实现缩略图，核心思路是用结构化元数据（ThumbnailMeta）渲染轻量 div，替代服务端截图。但实践中暴露以下问题：

- **ThumbnailPlaceholder 效果差**：无数据的页面只显示一个骨架占位，用户看不清页面内容
- **ThumbnailRenderer 保真度低**：灰色横条 + 色块无法反映真实页面的视觉层次和布局
- **DOM 采集覆盖不全**：三方组件、动态渲染、Canvas 等内容无法被 DOM 扫描到
- **编译 + CDN 加载延迟**：需调 `/api/compile` → CDN import → 渲染 → 采集，链路长、不稳定

### 0.2 决策

**放弃 DOM 采集方案，改用 Puppeteer 服务端截图**。画布展示真实页面 PNG 截图（由 agent-service 后台生成），恢复单页/宫格模式的 iframe 实时预览不受影响。

---

## 一、方案概览

```
┌─────────────────────────────────────────────────────────┐
│                    agent-service (Fastify)               │
│  ┌────────────────────────────────────────────────────┐  │
│  │  /api/screenshots/*                                │  │
│  │  ┌──────────────┐   ┌─────────────────────────┐   │  │
│  │  │ generate     │   │  Puppeteer Browser Pool  │   │  │
│  │  │ generate-    │──▶│  (单例, 复用实例)        │   │  │
│  │  │ batch        │   │  headless:true           │   │  │
│  │  │ file         │   │  375×812 viewport         │   │  │
│  │  │ status       │   └─────────────────────────┘   │  │
│  │  └──────────────┘         │                        │  │
│  │                           ▼                        │  │
│  │                    ┌──────────────┐                │  │
│  │                    │ data/        │                │  │
│  │                    │ screenshots/ │                │  │
│  │                    │ {projectId}/ │                │  │
│  │                    │  {pageId}.png│                │  │
│  │                    └──────────────┘                │  │
│  └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
         ▲                           │
         │ POST /generate-batch      │ PNG bytes
         │                           ▼
┌─────────────────────────────────────────────────────────┐
│              author-site (Next.js 3200)                  │
│  ┌────────────────────────────────────────────────────┐  │
│  │  PreviewCanvas.tsx                                │  │
│  │  进入画布 → 请求批量截图                           │  │
│  │  渲染 <img src="/api/screenshots/...">            │  │
│  └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

**核心变更**：

| 变更 | 说明 |
|------|------|
| 新增 | agent-service 截图 API（复用现有 Fastify 服务，不拆新服务） |
| 新增 | Puppeteer Browser 单例管理（启动/复用/销毁） |
| 新增 | `data/screenshots/` 截图文件存储（独立于现有 `data/snapshots/` 版本快照） |
| 新增 | CanvasPageItem `<img>` 展示截图（替代 ThumbnailRenderer） |
| 新增 | 进入画布时触发生成队列（懒加载 + 缓存命中跳过） |
| 移除 | 全部 Thumbnail 相关文件（约 7 个文件 + 1 个 Hook） |
| 保留 | iframe-template.ts（截图时 HTML 组装复用） |
| 保留 | author-site `/api/compile` 端点（编译逻辑复用） |

---

## 二、架构设计

### 2.1 集成位置：agent-service

**不再新建独立服务**，将截图能力作为 agent-service 的 `/api/screenshots/*` 路由。理由：

| 维度 | 独立服务 | 集成到 agent-service |
|------|---------|---------------------|
| 部署 | 多一个 Docker 容器 + 端口 | 零新增容器 |
| 通信 | 跨服务 HTTP 调用 | API 层合并，编译仍需跨服务调用 `/api/compile` |
| 维护 | 单独构建/部署/监控 | 与现有服务一致 |
| 资源 | 独立 Node 进程 | 共享 Node 进程（Browser 单例独立） |

Puppeteer 的 Chromium 进程仍然是独立子进程，不受 Node 进程影响。集成到 agent-service 只是 API 层合并，Browser 管理不变。

### 2.2 Browser 管理

```
首次请求 → launch Chromium (headless)
  ↓
复用同一实例处理所有截图请求
  ↓
并发控制：同一时间最多 3 个截图任务（创建独立 Page）
  ↓
服务关闭 → browser.close()
```

- 使用 `puppeteer-core`（不内置 Chromium，依赖系统已安装的 Chrome）
- 通过 `PUPPETEER_EXECUTABLE_PATH` 环境变量指定路径（与现有 Dockerfile 一致）
- 兜底搜索策略：`PUPPETEER_EXECUTABLE_PATH` → macOS `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` → Linux `/usr/bin/chromium` → `/usr/bin/google-chrome`
- 启动参数：`--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage --disable-gpu`
- Browser crash 自动重启：捕获 `disconnected` 事件，重新 launch

### 2.3 编译复用

**截图的代码编译路径与实时预览一致**：

```
原始代码 (TSX/JSX)
  ↓
POST /api/compile (author-site 现有 API，agent-service 跨服务调用)
  ↓
编译结果 { compiledCode, cssImports }
  ↓
generateIframeHtml(compiledCode, cssImports, configData) → HTML 字符串
  ↓
Puppeteer page.setContent(html) → 渲染 → 截图
```

- agent-service 通过 HTTP 调用 author-site 的 `/api/compile` 进行编译（`AGENT_SERVICE_URL` 或新增 `AUTHOR_SITE_URL` 环境变量）
- author-site 的 `compiler.ts` 已有服务端编译缓存（Map，key 为代码 hash + 锁定依赖 JSON，上限 100 条），相同代码不重复编译
- agent-service 侧新增编译结果缓存（key 为代码 hash，上限 200 条，LRU 淘汰），避免跨服务重复调用
- iframe-template 的 HTML 生成逻辑不变

> **注意**：`packages/shared/src/demo/compile-cache.ts` 是浏览器端缓存（key 为 `sessionId:demoId`，20 条 / 5 分钟 TTL），不适用于服务端截图场景。截图场景需在 agent-service 内新建独立的服务端编译缓存。

### 2.4 截图存储

```
data/
  screenshots/                    # 截图存储（独立于 data/snapshots/ 版本快照）
    {projectId}/
      {pageId}.png                # 最新截图（符号链接或直接覆盖）
      {pageId}.{hash}.png         # 历史版本（保留最近 5 个）
      {pageId}.meta.json          # 单页元数据（避免并发写冲突）
```

- `hash = SHA256(code + JSON.stringify(configData) + width + height + SNAPSHOT_VERSION)[:16]`
- `SNAPSHOT_VERSION = 1`（截图生成逻辑版本号，升级后递增可强制刷新所有缓存）
- 写入前检查 hash 是否匹配已有文件，匹配则跳过生成（缓存命中）
- 每个页面独立 `meta.json`（记录当前 hash、生成时间、耗时、近 5 个历史 hash），避免多页面并发写入同一 `meta.json` 导致数据损坏
- `data/screenshots/` 与现有 `data/snapshots/`（项目文件版本快照）完全独立，互不影响

### 2.5 Docker 部署

**现有 Dockerfile 已预装 Chromium + Puppeteer**，仅需验证和微调：

当前 `docker/agent-service/Dockerfile` 已包含：
```dockerfile
# 已有：安装 Chromium
RUN apt-get update && apt-get install -y chromium && rm -rf /var/lib/apt/lists/*
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN npm install --no-save ... puppeteer
```

**需调整**：
1. 将 `puppeteer` 替换为 `puppeteer-core`（减少镜像体积，避免内置 Chromium 重复）
2. `docker-compose.yml` 无需新增 `CHROME_PATH`，已有 `PUPPETEER_EXECUTABLE_PATH` 可用

---

## 三、API 设计

### 3.1 POST /api/screenshots/generate

**请求**：
```json
{
  "projectId": "proj_xxx",
  "pageId": "page_xxx",
  "code": "export default function Page() { ... }",
  "configData": { "title": "示例" },
  "width": 375,
  "height": 812
}
```

**成功响应**：
```json
{
  "success": true,
  "data": {
    "url": "/api/screenshots/file/proj_xxx/page_xxx",
    "hash": "a1b2c3d4e5f67890",
    "elapsed": 1240,
    "cached": false
  }
}
```

**失败响应**：
```json
{
  "success": false,
  "error": { "code": "COMPILE_ERROR", "message": "代码编译失败: Unexpected token" }
}
```

### 3.2 POST /api/screenshots/generate-batch

**异步模式**：立即返回 batchId，后台逐页生成，前端轮询 status 获取进度。

**请求**：
```json
{
  "projectId": "proj_xxx",
  "pages": [
    { "pageId": "page_1", "code": "...", "configData": {}, "width": 375, "height": 812 },
    { "pageId": "page_2", "code": "...", "configData": {}, "width": 375, "height": 812 }
  ]
}
```

**立即响应**：
```json
{
  "success": true,
  "data": {
    "batchId": "batch_xxx",
    "total": 2,
    "cached": 0
  }
}
```

> **为什么异步**：多页截图可能耗时数十秒（每页 1~3s + 编译），同步阻塞请求会导致 HTTP 超时和前端卡顿。异步模式让前端可以展示进度，已完成的页面可先渲染。

### 3.3 GET /api/screenshots/file/:projectId/:pageId

- 返回 PNG 文件（`Content-Type: image/png`）
- 支持查询参数 `?hash=xxx` 指定历史版本
- 支持 `?t={timestamp}` 兜底刷新（避免浏览器强缓存旧图）
- 文件不存在返回 404

### 3.4 GET /api/screenshots/status/:projectId/:batchId

- 轮询批量截图进度
- 返回：
```json
{
  "success": true,
  "data": {
    "batchId": "batch_xxx",
    "total": 5,
    "completed": 3,
    "failed": 0,
    "results": [
      { "pageId": "page_1", "url": "/api/screenshots/file/...", "elapsed": 1200, "cached": false, "status": "done" },
      { "pageId": "page_2", "url": "/api/screenshots/file/...", "elapsed": 50, "cached": true, "status": "done" },
      { "pageId": "page_3", "status": "pending" },
      { "pageId": "page_4", "status": "rendering" },
      { "pageId": "page_5", "status": "pending" }
    ]
  }
}
```

- 前端可在轮询中逐步渲染已完成的页面截图，无需等待全部完成

---

## 四、截图生成流程

```
request (pageId + code + configData)
  │
  ▼
① 计算 hash = SHA256(code + configData + width + height + SNAPSHOT_VERSION)
  │
  ├── 文件已存在 → 直接返回缓存 URL (≈50ms)
  │
  ▼ (缓存未命中)
② 编译代码: POST author-site /api/compile
  │
  ├── 编译失败 → 返回 COMPILE_ERROR
  │
  ▼ (编译成功)
③ HTML 组装: generateIframeHtml(compiledCode, cssImports, configData)
  │
  ▼
④ Puppeteer Browser 单例 (懒加载)
  │
  ▼
⑤ 创建 Page → viewport {width}×{height} → setContent(html)
  │
  ▼
⑥ waitForSelector('#root') + waitForNetworkIdle({ timeout: 10000 })
  │
  ▼
⑦ page.screenshot({ fullPage: true, type: 'png' })
  │
  ▼
⑧ 写入 data/screenshots/{projectId}/{pageId}.{hash}.png
  │  更新 {pageId}.meta.json
  ▼
⑨ 回复 { url: "/api/screenshots/file/...", hash, elapsed }
```

**并发控制**：Puppeteer 单 Browser + 多 Page 并发。使用信号量限制同时 Page 数 ≤ 3。超时 15s。

**队列策略**（批量场景）：
1. 计算所有页面的 hash，筛出缓存未命中的页面
2. 未命中页面进入并发队列（最多 3 个同时渲染）
3. 每完成一页立即写入存储，更新 batch status（前端可轮询获取已完成页面）
4. 全部完成（或失败）后，batch status 标记为 `completed`

---

## 五、画布集成

### 5.1 进入画布时触发

```
用户切换为画布模式
  ↓
收集所有页面代码
  ↓
POST /api/screenshots/generate-batch（异步，立即返回 batchId）
  ↓
前端轮询 /api/screenshots/status/{batchId}
  ↓
已完成的页面立即渲染 <img>，未完成的显示 PageSkeleton
```

**时机**：切换模式时触发一次批量生成。之后用户编辑某页并保存时，触发该页的单独再生成。

### 5.2 CanvasPageItem 渲染逻辑

```typescript
if (editingPageId === page.id) {
  return <PreviewPanel />;          // 编辑中：实时 iframe
}
if (page.screenshotUrl) {
  return <img src={page.screenshotUrl} />;  // 有截图
}
return <PageSkeleton name={page.name} />;   // 生成中/失败：轻量占位
```

**PageSkeleton**：仅显示页面名称 + 尺寸占位框 + 淡入动画（截图加载完成后替换）。不显示任何内容骨架。

### 5.3 编辑后刷新

```
用户保存页面修改
  ↓
调用 /api/screenshots/generate（单页，同步即可）
  ↓
更新 page.screenshotUrl（附带 ?t={timestamp}）
  ↓
CanvasPageItem 重新渲染 <img>
```

### 5.4 zoom 联动（取消阈值切换）

**移除** zoom 阈值切换逻辑（当前阈值为 `IFRAME_ZOOM_THRESHOLD = 0.55`，不再根据缩放程度切换 iframe/缩略图）。画布中所有非编辑页面统一展示截图，无论缩放等级。截图默认缩放至卡片尺寸。

---

## 六、缓存策略

### 6.1 文件级缓存

```
hash = shortHash(code + JSON.stringify(configData) + width + height + SNAPSHOT_VERSION)
```

- 同一项目下 `data/screenshots/{projectId}/{pageId}.{hash}.png` 存在 → 直接返回
- hash 变化 → 重新生成，旧文件保留（回滚场景可引用历史版本）
- `{pageId}.meta.json` 记录当前 hash、生成时间、耗时、近 5 个历史 hash

### 6.2 前端缓存

- 图片 URL 使用 `?t={timestamp}` 兜底刷新（避免浏览器强缓存旧图）
- 用户保存后手动更新 timestamp

### 6.3 编译缓存

**双层缓存**：

| 层级 | 位置 | Key | 容量 | 说明 |
|------|------|-----|------|------|
| author-site 服务端 | `compiler.ts` | 代码 hash + 锁定依赖 JSON | 100 条 | 已有，无需修改 |
| agent-service 侧 | 新增 `screenshot-compile-cache.ts` | 代码 hash | 200 条，LRU | 避免跨服务重复调用 |

> **注意**：`packages/shared/src/demo/compile-cache.ts` 是浏览器端缓存（key 为 `sessionId:demoId`，20 条 / 5 分钟 TTL），不适用于服务端截图场景，不在截图链路中使用。

---

## 七、错误处理与兜底

| 场景 | 表现 |
|------|------|
| 代码编译失败 | 该页显示 PageSkeleton，不阻塞其他页面 |
| Puppeteer 启动失败 | 所有页面显示 PageSkeleton，画布可正常使用 |
| 单页截图超时（15s） | 该页显示 PageSkeleton |
| Browser crash | 监听 `disconnected` 事件 → 自动 restart → 重试未完成截图 |
| 磁盘空间不足 | 截图写入失败，返回错误但不崩溃 |
| 全部截图失败 | 画布显示全为 PageSkeleton，用户仍可编辑 |
| author-service 不可达 | 编译请求失败，该页显示 PageSkeleton |

**PageSkeleton 设计**：带页面名称的浅灰色占位框（与卡片尺寸一致），左上角显示页面名，无骨架/图标/动画，极其轻量。

---

## 八、文件变更清单

### 8.1 新增文件（6 个）

| 文件 | 位置 | 说明 |
|------|------|------|
| `screenshot-routes.ts` | `packages/agent-service/src/routes/` | 截图 API 4 个端点 |
| `screenshot-renderer.ts` | `packages/agent-service/src/utils/` | Puppeteer Browser 单例 + 渲染逻辑 |
| `screenshot-compile-cache.ts` | `packages/agent-service/src/utils/` | 服务端编译结果缓存（LRU，200 条） |
| `PageSkeleton.tsx` | `packages/shared/src/demo/` | 截图未就绪时的轻量占位组件 |
| `useScreenshotGeneration.ts` | `packages/author-site/src/components/demo/` | React Hook，管理截图生命周期 |
| `data/screenshots/.gitkeep` | `data/screenshots/` | 截图存储目录占位 |

### 8.2 修改文件（7 个）

| 文件 | 变更 |
|------|------|
| `packages/agent-service/src/routes/index.ts` | 注册 `registerScreenshotRoutes` |
| `packages/agent-service/src/server.ts` | SIGTERM / SIGINT 时关闭 Browser |
| `packages/agent-service/package.json` | 新增 `puppeteer-core` 依赖 |
| `packages/shared/src/demo/PreviewCanvas.tsx` | 进入画布时触发批量截图；移除 Thumbnail 生成逻辑 |
| `packages/shared/src/demo/CanvasPageItem.tsx` | `<img>` 替代 ThumbnailRenderer；移除 zoom 阈值切换 |
| `packages/shared/src/demo/index.ts` | 移除 Thumbnail 导出，新增 PageSkeleton |
| `packages/author-site/src/app/demo/[id]/edit/page.tsx` | 接入 useScreenshotGeneration；移除 useThumbnailGeneration |

### 8.3 移除文件（7 个）

| 文件 | 说明 |
|------|------|
| `packages/shared/src/demo/thumbnail-types.ts` | ThumbnailMeta 类型定义 |
| `packages/shared/src/demo/thumbnail-collector.ts` | DOM 采集脚本 |
| `packages/shared/src/demo/thumbnail-generator.ts` | Evidence → Meta 转换 |
| `packages/shared/src/demo/thumbnail-utils.ts` | Hash 计算等工具 |
| `packages/shared/src/demo/ThumbnailRenderer.tsx` | 缩略图渲染组件 |
| `packages/shared/src/demo/ThumbnailBlockView.tsx` | Block 逐类型渲染 |
| `packages/shared/src/demo/ThumbnailPlaceholder.tsx` | 缩略图占位组件 |

### 8.4 移除的 Hook

| 文件 | 说明 |
|------|------|
| `packages/author-site/src/components/demo/useThumbnailGeneration.ts` | Thumbnail 生命周期 Hook |

### 8.5 Docker 调整

| 文件 | 变更 |
|------|------|
| `docker/agent-service/Dockerfile` | `puppeteer` → `puppeteer-core`（减少镜像体积） |

---

## 九、实施步骤

### Phase 1：核心基础设施（agent-service）

1. 安装 `puppeteer-core` 依赖到 `agent-service`
2. 实现 `screenshot-renderer.ts`（Browser 单例 + `renderPage()` + crash 自动重启）
3. 实现 `screenshot-compile-cache.ts`（LRU 编译缓存，200 条）
4. 实现 `screenshot-routes.ts`（generate / generate-batch / file / status）
5. 注册路由到 `routes/index.ts`，SIGTERM / SIGINT 时关闭 Browser
6. 编写单元测试（Browser mock + 路由测试）

### Phase 2：前端集成（author-site + shared）

1. 新建 `PageSkeleton.tsx`，替换 ThumbnailPlaceholder 引用
2. 新建 `useScreenshotGeneration.ts`，管理进入画布时的异步批量生成 + 轮询
3. 修改 `CanvasPageItem.tsx`：截图 `<img>` + PageSkeleton 替代 ThumbnailRenderer/Placeholder
4. 修改 `PreviewCanvas.tsx`：进入画布触发批量截图，移除 Thumbnail 逻辑
5. 修改 edit `page.tsx`：接入 useScreenshotGeneration

### Phase 3：清理

1. 删除 7 个 Thumbnail 文件
2. 删除 `useThumbnailGeneration.ts`
3. 更新 `index.ts` 导出

### Phase 4：Docker 验证

1. 调整 agent-service Dockerfile（`puppeteer` → `puppeteer-core`）
2. 验证 `PUPPETEER_EXECUTABLE_PATH` 环境变量在 Docker 中正确指向 Chromium
3. 验证截图在 Docker 环境中正常工作

---

## 十、与旧方案的关键差异

> **说明**：项目中不存在独立的 `packages/snapshot-service/` 包。当前 Dockerfile 中已预装 `puppeteer` + Chromium 但未使用，以下对比基于 Dockerfile 中残留的旧截图服务痕迹。

| 维度 | 旧方案（Dockerfile 残留） | 本次方案 |
|------|-------------------------|---------|
| 部署形式 | 独立服务痕迹（Dockerfile 中 puppeteer） | 集成到 agent-service（端口 3201） |
| Puppeteer 包 | `puppeteer`（内置 Chromium，镜像体积大） | `puppeteer-core`（复用系统 Chrome，镜像更小） |
| 编译器 | 不明（Dockerfile 无编译相关） | 跨服务调用 author-site `/api/compile`（与前端一致） |
| 存储 | 不明 | hash 版本化 + per-page meta.json |
| 缓存 | 无 | hash + 双层编译缓存 |
| API 模式 | 不明 | 批量异步 + 单页同步 |
| 超时 | 无 | 15s 硬超时 |
| 并发控制 | 不明 | 最大 3 Page 并行 |
| Browser 容错 | 无 | crash 自动重启 |
