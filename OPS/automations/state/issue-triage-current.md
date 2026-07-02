# 问题排查当前状态

> 更新日期：2026-07-02

## 当前结论

问题排查与清理尚未形成独立自动任务。当前已有大量进行中计划和已完成记录，后续自动任务应以“更新当前状态、减少重复记录”为目标，不应追加流水账。

## 当前已知事项

- 根目录存在若干既有临时/诊断产物，`check:repo` 会给出 warning。
- 2026-07-01 暴露的计划文档 Markdown 坏链已完成低风险路径修复；后续若再次出现，优先排查计划文档归档后的相对路径漂移。
- `OPS/automations/diagnostics/` 已有 E2E 失败、创作端编辑诊断事件、预览不更新、AI 会话失败、发布 SESSION_NOT_FOUND 五个诊断包。
- 创作端编辑页、协同、自动保存、AI、预览或重新打开复原类问题应先走根目录 `diagnostics:*` 脚本建立事件时间线；只有 CLI 不可用或输出提示事件缺口时，才降级 `rg data/editor-diagnostics`，并在结论中标明使用 JSONL 兜底。
- 诊断系统本身是独立维护对象：若发现事件缺字段、CLI fallback 不可信、导出包缺信息或诊断包步骤漂移，应维护 `OPS/CLI`、`OPS/automations/diagnostics/editor-diagnostics.md` 和 `docs/项目文档/创作端/11-诊断与日志/`，不要只沉淀到单个业务问题文档。
- `OPS/automations/knowledge/failure-patterns.md` 已记录 `check:repo` 临时产物 warning、计划文档坏链、registry 路径失效和 E2E 服务前置缺失等失败模式。
- 2026-07-01 再次运行 `corepack pnpm ops:automation stale-issues --json`，当前扫描 16 个进行中计划，`flagged=0`；静态规则下暂未发现“已完成仍在进行中 / 长期未更新 / 疑似重复 / 缺失链接”候选项。
- 工作区可能存在与本自动任务无关的用户改动，自动任务不得回滚或整理。
- CLI 能力缺口已有长期跟踪文档，不应在问题排查 state 中重复维护。
- 若 E2E 在 Codex 沙箱内报 `connect EPERM ::1:3200` 或 Chromium `MachPortRendezvousServer ... Permission denied (1100)`，优先视为运行权限问题，先做非沙箱复跑，不直接创建业务缺陷文档。
- 历史计划文档坏链已收敛到 `docs/plans/已完成/计划文档Markdown坏链清理.md`，后续应复用该记录而不是继续在 state 追加清单。
- 2026-07-02 每日完整回归未发现新的业务缺陷或测试缺口；本轮仅修复 `OPS/automations/contexts/cli-maintenance.md` 到 `docs/plans/进行中/创作端CLI.md` 的低风险链接漂移。
- 2026-07-02 高频轻量检查再次发现 4 条 `docs/项目文档/` 指向已丢失归档文档的坏链；该类问题继续按低风险文档漂移处理，不升级为业务缺陷。
- 2026-07-02 高频轻量检查发现根 `package.json` 的 `diagnostics:*` 别名路径漂移；修复为 `OPS/CLI/src/index.ts` 后恢复通过，按低风险仓库卫生问题处理，不创建新的进行中文档。

## 下一次清理重点

- 运行 `corepack pnpm ops:automation stale-issues` 生成静态候选清单。
- 扫描 `docs/plans/进行中/` 中是否有已完成但未归档的问题。
- 检查是否存在同一问题的平行记录。
- 检查测试工具、CLI 和自动任务相关计划是否有过期状态。
- 检查 `diagnostics:*` 根脚本、`OPS/CLI/src/commands/diagnostics.ts`、`OPS/automations/diagnostics/editor-diagnostics.md` 与 `docs/项目文档/创作端/11-诊断与日志/` 是否仍一致。
- 对无法行动的历史测试脚本记录，提出归档或停用建议。

## 最近验证

- 2026-06-30：迁移上下文前运行过 `corepack pnpm check:repo`，通过但存在 9 个既有根目录临时/诊断产物 warning。
- 2026-07-01：`corepack pnpm check:automation`、`corepack pnpm check:all` 通过；`corepack pnpm test:e2e:core-flow` 沙箱内失败、非沙箱复跑通过，判定为环境权限阻塞而非产品回归。
- 2026-07-01：`corepack pnpm check:automation` 通过；`corepack pnpm ops:automation report --json` 显示 13 个 active 入口；本轮修复计划文档相对路径漂移后，`corepack pnpm check:repo` 通过并回到 9 条既有根目录临时/诊断产物 warning。
- 2026-07-01：`corepack pnpm check:automation` 再次通过；`corepack pnpm ops:automation stale-issues --json` 返回 `scanned=16`、`flagged=0`，本轮无需自动归档或合并进行中文档。
- 2026-07-02：`corepack pnpm check:automation` 初次因 OPS context 文档链接漂移失败，修复为当前 `docs/plans/进行中/创作端CLI.md` 后通过；`corepack pnpm check:all` 全量通过。
- 2026-07-02：本地 `3200/3201/3202/3300` 服务端口已监听；`corepack pnpm test:e2e:core-flow` 沙箱内复现 `connect EPERM ::1:3200` 与 Chromium `MachPortRendezvousServer ... Permission denied (1100)`，非沙箱复跑通过，因此未创建新的进行中文档。
- 2026-07-02：`corepack pnpm check:repo` 暴露 4 条项目文档坏链，分别位于 Demo 管理、动态编译方案和 AI 行为约束文档；修复为现存归档引用或文字说明后，检查恢复通过，未新增 `docs/plans/进行中/` 缺陷记录。
- 2026-07-02：高频轻量检查中，`corepack pnpm check:automation` 通过，`corepack pnpm ops:automation report --json` 仍为 13 个 active；`corepack pnpm check:repo` 初次因 9 个 `diagnostics:*` 根脚本路径漂移失败，修复后恢复为仅 9 条既有根目录临时/诊断产物 warning。
