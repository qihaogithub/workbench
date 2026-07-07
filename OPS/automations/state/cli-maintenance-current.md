# CLI 维护当前状态

> 更新日期：2026-07-07

## 当前结论

`project-cli` 已有独立自动维护文档和长期跟踪记录。下一轮 CLI 定时任务应优先读取：

- `docs/plans/进行中/创作端CLI.md`
- `docs/项目文档/创作端/10-CLI/技术/05_CLI能力自动化清单.md`
- `docs/项目文档/创作端/10-CLI/技术/06_CLI自动维护运行手册.md`

`commands --json`、`packages/project-cli/src/index.ts` 的 `register(...)` 列表与 `packages/project-cli/src/cli-all-commands.test.ts` 末尾的未覆盖守卫继续保持一致。2026-07-07 复核未发现新的 L3 只读命令缺口或已注册命令参数漂移：上一轮补齐的 `project create --category` 与 `project update --category`、`--authoring-preferences`、`--sketch-editor-engine`、`--clear-authoring-preferences` 仍与 `packages/project-core/src/service.ts` 的项目元数据写入能力、author-site `POST /api/demos` 与 `PATCH /api/demos/[id]` 入口保持同名同义，并继续进入 `cli-all-commands` 与稳定入口回归。

当前工作树新增的 HTML/CSS 原型页能力已进入共享层：`page create` 支持 `runtimeType: "prototype-html-css"` 与 `prototypeHtml`、`prototypeCss`、`prototypeMeta`，`page update-prototype` 与 `page switch-runtime` 已注册并纳入 `cli-all-commands` 覆盖。对应的文件读写、版本快照、运行时切换、恢复与校验由 `project-core` 承载，不属于 CLI 侧复制 Web 逻辑；但这条能力当前只确认创作端编辑事务与本地测试链路，不等同于发布、viewer 或本地项目包协议已经完整支持原型页。

当前工作树新增的草图页能力也已进入共享层：`page create` 支持 `runtimeType: "sketch-scene"` 与 `sketchScene`、`sketchMeta`，`page update-sketch` 通过 `switchPageRuntime` 复用 `project-core` 的草图 scene 文件读写、版本快照和 `@workbench/sketch-core` 校验；author-site 的 `/api/projects/[projectId]/demos` 与 `/runtime` 入口也已接受相同 runtimeType 和 scene 负载。本轮只确认共享层、CLI 和 author-site 本地测试链路，不等同于 viewer、publish 或 project-scaffold 已对草图页完成全链路收口。

当前页面历史模型已经从旧 `page version-*` 命令切换到通用 `resource version-*` 入口。author-site 的页面版本与知识文档版本入口均已迁到 `/api/projects/[projectId]/resources/[kind]/[resourceId]/versions/*`，知识文档增删改也会通过 `ProjectAdminService.resourceVersionCreate` / `resourceDelete` 写入资源历史；CLI 与共享层对齐本身没有缺命令，缺的是长期文档还保留旧命令名称和旧路由认知。

本轮复核还确认，知识文档“资源历史”与“知识文档 CRUD”仍是两层能力：`resource version-*` 与 `resourceDelete` 已进入共享层，但 `packages/author-site/src/app/api/knowledge/*` 仍直接维护 `knowledge/manifest.json` 和文档文件；`packages/author-site/src/app/api/workspaces/route.ts` 仍依赖 author-site 本地 workspace manager；`packages/author-site/src/app/api/screenshots/generate-batch/route.ts` 仍只做代理到 screenshot-service。因此 GAP-003、GAP-004、GAP-005 继续保持 L1，只报告不补 CLI。

本轮处理额外关闭了一个 L4 元数据对齐缺口：此前 CLI `project create` / `project update` 仅暴露名称和描述，未覆盖 Web 已有的项目分类与项目级创作偏好。当前已补齐 CLI 参数层与回归测试，但由于属于创建 / 更新类能力，自动化等级仍按 L4 记录，后续需要人工审核变更语义而非继续自动扩面。

外部自动化提示词仍使用旧文件名 `docs/plans/进行中/CLI与创作端能力对齐长期跟踪.md`。仓库内当前事实文档仍以 `docs/plans/进行中/创作端CLI.md` 为准；本轮已补回兼容入口，避免下一次运行因为文件名漂移中断。

根 `package.json` 新增的 `diagnostics:*` 稳定别名当前应指向 `OPS/CLI/src/index.ts`。若 `check:repo` 报告这些别名引用不存在的 `src/index.ts`，按根脚本路径漂移处理，不升级为 CLI 能力缺失。

当前工作树里的 `packages/project-core/src/service.ts` 还存在 `project_delete_execute` 同步清理已发布产物并重建 `published/projects-index.json` 的删除语义变更。这属于删除 / 发布链路，自动化等级继续按 L5 只报告；现有 CLI `project delete-preview`、`project delete-execute` 无需新增实现，本轮不自动扩面。

## 当前缺口

沿用 `CLI与创作端能力对齐长期跟踪.md` 中的当前缺口，不在本 state 重复维护能力清单。

## 下一次检查

- 检查 `project-core` 是否新增会话、工作区、知识文档或截图任务共享能力。
- 检查 `project-cli` 是否新增或缺失对应命令。
- 检查现有命令的参数面是否仍与共享层和 Web 路由一致，尤其是 `project create` / `project update` 的 `category` 与 `authoringPreferences`。
- 检查 HTML/CSS 原型页和草图页能力是否继续保持 `project-core` 共享承载，并确认能力清单、运行手册与全命令测试同步。
- 检查 `resource version-*`、`project commit-list`、`project materialize --check` 与 `project content-gc --dry-run` 输出是否继续与 author-site `/resources`、`/commits`、`/materialize` 路由保持一致。
- 检查 `page update-sketch`、`page switch-runtime --target-runtime-type sketch-scene` 与 author-site `/demos`、`/runtime` 路由是否继续复用共享层校验，而不是复制 demo-ui 编辑器逻辑。
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
- 2026-07-03：`corepack pnpm check:automation` 通过；`corepack pnpm ops:automation report --json` 仍显示 13 个 active 入口；`corepack pnpm exec tsx packages/project-cli/src/index.ts commands --json` 输出包含 `page switch-runtime`。结合 `register(...)`、`cli-all-commands` 与 `project-core.switchPageRuntime` 的对账结果，本轮仅补齐能力清单与状态文档。
- 2026-07-03：`corepack pnpm check:project-core` 通过（31 tests passed）；`corepack pnpm check:project-cli` 通过。当前工作树虽存在删除已发布产物的共享层改动，但未产生新的低风险 CLI 命令缺口。
- 2026-07-04：`corepack pnpm check:automation` 通过；`corepack pnpm ops:automation report --json` 仍显示 13 个 active 入口；`corepack pnpm exec tsx packages/project-cli/src/index.ts commands --json` 输出新增 `project commit-list`、`project materialize`、`project content-gc` 与 `resource version-*` 命令。对账 `packages/project-core/src/service.ts`、`packages/author-site/src/lib/project-api.ts` 与 `/api/projects/[projectId]/resources|commits|materialize` 路由后，确认这是共享层迁移已落地、长期文档尚未同步的低风险漂移；同时复核 `packages/author-site/src/app/api/knowledge/*` 仍直接写 `knowledge/manifest.json` 与文档文件，因此知识文档 CRUD 缺口继续保留。
- 2026-07-04：`corepack pnpm check:project-core` 通过（31 tests passed）；`corepack pnpm check:project-cli` 通过，期间覆盖了 `preview-contract` 20 tests 与 CLI 全命令回归，确认新增 `project commit-list` / `project materialize --check` / `project content-gc --dry-run` / `resource version-*` 在当前工作树下没有回归。
- 2026-07-05：`corepack pnpm check:automation` 通过；`corepack pnpm ops:automation report --json` 仍显示 13 个 active 入口；`corepack pnpm exec tsx packages/project-cli/src/index.ts commands --json` 输出新增 `page update-sketch`，并与 `packages/project-cli/src/index.ts` 注册项、`packages/project-cli/src/cli-all-commands.test.ts` 覆盖和 `packages/project-core/src/service.ts` 的 `sketch-scene` 共享能力保持一致。
- 2026-07-05：`corepack pnpm check:project-core` 通过（31 tests passed）；`corepack pnpm check:project-cli` 通过；`corepack pnpm check:author` 通过（85 test suites / 577 tests），确认草图页 runtimeType 与 scene 负载在当前工作树的共享层、CLI 与 author-site 本地测试链路下没有回归。
- 2026-07-06：`corepack pnpm check:automation` 通过；`corepack pnpm ops:automation report --json` 仍显示 13 个 active 入口；`corepack pnpm exec tsx packages/project-cli/src/index.ts commands --json` 输出仍与 `register(...)` 一致。对账 `packages/project-core/src/service.ts`、`packages/author-site/src/app/api/demos/route.ts` 与 `packages/author-site/src/app/api/demos/[id]/route.ts` 后，确认 CLI 先前遗漏了 `project create/update` 的 `category` 与项目级 `authoringPreferences` 参数面。
- 2026-07-06：`corepack pnpm check:project-cli` 通过，确认新增的项目元数据参数和稳定入口 / 全命令回归没有引入新失败。
- 2026-07-07：`corepack pnpm check:automation` 通过；`corepack pnpm ops:automation report --json` 仍显示 13 个 active 入口；`corepack pnpm exec tsx packages/project-cli/src/index.ts commands --json` 输出仍与 `register(...)` 一致，`packages/project-cli/src/cli-all-commands.test.ts` 仍使用 `registeredCommands.filter((command) => !executed.has(command))` 断言无未覆盖命令。
- 2026-07-07：对账 `packages/author-site/src/app/api/sessions/route.ts`、`workspaces/route.ts`、`knowledge/route.ts`、`knowledge/[docId]/route.ts` 与 `screenshots/generate-batch/route.ts` 后，确认剩余会话 / 工作区 / 知识文档 CRUD / 截图任务仍停留在 author-site 路由或代理层，不满足 CLI 自动补齐前提。
- 2026-07-07：`corepack pnpm check:project-cli` 通过（含 `preview-contract` 20 tests、`project-cli` typecheck 与 CLI 测试），确认本轮文档更新前后当前命令集没有回归。
