# ISSUE-003: 截图显示效果不佳——移动端截图在卡片封面中被严重裁切

## 1. 元信息

- 类型：Bug
- 优先级：High
- 状态：Todo
- 创建来源：Issue Builder
- 是否需要代码修改：Yes

## 2. 用户原始描述

截图显示效果不佳

（附截图：项目卡片封面的 2x2 截图拼接展示中，页面内容被严重裁切，文字显示不完整）

## 3. 任务背景

创作端首页项目卡片在无手动封面时，通过 `ScreenshotCover` 组件将最多 4 个页面的截图以 2x2 网格拼接展示。截图由 Puppeteer 服务生成，默认视口为 375x812（移动端竖屏比例）。卡片封面区域使用 `aspect-video`（16:9 横屏比例）。

## 4. 当前问题 / 当前需求

截图在卡片封面中的展示存在严重的比例不匹配和内容裁切问题：

**4.1 截图比例与展示区域严重不匹配**

- 截图视口：375×812（竖屏，宽高比 ≈ 0.46）
- 卡片封面区域：`aspect-video`（16:9，宽高比 ≈ 1.78）
- 2x2 网格的每个格子继承了封面的横屏比例特征
- `object-cover` 策略为填满格子而对截图进行大幅裁切，导致页面顶部和底部内容被截断

**4.2 截图仅捕获视口区域而非完整页面**

`browser-pool.ts` 中 `page.screenshot({ fullPage: false })` 仅截取视口可见区域（375×812）。如果页面实际内容高度超过 812px，超出部分永远不会被截取。

**4.3 视觉表现**

从实际截图观察：

- 2x2 网格中的每个截图格子都呈现"放大+裁切"效果
- 页面文字内容被截断（如 "免费试一试" 等区域只显示部分）
- "+12" 叠加层所在的右下角格子中，底层截图同样被裁切
- 整体封面看起来是放大的局部画面，而非可辨识的页面缩略图

## 5. 期望结果

- 卡片封面中的截图应能展示完整的页面内容，不应出现文字被截断的情况
- 截图的展示方式应与截图本身的比例相适配
- 截图应捕获完整的页面内容（支持滚动截长图），而非仅视口区域

## 6. 影响范围

- 创作端首页所有无手动封面的项目卡片
- 截图服务（screenshot-service）的截图生成策略
- 卡片封面组件（`DemoCard`、`ScreenshotCover`、`PageScreenshotCell`）的展示逻辑

## 7. 相关代码文件路径

### 高相关

- `packages/screenshot-service/src/utils/browser-pool.ts`
  - 关联原因：Puppeteer 截图生成核心，决定截图的视口和截取范围
  - 证据：`renderPage`（L77-124）使用 `page.setViewport({ width, height })` 和 `page.screenshot({ fullPage: false })`，仅截取视口区域（375×812）
  - 置信度：High

- `packages/screenshot-service/src/config.ts`
  - 关联原因：截图视口配置
  - 证据：`viewport: { width: 375, height: 812 }`（L17-20）决定默认截图尺寸
  - 置信度：High

- `packages/author-site/src/components/demo/demo-card.tsx`
  - 关联原因：卡片封面展示组件，直接控制截图的显示方式
  - 证据：`PageScreenshotCell`（L43-88）使用 `object-cover`（L67）；`ScreenshotCover`（L91-121）使用 2x2 grid 布局；`DemoCard`（L145-203）封面区域使用 `aspect-video`（L149）
  - 置信度：High

### 中相关

- `packages/screenshot-service/src/routes/screenshots.ts`
  - 关联原因：截图生成路由，传递 width/height 给 `renderPage`
  - 证据：`generateScreenshot`（L72-90）调用 `pool.renderPage(html, width, height)`；`handleGenerate`（L134-181）和 `processBatch`（L229-299）调用 `generateScreenshot`
  - 置信度：Medium

- `packages/author-site/src/components/demo/useScreenshotGeneration.ts`
  - 关联原因：前端截图生成 Hook，决定传递给截图服务的尺寸参数
  - 证据：`startBatchGeneration`（L112-193）和 `regeneratePage`（L195-258）调用截图服务时传递 `width`/`height`
  - 置信度：Medium

- `packages/author-site/src/app/api/screenshots/ensure/route.ts`
  - 关联原因：截图补生 API，同样调用截图服务生成截图
  - 证据：POST 处理器调用 `screenshot-service` 的 `generate-batch`，未指定 width/height 时使用默认视口
  - 置信度：Medium

### 低相关

- `packages/screenshot-service/src/utils/screenshot-store.ts`
  - 关联原因：截图文件存储，影响截图文件的读写
  - 证据：`writeScreenshot` 存储截图文件，`readScreenshot` 读取截图文件
  - 置信度：Low

- `packages/author-site/src/components/demo/home-page.tsx`
  - 关联原因：首页容器，渲染 `DemoCard` 列表
  - 证据：遍历 `demos` 渲染 `DemoCard`，展示截图封面
  - 置信度：Low

## 8. 执行约束

- 修改截图视口或展示方式时，需确保不影响画布模式（canvas mode）下的截图展示
- 截图文件格式（PNG）和存储路径应保持不变
- 修改不应破坏现有的 `meta.json` 截图元数据机制
- 需考虑不同页面可能有不同的 `previewSize`（如 PC 端页面 vs 移动端页面）

## 9. 不要做的事

- 不要修改截图文件存储路径或 `meta.json` 结构
- 不要移除 `ScreenshotCover` 的网格拼接布局概念
- 不要修改截图服务的 HTTP API 接口定义
- 不要降低截图质量（PNG 格式、分辨率）

## 10. 验收标准

- [ ] 卡片封面中的截图不再出现文字/内容被截断的情况
- [ ] 截图能展示完整的页面内容（或至少关键内容区域）
- [ ] 截图的展示比例与截图本身相适配，不出现过度拉伸或裁切
- [ ] 画布模式下的截图展示不受影响

## 11. 建议验证方式

1. `pnpm dev` 启动开发服务
2. 访问 `http://localhost:3200`
3. 观察无手动封面的项目卡片封面，确认截图中的文字内容完整可见
4. 点击卡片进入编辑页，确认画布模式下的截图展示正常
5. 检查不同 previewSize 的页面（如 PC 端页面）截图展示是否正常

## 12. 不确定信息

- 不同项目的页面可能有不同的 `previewSize`（如 375×812 手机端 vs 1024×768 PC 端），当前截图服务是否已为不同尺寸页面生成适配的截图——需要确认 `previewSize` 是否已传递到截图服务
- 截图使用 `fullPage: false` 是设计意图（仅截取视口）还是遗漏——需要确认产品需求

## 13. 完成后必须输出

- 修改文件列表
- 如何验证
- 遗留风险
