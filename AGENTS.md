# AGENTS.md - opencode-workbench

> 面向 AI 编码代理的项目工作指南。目标是让后续代理能快速判断改动边界、选择正确工具、运行合适验证，并避免被历史目录或过期脚本误导。

<!-- CODEGRAPH_START -->
## CodeGraph

本仓库已配置 CodeGraph MCP server（`codegraph_*` tools）。CodeGraph 是基于 tree-sitter 的代码知识图谱，适合回答结构性问题：符号定义、调用关系、影响范围、文件结构和相关源码上下文。

优先使用 CodeGraph 的场景：

| 问题 | 工具 |
|---|---|
| 查找文件或目录结构 | `codegraph_files` |
| 查找符号定义 | `codegraph_search` |
| 理解某个功能、架构或 bug 上下文 | `codegraph_context` |
| 查看多个相关符号源码 | `codegraph_explore` |
| 查看单个符号签名、位置或源码 | `codegraph_node` |
| 查看调用者 | `codegraph_callers` |
| 查看被调用项 | `codegraph_callees` |
| 评估变更影响 | `codegraph_impact` |
| 检查索引状态 | `codegraph_status` |

使用规则：

- 结构性探索先用 CodeGraph，不要先 grep。
- “X 怎么工作”“这个 bug 可能在哪”这类问题，先调 `codegraph_context`，必要时再调一次 `codegraph_explore`。
- 不要循环调用 `codegraph_node` 读取一串符号；用一次 `codegraph_explore` 聚合上下文。
- 字符串字面量、日志文本、注释或配置项搜索才使用 `rg`。
- 文件刚改完时 CodeGraph 可能有约 500ms 索引延迟，不要立刻依赖它验证刚写入的内容。

如果 `.codegraph/` 不存在或工具提示未初始化，先询问用户是否运行 `codegraph init -i`。
<!-- CODEGRAPH_END -->

## 快速判断

- 包管理器：`pnpm@8.15.0`
- Node 要求：`node >=18.0.0`
- `.npmrc`：`shamefully-hoist=true`
- Workspace：`packages/*` 和 `OPS/CLI`
- 前端：Next.js 14 App Router、Tailwind CSS、shadcn/ui、lucide-react
- 后端：Fastify
- 共享包：`@opencode-workbench/shared`
- 数据目录：默认 `data/`，可由 `DATA_DIR` 覆盖
- 环境变量文件：`.env` 被 git 忽略，`.env.docker` 用于 Docker 部署覆盖
- OPS 工程上下文入口：`OPS/AGENTS.md`
- Codex 定时任务上下文：`OPS/automations/`
- `CLAUDE.md` 仅包含 `@AGENTS.md` 转引，根目录 `AGENTS.md` 是主要工作指南。

## 工作流程

1. 先确认改动范围。涉及 `packages/agent-service/` 时，必须先阅读 `packages/agent-service/AGENTS.md`；涉及 `OPS/` 时，必须先阅读 `OPS/AGENTS.md`，再按子目录规则继续。
2. 若任务较复杂，先在 `docs/plans/进行中/` 创建任务文档，再开始实施，具体要求见“复杂任务计划文档”。
3. 用 CodeGraph 获取结构上下文；只有在查找字面文本时用 `rg`。
4. 涉及功能新增、功能调整、产品行为、业务流程、架构边界或接口契约时，优先读取 `docs/项目文档/` 中的相关模块文档，先确认既有语义和约束。
5. 保持改动局部化，遵循现有模块边界和导入风格。
6. 修改过程中同步更新任务文档的任务清单、进度、关键决策和验证结果。
7. 每次功能改动完成后，必须同步更新 `docs/项目文档/` 中对应需求、技术或模块索引文档，确保项目文档与代码行为一致；若确认没有对应项目文档可更新，需要在最终回复中说明原因。
8. 修改后运行与改动范围匹配的验证命令。优先使用根目录 `check:*` 脚本，无法覆盖时再使用包级命令。
9. 不要回滚或整理与当前任务无关的用户改动。

## 复杂任务计划文档

当任务满足以下任一条件时，视为“较复杂任务”，必须先在 `docs/plans/进行中/` 创建 Markdown 任务文档：

- 涉及多个包、多个服务、跨前后端或跨模块数据流。
- 涉及产品行为、业务流程、权限边界、接口契约、状态机或部署方式变化。
- 需要分阶段排查、设计、实现、验证，或预计会产生多次文件改动。
- 修复原因不明确的问题，需要沉淀调查过程、根因和验证证据。
- 用户明确要求追踪、跟进、验收或产出方案/计划。

任务文档要求：

- 文件名使用能表达任务主题的中文短标题，必要时加日期或类型后缀，例如 `AI对话空回复排查与修复方案.md`。
- 文档至少包含：背景、目标、范围、方案、任务清单、进度记录、验证方式、风险与待确认事项。
- 任务清单使用可勾选列表，执行过程中及时更新状态，而不是结束后一次性补写。
- 进度记录要保留关键时间点、关键发现、方案调整、阻塞点和验收结果，便于后续代理接手。
- 若任务最终完成，应在文档中更新最终状态、实施摘要、验证结果和剩余风险；是否移动到 `docs/plans/已完成/` 按项目现有归档习惯处理。
- 修改 `docs/` 下计划文档时同样遵循 `doc-maintainer` 技能要求。

## 项目文档知识库

`docs/项目文档/` 是长期项目知识库，用来沉淀产品需求、模块设计、架构决策和接口约定。涉及功能改动时，agent 应优先按需读取相关文档，并在代码修改完成后同步更新对应文档；不应在每次任务中全量读取。

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
- 修复的问题暴露了可复用的设计约束或协作规则。

维护规则：

- 修改 `docs/` 下文档时使用 `doc-maintainer` 技能。
- 需求文档只写“做什么”和“为什么”。
- 技术文档只写“怎么做”，避免粘贴大段源码。
- 更新模块文档时同步更新对应 `INDEX.md`。
- 当前项目文档入口是 `docs/项目文档/INDEX.md`；`doc-maintainer` 技能里提到的 `docs/INDEX.md` 在本项目中映射为 `docs/项目文档/INDEX.md`，除非后续专门建立全局 `docs/INDEX.md`。
- `docs/plans/进行中/` 是任务追踪区，新增或更新计划文档不需要同步 `docs/项目文档/INDEX.md`；任务完成后按 `docs/plans/已完成/AGENTS.md` 的归档规则移动。

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

| 包名 | 路径 | 类型 | 端口 | 测试 |
|---|---|---|---|---|
| `@opencode-workbench/author-site` | `packages/author-site/` | Next.js 14 App Router | 3200 | Jest + Testing Library |
| `@opencode-workbench/viewer-site` | `packages/viewer-site/` | Next.js 14 App Router | 3300 | 无包内测试脚本 |
| `@opencode-workbench/shared` | `packages/shared/` | 共享类型和常量 | - | 无测试脚本 |
| `@opencode-workbench/agent-service` | `packages/agent-service/` | Fastify + Pi Agent | 3201 | Vitest |
| `@opencode-workbench/agent-client` | `packages/agent-client/` | Client SDK | - | 无测试脚本 |
| `@opencode-workbench/screenshot-service` | `packages/screenshot-service/` | Fastify + Puppeteer | 3202 | Vitest |
| `@opencode-workbench/knowledge-core` | `packages/knowledge-core/` | 知识库领域模型与权限规则 | - | Vitest |
| `@opencode-workbench/knowledge-service` | `packages/knowledge-service/` | Basic 检索、阅读地图、索引任务、知识报告 | - | Vitest |
| `@opencode-workbench/project-core` | `packages/project-core/` | 项目读写领域服务，供 Web API 与 CLI 复用 | - | Vitest |
| `@opencode-workbench/project-scaffold` | `packages/project-scaffold/` | 本地项目包协议与脚手架转换器 | - | Node/tsx 命令 |
| `@opencode-workbench/project-cli` | `packages/project-cli/` | 项目管理 JSON-first CLI | - | Node/tsx 命令 |
| `@opencode-workbench/cli-tools` | `OPS/CLI/` | CLI 测试工具，ESM | - | Node/tsx 命令 |

历史或非 workspace 目录：

- `packages/web/` 存在于文件系统，但没有 `package.json`，不要引入或修改，除非用户明确要求。
- `packages/snapshot-service/` 当前没有 `package.json`。根脚本只保留 `dev:snapshot:legacy` 作为历史排查入口，不参与默认 `pnpm dev`。
- `.next/`、`node_modules/`、`coverage/`、`dist/`、`out/`、`test/**/test-outputs/` 都是生成物或依赖目录，不作为源码入口。

`packages/shared/src/index.ts` 是共享类型入口。`@opencode-workbench/shared` 由 author-site、agent-service、screenshot-service 等包通过 `workspace:*` 引用。

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
pnpm build
pnpm build:viewer
pnpm lint
pnpm typecheck
pnpm typecheck:viewer
pnpm check:author
pnpm check:agent
pnpm check:screenshot
pnpm check:knowledge-core
pnpm check:knowledge-service
pnpm check:project-core
pnpm check:project-scaffold
pnpm check:project-cli
pnpm check:viewer
pnpm check:all
pnpm test:e2e
pnpm test:e2e:ui
pnpm test:e2e:headed
```

注意：`pnpm dev` 会并行启动 author、agent、viewer、screenshot。`snapshot-service` 是历史包，默认不启动；如果需要调查旧截图方案，只使用 `pnpm dev:snapshot:legacy` 核实历史引用。

包级验证：

```bash
# author-site
pnpm --filter @opencode-workbench/author-site test
pnpm --filter @opencode-workbench/author-site test -- --testPathPattern="file.test.ts"
pnpm --filter @opencode-workbench/author-site test:watch
pnpm --filter @opencode-workbench/author-site db:init

# agent-service
pnpm --filter @opencode-workbench/agent-service test
pnpm --filter @opencode-workbench/agent-service test:watch
pnpm --filter @opencode-workbench/agent-service test:coverage
pnpm --filter @opencode-workbench/agent-service test:smoke
pnpm --filter @opencode-workbench/agent-service typecheck

# screenshot-service
pnpm --filter @opencode-workbench/screenshot-service test
pnpm --filter @opencode-workbench/screenshot-service typecheck

# viewer-site
pnpm --filter @opencode-workbench/viewer-site typecheck
pnpm --filter @opencode-workbench/viewer-site build

# project-core
pnpm --filter @opencode-workbench/project-core typecheck
pnpm --filter @opencode-workbench/project-core test

# project-scaffold
pnpm --filter @opencode-workbench/project-scaffold typecheck
pnpm --filter @opencode-workbench/project-scaffold test

# project-cli
pnpm --filter @opencode-workbench/project-cli typecheck
pnpm --filter @opencode-workbench/project-cli test
```

`test:smoke` 需要 `ACP_SMOKE_REAL=1`，只在明确需要真实集成冒烟时运行。

## Playwright E2E

- 配置文件在 `test/创作端E2E回归测试/playwright.config.ts`，不是根目录默认配置。
- baseURL 是 `http://localhost:3200`。
- 前置条件：author-site 等相关服务已启动；首次运行需要 `pnpm playwright install chromium`。
- 运行命令：`pnpm test:e2e`、`pnpm test:e2e:ui`、`pnpm test:e2e:headed`。根脚本已显式指定 Playwright 配置文件。
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
- Pi Agent 通过 `@earendil-works/pi-agent-core` 进程内嵌入，不依赖 OpenCode Server 或外部 CLI 子进程。
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
- 共享类型优先从 `@opencode-workbench/shared` 引入。
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

## 验证策略

选择最小但足够的验证：

- author-site UI 或 API：`pnpm check:author`；只需要类型检查时可用 `pnpm typecheck`。
- viewer-site：`pnpm check:viewer`，必要时 `pnpm build:viewer`。
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

## 不要做

- 不要修改 `.env` 或提交任何密钥。
- 不要把生成数据、缓存、截图输出或数据库文件纳入提交，除非任务明确要求。
- 不要修改 `packages/web/` 或无 `package.json` 的历史目录，除非用户明确要求。
- 不要把 unrelated dirty changes 回滚、格式化或顺手修掉。
- 不要新增大型抽象、UI 库、服务依赖或全局配置，除非现有结构确实需要。
- 不要依赖根 `pnpm dev` 判断所有服务健康；它当前包含历史 snapshot 引用。
