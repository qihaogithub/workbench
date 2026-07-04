# CLI 维护当前状态

> 更新日期：2026-07-04

## 当前结论

`project-cli` 已有独立自动维护文档和长期跟踪记录。下一轮 CLI 定时任务应优先读取：

- `docs/plans/进行中/创作端CLI.md`
- `docs/项目文档/创作端/10-CLI/技术/05_CLI能力自动化清单.md`
- `docs/项目文档/创作端/10-CLI/技术/06_CLI自动维护运行手册.md`

`commands --json`、`packages/project-cli/src/index.ts` 的 `register(...)` 列表与 `packages/project-cli/src/cli-all-commands.test.ts` 末尾的未覆盖守卫继续保持一致。2026-07-04 对账确认，当前工作树新增的内容图与资源历史命令 `project commit-list`、`project materialize`、`project content-gc`、`resource version-list`、`resource version-get`、`resource version-create`、`resource restore-version` 已全部注册，并已进入 `cli-all-commands` 覆盖。

当前工作树新增的 HTML/CSS 原型页能力已进入共享层：`page create` 支持 `runtimeType: "prototype-html-css"` 与 `prototypeHtml`、`prototypeCss`、`prototypeMeta`，`page update-prototype` 与 `page switch-runtime` 已注册并纳入 `cli-all-commands` 覆盖。对应的文件读写、版本快照、运行时切换、恢复与校验由 `project-core` 承载，不属于 CLI 侧复制 Web 逻辑；但这条能力当前只确认创作端编辑事务与本地测试链路，不等同于发布、viewer 或本地项目包协议已经完整支持原型页。

当前页面历史模型已经从旧 `page version-*` 命令切换到通用 `resource version-*` 入口。author-site 的页面版本与知识文档版本入口均已迁到 `/api/projects/[projectId]/resources/[kind]/[resourceId]/versions/*`，知识文档增删改也会通过 `ProjectAdminService.resourceVersionCreate` / `resourceDelete` 写入资源历史；CLI 与共享层对齐本身没有缺命令，缺的是长期文档还保留旧命令名称和旧路由认知。

本轮复核还确认，知识文档“资源历史”与“知识文档 CRUD”仍是两层能力：`resource version-*` 与 `resourceDelete` 已进入共享层，但 `packages/author-site/src/app/api/knowledge/*` 仍直接维护 `knowledge/manifest.json` 和文档文件，所以 GAP-004 继续保持 L1，只报告不补 CLI。

本轮处理的是低风险文档漂移：补齐 `project commit-list` / `project materialize` / `project content-gc` / `resource version-*` 相关清单、运行手册和长期跟踪结论，并明确 `project materialize`、`project content-gc`、`resource restore-version` 继续按高风险命令处理，不纳入自动合入。

外部自动化提示词仍使用旧文件名 `docs/plans/进行中/CLI与创作端能力对齐长期跟踪.md`。仓库内当前事实文档仍以 `docs/plans/进行中/创作端CLI.md` 为准；本轮已补回兼容入口，避免下一次运行因为文件名漂移中断。

根 `package.json` 新增的 `diagnostics:*` 稳定别名当前应指向 `OPS/CLI/src/index.ts`。若 `check:repo` 报告这些别名引用不存在的 `src/index.ts`，按根脚本路径漂移处理，不升级为 CLI 能力缺失。

当前工作树里的 `packages/project-core/src/service.ts` 还存在 `project_delete_execute` 同步清理已发布产物并重建 `published/projects-index.json` 的删除语义变更。这属于删除 / 发布链路，自动化等级继续按 L5 只报告；现有 CLI `project delete-preview`、`project delete-execute` 无需新增实现，本轮不自动扩面。

## 当前缺口

沿用 `CLI与创作端能力对齐长期跟踪.md` 中的当前缺口，不在本 state 重复维护能力清单。

## 下一次检查

- 检查 `project-core` 是否新增会话、工作区、知识文档或截图任务共享能力。
- 检查 `project-cli` 是否新增或缺失对应命令。
- 检查 HTML/CSS 原型页能力是否继续保持 `project-core` 共享承载，并确认能力清单、运行手册与全命令测试同步。
- 检查 `resource version-*`、`project commit-list`、`project materialize --check` 与 `project content-gc --dry-run` 输出是否继续与 author-site `/resources`、`/commits`、`/materialize` 路由保持一致。
- 检查 `preview compile`、`edit validate` 与 runtime contract 校验输出是否继续保持一致。
- 检查 CLI 全命令测试是否覆盖新增命令。
- 如有改动，运行 `corepack pnpm check:project-cli`；涉及领域服务时追加 `corepack pnpm check:project-core`。

## 最近验证

- 2026-06-30：迁移上下文时未修改 CLI 代码，未运行 CLI 包检查。
- 2026-07-01：`corepack pnpm check:automation` 通过；`corepack pnpm ops:automation report --json` 显示 13 个 active 入口（`tools.json` 3 / `tests.json` 6 / `scripts.json` 4），未发现 CLI 账本漂移。
- 2026-07-01：`corepack pnpm check:project-core` 通过；`corepack pnpm check:project-cli` 通过。期间修复了 `previewHealthcheck` 的 `RequestInit.cache` 类型阻塞。
- 2026-07-02：`corepack pnpm check:automation` 通过；`corepack pnpm ops:automation report --json` 仍显示 13 个 active 入口。`corepack pnpm exec tsx packages/project-cli/src/index.ts commands --json` 成功返回当前命令清单，并与 `register(...)` / `cli-all-commands` 覆盖守卫保持一致。
- 2026-07-02：高频轻量检查发现根 `package.json` 的 9 个 `diagnostics:*` 别名误指向仓库根 `src/index.ts`；改为 `OPS/CLI/src/index.ts` 后，`corepack pnpm check:repo` 恢复为仅 9 条既有根目录临时/诊断产物 warning。
- 2026-07-02：`corepack pnpm check:project-core` 通过（27 tests passed）；`corepack pnpm check:project-cli` 通过，确认 `page update-prototype` 已被全命令测试覆盖。
- 2026-07-02：`corepack pnpm check:author` 失败，但失败项集中在既有 `src/components/demo/home-page.test.tsx` 与 `src/components/demo/preview-canvas-interaction-mode.test.tsx` 超时，不属于本轮 CLI 对齐阻塞。
- 2026-07-03：`corepack pnpm check:automation` 通过；`corepack pnpm ops:automation report --json` 仍显示 13 个 active 入口；`corepack pnpm exec tsx packages/project-cli/src/index.ts commands --json` 输出包含 `page switch-runtime`。结合 `register(...)`、`cli-all-commands` 与 `project-core.switchPageRuntime` 的对账结果，本轮仅补齐能力清单与状态文档。
- 2026-07-03：`corepack pnpm check:project-core` 通过（31 tests passed）；`corepack pnpm check:project-cli` 通过。当前工作树虽存在删除已发布产物的共享层改动，但未产生新的低风险 CLI 命令缺口。
- 2026-07-04：`corepack pnpm check:automation` 通过；`corepack pnpm ops:automation report --json` 仍显示 13 个 active 入口；`corepack pnpm exec tsx packages/project-cli/src/index.ts commands --json` 输出新增 `project commit-list`、`project materialize`、`project content-gc` 与 `resource version-*` 命令。对账 `packages/project-core/src/service.ts`、`packages/author-site/src/lib/project-api.ts` 与 `/api/projects/[projectId]/resources|commits|materialize` 路由后，确认这是共享层迁移已落地、长期文档尚未同步的低风险漂移；同时复核 `packages/author-site/src/app/api/knowledge/*` 仍直接写 `knowledge/manifest.json` 与文档文件，因此知识文档 CRUD 缺口继续保留。
- 2026-07-04：`corepack pnpm check:project-core` 通过（31 tests passed）；`corepack pnpm check:project-cli` 通过，期间覆盖了 `preview-contract` 20 tests 与 CLI 全命令回归，确认新增 `project commit-list` / `project materialize --check` / `project content-gc --dry-run` / `resource version-*` 在当前工作树下没有回归。
