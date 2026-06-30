# 问题排查当前状态

> 更新日期：2026-06-30

## 当前结论

问题排查与清理尚未形成独立自动任务。当前已有大量进行中计划和已完成记录，后续自动任务应以“更新当前状态、减少重复记录”为目标，不应追加流水账。

## 当前已知事项

- 根目录存在若干既有临时/诊断产物，`check:repo` 会给出 warning。
- `OPS/automations/diagnostics/` 已有 E2E 失败、预览不更新、AI 会话失败、发布 SESSION_NOT_FOUND 四个诊断包。
- `OPS/automations/knowledge/failure-patterns.md` 已记录 `check:repo` 临时产物 warning、registry 路径失效和 E2E 服务前置缺失三类失败模式。
- `corepack pnpm ops:automation stale-issues --json` 当前扫描 44 个进行中计划，标出 12 个 `completed-in-progress` 候选项；尚未自动移动或归档。
- 工作区可能存在与本自动任务无关的用户改动，自动任务不得回滚或整理。
- CLI 能力缺口已有长期跟踪文档，不应在问题排查 state 中重复维护。

## 下一次清理重点

- 运行 `corepack pnpm ops:automation stale-issues` 生成静态候选清单。
- 扫描 `docs/plans/进行中/` 中是否有已完成但未归档的问题。
- 检查是否存在同一问题的平行记录。
- 检查测试工具、CLI 和自动任务相关计划是否有过期状态。
- 对无法行动的历史测试脚本记录，提出归档或停用建议。

## 最近验证

- 2026-06-30：迁移上下文前运行过 `corepack pnpm check:repo`，通过但存在 9 个既有根目录临时/诊断产物 warning。
