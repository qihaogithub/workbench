#  Markdown 编辑器 TopBar 工具栏裁切

> 最后更新：2026-08-13  
> 状态：根因修复与窄容器浏览器验证已完成；待现有 Next 开发服务恢复后做完整编辑页回归。

## Markdown 编辑器 TopBar 工具栏裁切与“更多”入口缺失

### 现象与影响

创作端编辑页的 Markdown 编辑器（Milkdown Crepe）在中间文档栏宽度受两侧栏挤压时，原生 TopBar 会从右侧被裁切。用户连续提供的截图显示：右端工具图标无法完整展示，预期用于访问被收纳操作的“更多”（`…`）入口也不可见。因此用户无法使用右侧格式功能。

验收目标：无论编辑器实际宽度如何，右侧都必须有可点击、可见的“更多”入口；宽度不足的原生操作需进入该菜单，不能让编辑器整体发生横向滚动。

### 当前实现状态

- 编辑器入口为 [`DocumentEditor.tsx`](../../../packages/demo-ui/src/DocumentEditor.tsx)，在 Crepe `create()` 完成后挂载 `mountTopBarOverflow`（约 173–180 行）。
- 溢出适配器在 [`top-bar-overflow.ts`](../../../packages/demo-ui/src/markdown/top-bar-overflow.ts)；它读取 Crepe 的 `.milkdown-top-bar` 与 `.top-bar-inner`，按工具项宽度设置原节点 `hidden`，并为菜单克隆可点击的转发按钮。
- “更多”节点现在插入 React 管理的最外层 `[data-document-editor="crepe"]`，与 `.crepe` 滚动/裁切容器为兄弟节点；样式在 [`crepe-theme.css`](../../../packages/demo-ui/src/markdown/crepe-theme.css) 中相对外层宿主右上角定位。
- TopBar 内部行已预留 `48px` 右侧宽度（[`crepe-theme.css`](../../../packages/demo-ui/src/markdown/crepe-theme.css) 约 90–99 行），标题下拉已按需求使用紧凑的 `正文 / H1–H6`（[`heading-style-toolbar.ts`](../../../packages/demo-ui/src/markdown/heading-style-toolbar.ts) 约 6–14 行）。
- 当前代码、测试及样式改动均仍在未提交工作区；后续须避免覆盖其他大量用户改动。

### 已尝试的方案与结论

| 方案 | 结论 |
| --- | --- |
| 仅为编辑器和 TopBar 设置 `min-width: 0`、`width/max-width: 100%`，并阻断横向滚动 | 未解决截图中的右端裁切。 |
| 在 `.top-bar-inner` 内追加“更多”，按 TopBar 宽度隐藏后续原生工具 | 未解决；内部行本身可被 Crepe 裁切，因此入口会一并不可见。 |
| 将“更多”提升为 `.milkdown-top-bar` 的子节点并绝对定位 | 用户仍反馈不可见；TopBar 仍属于 Crepe 的 Vue 受控树，不能假设追加节点不会被更新或受其 overflow 链影响。 |
| 将“更多”提升为 `.crepe` 直接子节点 | 仍位于 `.crepe` 自身的滚动/裁切链中，没有解决根因。 |
| 将“更多”提升为 React 外层编辑器宿主的直接子节点 | 已实现；编译后源码与实际主题 CSS 的 280px Chromium 夹具验证通过。 |

根因不是 TopBar 内的固定宽度，而是挂载边界选错：`.crepe` 既是 Crepe 的 DOM 宿主，又是项目主题定义的滚动/裁切容器。只要恢复入口仍在其内，就会与被收纳的工具共享同一裁切链。本轮修复了边界，没有继续叠加宽度补丁。

### 已有自动化验证

下列命令在本机通过；它们只验证 jsdom 中的适配逻辑与静态样式契约，**不能证明实际编辑页已使用了最新 bundle，也不能证明 Crepe 实际布局未裁切**：

```bash
corepack pnpm --filter @workbench/demo-ui exec vitest run src/markdown/top-bar-overflow.test.ts src/markdown/crepe-theme.test.ts --pool=forks --maxWorkers=1 --minWorkers=1 --no-file-parallelism
corepack pnpm --filter @workbench/demo-ui typecheck
```

结果：2 个测试文件、21 个用例通过；`@workbench/demo-ui` TypeScript 检查通过。`git diff --check` 也通过。

### 本轮运行时验证

- ego-browser 成功复用本机登录态打开项目首页；现有 Next 开发进程在进入任意项目编辑页时长时间停留在待响应状态，本轮未擅自终止用户进程。
- 为隔离开发服务阻塞，使用当前 `top-bar-overflow.ts` 编译产物与 `crepe-theme.css` 搭建 280px 真实 Chromium 夹具。验证结果：“更多”的父节点为 React 外层宿主、不在 `.crepe` 内；32px 按钮完整位于宿主右边界内并可命中点击；5 个超出项被收纳后菜单成功展开。
- 定向 Vitest 21 个用例、`@workbench/demo-ui` TypeScript 检查和 `git diff --check` 通过。

### 完整编辑页待验证项

现有 Next 开发服务恢复后，在已登录项目编辑页将中间文档栏缩窄，确认“更多”始终位于右上角、点击后菜单不被右侧评论栏覆盖，且编辑器本身不产生横向滚动。如仍不可见，先确认页面已加载最新 bundle，并检查 `[data-top-bar-overflow]` 是否直接位于 `[data-document-editor="crepe"]` 下；不再回退到 `.crepe` 或 TopBar 内部挂载。

### 相关文件

- [`packages/demo-ui/src/DocumentEditor.tsx`](../../../packages/demo-ui/src/DocumentEditor.tsx)
- [`packages/demo-ui/src/markdown/top-bar-overflow.ts`](../../../packages/demo-ui/src/markdown/top-bar-overflow.ts)
- [`packages/demo-ui/src/markdown/top-bar-overflow.test.ts`](../../../packages/demo-ui/src/markdown/top-bar-overflow.test.ts)
- [`packages/demo-ui/src/markdown/crepe-theme.css`](../../../packages/demo-ui/src/markdown/crepe-theme.css)
- [`packages/demo-ui/src/markdown/crepe-theme.test.ts`](../../../packages/demo-ui/src/markdown/crepe-theme.test.ts)
- [`packages/demo-ui/src/markdown/heading-style-toolbar.ts`](../../../packages/demo-ui/src/markdown/heading-style-toolbar.ts)
- [`packages/demo-ui/src/markdown/crepe-config.ts`](../../../packages/demo-ui/src/markdown/crepe-config.ts)

### 当前结论

根因已确认并修复：恢复入口必须挂在 React 外层编辑器宿主，不能挂在 `.crepe` 或 TopBar 内。窄容器的真实浏览器布局与交互已通过；剩余事项只是在现有 Next 开发服务恢复后，在完整项目编辑页再做一次视觉回归。
