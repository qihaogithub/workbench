# ISSUE-001: 创作端首页项目卡片自动生成封面部分截图缺失只显示图片名称

## 1. 元信息

- 类型：Bug
- 优先级：Medium
- 状态：Todo
- 创建来源：Issue Builder
- 是否需要代码修改：Yes

## 2. 用户原始描述

创作端首页项目卡片中，如果用户没有配置项目封面，应该显示自动生成的封面，但是现在自动生成的封面，有的图片显示，有的图片没显示出来，只显示了图片名称

## 3. 任务背景

创作端首页（`/`）以卡片网格展示所有项目。当项目没有手动上传封面图（`thumbnail` 字段为空）时，`DemoCard` 组件会回退到 `ScreenshotCover` 组件，该组件从 `demo.demoPages` 中取出最多 4 个页面，通过 `/api/screenshots/file/{projectId}/{pageId}` 加载各页面的截图文件来拼接展示封面。

## 4. 当前问题 / 当前需求

在自动生成封面模式下（无手动封面），部分项目的卡片封面中：

- 某些页面能正常显示截图图片
- 某些页面截图加载失败，只显示了页面名称文本（如 "page_bv0k"、"page_ihtj" 等）

实际数据验证：以 `proj_1779608460378` 为例，该项目有 16 个 demoPages 且无 thumbnail。其截图目录 `data/screenshots/proj_1779608460378/` 中仅有 5 个页面的截图文件（`demo_1779608460379_a1b2c3`、`demo_1779608460380_d4e5f6`、`demo_1780550141175_a79047`、`figma_ey8y`、`figma_vh1z`），其余 11 个页面（`page_bv0k`、`page_ihtj`、`page_b31r` 等）均无对应截图文件。

另有多个项目（`proj_1779608458649`、`proj_1779608460370` ~ `proj_1779608460374`）既无 thumbnail 也无截图目录，这些项目的卡片封面同样无法显示截图。

## 5. 期望结果

- 没有手动封面的项目卡片，所有页面格子都应显示有意义的视觉内容（截图或合理的占位图），不应出现只显示页面名称文本的情况
- 截图不存在时，应有统一的兜底展示方案

## 6. 影响范围

- 创作端首页项目卡片列表展示
- 所有未设置手动封面（`thumbnail` 为空）的项目
- 截图生成/存储流程

## 7. 相关代码文件路径

### 高相关

- `packages/author-site/src/components/demo/demo-card.tsx`
  - 关联原因：首页项目卡片渲染组件，包含 `DemoCard`、`ScreenshotCover`、`PageScreenshotCell` 三个关键组件
  - 证据：`PageScreenshotCell`（L43-85）在 `img` 加载失败时（`onError`）直接显示 `page.name` 文本；`ScreenshotCover`（L88-114）遍历 `demoPages` 拼接截图；`DemoCard`（L138-196）的三元判断逻辑决定封面展示策略
  - 置信度：High

- `packages/author-site/src/app/api/screenshots/file/[projectId]/[pageId]/route.ts`
  - 关联原因：截图文件读取 API，决定截图是否能正常返回
  - 证据：`GET` 处理器通过 `meta.json` 的 `currentHash` 查找截图文件，找不到则返回 404（L52-56）
  - 置信度：High

- `packages/author-site/src/lib/fs-utils.ts`
  - 关联原因：`listProjects` 函数构建首页数据，包含 `demoPages` 数组
  - 证据：`listProjects`（L193-218）将 `project.demoPages` 传递给前端，前端据此生成截图 URL
  - 置信度：High

### 中相关

- `packages/author-site/src/components/demo/home-page.tsx`
  - 关联原因：首页容器组件，渲染 `DemoCard` 列表
  - 证据：`HomePage`（L16-178）遍历 `demos` 渲染 `DemoCard`
  - 置信度：Medium

- `packages/author-site/src/components/demo/useScreenshotGeneration.ts`
  - 关联原因：截图生成 Hook，涉及截图创建流程
  - 证据：使用 `SCREENSHOT_SERVICE_URL` 拼接截图请求 URL（L53）
  - 置信度：Medium

- `packages/author-site/src/app/api/demos/[id]/cover/route.ts`
  - 关联原因：封面上传/删除 API，影响 `thumbnail` 字段
  - 证据：`DELETE` 处理器在删除封面后检查自动截图是否存在（L118-124）
  - 置信度：Medium

- `packages/shared/src/index.ts`
  - 关联原因：`DemoMeta` 类型定义，包含 `demoPages` 字段结构
  - 证据：`DemoMeta.demoPages`（L8）类型为 `Array<{ id, name, order, parentId }>`
  - 置信度：Medium

### 低相关

- `packages/author-site/src/app/page.tsx`
  - 关联原因：首页服务端入口，调用 `listProjects` 获取初始数据
  - 证据：`Page` 组件（L6-8）传入 `initialDemos`
  - 置信度：Low

- `packages/screenshot-service/`
  - 关联原因：截图服务（Puppeteer），负责实际截图生成
  - 证据：端口 3202 的 Fastify 服务，生成截图存储到 `data/screenshots/`
  - 置信度：Low

## 8. 执行约束

- 不能改变 `DemoMeta` 类型结构（`packages/shared` 共享类型）
- 截图 API 的 404 响应行为是合理的（文件确实不存在），不应在 API 层做特殊处理
- 兜底方案需要视觉一致，不能出现布局跳动或空白

## 9. 不要做的事

- 不要修改截图生成服务（screenshot-service）的逻辑
- 不要修改 `listProjects` 的数据结构
- 不要为缺失截图生成假截图文件
- 不要修改 `DemoMeta` 共享类型定义

## 10. 验收标准

- [ ] 无封面项目的卡片封面中，所有页面格子都有视觉内容展示，不出现裸露的页面名称文本
- [ ] 截图文件不存在时，显示统一的占位样式（如渐变背景 + 图标），而非纯文本
- [ ] 有截图文件的页面仍正常显示截图图片
- [ ] 完全无截图目录的项目卡片也有合理的兜底展示

## 11. 建议验证方式

1. `pnpm dev` 启动开发服务
2. 访问 `http://localhost:3200`
3. 观察没有手动封面的项目卡片（如 `proj_1779608460378`），确认所有格子都有视觉内容
4. 检查浏览器 Network 面板，确认截图 404 的页面是否有合理的兜底展示

## 12. 不确定信息

- 截图为什么部分页面有、部分页面没有——可能是截图生成流程未覆盖所有页面，但这不是本 Issue 要解决的问题
- 截图服务是否有自动触发机制为所有新页面生成截图——需要进一步确认截图生成的触发时机

## 13. 完成后必须输出

- 修改文件列表
- 如何验证
- 遗留风险
