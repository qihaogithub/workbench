# 测试工具治理当前状态

> 更新日期：2026-07-01

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
- `check:repo` 当前除根目录临时/诊断产物外，还暴露 9 条计划文档 Markdown 坏链 warning；这属于文档引用漂移，不应继续归类为“仅有临时产物 warning”。
- Codex 沙箱内运行 Playwright 可能因 macOS 权限限制触发 `connect EPERM ::1:3200` 或 Chromium `MachPortRendezvousServer ... Permission denied (1100)`；若服务端口已监听，需先非沙箱复跑再判断是否为真实回归。

## 下一次检查

- 先运行 `corepack pnpm check:automation`，确认 registry 与路径、根脚本、文档引用一致。
- 检查根 `package.json` 中测试命令与实际脚本是否一致。
- 检查 `scripts/development/README.md` 是否覆盖全部开发诊断脚本。
- 检查 `test/创作端E2E回归测试/AGENTS.md` 是否与实际文件结构一致。
- 跟进 `docs/plans/进行中/计划文档Markdown坏链清理.md`，确认坏链修复后 `check:repo` 是否回到仅剩临时产物 warning。
- 检查近期 bug 修复是否缺少回归测试。

## 最近验证

- 2026-06-30：迁移上下文前运行过 `corepack pnpm check:repo`，通过但存在 9 个既有根目录临时/诊断产物 warning。
- 2026-07-01：`corepack pnpm check:automation`、`corepack pnpm check:all` 通过；`corepack pnpm test:e2e:core-flow` 在沙箱内因 Playwright/macOS 权限失败，非沙箱复跑通过。
- 2026-07-01：`corepack pnpm check:automation` 通过，`corepack pnpm ops:automation report --json` 显示 13 个 active 入口；`corepack pnpm check:repo` 通过，但 warning 增至 18 条，其中 9 条为计划文档 Markdown 坏链。
