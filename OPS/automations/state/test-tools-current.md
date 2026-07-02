# 测试工具治理当前状态

> 更新日期：2026-07-02

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
- `check:automation` 若失败，先排查 `OPS/automations/` context/runbook/state 中的低风险文档链接漂移，再判断是否为测试工具或 registry 问题。
- `check:repo` 仍可能因历史归档迁移暴露 Markdown 坏链；优先修复 `docs/项目文档/` 内失效的相对引用，不处理既有 9 条根目录临时/诊断产物 warning。
- 根 `package.json` 的 `diagnostics:*` 别名必须显式指向 `OPS/CLI/src/index.ts`；若写成仓库根相对路径 `src/index.ts`，`check:repo` 会将其判定为失效入口。
- Codex 沙箱内运行 Playwright 可能因 macOS 权限限制触发 `connect EPERM ::1:3200` 或 Chromium `MachPortRendezvousServer ... Permission denied (1100)`；若服务端口已监听，需先非沙箱复跑再判断是否为真实回归。

## 下一次检查

- 先运行 `corepack pnpm check:automation`，确认 registry 与路径、根脚本、文档引用一致。
- 检查根 `package.json` 中测试命令与实际脚本是否一致。
- 检查 `scripts/development/README.md` 是否覆盖全部开发诊断脚本。
- 检查 `test/创作端E2E回归测试/AGENTS.md` 是否与实际文件结构一致。
- 如 `check:repo` 再次出现 Markdown 坏链，优先检查近期计划文档归档后的相对路径是否同步更新，可参考 `docs/plans/已完成/计划文档Markdown坏链清理.md`。
- 检查近期 bug 修复是否缺少回归测试。

## 最近验证

- 2026-06-30：迁移上下文前运行过 `corepack pnpm check:repo`，通过但存在 9 个既有根目录临时/诊断产物 warning。
- 2026-07-01：`corepack pnpm check:automation`、`corepack pnpm check:all` 通过；`corepack pnpm test:e2e:core-flow` 在沙箱内因 Playwright/macOS 权限失败，非沙箱复跑通过。
- 2026-07-01：`corepack pnpm check:automation` 通过，`corepack pnpm ops:automation report --json` 显示 13 个 active 入口；本轮修复计划文档相对路径漂移后，`corepack pnpm check:repo` 通过并回到 9 条既有根目录临时/诊断产物 warning。
- 2026-07-02：`corepack pnpm check:automation` 初次运行因 `OPS/automations/contexts/cli-maintenance.md` 指向已迁移的 `docs/plans/进行中/CLI与创作端能力对齐长期跟踪.md` 失败；修正为 `docs/plans/进行中/创作端CLI.md` 后通过，`corepack pnpm ops:automation report --json` 仍显示 13 个 active 入口。
- 2026-07-02：`corepack pnpm check:all` 全量通过；`corepack pnpm test:e2e:core-flow` 在沙箱内复现 `connect EPERM ::1:3200` 与 Chromium `MachPortRendezvousServer ... Permission denied (1100)`，非沙箱复跑通过，判定为环境权限阻塞而非测试或业务回归。
- 2026-07-02：`corepack pnpm check:automation` 继续通过；`corepack pnpm ops:automation report --json` 维持 13 个 active 入口。`corepack pnpm check:repo` 发现 4 条 `docs/项目文档/` 历史归档坏链和 9 条既有根目录临时产物 warning；修复坏链后恢复通过。
- 2026-07-02：高频轻量检查发现根 `package.json` 的 9 个 `diagnostics:*` 脚本仍指向不存在的仓库根 `src/index.ts`；修正为 `OPS/CLI/src/index.ts` 后，`corepack pnpm check:repo` 恢复通过。追加的 `corepack pnpm diagnostics:recent -- --help` 冒烟在沙箱内因 `tsx` 本地 IPC pipe `listen EPERM` 失败，暂按环境限制记录。
