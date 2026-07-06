# 项目管理与 CLI 问题沉淀

## 当前状态

CLI 与创作端能力对齐仍需长期跟踪。最近更新：2026-07-06。

主线结论：CLI 对账仍只剩 4 个结构性共享层缺口，但 2026-07-06 额外发现并修复了一个 L4 参数面对齐缺口：Web 与 `project-core` 已支持项目分类和项目级创作偏好，CLI `project create` / `project update` 之前没有完整暴露这些字段。`commands --json` 与 `register(...)` 列表继续保持一致，`cli-all-commands` 末尾仍用反查守卫覆盖所有已注册命令。

## 当前缺口

| 编号 | 状态 | 自动化等级 | 缺口 | 当前判断 |
| --- | --- | --- | --- | --- |
| GAP-002 | 待处理 | L1 | 会话管理缺失 | Web 会话创建/删除依赖 agent-service、模型配置和外部鉴权同步；`project-core` 尚无共享会话生命周期能力 |
| GAP-003 | 待处理 | L1 | 工作区管理缺失 | Web 工作区仍停留在 author-site 本地 manager；`project-core` 尚无统一工作区服务 |
| GAP-004 | 待处理 | L1 | 知识文档 CRUD 缺失 | Web 侧知识文档直接操作 `workingDir/knowledge` 与 manifest，缺少适用于 CLI 的共享领域封装 |
| GAP-005 | 待处理 | L1 | 截图任务命令缺失 | 截图任务依赖 author-site 代理与 screenshot-service；当前 `project-core` 只有健康状态查询，未具备任务级共享能力 |

## 已关闭项

- GAP-000：`project duplicate` 参数顺序回归已关闭，当前 `packages/project-cli/src/index.ts` 与全命令测试正常。
- GAP-001：页面版本历史/快照查询缺失已关闭，当前页面历史已统一走 `resource version-list`、`resource version-get`、`resource version-create` 与 `resource restore-version`；旧 `page version-*` / `page restore-version` 不再是事实入口。
- GAP-006：`corepack pnpm` 标准验证环境阻塞已关闭。
- GAP-007：runtime contract 校验 CLI 缺口已关闭，当前已覆盖 `project validate-runtime`、`page validate-runtime`，并由 `packages/project-core/src/service.ts` 提供共享能力。
- GAP-008：HTML/CSS 原型页 CLI 缺口已关闭，当前 `page create` 已支持 `runtimeType: "prototype-html-css"` 与原型页文件输入，`page update-prototype`、`page switch-runtime` 已注册并复用 `packages/project-core/src/service.ts` 的共享文件读写、运行时切换、版本快照与静态安全校验。
- GAP-009：草图页 CLI 缺口已关闭，当前 `page create` 已支持 `runtimeType: "sketch-scene"` 与 `sketchScene` / `sketchMeta` 输入，`page update-sketch` 与 `page switch-runtime --target-runtime-type sketch-scene` 已注册并复用 `packages/project-core/src/service.ts` 的共享文件读写、内容图持久化、版本快照与 `@workbench/sketch-core` 校验。
- GAP-010：项目元数据参数面对齐缺口已关闭。当前 `project create` 已支持 `--category`，`project update` 已支持 `--category`、`--authoring-preferences`、`--sketch-editor-engine` 与 `--clear-authoring-preferences`，并复用 `packages/project-core/src/service.ts` 与 author-site 项目元数据路由的既有语义。

## 验证状态

- `corepack pnpm check:automation`：通过。
- `corepack pnpm ops:automation report --json`：通过，当前仍为 13 个 active 入口（`tools.json` 3 / `tests.json` 6 / `scripts.json` 4）。
- `corepack pnpm exec tsx packages/project-cli/src/index.ts commands --json`：通过；返回的命令清单与 `packages/project-cli/src/index.ts` 注册项一致。
- `packages/project-cli/src/cli-all-commands.test.ts`：仍以 `registeredCommands.filter((command) => !executed.has(command))` 断言没有未覆盖命令。
- `corepack pnpm check:project-core`：通过（31 tests passed），确认原型页与草图页能力的共享层实现可通过类型检查与单元测试。
- `corepack pnpm check:project-cli`：通过，确认 `page update-prototype`、`page update-sketch` 与扩展后的 `page create` 仍满足全命令回归。
- `corepack pnpm check:author`：通过（85 test suites / 577 tests），确认当前工作树里的草图页 runtimeType / scene 负载改动未引入 author-site 本地测试回归。
- 未运行 `corepack pnpm check:project-scaffold`：最近一轮未修改 project-scaffold。
- 2026-07-06 对账：`packages/project-core/src/service.ts` 的 `createProject` / `updateProject` 已支持 `category` 与 `authoringPreferences`，author-site `POST /api/demos` 与 `PATCH /api/demos/[id]` 也已暴露相同元数据字段；CLI 侧此前仅透传 `name` / `description`，属于 L4 项目元数据参数面对齐缺口。
- 2026-07-06 当前工作树验证：`corepack pnpm check:project-cli` 通过，新增的 `project create --category`、`project update --category`、`--sketch-editor-engine` 与 `--clear-authoring-preferences` 已进入稳定入口回归和全命令回归。
- 2026-07-03 对账：`corepack pnpm exec tsx packages/project-cli/src/index.ts commands --json` 输出包含 `page switch-runtime`；同时该命令已存在于 `packages/project-cli/src/index.ts`、`packages/project-cli/src/cli-all-commands.test.ts`、`packages/project-core/src/service.ts` 与 `packages/author-site/src/app/api/projects/[projectId]/demos/[demoId]/runtime/route.ts`，本轮只修正文档登记遗漏。
- 2026-07-03 当前工作树验证：`corepack pnpm check:project-core` 通过（31 tests passed）；`corepack pnpm check:project-cli` 通过。删除已发布产物的共享层改动未引入新的 CLI 注册或测试覆盖缺口。
- 2026-07-04 对账：`corepack pnpm exec tsx packages/project-cli/src/index.ts commands --json` 输出新增 `project commit-list`、`project materialize`、`project content-gc` 与 `resource version-*`。对应共享层方法位于 `packages/project-core/src/service.ts`，author-site 入口位于 `/api/projects/[projectId]/resources/*`、`/commits/*`、`/materialize` 和 `packages/author-site/src/app/api/knowledge/*`；本轮仅需补齐清单、运行手册与状态文档。
- 2026-07-04 当前工作树验证：`corepack pnpm check:project-core` 通过（31 tests passed）；`corepack pnpm check:project-cli` 通过，并包含 `preview-contract` 20 tests 与 CLI 全命令回归。当前新增的资源历史 / 内容图命令在现有工作树下未出现类型或测试回归。
- 2026-07-05 对账：`corepack pnpm exec tsx packages/project-cli/src/index.ts commands --json` 输出新增 `page update-sketch`。对应共享层方法位于 `packages/project-core/src/service.ts`，author-site 入口位于 `/api/projects/[projectId]/demos` 与 `/demos/[demoId]/runtime`；本轮仅需补齐清单、运行手册、state 与长期跟踪文档。
- 2026-07-05 当前工作树验证：`corepack pnpm check:project-core` 通过（31 tests passed）；`corepack pnpm check:project-cli` 通过；`corepack pnpm check:author` 通过（85 test suites / 577 tests）。当前新增的草图页命令与 runtimeType 在现有工作树下未出现类型或测试回归。

## 当前结论

- `project-core` 仍未提供通用 `session *`、`workspace *`、`knowledge *` 或截图任务级共享服务；当前相关能力仍主要停留在 author-site 路由与本地 manager 层。
- `packages/project-core/src/service.ts` 现已承载 HTML/CSS 原型页的创建、更新、运行时切换、版本快照、恢复和静态安全校验，`packages/project-cli/src/index.ts` 通过 `page create`、`page update-prototype` 与 `page switch-runtime` 复用该能力完成对齐，不需要在 CLI 侧复制 author-site 组件逻辑。
- `packages/project-core/src/service.ts` 也已承载草图页 `sketch-scene` 的创建、运行时切换、版本快照、内容图 blob 持久化和 `@workbench/sketch-core` 校验；`packages/project-cli/src/index.ts` 通过 `page create --runtime-type sketch-scene` 与 `page update-sketch` 复用该能力完成对齐，author-site 的 `/api/projects/[projectId]/demos` 与 `/runtime` 入口只负责透传同名 runtimeType 和 scene 负载，不需要在 CLI 侧复制 demo-ui 编辑器逻辑。
- `packages/project-core/src/service.ts` 现已额外承载项目内容图提交列表、物化检查 / 执行、blob 垃圾清理以及页面 / 知识文档资源历史；`packages/project-cli/src/index.ts` 已通过 `project commit-list`、`project materialize`、`project content-gc` 与 `resource version-*` 复用这些共享能力，不需要在 CLI 侧直接操作 `content/`、`knowledge/` 或旧页面版本快照目录。
- `packages/project-core/src/service.ts` 的 `createProject` / `updateProject` 与 author-site 的项目元数据路由当前都支持 `category`；其中更新链路还支持项目级 `authoringPreferences.sketchEditorEngine`。CLI 现在只做参数适配与校验，不引入新的业务语义，也不绕过 `project-core` 的审计和权限边界。
- `packages/author-site/src/app/api/knowledge/*` 虽然已经把知识文档版本快照和删除审计接到 `resourceVersionCreate` / `resourceDelete`，但创建、改名、内容写入、manifest 维护仍直接操作 `workspace/knowledge/*` 与 `knowledge/manifest.json`；因此 GAP-004 只能继续按“共享层未完成”处理，不能因为有 `resource version-*` 就判定知识文档 CLI 已可补齐。
- 原型页和草图页能力当前仅确认创作端编辑事务与本地测试链路；根据 [`docs/项目文档/创作端/10-CLI/技术/01_CLI能力层实现设计.md`](../../项目文档/创作端/10-CLI/技术/01_CLI能力层实现设计.md)，发布、viewer 与本地项目包协议仍不应被自动推断为已完整支持。
- `packages/author-site/src/app/api/projects/[projectId]/resources/*`、`commits/*`、`materialize/route.ts` 与 `packages/author-site/src/app/api/knowledge/*` 说明资源历史与内容图迁移已经完成共享层复用；`packages/author-site/src/app/api/sessions/route.ts`、`workspaces/route.ts`、`screenshots/generate-batch/route.ts` 仍继续证明剩余 4 个缺口属于共享层缺口，不适合在 CLI 侧直接复制 Web 逻辑。
- 当前工作树中的 `packages/project-core/src/service.ts` 已出现 `project_delete_execute` 同步删除已发布产物并重建 `published/projects-index.json` 的语义扩展；它落在删除 / 发布链路，自动化等级继续按 L5 只报告，不触发新的 CLI 自动实现。
- `project materialize`、`project content-gc` 与 `resource restore-version` 虽然都已有 CLI 命令，但它们分别涉及写项目基准工作区、删除 blob 和覆盖资源内容，后续自动任务仍需按 L5 高风险处理；只有 `project commit-list`、`resource version-list`、`resource version-get` 可继续视为低风险只读命令。
- `project create` / `project update` 的项目元数据参数面对齐虽然已经补齐，但它们仍属于创建 / 更新类能力，自动任务后续只能按 L4 继续维护，不因为参数补齐就下调为 L3。
- 外部自动化提示词仍使用历史文件名 `CLI与创作端能力对齐长期跟踪.md`；兼容入口继续保留，但正文仍只在本文件维护。

## 下次检查重点

- `packages/project-core/src/service.ts` 是否新增会话、工作区、知识文档或截图任务的共享能力。
- `packages/project-cli/src/index.ts` 是否新增 `session *`、`workspace *`、`knowledge *`、`screenshot *` 相关命令。
- `packages/project-cli/src/index.ts` 的 `resource version-*` 与 `project commit-list/materialize/content-gc` 是否继续和共享层 / Web API 路径同名同义，不再回退到旧 `page version-*` 入口。
- `packages/project-cli/src/index.ts` 的现有命令参数面是否继续与共享层和 Web 路由保持一致，尤其是 `project create/update` 的 `category` 与项目级创作偏好字段。
- HTML/CSS 原型页和草图页是否进一步进入 publish、viewer 或 project-scaffold；在共享层明确前，不要把这些链路误记为已完成 CLI 对齐。
- `page update-sketch`、`page switch-runtime --target-runtime-type sketch-scene` 与 `/api/projects/[projectId]/demos`、`/runtime` 是否继续共用 `project-core` / `@workbench/sketch-core`，不回退到 author-site 本地编辑器逻辑。
- author-site 新增项目、模板、页面、配置、资产、预览、发布、AI 会话或审计路由时，是否已经在 CLI 能力清单留下对齐决策。
- 若会话、工作区、知识、截图能力仍只存在于 author-site 本地实现，继续按 L1 报告，不在 CLI 侧复制 Web 逻辑。
