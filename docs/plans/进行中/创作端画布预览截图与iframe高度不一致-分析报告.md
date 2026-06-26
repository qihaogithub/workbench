# 创作端画布预览截图与 iframe 高度不一致 - 分析报告

## 背景

用户反馈创作端项目编辑页预览区的画布模式中，未选中页面疑似展示截图，选中页面后切换为 iframe。两种状态下页面卡片尺寸不变，但页面内容高度和起始位置不同：选中后顶部出现空白，底部出现黑色空区或内容裁剪。

## 目标

- 确认截图路径与 iframe 路径的尺寸口径差异。
- 修复画布页面在截图与 iframe 间切换时的视觉不一致。
- 保持改动局部化，不影响单页面预览和无关画布能力。
- 同步更新配置与预览模块文档。

## 范围

- 代码范围：`packages/shared/src/demo/CanvasPageItem.tsx`、必要时涉及 `PreviewPanel` 的画布调用参数。
- 文档范围：`docs/项目文档/创作端/04-配置与预览/技术/07_截图服务与预览快照机制.md`。
- 不处理截图服务生成逻辑、画布自动排版、历史数据清理和其他未提交改动。

## 方案

画布页面卡片在进入 iframe 路径时，应把当前画布卡片高度换算回 iframe 内容高度，作为 `PreviewPanel.effectiveHeight` 的下限。这样 iframe 初始渲染就按卡片宽度贴顶缩放，不再先按 `$demo.previewSize.height` 居中适配；后续仍可由 iframe 测量或截图 `renderBox` 继续扩展卡片高度。

## 任务清单

- [x] 收集用户现象与预期行为
- [x] 阅读配置与预览模块相关需求和技术文档
- [x] 定位画布截图/iframe 渲染组件
- [x] 修复画布 iframe 初始高度口径
- [x] 更新项目文档
- [x] 运行匹配验证

## 进度记录

- 2026-06-26：确认当前会话未暴露 `codegraph_*` 工具，但仓库存在 `.codegraph/` 目录；改用本地文件搜索继续定位。
- 2026-06-26：从用户截图确认现象集中在画布页面选中前后的截图与 iframe 切换。
- 2026-06-26：阅读 `预览系统_需求文档.md`、`02_实时预览机制.md`、`07_截图服务与预览快照机制.md`，确认既有契约要求画布截图和 iframe 共享同一渲染基准。
- 2026-06-26：定位到 `CanvasPageItem` 的截图层贴顶按宽度展示，而 iframe 层通过 `PreviewPanel(fillContainer)` 在未获得有效内容高度时按初始视口居中适配容器，导致选中后顶部留白与底部裁剪。
- 2026-06-26：在 `CanvasPageItem` 中按当前画布卡片宽度反推 iframe 有效内容高度，让 iframe 初始渲染沿用卡片高度口径并从顶部贴齐。
- 2026-06-26：更新截图服务与预览快照机制文档，补充画布页面切换到实时 iframe 时的高度口径约束。
- 2026-06-26：验证通过 `corepack pnpm --filter @opencode-workbench/author-site typecheck` 与 `corepack pnpm --filter @opencode-workbench/author-site test`。根脚本 `pnpm check:author` 因当前 PATH 中裸 `pnpm` 为 11.7.0，和仓库 pnpm 8 锁文件不兼容，未能直接执行；已用 `corepack pnpm` 分拆执行等价检查。

## 最终状态

已完成。画布 iframe 路径会优先使用当前卡片高度推导出的有效内容高度，避免选中页面从截图切换到 iframe 时重新按初始视口居中适配。

## 验证结果

- `corepack pnpm --filter @opencode-workbench/author-site typecheck`：通过。
- `corepack pnpm --filter @opencode-workbench/author-site test`：通过，47 个测试套件、340 个测试全部通过。
- `pnpm check:author`：未进入项目检查阶段。当前 PATH 中裸 `pnpm` 为 11.7.0，会把 pnpm 8 锁文件识别为不兼容并尝试重装依赖，非 TTY 环境下中止。已用 `corepack pnpm` 分拆执行等价的 author-site 类型检查和测试。

## 相关代码路径

- `packages/shared/src/demo/CanvasPageItem.tsx`：画布页面截图与 iframe 渲染切换、内容高度回写、画布卡片高度反推 iframe 有效内容高度。
- `packages/shared/src/demo/PreviewPanel.tsx`：`fillContainer` 模式下根据 `effectiveHeight` 决定 iframe 贴顶按宽度缩放或按初始视口居中适配。
- `docs/项目文档/创作端/04-配置与预览/技术/07_截图服务与预览快照机制.md`：画布截图与 iframe 高度口径契约。

## 风险与待确认事项

- 当前工作区存在大量未提交改动，本次只修改预览相关文件和本计划文档，不整理其他变更。
- 若本地依赖或既有测试受其他未提交改动影响，需在结果中区分本次修改与环境/既有问题。
