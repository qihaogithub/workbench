# 每周完整回归 Runbook

## 目标

每周低峰期运行更完整的质量检查，发现日常轻量巡检覆盖不到的跨包回归、E2E 问题和测试工具失效。

## 读取

1. `OPS/automations/AGENTS.md`
2. `contexts/test-tools-maintenance.md`
3. `contexts/issue-triage-and-cleanup.md`
4. `state/test-tools-current.md`
5. `state/issue-triage-current.md`
6. `test/创作端E2E回归测试/AGENTS.md`

## 前置检查

- 确认是否需要启动 author-site、agent-service、viewer-site 或 screenshot-service。
- 确认 E2E 浏览器依赖是否可用。
- 确认测试项目清理策略仍有效。
- 确认当前工作区 dirty changes 不会影响测试结果判断。

## 推荐执行

1. 运行 `corepack pnpm check:all`。
2. 如果服务前置条件满足，运行 `corepack pnpm test:e2e`。
3. 若失败，按问题排查上下文分类。
4. 收集失败摘要、截图或报告路径。
5. 更新 state 和对应问题文档。

## 失败分类

| 现象 | 处理 |
|:-----|:-----|
| `check:all` 类型或单测失败 | 定位到对应包，创建或更新修复计划 |
| E2E 服务未启动 | 记录环境阻塞，不改业务代码 |
| E2E 定位失效 | 进入测试工具治理 |
| E2E 稳定复现业务错误 | 创建业务问题记录 |
| 外部服务失败 | 记录外部依赖异常 |

## 输出

- `OPS/automations/state/test-tools-current.md`
- `OPS/automations/state/issue-triage-current.md`
- 必要时更新 `docs/plans/进行中/`

不要提交 Playwright 报告、截图、trace 或临时日志。

报告格式优先使用 `OPS/automations/templates/regression-report.md`。
