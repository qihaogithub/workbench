# 测试工具治理当前状态

> 更新日期：2026-06-30

## 当前结论

测试工具治理尚未形成独立自动任务。当前仓库已有以下入口：

- 根质量门禁：`check:*`、`test:e2e`、若干 `test:*` 诊断命令。
- 正式 E2E：`test/创作端E2E回归测试/`。
- 开发诊断脚本：`scripts/development/`。
- OPS 诊断工具：`OPS/CLI/`。
- 历史测试脚本：`docs/plans/测试脚本/`。

## 当前关注点

- `OPS/automations/registry/*.json` 是工具、测试和脚本的机器可读账本，新增入口后应同步登记。
- `OPS/CLI` 是 Agent Service 诊断工具，不应替代正式测试。
- `scripts/development/` 中稳定断言脚本需要定期评估是否迁移到正式测试。
- `docs/plans/测试脚本/` 默认视为历史输入，不作为新自动任务默认入口。
- E2E 应继续使用统一测试项目 helper 和清理策略。

## 下一次检查

- 先运行 `corepack pnpm check:automation`，确认 registry 与路径、根脚本、文档引用一致。
- 检查根 `package.json` 中测试命令与实际脚本是否一致。
- 检查 `scripts/development/README.md` 是否覆盖全部开发诊断脚本。
- 检查 `test/创作端E2E回归测试/AGENTS.md` 是否与实际文件结构一致。
- 检查近期 bug 修复是否缺少回归测试。

## 最近验证

- 2026-06-30：迁移上下文前运行过 `corepack pnpm check:repo`，通过但存在 9 个既有根目录临时/诊断产物 warning。
