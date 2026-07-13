# 每日轻量检查 Runbook

## 目标

每日发现高信号、低成本的问题：CLI 能力漂移、根验证入口失效、测试工具明显过期、进行中状态需要更新。

## 读取

1. `OPS/automations/AGENTS.md`
2. `OPS/automations/README.md`
3. `contexts/cli-maintenance.md`
4. `contexts/test-tools-maintenance.md`
5. `state/cli-maintenance-current.md`
6. `state/test-tools-current.md`

## 推荐步骤

1. 检查工作区状态，识别无关 dirty changes。
2. 读取当前 state，不从历史文档重新开始。
3. 检查根 `package.json` 的 `check:*` 和 `test:*` 入口是否仍成立。
4. 运行 `corepack pnpm check:automation`，检查 registry、路径和根脚本引用。
5. 检查 `OPS/CLI`、`scripts/development`、E2E 文档是否与实际文件结构一致。
6. 对 CLI 能力只做增量扫描：关注近期变化和当前缺口。
7. 运行低成本验证。
8. 覆盖更新对应 state。

当近期改动 Workspace 写入、Authority、部署或 `DATA_DIR` 时，追加运行 `corepack pnpm check:workspace-deploy-preflight`。该命令只读扫描本地 `data/`；若发现未注册 live Workspace、外部漂移、lease、prepared 事务、committed backup 缺口或 Compose 共享 `DATA_DIR` 不一致，只报告并保留失败，不自动 adopt/restore。

## 推荐验证

优先选择：

- `corepack pnpm check:repo`
- `corepack pnpm check:automation`
- `corepack pnpm check:project-cli`
- `corepack pnpm check:workspace-deploy-preflight`

只有当本轮触及具体包或失败指向具体包时，才追加包级检查。

## 输出

更新：

- `OPS/automations/state/cli-maintenance-current.md`
- `OPS/automations/state/test-tools-current.md`

如果发现真实缺陷，新建或更新 `docs/plans/进行中/` 下的具体问题文档。

报告格式优先使用 `OPS/automations/templates/daily-check-report.md`。

## 停机

遇到发布、删除、权限、鉴权、生产数据、密钥或业务规则定义，停止并只输出报告。
