# 问题排查当前状态

> 更新日期：2026-07-01

## 当前结论

问题排查与清理尚未形成独立自动任务。当前已有大量进行中计划和已完成记录，后续自动任务应以“更新当前状态、减少重复记录”为目标，不应追加流水账。

## 当前已知事项

- 根目录存在若干既有临时/诊断产物，`check:repo` 会给出 warning。
- `check:repo` 于 2026-07-01 新暴露 9 条计划文档 Markdown 坏链 warning，命中文件为 `单页预览右侧属性面板优化方案.md`、`P0项目管理关键动作强制同步实施计划.md`、`CLI与创作端能力对齐长期跟踪.md`、`项目管理方案长期优化评估.md`。
- `OPS/automations/diagnostics/` 已有 E2E 失败、预览不更新、AI 会话失败、发布 SESSION_NOT_FOUND 四个诊断包。
- `OPS/automations/knowledge/failure-patterns.md` 已记录 `check:repo` 临时产物 warning、计划文档坏链、registry 路径失效和 E2E 服务前置缺失等失败模式。
- `corepack pnpm ops:automation stale-issues --json` 当前扫描 44 个进行中计划，标出 12 个 `completed-in-progress` 候选项；尚未自动移动或归档。
- 工作区可能存在与本自动任务无关的用户改动，自动任务不得回滚或整理。
- CLI 能力缺口已有长期跟踪文档，不应在问题排查 state 中重复维护。
- 若 E2E 在 Codex 沙箱内报 `connect EPERM ::1:3200` 或 Chromium `MachPortRendezvousServer ... Permission denied (1100)`，优先视为运行权限问题，先做非沙箱复跑，不直接创建业务缺陷文档。
- 计划文档坏链已单独记录到 `docs/plans/进行中/计划文档Markdown坏链清理.md`，后续应在该文档里收敛，而不是继续在 state 追加清单。

## 下一次清理重点

- 运行 `corepack pnpm ops:automation stale-issues` 生成静态候选清单。
- 扫描 `docs/plans/进行中/` 中是否有已完成但未归档的问题。
- 检查是否存在同一问题的平行记录。
- 检查测试工具、CLI 和自动任务相关计划是否有过期状态。
- 对无法行动的历史测试脚本记录，提出归档或停用建议。

## 最近验证

- 2026-06-30：迁移上下文前运行过 `corepack pnpm check:repo`，通过但存在 9 个既有根目录临时/诊断产物 warning。
- 2026-07-01：`corepack pnpm check:automation`、`corepack pnpm check:all` 通过；`corepack pnpm test:e2e:core-flow` 沙箱内失败、非沙箱复跑通过，判定为环境权限阻塞而非产品回归。
- 2026-07-01：`corepack pnpm check:automation` 通过；`corepack pnpm ops:automation report --json` 显示 13 个 active 入口；`corepack pnpm check:repo` 通过但出现 18 条 warning，其中 9 条为既有根目录临时/诊断产物，9 条为计划文档 Markdown 坏链。
