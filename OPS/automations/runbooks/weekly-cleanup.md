# 每周问题清理 Runbook

## 目标

清理已处理、已过期、重复或无法行动的问题记录，让自动任务下一轮只看到当前仍成立的结论。

## 读取

1. `OPS/automations/AGENTS.md`
2. `contexts/issue-triage-and-cleanup.md`
3. `state/issue-triage-current.md`
4. `docs/plans/进行中/AGENTS.md`
5. `docs/plans/已完成/AGENTS.md`

## 清理步骤

1. 扫描 `docs/plans/进行中/` 中与自动任务、CLI、测试、脚本、排查相关的文档。
2. 运行 `corepack pnpm ops:automation stale-issues` 获取静态候选项。
3. 对照 state，判断问题是否仍成立。
4. 对已验证关闭的问题，移动或记录到已完成分类。
5. 对重复记录，保留最新或最完整的一份，并在被合并处说明去向。
6. 对已过期问题，记录过期原因后从当前 state 移除。
7. 对仍需处理的问题，只保留当前结论和下一步动作。

## 可清理对象

- 已关闭但仍在进行中列表的问题。
- 同一问题的重复计划。
- 已被正式测试覆盖的历史测试脚本待办。
- 已不存在功能对应的问题记录。
- `state/` 中不再成立的缺口。

## 不自动清理

- 真实用户数据。
- 数据库、缓存、截图、trace、日志等运行现场。
- 需要人工判断价值的历史根因分析。
- 涉及发布、删除、权限和生产环境的问题。

## 输出

更新：

- `OPS/automations/state/issue-triage-current.md`
- 必要的 `docs/plans/进行中/*.md`
- 必要的 `docs/plans/已完成/*.md`

最终报告写清：关闭了什么、保留了什么、为什么。

报告格式优先使用 `OPS/automations/templates/cleanup-report.md`。
