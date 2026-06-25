# 画布截图与 iframe 尺寸不一致 - 分析报告

## 1. 问题状态

- 状态：已修复并完成针对性验证。
- 记录时间：2026-06-24。
- 影响位置：创作端项目编辑页，画布模式下的页面预览卡片。
- 典型页面：`配置项示例` 项目中的 `位置与排序`、`颜色与图片` 页面。

当前用户确认的现象：

- 图 1 是截图服务返回后的画布显示，图 2 是 iframe 实时预览状态。
- 两者内容比例、页面高度和元素位置仍然不一致。
- `$demo.previewSize` 表示单页面模式的预览宽高，不等于画布模式中的最终页面尺寸；画布模式下高度应拉伸到能完整显示页面内容。

用户提供的最新证据：

- 截图服务显示结果：`/Users/qh2/Library/Application Support/PixPin/Temp/PixPin_2026-06-24_15-45-32.png`
- iframe 实时预览结果：`/Users/qh2/Library/Application Support/PixPin/Temp/PixPin_2026-06-24_15-45-46.png`

## 2. 期望行为

画布中每个页面应始终显示该页面的最新视觉效果：

1. 代码或配置变化后，如果截图服务还没有返回对应最新版本，画布继续使用 iframe 实时预览。
2. 截图服务返回最新版本后，才可用截图替换 iframe。
3. 点击页面只应改变选中态和配置面板，不应在代码、配置、渲染尺寸未变化时触发 iframe 与截图之间的无意义切换。
4. 画布模式的页面宽度应以 `$demo.previewSize.width` 作为内容布局宽度；页面高度应以内容在该宽度下自然排版后的完整内容高度为准，而不是直接使用 `$demo.previewSize.height`。
5. 截图服务和画布 iframe 都应对齐同一个更根本的基准：页面内容在同一代码、配置、资源状态和 `$demo.previewSize.width` 布局宽度下形成的“内在渲染盒”。该渲染盒的宽度来自 `$demo.previewSize.width`，高度来自内容实际完整高度。截图的图片比例、内容高度和裁剪范围应反映这个内在渲染盒，而不是反过来以画布容器、画布缩放后的显示宽度或当前 iframe 载体作为基准。

## 3. 已处理过但仍不足的部分

本次问题链路中已经做过几类调整，但最终现象仍存在：

| 已处理点 | 当前代码位置 | 现状 |
| --- | --- | --- |
| 截图请求发起时先让旧截图失效 | `packages/author-site/src/app/demo/[id]/edit/page.tsx:906`、`:930`、`:3035` | 能避免配置/代码变化后继续直接展示旧 hash 截图 |
| 只把 hash 匹配且非 loading 的截图传给画布 | `packages/author-site/src/app/demo/[id]/edit/page.tsx:342` | 能过滤部分过期截图 |
| 点击页面不再因为选中态立即切 iframe | `packages/shared/src/demo/CanvasPageItem.tsx:256` | 选中态和渲染路径已解耦 |
| 画布截图请求改为 `fullPage=true` | `packages/author-site/src/app/demo/[id]/edit/page.tsx:157`、`:378`、`:398`、`:428` | 只解决了“截不完整”的一部分，没有解决比例和渲染盒一致性 |
| 根据 iframe 或图片高度回写画布卡片高度 | `packages/shared/src/demo/CanvasPageItem.tsx:190`、`:192`、`:226` | 高度来源仍不统一，可能引入二次不一致 |

结论：问题不应继续按“调 CSS 或开关 fullPage”处理。根因更像是截图生成路径和 iframe 显示路径没有共享同一套画布渲染盒契约。

2026-06-24 修复记录：

- 截图服务在渲染稳定后测量 body/document 尺寸，返回 `renderBox`，并将 `renderBox` 写入截图 meta。
- 截图 hash 加入 `render-box-v2` 契约版本，避免旧缓存继续参与画布显示。
- 前端截图状态保存 `renderBox`；画布只展示 hash 匹配、非 loading、`renderBox.fullPage=true` 且宽度匹配 `$demo.previewSize.width` 的截图。
- `CanvasPageItem` 不再使用图片 `naturalHeight/naturalWidth` 反向改写布局；截图加载只负责切换静态载体，布局高度来自 iframe 测量或截图服务 `renderBox.height`。
- 已运行验证：`pnpm --filter @opencode-workbench/screenshot-service typecheck`、`pnpm --filter @opencode-workbench/screenshot-service test`、`pnpm --filter @opencode-workbench/author-site typecheck`、`pnpm --filter @opencode-workbench/author-site test -- --runTestsByPath src/components/demo/useScreenshotGeneration.test.tsx`。

## 4. 当前关键代码链路

### 4.1 画布向截图服务发请求

`packages/author-site/src/app/demo/[id]/edit/page.tsx`

- `getScreenshotRequestSize` 从 `previewSize` 取截图请求宽高：`:147`。
- `CANVAS_SCREENSHOT_FULL_PAGE = true`：`:157`。
- 单页再生截图时传 `width`、`height`、`fullPage`：`:361` 到 `:379`。
- 批量画布截图时同样传 `previewSize` 和 `fullPage`：`:384` 到 `:403`。
- 切换到画布模式会触发批量截图：`:415` 到 `:436`。

这里的风险点是：截图请求的 width 可以继续来自 `$demo.previewSize.width`，但 height 不应继续等同于 `$demo.previewSize.height`。画布模式最终高度应该来自页面内容在 `$demo.previewSize.width` 下形成的内在渲染高度。

### 4.2 截图状态过滤

`packages/author-site/src/app/demo/[id]/edit/page.tsx`

- `canvasScreenshotUrls` 只保留 `screenshotUrl` 存在、非 loading、`hash === expectedHash` 的截图：`:342` 到 `:354`。

这里当前只验证内容版本 hash，没有验证“渲染尺寸版本”。如果同一代码和配置在不同 viewport、不同 fullPage 策略、不同内容高度下生成截图，当前状态模型无法区分这些情况。

### 4.3 画布页面卡片渲染

`packages/shared/src/demo/CanvasPageItem.tsx`

- `contentHeight` 记录内容高度：`:190`。
- `handleContentHeightChange` 根据 iframe 或图片测得高度回写 layout 高度：`:192` 到 `:224`。
- 图片加载后使用 `image.naturalHeight` 和 `image.naturalWidth` 参与高度换算：`:226` 到 `:233`。
- `effectiveHeight` 用于传给 `PreviewPanel`：`:235` 到 `:240`。
- 有截图但未加载时 iframe 隐藏保留，图片加载后卸载 iframe：`:256` 到 `:265`。
- iframe 路径传 `fillContainer`、`onContentHeightChange`、`effectiveHeight`：`:452` 到 `:475`。
- 截图路径使用绝对定位容器，图片 `w-full h-auto`：`:479` 到 `:488`。

这里的风险点是：iframe 的高度来自 `document.body` 的 ResizeObserver，截图的高度来自 PNG natural size。两者被同一个 `handleContentHeightChange` 消费，但并不能证明它们描述的是同一个渲染盒。

### 4.4 iframe 缩放逻辑

`packages/shared/src/demo/PreviewPanel.tsx`

- `computePreviewScale` 以 `previewSize` 的宽高作为设计尺寸：`:33` 到 `:44`。
- `fillContainer` 且没有 `effectiveHeight` 时，会在容器内按 `min(scaleX, scaleY)` 缩放并居中：`:73` 到 `:101`。
- `fillContainer` 且有 `effectiveHeight` 时，以容器宽度计算 scale，iframe 高度使用 `effectiveHeight`：`:46` 到 `:70`。
- iframe 的外层 wrapper 是 `w-full h-full`，内部按上面的 scale 绝对定位：`:831` 到 `:868`。

这里的风险点是：首次渲染、iframe RESIZE 回写、layout 高度变化、再次计算 scale 是一个反馈环。截图图片加载时也会进入同一反馈环，但截图和 iframe 的原始尺寸来源不同。

### 4.5 iframe 内容高度上报

`packages/shared/src/demo/iframe-template.ts`

- iframe 内部用 `ResizeObserver` 监听 `document.body`，向父窗口发送 `{ type: 'RESIZE', height }`：`:1299` 到 `:1305`。

这里的风险点是：`document.body` 的高度未必等于截图服务 fullPage 捕获的页面高度，也未必等于画布中应该展示的卡片高度。尤其当 body/html 样式、外部图片加载、字体加载、绝对定位元素或溢出元素参与时，测量口径可能不同。

### 4.6 screenshot-service 渲染

`packages/screenshot-service/src/routes/screenshots.ts`

- 截图 hash 包含 `code`、`configData`、`width`、`height`、`fullPage`：`:135` 到 `:142`、`:160`。
- 生成 HTML 时直接调用 `generateIframeHtml`：`:239` 到 `:246`。
- 渲染时把 `width`、`height`、`fullPage` 传给 browser pool：`:248` 到 `:250`。

`packages/screenshot-service/src/utils/browser-pool.ts`

- Puppeteer viewport 设置为请求传入的 `width`、`height`：`:211` 到 `:214`。
- `setContent` 等待 `domcontentloaded`，再等待 selector 和 network idle：`:241` 到 `:264`。
- 最终执行 `page.screenshot({ fullPage, type: 'png' })`：`:266` 到 `:269`。

这里的风险点是：screenshot-service 捕获的是单独 HTML 页面，不经过 `CanvasPageItem -> PreviewPanel -> iframe` 的画布容器和缩放流程。也就是说，截图服务和画布 iframe 共享了 iframe-template，但没有共享外层显示盒、测量时机和最终 layout 状态。

## 5. 当前最可能根因

### 根因假设 A：截图路径和 iframe 路径没有统一“画布渲染盒契约”

iframe 实际显示路径：

`CanvasPageItem -> PreviewPanel(fillContainer) -> iframe -> iframe-template -> RESIZE -> CanvasPageItem layout height`

截图生成路径：

`DemoEditPage -> useScreenshotGeneration -> author-site screenshot API -> screenshot-service -> generateIframeHtml -> Puppeteer viewport -> fullPage screenshot`

两条路径只共享组件代码和配置数据，不共享：

- `$demo.previewSize.width` 作为内容布局宽度的明确契约。
- 内容在 `$demo.previewSize.width` 下自然排版后的完整高度。
- iframe 缩放策略。
- 内容高度测量口径。
- 图片/字体完全稳定后的测量结果。
- 渲染尺寸版本标识。

因此即使 hash 匹配，截图仍可能不是同一个内在渲染盒的视觉等价物。画布 iframe 也不应被视为根本基准，它只是目前最接近实时内容的观测入口。

### 根因假设 B：`$demo.previewSize` 被继续当作画布截图 viewport

用户已明确说明：

- `$demo.previewSize` 是单页面模式的宽高。
- 画布模式中，高度会拉伸到显示完整页面。
- 中间页面尺寸和单页面不同，也不应直接等于 `$demo.previewSize`。

当前截图请求仍通过 `getScreenshotRequestSize(pagePreviewSizeMap[p.id])` 取宽高。`fullPage=true` 后，Puppeteer 会截完整页面，但其 viewport 初始高度仍来自 `$demo.previewSize.height`。正确方向不是用画布卡片当前显示宽度替代它，而是固定使用 `$demo.previewSize.width` 作为布局宽度，再以内容实际完整高度作为画布页和截图页的高度基准。

### 根因假设 C：高度反馈环使用了两个不等价的测量来源

iframe 加载时：

- `ResizeObserver(document.body)` 发送高度。
- `CanvasPageItem` 用该高度按当前 layout 宽度和 design width 换算卡片高度。

截图加载时：

- `img.naturalHeight / img.naturalWidth` 被当作内容高度/宽度。
- 同一个 `handleContentHeightChange` 再次可能改写 layout 高度。

如果截图 natural size 和 iframe body size 不同，页面卡片会在 iframe 与截图切换时被不同数据源拉扯，表现为比例突变、内容位置变化或局部裁剪。

## 6. 下次修复建议

### 6.1 先补诊断，不要直接改 CSS

建议先加临时调试信息，至少记录同一个 `pageId` 的以下字段：

- `pageId`
- `previewSize.width`、`previewSize.height`，并区分 width 是布局基准、height 只是单页面视口或初始参考
- canvas layout 的 `width`、`height`
- 当前画布 zoom
- 当前截图 `hash`、`expectedHash`、`loading`
- 截图图片 `naturalWidth`、`naturalHeight`
- iframe 上报的 `bodyHeight`
- `PreviewPanel.computePreviewScale` 的 `scale`、`iframeStyle.width`、`iframeStyle.height`、`top`、`left`
- screenshot-service 收到的 `width`、`height`、`fullPage`
- Puppeteer 截图前测得的 `document.body.scrollWidth`、`document.body.scrollHeight`、`document.documentElement.scrollWidth`、`document.documentElement.scrollHeight`
- Puppeteer 最终 PNG 的宽高

没有这些数据，继续调 `fullPage`、`object-fit` 或卡片 CSS 很容易只修复一个页面并破坏另一个页面。

### 6.2 建立画布截图的 render box 版本

截图有效性不应只看内容 hash。建议新增“渲染盒版本”概念，至少包含：

- 内容版本：code + configData。
- 渲染盒版本：layoutWidth，即 `$demo.previewSize.width`；measuredContentHeight，即内容完整高度；以及 `fullPage`、截图等待策略等会影响捕获范围的参数。
- 内容测量版本：contentHeight 或 screenshotMeasuredHeight。

`canvasScreenshotUrls` 只有在内容版本和渲染盒版本都匹配时，才允许把 iframe 替换成截图。

### 6.3 统一截图和 iframe 的尺寸来源

下一次修复可以在两种方向中选一种，不建议混用：

方案 A：截图服务返回测量元数据，并由画布信任截图元数据。

- screenshot-service 在截图前测量 DOM 尺寸。
- API 结果返回 `renderedWidth`、`renderedHeight`、`bodyHeight`、`viewportWidth`、`viewportHeight`。
- 画布在图片加载前就能知道截图对应的准确尺寸。
- `CanvasPageItem` 不再靠 `img.naturalHeight` 反推业务高度，避免图片加载后的二次 layout 震荡。

方案 B：通过画布 iframe 观测内在渲染盒，再用该尺寸请求截图。

- iframe 作为实时观测入口，先上报稳定后的 contentHeight。
- 画布将 `$demo.previewSize.width` 和稳定后的内容完整高度发给截图服务；不要把画布缩放后的显示宽度当作布局宽度。
- 截图服务使用同一 viewport 生成图片。
- 截图回来时，只替换相同 render box 的 iframe。

从产品语义看，方案 B 更符合“页面内容的内在渲染盒是基准，画布 iframe 和截图都只是渲染载体”的原则。

### 6.4 让截图服务捕获画布等价环境

当前 screenshot-service 直接渲染 `generateIframeHtml`。如果继续这样做，需要确保它的 viewport 和 CSS 环境与画布 iframe 等价。

可选做法：

- 给截图服务增加专门的 canvas render mode，明确传入画布页面宽度和内容高度。
- 或提供一个“canvas preview fixture”HTML，模拟 `PreviewPanel(fillContainer)` 的外层盒模型。
- 或把 `PreviewPanel` 的尺寸计算规则抽成共享纯函数，并在截图请求参数中传递其结果，避免服务端和前端各自推导。

## 7. 不建议重复的修复方向

- 不要只把 `fullPage` 从 false 改 true 或再改回 false。当前已证明 `fullPage=true` 仍不解决比例问题。
- 不要把 `$demo.previewSize.height` 当作画布最终高度。用户已明确这只属于单页面模式。
- 不要点击页面就强制切 iframe。这样会制造不必要闪烁，且不能修正截图本身。
- 不要只改 `<img>` 的 `object-fit`、`height: 100%`、`object-contain`。这会掩盖截图尺寸错误，可能导致裁剪或留白。
- 不要让截图图片加载后无条件改写 layout，除非能证明该图片的 natural size 和 iframe 实时内容的测量口径一致。

## 8. 下一次修复的最小任务拆分

1. 加诊断日志或调试面板，只覆盖画布模式和选中页面。
2. 用 `位置与排序` 页面复现一次，记录 iframe 与截图两条路径的尺寸元数据。
3. 判断差异来自 viewport 宽度、内容高度、缩放策略、截图等待时机还是图片/字体加载。
4. 选定一个尺寸主数据源：iframe 测量优先，或 screenshot-service 测量优先。
5. 扩展截图状态结构，加入 render box 元数据，避免只靠 hash 判断截图有效。
6. 修改 `CanvasPageItem`，让截图替换 iframe 时只做视觉载体替换，不再反过来决定页面内容的内在尺寸。
7. 回归 `颜色与图片`、`数据列表`、`位置与排序` 三类页面，覆盖图片、长内容、响应式/布局类组件。

## 9. 建议验证清单

手动验证：

- 打开 `配置项示例`。
- 切换到画布模式。
- 选中 `颜色与图片`，确认点击前后不会无意义闪烁。
- 修改颜色配置，截图未返回前继续显示 iframe 最新效果。
- 截图返回后，截图与 iframe 在比例、内容高度、图片位置上保持一致。
- 选中 `位置与排序`，确认截图宽高比例和 iframe 一致。
- 在 19%、34%、45% 等不同画布 zoom 下重复检查。

自动化建议：

- `useScreenshotGeneration` 单元测试：截图有效性必须同时校验内容版本和 render box 版本。
- `CanvasPageItem` 组件测试：点击选中不应切换渲染载体；截图加载不应在 render box 不匹配时替换 iframe。
- screenshot-service 测试：返回截图文件时同时返回测量元数据；hash 或 metadata 应覆盖 width、height、fullPage、render mode。

## 10. 本次文档记录没有做的事

- 没有继续修复代码。
- 没有回滚已有改动。
- 没有清理当前工作区中的生成截图、数据文件或其它脏文件。
- 没有运行测试；本次目标只是记录下次修复所需上下文。
