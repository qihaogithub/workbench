# 项目管理与 CLI 问题沉淀

## 当前状态

CLI 与创作端能力对齐仍需长期跟踪。最近更新：2026-07-10。

主线结论：2026-07-10 复核仍未发现新的 L3 / L4 CLI 命令缺口，长期缺口仍维持 5 条 report-only 项。最新变化也不是“CLI 少了新命令”，而是共享层把 `page create` 的默认运行时切到了 `prototype-html-css`，同时放宽了大型 Figma HTML 原型页上限；CLI 若要稳定创建高保真 React 页，现应显式传 `--runtime-type high-fidelity-react` 或提供页面代码。`project.config.values.json` 继续是更值得持续追踪的结构性缺口。最近一个已关闭缺口仍是 2026-07-06 修复的项目元数据参数面对齐问题：Web 与 `project-core` 已支持项目分类和项目级创作偏好，CLI `project create` / `project update` 现已完整暴露这些字段。`commands --json` 与 `register(...)` 列表继续保持一致，`cli-all-commands` 末尾仍用反查守卫覆盖所有已注册命令。

本轮新增确认的共享层事实是：`packages/project-core/src/service.ts` 的 `listProjects()` 已开始忽略缺少 `project.json` 的残留目录；`packages/project-cli/src/index.ts` 的 `project list`、author-site 的 `packages/author-site/src/app/api/demos/route.ts` 以及首页 `packages/author-site/src/app/page.tsx` 当前都直接复用 `getProjectAdminService().listProjects()`，因此这次项目列表语义收敛已经同时进入 CLI 与 Web，而不是新的 CLI 缺口。

本轮还新增确认了一条 `project.config.values.json` 相关边界：`packages/project-core/src/service.ts` 的 `getProject()` 与 `exportProjectPackage()` 都已经带出 `projectConfigValues`，因此 CLI `project get` 会随共享层读取这份只读数据；但 author-site 新增的 `packages/author-site/src/app/api/projects/[projectId]/config-values/route.ts` 写入链路仍直接依赖 session/workspace 校验、`saveProjectConfigValues()` 与 `updateWorkspaceTimestamp()`，并没有进入 `project-core` 的共享写能力。与此同时，`packages/project-scaffold/src/index.ts` 与 `project-package.schema.json` 仍只托管 `projectConfigSchema`，`project pull` / `validate` / `submit` 不会 round-trip `project.config.values.json`。因此这不是“CLI 漏了一个低风险命令”，而是新的共享层 + project-scaffold 协议缺口，当前只能按 GAP-011 / L1 报告。

2026-07-09 继续复核后又新增一个相关事实：author-site 的 `packages/author-site/src/app/api/viewer/[projectId]/data/route.ts` 与 viewer 页面默认值合并逻辑现在也会消费 `projectConfigValues`，`packages/author-site/src/app/api/projects/[projectId]/publish/route.ts` 还会在发布前把 live workspace 中非空的运行值回填到 canonical workspace（仅当 canonical 缺失时）。这使得 `project.config.values.json` 已经同时影响项目详情、viewer 和发布链路；但因为写回语义依旧停留在 author-site 路由层，`project-core` / `project-scaffold` 仍未形成共享闭环，所以 GAP-011 的结论不变，仍然只能按 L1 结构性缺口持续报告。

2026-07-10 继续复核后又新增一个页面默认运行时事实：`packages/project-core/src/service.ts` 的 `createPage()` 现在会在“未显式传 `runtimeType` 且未传 React `code`”时默认创建 `prototype-html-css` 页面；author-site 的 `packages/author-site/src/lib/fs-utils.ts` `createWorkspaceDemoPage()` 也已同步默认写入 `prototype.html` / `prototype.css`。这说明“默认原型页、显式 React”已经是共享层与 Web 的当前产品事实，而不是 CLI 参数缺失。

同轮还确认 `packages/project-core/src/service.ts` 已把原型页 HTML 上限从旧 120KB 提升到 2MB；当前大型 Figma HTML 原型页仍可继续通过 `page create`、`page update-prototype`、`page update-prototypes` 与 `project import-prototype` 的共享链路导入，不应再沿用旧限制判断为 CLI 缺口。

2026-07-10 同轮还确认 active Workspace 的耐久写入契约进一步扩到了 author-site 路由层：`packages/shared/src/contracts.ts` 新增了 `WorkspaceMutationOperation` / `WorkspaceMutationReceipt` 等共享协议，`packages/project-core/src/workspace-resource-registry.ts` 则把 demo / knowledge / asset / workspace-tree / canvas-layout 等受管资源的白名单和哈希校验集中化。author-site 当前对 `packages/author-site/src/app/api/knowledge/*` 与 `packages/author-site/src/app/api/projects/[projectId]/demos*` 的 live Workspace 写入，已经改走 `commitWorkspaceMutation`；但这仍是 author-site + workspace-authority 的写入编排，并不等于 `project-core` 已经提供了可复用的 `knowledge *`、`workspace *` 或 session 生命周期共享服务，所以它不会关闭现有 CLI 缺口。

## 当前缺口

| 编号 | 状态 | 自动化等级 | 缺口 | 当前判断 |
| --- | --- | --- | --- | --- |
| GAP-002 | 待处理 | L1 | 会话管理缺失 | Web 会话创建/删除依赖 agent-service、模型配置和外部鉴权同步；`project-core` 尚无共享会话生命周期能力 |
| GAP-003 | 待处理 | L1 | 工作区管理缺失 | Web live Workspace 写入正在接入 author-site + workspace-authority 契约，但 `project-core` 仍无统一工作区共享服务 |
| GAP-004 | 待处理 | L1 | 知识文档 CRUD 缺失 | knowledge 写入在 live Workspace 已改走 mutation contract，但语义仍由 author-site 路由拼装，`project-core` 尚无可复用 CRUD 服务 |
| GAP-005 | 待处理 | L1 | 截图任务命令缺失 | 截图任务依赖 author-site 代理与 screenshot-service；当前 `project-core` 只有健康状态查询，未具备任务级共享能力 |
| GAP-011 | 待处理 | L1 | 项目配置运行值共享与本地包同步缺失 | `project-core` 已把 `projectConfigValues` 放进 `project get` / `exportProjectPackage`，但 author-site `/config-values` 写入仍停留在路由层，`project-scaffold` 也未把 `project.config.values.json` 纳入本地项目包协议 |

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
- `corepack pnpm check:project-core`：通过（38 tests passed），确认原型页与草图页能力，以及新加入的 workspace resource registry 共享层实现可通过类型检查与单元测试。
- `corepack pnpm check:project-cli`：通过，确认 `page update-prototype`、`page update-sketch` 与扩展后的 `page create` 仍满足全命令回归。
- `corepack pnpm check:author`：2026-07-10 失败；当前失败集中在 `src/app/demo/[id]/edit/__tests__/useVisualEditState.test.tsx` 的 AI prompt 断言，以及 `src/app/api/sessions/[sessionId]/assets/localize/route.test.ts` 的 `fetch is not defined` / 500 响应。这些失败落在 author-site 当前脏分支里的新 workspace-authority / AI prompt 改动上，尚未单独证明 CLI 或 `project-core` 对齐回归。
- `corepack pnpm check:project-scaffold`：通过。
- 2026-07-10 当前工作树验证：`corepack pnpm check:automation` 通过；`corepack pnpm ops:automation report --json` 仍显示 13 个 active 入口；`corepack pnpm exec tsx packages/project-cli/src/index.ts commands --json` 输出继续与当前注册命令一致。
- 2026-07-10 当前工作树验证：`corepack pnpm check:project-core` 通过（38 tests passed）；`corepack pnpm check:project-cli` 通过。`page create` 默认原型页策略、大型原型页 HTML 上限调整，以及 workspace resource registry 引入在当前正式仓库路径下未引入新的 CLI / 共享层回归。
- 2026-07-10 当前工作树验证：`corepack pnpm check:author` 失败，当前失败集中在 `useVisualEditState` 与 `assets/localize` 两组 author-site 测试；因为没有独立的 `project-cli` / `project-core` 失配证据，本轮结论继续保持 report-only。
- 2026-07-09 当前工作树验证：`corepack pnpm check:automation` 通过；`corepack pnpm ops:automation report --json` 仍显示 13 个 active 入口；`corepack pnpm exec tsx packages/project-cli/src/index.ts commands --json` 输出仍与当前注册命令一致。
- 2026-07-09 当前工作树验证：`corepack pnpm check:project-core` 通过（34 tests passed）；`corepack pnpm check:project-cli` 通过；`corepack pnpm check:project-scaffold` 通过。`projectConfigValues` 扩展到 publish / viewer 消费链路后，CLI 与共享层相关检查未出现新增回归。
- 2026-07-09 当前工作树验证：`corepack pnpm check:author` 通过（102 test suites / 677 tests）。正式仓库路径下 author-site 本地测试链路已恢复全绿，因此本轮不再把先前记录的超时 / `act(...)` 噪声视为 CLI 自动维护阻塞。
- 2026-07-08 当前工作树验证：`corepack pnpm check:project-core` 通过（33 tests passed），确认 `ProjectAdminService.listProjects()` 新增的“忽略缺少 `project.json` 的残留目录”行为已被共享层测试覆盖。
- 2026-07-08 当前工作树验证：`corepack pnpm check:project-cli` 通过，`project list`、`project get` 与 `commands --json` 在新的项目列表语义和 `projectConfigValues` 只读输出下无回归。
- 2026-07-08 当前工作树验证：`corepack pnpm check:project-scaffold` 通过；结合 `packages/project-scaffold/src/index.ts` 与 `project-package.schema.json` 复核，确认本地项目包协议当前仍只托管 `projectConfigSchema`，没有把 `project.config.values.json` 纳入拉取、校验或提交闭环。
- 2026-07-08 当前工作树验证：`corepack pnpm check:author` 通过（94 test suites / 641 tests）；新加的 `/api/projects/[projectId]/config-values` 路由测试已在当前工作树下通过。
- 2026-07-07 对账：`corepack pnpm exec tsx packages/project-cli/src/index.ts commands --json` 输出仍与 `packages/project-cli/src/index.ts` 注册项一致；`packages/project-cli/src/cli-all-commands.test.ts` 仍通过 `registeredCommands.filter((command) => !executed.has(command))` 反查所有已注册命令。
- 2026-07-07 对账：`packages/author-site/src/app/api/sessions/route.ts`、`workspaces/route.ts`、`knowledge/route.ts`、`knowledge/[docId]/route.ts` 与 `screenshots/generate-batch/route.ts` 仍分别依赖 agent-service / 外部鉴权同步、本地 workspace manager、直接文件与 manifest 读写、以及 screenshot-service 代理；剩余 4 个缺口继续判定为共享层未完成，而不是 CLI 漏实现。
- 2026-07-07 当前工作树验证：`corepack pnpm check:project-cli` 通过（含 `preview-contract` 20 tests、`project-cli` typecheck 与 CLI 测试），本轮未发现新增命令回归。
- 2026-07-07 正式仓库复核：按自动化提示词切到 `/Users/qh2/Documents/PGM/1·Work/workbench` 重新运行 `corepack pnpm check:automation`、`corepack pnpm ops:automation report --json`、`corepack pnpm exec tsx packages/project-cli/src/index.ts commands --json` 与 `corepack pnpm check:project-cli`，均通过；当前 Codex worktree `/Users/qh2/.codex/worktrees/48ec/workbench` 缺少依赖，因此验证命令应继续在正式仓库路径执行，避免把 `node_modules` 缺失误判成 CLI 回归。
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
- `packages/project-core/src/service.ts` 的 `createPage()` 现已把“未显式传 `runtimeType` 且未传 React `code`”的默认运行时切到 `prototype-html-css`；author-site `packages/author-site/src/lib/fs-utils.ts` 的 `createWorkspaceDemoPage()` 也同步默认写入原型页文件。CLI 如果要稳定创建高保真 React 页，应显式传 `--runtime-type high-fidelity-react` 或直接提供页面代码。
- `packages/project-core/src/service.ts` 还已把原型页 HTML 上限提升到 2MB，因此大型 Figma HTML 原型页现在仍属于共享层可承载输入，而不是新的 CLI 结构性缺口。
- `packages/project-core/src/service.ts` 也已承载草图页 `sketch-scene` 的创建、运行时切换、版本快照、内容图 blob 持久化和 `@workbench/sketch-core` 校验；`packages/project-cli/src/index.ts` 通过 `page create --runtime-type sketch-scene` 与 `page update-sketch` 复用该能力完成对齐，author-site 的 `/api/projects/[projectId]/demos` 与 `/runtime` 入口只负责透传同名 runtimeType 和 scene 负载，不需要在 CLI 侧复制 demo-ui 编辑器逻辑。
- `packages/project-core/src/service.ts` 现已额外承载项目内容图提交列表、物化检查 / 执行、blob 垃圾清理以及页面 / 知识文档资源历史；`packages/project-cli/src/index.ts` 已通过 `project commit-list`、`project materialize`、`project content-gc` 与 `resource version-*` 复用这些共享能力，不需要在 CLI 侧直接操作 `content/`、`knowledge/` 或旧页面版本快照目录。
- `packages/project-core/src/service.ts` 的 `createProject` / `updateProject` 与 author-site 的项目元数据路由当前都支持 `category`；其中更新链路还支持项目级 `authoringPreferences.sketchEditorEngine`。CLI 现在只做参数适配与校验，不引入新的业务语义，也不绕过 `project-core` 的审计和权限边界。
- `packages/project-core/src/service.ts` 的 `listProjects()` 现在会忽略缺少 `project.json` 的残留目录；`packages/project-cli/src/index.ts` 的 `project list`、author-site 的 `/api/demos` GET 和首页项目列表都直接复用这条共享层路径，因此当前项目列表语义已经在 CLI 与 Web 之间保持一致。
- `packages/project-core/src/service.ts` 的 `getProject()` 与 `exportProjectPackage()` 现在会带出 `projectConfigValues`，因此 `project get` 已可只读读取项目级配置运行值；但这不等同于 CLI 已经具备独立的配置运行值管理能力。
- `packages/shared/src/contracts.ts` 与 `packages/project-core/src/workspace-resource-registry.ts` 现在已经定义了 active Workspace 的共享 mutation 协议、受管资源白名单和哈希校验工具；但这还是底层写入契约，不是 `project-core` 面向 CLI 暴露的项目级 CRUD 服务。
- `packages/project-scaffold/src/index.ts` 与 `project-package.schema.json` 当前仍只托管 `projectConfigSchema`，没有为 `project.config.values.json` 分配 manifest 字段、托管文件路径或提交写回逻辑；因此 `project pull`、`validate` 与 `submit` 还不能 round-trip 这份运行值文件。
- `packages/author-site/src/app/api/projects/[projectId]/config-values/route.ts` 的 PUT 仍直接依赖 session/workspace 解析、`saveProjectConfigValues()` 与 `updateWorkspaceTimestamp()`，说明项目配置运行值写回语义仍停留在 author-site 路由层，尚未沉淀成可被 CLI 复用的共享领域服务。
- `packages/author-site/src/app/api/viewer/[projectId]/data/route.ts` 与 viewer 页面当前会把 `projectConfigValues` 合并进页面默认配置，`packages/author-site/src/app/api/projects/[projectId]/publish/route.ts` 还会在发布前把 live workspace 中非空的运行值回填到 canonical workspace；这说明 `project.config.values.json` 已经进入 viewer / publish 用户链路，但共享写入仍未进入 `project-core`。
- `packages/author-site/src/app/api/knowledge/*` 虽然已经把知识文档版本快照和删除审计接到 `resourceVersionCreate` / `resourceDelete`，并在 live Workspace 路径下改为提交 `commitWorkspaceMutation`，但文档/manifest 语义、session/workspace 解析和 mutation 组装仍停留在 author-site 路由层；因此 GAP-004 只能继续按“共享层未完成”处理，不能因为有 `resource version-*` 或 workspace-authority 契约就判定知识文档 CLI 已可补齐。
- `packages/author-site/src/app/api/projects/[projectId]/demos/route.ts` 与 `[demoId]/route.ts` 当前也会在 live Workspace 路径下通过 `commitWorkspaceMutation` 维护 `workspace-tree.json` 和页面初始文件；但 CLI 页面能力早已通过 `project-core` 共享服务对齐，这轮变化属于 author-site 写入通路治理，而不是新的 CLI 缺口或新的共享层闭环。
- 原型页和草图页能力当前仅确认创作端编辑事务与本地测试链路；根据 [`docs/项目文档/创作端/10-CLI/技术/01_CLI能力层实现设计.md`](../../项目文档/创作端/10-CLI/技术/01_CLI能力层实现设计.md)，发布、viewer 与本地项目包协议仍不应被自动推断为已完整支持。
- `packages/author-site/src/app/api/projects/[projectId]/resources/*`、`commits/*`、`materialize/route.ts` 与 `packages/author-site/src/app/api/knowledge/*` 说明资源历史与内容图迁移已经完成共享层复用；`packages/author-site/src/app/api/sessions/route.ts`、`workspaces/route.ts`、`screenshots/generate-batch/route.ts` 仍继续证明剩余 4 个缺口属于共享层缺口，不适合在 CLI 侧直接复制 Web 逻辑。
- 2026-07-10 当前正式仓库路径上的 `check:author` 失败集中在 `useVisualEditState` 与 `assets/localize` 两组 author-site 测试，说明当前脏分支里确实存在 author-site 独立回归；但它们没有改变 `commands --json`、`project-core` 或现有 CLI 参数面对齐结论，因此本轮不把它升级成新的 CLI 缺口。
- 当前工作树中的 `packages/project-core/src/service.ts` 已出现 `project_delete_execute` 同步删除已发布产物并重建 `published/projects-index.json` 的语义扩展；它落在删除 / 发布链路，自动化等级继续按 L5 只报告，不触发新的 CLI 自动实现。
- `project materialize`、`project content-gc` 与 `resource restore-version` 虽然都已有 CLI 命令，但它们分别涉及写项目基准工作区、删除 blob 和覆盖资源内容，后续自动任务仍需按 L5 高风险处理；只有 `project commit-list`、`resource version-list`、`resource version-get` 可继续视为低风险只读命令。
- `project create` / `project update` 的项目元数据参数面对齐虽然已经补齐，但它们仍属于创建 / 更新类能力，自动任务后续只能按 L4 继续维护，不因为参数补齐就下调为 L3。
- 外部自动化提示词仍使用历史文件名 `CLI与创作端能力对齐长期跟踪.md`；兼容入口继续保留，但正文仍只在本文件维护。
- 本轮再次确认，自动化提示词指定的正式仓库路径 `/Users/qh2/Documents/PGM/1·Work/workbench` 才是稳定验证来源；如果 Codex worktree 缺少依赖，属于执行环境差异，不应单独上升为 CLI 对齐缺口。

## 下次检查重点

- `packages/project-core/src/service.ts` 是否新增会话、工作区、知识文档或截图任务的共享能力。
- `packages/project-core/src/service.ts` 是否为 `projectConfigValues` 新增共享写能力，以及 `packages/project-scaffold/src/index.ts` / `project-package.schema.json` 是否把 `project.config.values.json` 纳入本地项目包协议。
- viewer `/api/viewer/[projectId]/data`、viewer 页面默认值合并与 publish 路由的 canonical 回填，是否继续停留在 author-site 本地逻辑；只有进入共享层后，才重新评估 GAP-011 是否可降级或关闭。
- `packages/project-cli/src/index.ts` 是否新增 `session *`、`workspace *`、`knowledge *`、`screenshot *` 相关命令。
- `packages/project-cli/src/index.ts` 的 `resource version-*` 与 `project commit-list/materialize/content-gc` 是否继续和共享层 / Web API 路径同名同义，不再回退到旧 `page version-*` 入口。
- `packages/project-core/src/service.ts` 的 `createPage()` 默认原型页策略是否继续和 author-site `createWorkspaceDemoPage()`、CLI 测试以及运行手册保持一致；在默认值再次变化前，不要把“未传 runtimeType”误记成 React 页创建语义。
- `packages/project-cli/src/index.ts` 的现有命令参数面是否继续与共享层和 Web 路由保持一致，尤其是 `project create/update` 的 `category` 与项目级创作偏好字段。
- `project get` 对 `projectConfigValues` 的只读输出、`project pull` 的项目包内容，以及 author-site `/api/projects/[projectId]/config-values` 的写入语义是否继续维持“共享层读已对齐、共享写与本地项目包仍未对齐”的现状；在共享层明确前，不要误记成可自动补 CLI 的低风险能力。
- `packages/project-core/src/service.ts` 的项目列表过滤语义是否继续被 author-site `/api/demos` 和首页复用，避免残留目录过滤逻辑再次回退到旧 `fs-utils.listProjects()` 路径。
- HTML/CSS 原型页和草图页是否进一步进入 publish、viewer 或 project-scaffold；大型 Figma HTML 原型页的共享导入上限是否继续保持当前 2MB；在共享层明确前，不要把这些链路误记为已完成 CLI 对齐。
- `page update-sketch`、`page switch-runtime --target-runtime-type sketch-scene` 与 `/api/projects/[projectId]/demos`、`/runtime` 是否继续共用 `project-core` / `@workbench/sketch-core`，不回退到 author-site 本地编辑器逻辑。
- author-site 新增项目、模板、页面、配置、资产、预览、发布、AI 会话或审计路由时，是否已经在 CLI 能力清单留下对齐决策。
- 若会话、工作区、知识、截图能力仍只存在于 author-site 本地实现，继续按 L1 报告，不在 CLI 侧复制 Web 逻辑。
