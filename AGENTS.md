# AGENTS.md - workbench

> 面向 AI 编码代理的项目工作指南。目标是让后续代理能快速判断改动边界、选择正确工具、运行合适验证，并避免被历史目录或过期脚本误导。

<!-- CODEGRAPH_START -->

## CodeGraph

本仓库已配置 CodeGraph MCP server（`codegraph_*` tools）。CodeGraph 是基于 tree-sitter 的代码知识图谱，适合回答结构性问题：符号定义、调用关系、影响范围、文件结构和相关源码上下文。

优先使用 CodeGraph 的场景：

| 问题                            | 工具                |
| ------------------------------- | ------------------- |
| 查找文件或目录结构              | `codegraph_files`   |
| 查找符号定义                    | `codegraph_search`  |
| 理解某个功能、架构或 bug 上下文 | `codegraph_context` |
| 查看多个相关符号源码            | `codegraph_explore` |
| 查看单个符号签名、位置或源码    | `codegraph_node`    |
| 查看调用者                      | `codegraph_callers` |
| 查看被调用项                    | `codegraph_callees` |
| 评估变更影响                    | `codegraph_impact`  |
| 检查索引状态                    | `codegraph_status`  |

使用规则：

- 结构性探索先用 CodeGraph，不要先 grep。
- “X 怎么工作”“这个 bug 可能在哪”这类问题，先调 `codegraph_context`，必要时再调一次 `codegraph_explore`。
- 不要循环调用 `codegraph_node` 读取一串符号；用一次 `codegraph_explore` 聚合上下文。
- 字符串字面量、日志文本、注释或配置项搜索才使用 `rg`。
- 文件刚改完时 CodeGraph 可能有约 500ms 索引延迟，不要立刻依赖它验证刚写入的内容。

如果 `.codegraph/` 不存在或工具提示未初始化，先询问用户是否运行 `codegraph init -i`。

<!-- CODEGRAPH_END -->

## 快速判断

- **项目阶段：未上线，不需要向后兼容。** 可以直接做破坏性变更（重命名接口、删除字段、修改数据格式等），无需迁移脚本或兼容层。
- 包管理器：`pnpm@8.15.0`
- Node 要求：`node >=20.0.0`
- `.npmrc`：`shamefully-hoist=true`
- Workspace：`packages/*` 和 `OPS/CLI`
- 前端：Next.js 14 App Router、Tailwind CSS、shadcn/ui、lucide-react
- 后端：Fastify
- 共享包：`@workbench/shared`
- 数据目录：默认 `data/`，可由 `DATA_DIR` 覆盖
- 环境变量文件：`.env` 被 git 忽略，`.env.docker` 用于 Docker 部署覆盖
- OPS 工程上下文入口：`OPS/AGENTS.md`
- Codex 定时任务上下文：`OPS/automations/`
- `CLAUDE.md` 仅包含 `@AGENTS.md` 转引，根目录 `AGENTS.md` 是主要工作指南。

## 工作流程

1. 先确认改动范围。涉及 `packages/agent-service/` 时，必须先阅读 `packages/agent-service/AGENTS.md`；涉及 `OPS/` 时，必须先阅读 `OPS/AGENTS.md`，再按子目录规则继续。
2. 若任务需要记录排查过程、根因、验证证据或后续事项，优先更新 `docs/plans/进行中/` 下对应功能模块的固定沉淀文档；不要因为单次修复或单个 bug 新建文档。
3. 用 CodeGraph 获取结构上下文；只有在查找字面文本时用 `rg`。
4. 涉及功能新增、功能调整、产品行为、业务流程、架构边界或接口契约时，优先读取 `docs/项目文档/` 中的相关模块文档，先确认既有语义和约束。
5. 保持改动局部化，遵循现有模块边界和导入风格。
6. 修改过程中按需同步更新对应模块沉淀文档的当前状态、关键结论、待办、验证状态和风险；简单局部修复可不写计划文档。
7. 每次功能改动完成后，必须同步更新 `docs/项目文档/` 中对应需求、技术或模块索引文档，确保项目文档与代码行为一致；若确认没有对应项目文档可更新，需要在最终回复中说明原因。
8. 修改后运行与改动范围匹配的验证命令。优先使用根目录 `check:*` 脚本，无法覆盖时再使用包级命令。
9. 不要回滚或整理与当前任务无关的用户改动。
10. **独立思考，不要刻意迎合用户。** 当用户提出的方案存在技术缺陷、违背最佳实践或不适合当前架构时，应明确指出问题并给出更优替代方案，而不是盲目执行。对于用户提出的需求要独立思考其合理性和可行性，给出客观专业的判断。
11. **主动维护 AGENTS.md。** 在完成每次任务后，如果发现新的约定、工具、流程、架构信息或常见陷阱值得沉淀，应主动更新 `AGENTS.md`、`packages/agent-service/AGENTS.md` 或 `OPS/AGENTS.md` 中对应的内容，使后续代理能从中受益。不要让好经验只留在这一次对话中。

## 创作端问题诊断优先入口

遇到创作端编辑页、协同、自动保存、AI 对话、预览、发布或重新打开复原类问题时，先使用结构化诊断入口建立时间线，再读源码或手工 `rg data/editor-diagnostics`：

```bash
corepack pnpm diagnostics:recent -- --project <projectId>
corepack pnpm diagnostics:project -- --project <projectId> --since 24h
corepack pnpm diagnostics:preview -- --project <projectId> --since 24h
corepack pnpm diagnostics:autosave -- --project <projectId> --since 24h
corepack pnpm diagnostics:collab -- --workspace <workspaceId> --since 24h
corepack pnpm diagnostics:session -- --editor-session <editorSessionId>
corepack pnpm diagnostics:trace -- --trace <traceId>
corepack pnpm diagnostics:export -- --project <projectId> --since 24h
```

使用规则：

- 先看输出中的 `diagnostics` 完整性字段，确认 SQLite、JSONL fallback、event gap 和 warning，再下结论。
- 若 CLI 返回缺失、不可用或事件缺口，再降级读取 `data/editor-diagnostics/*.jsonl`，并在结论中说明使用了兜底数据。
- 预览错误优先按 `preview` 分组判断失败来自编译、iframe 加载、运行时错误还是自动修复；自动保存/复原问题优先同时看 `collab`、`autosave` 和 `ai` 分组。
- 如果排查中发现诊断事件缺字段、命令不可用、fallback 误判或导出包缺口，应同步维护 `OPS/CLI`、`OPS/automations/diagnostics/` 和 `docs/项目文档/创作端/11-诊断与日志/`，不要只在当前 bug 文档里记录。

## 计划与问题沉淀文档

`docs/plans/进行中/` 用于记录排查过程、问题根因、修复经验、测试缺口和后续事项。默认不要因为每次修复问题就新建文档；优先按功能模块维护少量固定文档，让同类问题持续沉淀在同一个位置。

优先更新已有模块沉淀文档，例如：

- `docs/plans/进行中/创作端编辑与协同问题沉淀.md`
- `docs/plans/进行中/创作端项目编辑页预览区问题沉淀.md`
- `docs/plans/进行中/项目管理与CLI问题沉淀.md`
- `docs/plans/进行中/AI对话与Agent问题沉淀.md`
- `docs/plans/进行中/部署与运维问题沉淀.md`
- `docs/plans/进行中/测试与工程质量问题沉淀.md`

如果对应模块文档不存在，优先创建模块级沉淀文档，而不是为单个 bug 创建一次性文档。文件名必须体现功能模块边界，不要使用单个 bug、单次排查或一次任务名称。模块沉淀文档应按问题条目追加或更新，条目建议包含：现象、影响范围、当前结论、修复摘要、验证状态、后续事项和相关文件/命令。

模块沉淀文档维护规则：

- `docs/plans/进行中/` 只保留当前仍有价值的信息：未解决问题、待验证事项、可复用根因、验证结论和后续动作。
- 不要记流水账。避免逐次追加“做了什么命令、改了哪些细节、每次尝试的完整输出”；只保留影响判断和后续接手的证据。
- 每次更新前先整理同一模块文档：合并重复条目，删除已失效描述，压缩已完成事项，把长过程改写成短结论。
- 已完成且没有复用价值的工作记录应从 `进行中` 文档删除，不为保留历史而保留历史。
- 已完成但值得追溯的问题，可归档到 `docs/plans/已完成/`，并在模块沉淀文档中只保留一条简短索引链接和最终结论。
- 如果修复结果改变了项目当前事实，应更新 `docs/项目文档/` 对应需求、技术或模块索引文档；`进行中` 文档只保留指向项目文档的链接，不重复维护事实正文。
- 当模块沉淀文档已经过长，应优先清理已完成条目和过期过程；仍然过长时，再按子模块或主题拆分为少量固定文档，避免重新退化为“一问题一文档”。

需要临时独立计划文档的例外情况：

- 涉及多个包、多个服务、跨前后端或跨模块数据流。
- 涉及产品行为、业务流程、权限边界、接口契约、状态机或部署方式变化。
- 需要分阶段排查、设计、实现、验证，或预计会产生多次文件改动。
- 用户明确要求追踪、跟进、验收或产出方案/计划。
- 现有模块沉淀文档无法承载该问题，或单独成文能明显降低后续接手成本。

临时独立计划文档要求：

- 文件名仍需先体现功能模块边界，再体现任务主题，例如 `AI对话与Agent-空回复排查方案.md`；不要使用只有单个 bug 或一次任务的泛标题。
- 文档至少包含：背景、目标、范围、方案、任务清单、进度记录、验证方式、风险与待确认事项。
- 任务清单使用可勾选列表，执行过程中及时更新状态，而不是结束后一次性补写。
- 进度记录要保留关键时间点、关键发现、方案调整、阻塞点和验收结果，便于后续代理接手。
- 若任务最终完成，应压缩为短归档移动到 `docs/plans/已完成/`，或把可复用结论合并回对应模块沉淀文档后删除临时文档。

## 项目文档知识库

`docs/项目文档/` 是长期项目知识库，用来沉淀产品需求、模块设计、架构决策和接口约定等当前事实。涉及功能改动时，agent 应优先按需读取相关文档，并在代码修改完成后同步更新对应事实；不应在每次任务中全量读取，也不要把排查过程、修复经验或临时问题记录写入项目文档。

读取顺序：

1. 先读 `docs/项目文档/INDEX.md` 判断相关模块。
2. 再读对应模块的 `INDEX.md` 或 `README.md`。
3. 最后只读取与当前任务直接相关的需求文档和技术文档。

需要读取项目文档的场景：

- 每次新增或修改功能前，优先确认是否已有相关模块文档。
- 新增或调整用户可见功能。
- 修改鉴权、项目管理、AI 对话、配置预览、嵌入 API、管理后台等既有模块。
- 改动跨服务接口、数据流、状态机、权限边界或部署方式。
- 代码现状与预期行为不清楚，需要确认产品语义。

需要维护项目文档的场景：

- 每次功能改动完成后，必须更新相关项目文档，使需求、技术说明、接口契约或模块索引与代码同步。
- 功能行为、业务规则、接口契约或配置策略发生变化。
- 架构边界、数据流向、状态流转或模块职责发生变化。
- 新增模块或移除旧模块。
- 修复导致项目当前事实发生变化，例如接口契约、配置策略、模块职责、业务规则或状态流转被调整。

维护规则：

- 修改 `docs/项目文档/` 下文档时使用 `doc-maintainer` 技能；修改 `docs/plans/` 时按对应目录 `AGENTS.md` 执行，不使用该技能。
- 需求文档只写“做什么”和“为什么”。
- 技术文档只写“怎么做”，避免粘贴大段源码。
- 更新模块文档时同步更新对应 `INDEX.md`。
- 当前项目文档入口是 `docs/项目文档/INDEX.md`；`doc-maintainer` 技能里提到的 `docs/INDEX.md` 在本项目中映射为 `docs/项目文档/INDEX.md`，除非后续专门建立全局 `docs/INDEX.md`。
- `docs/plans/进行中/` 是任务追踪区，新增或更新计划文档不需要同步 `docs/项目文档/INDEX.md`；任务完成后按 `docs/plans/已完成/README.md` 的归档规则移动。

## OPS 工程与自动任务上下文

`OPS/` 用于维护项目内工程诊断工具、Codex 定时任务和维护型自动任务上下文。进入 `OPS/` 前先读 `OPS/AGENTS.md`，再根据实际子目录读取 `OPS/CLI/AGENTS.md` 或 `OPS/automations/AGENTS.md`。

`OPS/automations/` 用于维护 Codex 定时任务和维护型自动任务的运行上下文，包括 context、runbook 和当前状态账本。它的目标读者是自动任务中的 AI，优先保证可执行、可复查和低噪声更新。

维护规则：

- `OPS/CLI/` 是长期工程诊断 CLI 和 Agent Service 测试工具，修改前读取 `OPS/CLI/AGENTS.md`、`OPS/CLI/README.md` 和 `OPS/CLI/package.json`。
- `OPS/automations/` 不属于 `docs/项目文档/` 知识库，不套用需求文档/技术文档拆分规范。
- 修改 `OPS/automations/` 时优先读取 `OPS/automations/AGENTS.md` 和 `OPS/automations/README.md`。
- `contexts/` 放长期任务上下文，`runbooks/` 放按触发频率组织的执行手册，`state/` 放覆盖式当前状态。
- `state/` 只保留当前仍成立的结论，不追加逐次流水账。
- 自动任务发现业务规则、接口契约或架构边界变化时，仍需更新 `docs/项目文档/` 对应模块。
- 自动任务发现具体缺陷、测试缺口或实施事项时，记录到 `docs/plans/进行中/`，不要只写在 `OPS/automations/state/`。

## Monorepo 结构

当前有效 workspace 包：

| 包名                            | 路径                           | 类型                                                   | 端口 | 测试                     |
| ------------------------------- | ------------------------------ | ------------------------------------------------------ | ---- | ------------------------ |
| `@workbench/author-site`        | `packages/author-site/`        | Next.js 14 App Router                                  | 3200 | Jest + Testing Library   |
| `@workbench/viewer-site`        | `packages/viewer-site/`        | Next.js 14 App Router                                  | 3300 | 无包内测试脚本           |
| `@workbench/shared`             | `packages/shared/`             | 共享类型和常量                                         | -    | 无测试脚本               |
| `@workbench/sketch-core`        | `packages/sketch-core/`        | 草图页协议、校验、patch、几何、只读渲染                | -    | Vitest                   |
| `@workbench/sketch-react`       | `packages/sketch-react/`       | 草图页 React SDK：画布、工具栏、图层、属性栏和编辑状态 | -    | Vitest + Testing Library |
| `@workbench/sketch-playground`  | `packages/sketch-playground/`  | 草图 SDK 独立开发与测试 Playground                     | 3400 | TypeScript + Playwright  |
| `@workbench/agent-service`      | `packages/agent-service/`      | Fastify + Pi Agent                                     | 3201 | Vitest                   |
| `@workbench/agent-client`       | `packages/agent-client/`       | Client SDK                                             | -    | 无测试脚本               |
| `@workbench/screenshot-service` | `packages/screenshot-service/` | Fastify + Puppeteer                                    | 3202 | Vitest                   |
| `@workbench/knowledge-core`     | `packages/knowledge-core/`     | 知识库领域模型与权限规则                               | -    | Vitest                   |
| `@workbench/knowledge-service`  | `packages/knowledge-service/`  | Basic 检索、阅读地图、索引任务、知识报告               | -    | Vitest                   |
| `@workbench/project-core`       | `packages/project-core/`       | 项目读写领域服务，供 Web API 与 CLI 复用               | -    | Vitest                   |
| `@workbench/project-scaffold`   | `packages/project-scaffold/`   | 本地项目包协议与脚手架转换器                           | -    | Node/tsx 命令            |
| `@workbench/project-cli`        | `packages/project-cli/`        | 项目管理 JSON-first CLI                                | -    | Node/tsx 命令            |
| `@workbench/cli-tools`          | `OPS/CLI/`                     | CLI 测试工具，ESM                                      | -    | Node/tsx 命令            |

`.next/`、`node_modules/`、`coverage/`、`dist/`、`out/`、`test/**/test-outputs/` 都是生成物或依赖目录，不作为源码入口。

`packages/shared/src/index.ts` 是共享类型入口。`@workbench/shared` 由 author-site、agent-service、screenshot-service 等包通过 `workspace:*` 引用。

## 常用命令

人工开发命令示例使用 `pnpm ...`；Codex 定时任务和 `OPS/automations/` runbook 优先使用 `corepack pnpm ...`，确保包管理器版本一致。

根目录命令：

```bash
pnpm dev
pnpm dev:author
pnpm dev:agent
pnpm dev:viewer
pnpm dev:screenshot
pnpm dev:preview
pnpm dev:sketch
pnpm build
pnpm build:viewer
pnpm lint
pnpm typecheck
pnpm typecheck:viewer
pnpm check:author
pnpm check:agent
pnpm check:screenshot
pnpm check:sketch-core
pnpm check:sketch-react
pnpm check:sketch-playground
pnpm check:knowledge-core
pnpm check:knowledge-service
pnpm check:project-core
pnpm check:project-scaffold
pnpm check:project-cli
pnpm check:viewer
pnpm check:all
pnpm test:e2e
pnpm test:e2e:sketch-playground
pnpm test:e2e:ui
pnpm test:e2e:headed
```

注意：`pnpm dev` 会并行启动 author、agent、viewer、screenshot。当前正式截图服务是 `packages/screenshot-service/`。

包级验证：

```bash
# author-site
pnpm --filter @workbench/author-site test
pnpm --filter @workbench/author-site test -- --testPathPattern="file.test.ts"
pnpm --filter @workbench/author-site test:watch
pnpm --filter @workbench/author-site db:init

# agent-service
pnpm --filter @workbench/agent-service test
pnpm --filter @workbench/agent-service test:watch
pnpm --filter @workbench/agent-service test:coverage
pnpm --filter @workbench/agent-service test:smoke
pnpm --filter @workbench/agent-service typecheck

# screenshot-service
pnpm --filter @workbench/screenshot-service test
pnpm --filter @workbench/screenshot-service typecheck

# sketch-core / sketch-react / sketch-playground
pnpm --filter @workbench/sketch-core typecheck
pnpm --filter @workbench/sketch-core test
pnpm --filter @workbench/sketch-react typecheck
pnpm --filter @workbench/sketch-react test
pnpm --filter @workbench/sketch-playground typecheck

# viewer-site
pnpm --filter @workbench/viewer-site typecheck
pnpm --filter @workbench/viewer-site build

# project-core
pnpm --filter @workbench/project-core typecheck
pnpm --filter @workbench/project-core test

# project-scaffold
pnpm --filter @workbench/project-scaffold typecheck
pnpm --filter @workbench/project-scaffold test

# project-cli
pnpm --filter @workbench/project-cli typecheck
pnpm --filter @workbench/project-cli test
```

`test:smoke` 需要 `ACP_SMOKE_REAL=1`，只在明确需要真实集成冒烟时运行。

## Playwright E2E

- 配置文件在 `test/创作端E2E回归测试/playwright.config.ts`，不是根目录默认配置。
- baseURL 是 `http://localhost:3200`。
- 前置条件：author-site 等相关服务已启动；首次运行需要 `pnpm playwright install chromium`。
- 运行命令：`pnpm test:e2e`、`pnpm test:e2e:ui`、`pnpm test:e2e:headed`。根脚本已显式指定 Playwright 配置文件。
- 草图 SDK playground 的独立浏览器冒烟使用 `pnpm test:e2e:sketch-playground`，配置在 `test/sketch-playground/playwright.config.ts`，会自动启动 `pnpm dev:sketch`。
- 正式回归用例必须维护在 `test/` 下的 Playwright 测试目录中，优先放入 `test/创作端E2E回归测试/` 并写成 `.spec.ts`。
- `scripts/development/` 只放开发期诊断、复现、采样和报告生成脚本；脚本可以调用 Playwright，但不作为正式回归用例的长期维护位置。
- 当某个 `scripts/development/` 脚本需要长期纳入回归验证时，应迁移或补写为 `test/` 下的 Playwright spec，并通过根目录 `package.json` 暴露清晰的测试命令。

## 关键架构

Auth：

- author-site 使用 JWT（`jose`）。
- `middleware.ts` 保护 `/demo`、`/projects` 和 `/api/sessions`。
- 页面路由未登录时重定向到 `/login`；API 路由返回 401 JSON。
- 需要 `JWT_SECRET` 环境变量。

数据存储：

- 文件系统目录：`data/projects/`、`data/sessions/`、`data/workspaces/`、`data/snapshots/`、`data/screenshots/`。
- SQLite：`data/users.db`。
- `DATA_DIR` 可覆盖默认数据目录。

Session：

- author-site session 默认 2 小时过期：`SESSION_EXPIRY_MS = 2 * 60 * 60 * 1000`。
- author-site API 位于 `packages/author-site/src/app/api/`。

CORS：

- author-site 的跨域逻辑在 `middleware.ts`。
- agent-service 的 CORS 在 `packages/agent-service/src/server.ts`。
- agent-service 使用 `.env` 中的 `CORS_ORIGINS`。

Agent 后端：

- 当前仅支持 Pi Agent 后端。
- 后端实现位于 `packages/agent-service/src/backends/pi-agent.ts` 和 `packages/agent-service/src/backends/pi-tools/`。
- Pi Agent 通过 `@earendil-works/pi-agent-core` 进程内嵌入，不依赖 workbench Server 或外部 CLI 子进程。
- 模型配置通过 `PI_AGENT_*` 环境变量提供。

Screenshot 服务：

- 服务路径：`packages/screenshot-service/`。
- 端口：3202。
- 依赖 author-site 的 `/api/compile` 端点和本地 Chrome。
- 截图存储在 `data/screenshots/`。
- 支持同步单页截图、异步批量截图、LRU 编译缓存和文件系统截图缓存。

Docker：

- `docker-compose.yml` 包含 agent-service、author-site、screenshot-service、viewer-site。
- viewer-site 当前没有配置 profile，默认随 compose 一起启动。
- 部署脚本：`scripts/deploy.sh`。

## 代码约定

- TypeScript 使用 `strict: true`。
- 禁止新增 `as any`、`@ts-ignore`、`@ts-expect-error`，除非用户明确要求并说明原因。
- author-site 路径别名：`@/` 指向 `packages/author-site/src/*`。
- agent-service 路径别名：`@/` 指向 `packages/agent-service/src/*`。
- 共享类型优先从 `@workbench/shared` 引入。
- API 响应使用 `{ success: true, data: T }` 或 `{ success: false, error: { code, message } }`。
- author-site API 响应 helper：`createApiSuccess`、`createApiError`，位于 `packages/author-site/src/lib/fs-utils.ts`。
- 前端组件使用 shadcn/ui、Tailwind CSS、lucide-react、`class-variance-authority` 和 `cn()`。
- 不要新增其他 UI 库。
- 数据获取使用 SWR（`packages/author-site/src/lib/api.ts`）。
- 测试描述使用中文。
- agent-service 导入顺序：Node 内置模块、外部依赖、内部相对路径。

## 前端改动

- 优先复用现有组件、Tailwind token 和 `cn()`。
- lucide-react 已可用，按钮图标优先用 lucide。
- 不要为单个页面引入新的状态管理或 UI 框架。
- 修改交互流时，同步检查 API client、SWR key、loading/error 状态和移动端布局。
- 涉及登录、项目、会话、模型配置时，要检查 middleware、API route 和前端调用是否一致。

## 后端改动

- agent-service 改动前阅读 `packages/agent-service/AGENTS.md`。
- 不要恢复已移除的多后端架构；当前目标是 Pi Agent 单后端。
- 修改 Pi Agent 工具时，同时检查路径安全、文件变更捕获、事件流和测试。
- 修改 Fastify route 时，确认错误响应结构、CORS、WebSocket 事件和 session 生命周期。
- screenshot-service 改动要关注 Puppeteer、本地 Chrome、缓存键和截图文件路径。

## pi-agent 官方参考代码

`docs/external/pi-reference/` 是 pi-agent 官方仓库的本地 shallow clone（已加入 `.gitignore`，不入库），用于开发时直接查阅官方实现，无需网络抓取。

关键文件路径：

| 内容                | 路径                                                              |
| ------------------- | ----------------------------------------------------------------- |
| 工具实现（read/write/edit/bash/grep/find/ls） | `packages/coding-agent/src/core/tools/`                  |
| 输出截断（truncateHead/truncateTail）          | `packages/coding-agent/src/core/tools/truncate.ts`         |
| 文件变更队列（串行化同文件编辑）               | `packages/coding-agent/src/core/tools/file-mutation-queue.ts` |
| 系统提示词构建                                | `packages/coding-agent/src/core/system-prompt.ts`          |
| pi-agent-core 框架（AgentTool 接口、Harness）  | `packages/agent-core/src/`                                 |

使用规则：

- 修改 `packages/agent-service/src/backends/pi-tools/` 下的工具实现前，先用 `Read`/`Grep` 查阅官方对应工具的本地源码，确认行为对齐。
- 差异分析文档 `docs/plans/进行中/AI工具集与pi-agent官方最佳实践差异分析.md` 记录了当前已识别的差距项和优先级。
- 如需更新官方参考代码：`cd docs/external/pi-reference && git pull --depth 1`。

## 验证策略

选择最小但足够的验证：

- author-site UI 或 API：`pnpm check:author`；只需要类型检查时可用 `pnpm typecheck`。
- viewer-site：`pnpm check:viewer`，必要时 `pnpm build:viewer`。
- sketch-core：`pnpm check:sketch-core`。
- sketch-react：`pnpm check:sketch-react`；如果改动影响 author-site 草图编辑态，也运行 `pnpm check:author` 和 `pnpm test:e2e -- sketch-page-regression.spec.ts`。
- sketch-playground：`pnpm check:sketch-playground`，涉及交互或 fixture 时运行 `pnpm test:e2e:sketch-playground`。
- agent-service：`pnpm check:agent`。
- screenshot-service：`pnpm check:screenshot`。
- knowledge-core：`pnpm check:knowledge-core`。
- knowledge-service：`pnpm check:knowledge-service`。
- project-core：`pnpm check:project-core`。
- project-scaffold：`pnpm check:project-scaffold`。
- project-cli：`pnpm check:project-cli`。
- shared：至少运行 `pnpm check:author`、`pnpm check:agent`、`pnpm check:screenshot`、`pnpm check:viewer`；如果改动影响项目读写类型，也运行 `pnpm check:project-core` 和 `pnpm check:project-scaffold`。
- 跨页面关键流程：确认服务运行后执行 `pnpm test:e2e`。
- 全仓轻量验证：`pnpm check:all`。该命令不包含真实 LLM、OSS、Docker 或浏览器 E2E。

如果没有运行测试，在最终回复中说明原因和剩余风险。
