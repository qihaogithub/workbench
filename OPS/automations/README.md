# Codex 自动任务上下文

本目录是 Codex 定时任务在本仓库中运行时的项目内上下文入口。它服务三类长期任务：

1. 维护创作端 CLI 工具。
2. 维护测试工具和脚本。
3. 定期检查、排查问题并清理过期记录。

这里的文档按 AI 执行效率组织，不按项目文档知识库的需求/技术结构组织。

## 目录结构

| 目录 | 用途 |
|:-----|:-----|
| `contexts/` | 长期任务上下文，说明任务目标、输入、判断规则和停机条件 |
| `runbooks/` | 按触发方式组织的执行手册，例如每日检查、每周回归、每周清理 |
| `state/` | 当前状态账本，只保留仍成立的结论，供下一次定时任务继续 |
| `registry/` | 机器可读的工具、测试和脚本账本 |
| `diagnostics/` | 高频问题诊断包，帮助 AI 按固定路径定位根因 |
| `knowledge/` | 可复用失败模式和分类经验 |
| `templates/` | 定时任务报告模板 |
| `bin/` | 自动任务可执行检查入口 |

## 任务入口

| 任务 | Context | 推荐 Runbook | State |
|:-----|:--------|:-------------|:------|
| 创作端 CLI 工具维护 | [cli-maintenance](./contexts/cli-maintenance.md) | [daily-check](./runbooks/daily-check.md) | [cli-maintenance-current](./state/cli-maintenance-current.md) |
| 测试工具与脚本治理 | [test-tools-maintenance](./contexts/test-tools-maintenance.md) | [daily-check](./runbooks/daily-check.md)、[weekly-regression](./runbooks/weekly-regression.md) | [test-tools-current](./state/test-tools-current.md) |
| 问题排查与清理 | [issue-triage-and-cleanup](./contexts/issue-triage-and-cleanup.md) | [weekly-cleanup](./runbooks/weekly-cleanup.md) | [issue-triage-current](./state/issue-triage-current.md) |

## 高频诊断

日常开发遇到具体问题时，先查 [诊断包索引](./diagnostics/README.md)，再按对应路径排查。当前覆盖：

- [E2E 失败](./diagnostics/e2e-failed.md)
- [创作端编辑诊断事件](./diagnostics/editor-diagnostics.md)
- [预览不更新](./diagnostics/preview-not-updating.md)
- [AI 会话失败](./diagnostics/ai-session-failed.md)
- [发布 SESSION_NOT_FOUND](./diagnostics/publish-session-not-found.md)

可复用失败模式记录在 [failure-patterns](./knowledge/failure-patterns.md)。

## 与其他目录的关系

| 位置 | 角色 |
|:-----|:-----|
| `docs/项目文档/` | 长期项目知识库，沉淀业务语义、接口契约和架构边界 |
| `docs/plans/进行中/` | 当前问题、缺口和实施计划 |
| `docs/plans/已完成/` | 已关闭的问题、历史方案和验收证据 |
| `OPS/CLI/` | 长期工程诊断工具和 Agent Service 测试工具 |
| `scripts/development/` | 开发期复现、采样和诊断脚本 |
| `test/` | 正式回归测试 |
| `$CODEX_HOME/automations/*/memory.md` | Codex 自动化平台自己的运行记忆，不作为仓库长期事实来源 |

## 输出规则

每次自动任务至少输出：

- 本次结论。
- 发现的缺口或问题。
- 修改文件列表。
- 运行的验证命令和结果。
- 下一次应继续检查的事项。

长期状态写入 `state/`，具体问题写入 `docs/plans/进行中/`，可复用规则写回 `docs/项目文档/`。

## 机器检查入口

定时任务应优先使用机器检查入口建立工具上下文：

```bash
corepack pnpm ops:automation list-tools
corepack pnpm ops:automation report
corepack pnpm ops:automation stale-issues
corepack pnpm check:automation
```

`check:automation` 只做无副作用检查：registry JSON、登记路径、根脚本引用和文档引用。它不启动服务、不运行 E2E、不修改数据。

`stale-issues` 只扫描 `docs/plans/进行中/`，报告已完成仍在进行中、长期未更新、疑似重复标题和缺失链接，不移动或删除文件。

## Registry 维护

新增或调整测试工具时，同步更新：

- [tools.json](./registry/tools.json)：长期工程工具和 OPS 工具。
- [tests.json](./registry/tests.json)：正式验证入口和质量门禁。
- [scripts.json](./registry/scripts.json)：开发期诊断脚本。

registry 中的 `automationLevel` 用于指导定时任务处理方式：

| 等级 | 含义 |
|:-----|:-----|
| `auto-run` | 可在定时任务中直接运行的低副作用检查 |
| `report-only` | 只做发现和报告，不自动运行或修复 |
| `auto-fix-low-risk` | 可自动修复路径、文档、账本等低风险漂移 |
| `manual-or-weekly` | 只在每周回归或人工触发时运行 |
