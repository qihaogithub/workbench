#  Markdown 编辑器 TopBar 工具栏裁切

> 最后更新：2026-08-14
> 状态：已完成；真实项目编辑页的布局、命中与菜单交互回归通过。

## Markdown 编辑器 TopBar 工具栏裁切与“更多”入口缺失

### 现象与影响

创作端编辑页的 Markdown 编辑器（Milkdown Crepe）在中间文档栏宽度受两侧栏挤压时，原生 TopBar 会从右侧被裁切。用户连续提供的截图显示：右端工具图标无法完整展示，预期用于访问被收纳操作的“更多”（`…`）入口也不可见。因此用户无法使用右侧格式功能。

验收目标：无论编辑器实际宽度如何，右侧都必须有可点击、可见的“更多”入口；宽度不足的原生操作需进入该菜单，不能让编辑器整体发生横向滚动。

### 当前实现状态

- 编辑器入口为 [`DocumentEditor.tsx`](../../../packages/demo-ui/src/DocumentEditor.tsx)，在 Crepe `create()` 完成后挂载 `mountTopBarOverflow`（约 173–180 行）。
- 溢出适配器在 [`top-bar-overflow.ts`](../../../packages/demo-ui/src/markdown/top-bar-overflow.ts)；它读取 Crepe 的 `.milkdown-top-bar` 与 `.top-bar-inner`，按工具项宽度设置原节点 `hidden`，并为菜单克隆可点击的转发按钮。
- “更多”节点插入 React 管理的最外层 `[data-document-editor="crepe"]`，与 `.crepe` 滚动/裁切容器为兄弟节点；其层级高于原生 TopBar，并持续绑定 Crepe/Vue 当前实际使用的 `.top-bar-inner`。
- TopBar 内部行已预留 `48px` 右侧宽度（[`crepe-theme.css`](../../../packages/demo-ui/src/markdown/crepe-theme.css) 约 90–99 行），标题下拉已按需求使用紧凑的 `正文 / H1–H6`（[`heading-style-toolbar.ts`](../../../packages/demo-ui/src/markdown/heading-style-toolbar.ts) 约 6–14 行）。
- 当前代码、测试及样式改动均仍在未提交工作区；后续须避免覆盖其他大量用户改动。
- 恢复菜单的工具按钮是原生 TopBar 按钮的克隆，挂载后已脱离 `.milkdown .milkdown-top-bar` 主题选择器作用域；宿主主题对其 SVG 显式补齐默认与悬停的 `color` / `fill`，避免深色菜单中图标回退为黑色。

### 已尝试的方案与结论

| 方案 | 结论 |
| --- | --- |
| 仅为编辑器和 TopBar 设置 `min-width: 0`、`width/max-width: 100%`，并阻断横向滚动 | 未解决截图中的右端裁切。 |
| 在 `.top-bar-inner` 内追加“更多”，按 TopBar 宽度隐藏后续原生工具 | 未解决；内部行本身可被 Crepe 裁切，因此入口会一并不可见。 |
| 将“更多”提升为 `.milkdown-top-bar` 的子节点并绝对定位 | 用户仍反馈不可见；TopBar 仍属于 Crepe 的 Vue 受控树，不能假设追加节点不会被更新或受其 overflow 链影响。 |
| 将“更多”提升为 `.crepe` 直接子节点 | 仍位于 `.crepe` 自身的滚动/裁切链中，没有解决根因。 |
| 将“更多”提升为 React 外层编辑器宿主的直接子节点 | 只解决了裁切链；入口层级低于原生 TopBar，中心点仍命中原生按钮。 |
| 仅在首次发现 `.top-bar-inner` 时绑定并重试测量 | 无效；Crepe/Vue 后续替换了整个 TopBar DOM，适配器反复测量的是已脱离文档的旧节点。 |
| 持续核对 TopBar DOM 身份并重绑定 | 已实现；新 TopBar 接管后收纳逻辑立即作用于当前节点。 |

最终根因是三个边界同时失效：恢复入口虽已逃离 `.crepe` 裁切链，但 `z-index: 2` 低于原生 TopBar 的 `10`；收纳逻辑捕获了会被 Crepe/Vue 替换的短命 DOM 节点；即使旧节点被设为 `hidden`，主题的按钮 `display` 规则仍会让它占据布局。修复后由外层观察器监控 TopBar 节点身份，发生替换时销毁旧控制器并重绑定；同时提升入口层级并恢复 `[hidden]` 的退出布局语义。

选区标题菜单是独立的直接原因：自定义触发器没有复用原生按钮的 `6px` 边距，顶边比原生按钮高 `6px`；点击后菜单虽然被创建，但绝对定位在 `overflow: hidden` 的 `.milkdown-toolbar` 之外，因而完全被裁掉。修复后触发器与原生按钮对齐，箭头使用稳定独立节点，菜单可越过工具条边界保持可见可点。

“更多”菜单图标过暗同样是主题作用域问题，不是图标资源问题：克隆按钮的 `color` 为浅灰，但 SVG 实际依赖 `fill`；离开 `.milkdown` 后 `fill` 回退为 `rgb(0, 0, 0)`，与 `rgb(10, 10, 10)` 菜单背景几乎融合。恢复菜单现在直接承接 Crepe 的表面图标色，并在悬停时与原工具按钮一致切换为主题主色。

### 已有自动化验证

下列命令在本机通过；它们只验证 jsdom 中的适配逻辑与静态样式契约，**不能证明实际编辑页已使用了最新 bundle，也不能证明 Crepe 实际布局未裁切**：

```bash
corepack pnpm --filter @workbench/demo-ui exec vitest run src/markdown/top-bar-overflow.test.ts src/markdown/crepe-theme.test.ts --pool=forks --maxWorkers=1 --minWorkers=1 --no-file-parallelism
corepack pnpm --filter @workbench/demo-ui typecheck
```

结果：`check:demo-ui` 通过，共 17 个测试文件、108 个用例；其中 TopBar、主题与标题菜单定向回归为 29 个用例。`@workbench/demo-ui` TypeScript 检查通过。

### 本轮运行时验证

- 在用户指定的真实项目编辑页复现并取证，不再使用隔离夹具代替完整页。
- 修复前：“更多”中心命中原生 `.top-bar-item`；适配器闭包中的 TopBar 宽度连续 16 次为 `0/0`，当前页面实际节点已为 `551/535`，证明旧 DOM 引用已过期。标题菜单展开后已创建 7 个选项，但菜单区域命中 `.ProseMirror`，证明被父工具栏裁切。
- 修复后：TopBar `scrollWidth` 与 `clientWidth` 均为 `551px`，6 个尾部节点以 `display:none` 退出布局；“更多”中心命中自身按钮，菜单完整位于右侧评论栏之前并展示 4 个被收纳操作。
- 选区标题触发器与原生按钮的顶边同为约 `243px`；菜单从工具条底边 `282px` 下方展开，首个选项实际命中按钮。点击当前 `H2` 选项后菜单关闭，文档标题保持 `H2`，未改动用户内容。
- 后续截图反馈复现了恢复菜单图标过暗：修复前克隆 SVG `fill` 为黑色，原 TopBar SVG 为 `color(srgb 0.792 0.792 0.792)`。修复后两者 `fill` 一致，4 个恢复项均清晰可见；悬停时图标和按钮背景同步切换主题状态。

### 相关文件

- [`packages/demo-ui/src/DocumentEditor.tsx`](../../../packages/demo-ui/src/DocumentEditor.tsx)
- [`packages/demo-ui/src/markdown/top-bar-overflow.ts`](../../../packages/demo-ui/src/markdown/top-bar-overflow.ts)
- [`packages/demo-ui/src/markdown/top-bar-overflow.test.ts`](../../../packages/demo-ui/src/markdown/top-bar-overflow.test.ts)
- [`packages/demo-ui/src/markdown/crepe-theme.css`](../../../packages/demo-ui/src/markdown/crepe-theme.css)
- [`packages/demo-ui/src/markdown/crepe-theme.test.ts`](../../../packages/demo-ui/src/markdown/crepe-theme.test.ts)
- [`packages/demo-ui/src/markdown/heading-style-toolbar.ts`](../../../packages/demo-ui/src/markdown/heading-style-toolbar.ts)
- [`packages/demo-ui/src/markdown/crepe-config.ts`](../../../packages/demo-ui/src/markdown/crepe-config.ts)

### 当前结论

根因已确认并完整修复：恢复入口的挂载边界、层级、收纳语义和跨作用域主题承接缺一不可，且不能将 Crepe/Vue 初次生成的 TopBar DOM 当作稳定引用。选区标题菜单必须与原生按钮对齐，并显式逃离父工具栏的裁切。自动化、类型检查和用户指定的完整项目编辑页回归均已通过，无剩余验证项。
