# 项目 Agent 友好度优化方案

## 背景

当前项目以 Codex/Agent 编程协作为主要开发方式，需要让后续 agent 能更快理解项目边界、选择正确工具、运行有效验证，并在多人或多轮上下文中稳定维护项目。

本方案用于记录本次审查过程、发现的问题、优化建议和后续落地任务。

## 目标

- 降低 agent 首次接手项目时的结构理解成本。
- 提升开发、测试、调试、文档维护和交接流程的可执行性。
- 减少历史目录、过期脚本、缺失索引、隐式前置条件对 agent 的误导。
- 建立可分阶段落地的优化清单。

## 范围

- 根目录协作指南、包级指南和项目文档。
- workspace 包结构、常用脚本、测试入口和开发启动方式。
- agent 可读的模块边界、验证策略、环境前置条件和维护流程。
- 不包含业务功能重构、UI 改版或依赖升级落地。

## 审查方案

1. 先建立本任务文档，持续记录审查进度和关键发现。
2. 审查根目录与 workspace 配置，确认包边界、脚本入口和历史残留。
3. 审查 `docs/`、`AGENTS.md`、包级说明与测试脚本的一致性。
4. 识别影响 agent 开发、测试、维护的摩擦点，并按收益和风险排序。
5. 输出可执行的项目优化方案与分阶段落地建议。

## 任务清单

- [x] 创建进行中的任务文档。
- [x] 审查仓库结构和 workspace 配置。
- [x] 审查脚本、测试入口和开发启动体验。
- [x] 审查项目文档、计划文档和 agent 指南。
- [x] 汇总优化项、优先级、落地方式和验证建议。
- [x] 更新最终方案、验证结果和剩余风险。
- [x] 实施 P0 入口纠偏：根脚本、根指南、E2E 指南、Docker 说明。
- [x] 实施 P1 验证矩阵：新增根 `check:*` 脚本和验证决策说明。
- [x] 实施 P2 第一阶段：更新 `.gitignore`，不直接删除已跟踪运行数据。
- [x] 实施 P3：新增关键包级 `AGENTS.md`。
- [x] 实施 P4/P5 第一阶段：同步关键项目文档，新增根 `.env.example`，E2E 支持环境变量。

## 进度记录

- 2026-06-25：创建本任务文档，开始审查项目对 Codex/Agent 协作的友好度。
- 2026-06-25：确认 `.codegraph/` 存在，但当前会话未暴露 `codegraph_*` 工具；本次改用文件结构、脚本和精确搜索完成审查。
- 2026-06-25：审查 `package.json`、`pnpm-workspace.yaml`、根 `AGENTS.md`、包级 `package.json`、E2E 配置、项目文档索引、`.gitignore`、Docker 配置和当前工作区状态。
- 2026-06-25：发现主要摩擦集中在工作入口过期、workspace 包清单不完整、测试脚本入口不准确、长期文档仍保留旧架构描述、生成物/数据文件污染工作区。
- 2026-06-25：完成第一轮优化实施：根 `pnpm dev` 移除默认 snapshot 历史包；新增 `check:*` 验证矩阵；E2E 根脚本显式指定配置；补齐 `author-site`、`project-core`、`project-admin-mcp`、`screenshot-service` 包级 AGENTS；新增根 `.env.example`；更新生成物忽略规则。
- 2026-06-25：同步长期文档中的关键旧描述：项目总览改为 Pi Agent 单后端，Docker 文档补齐 screenshot/viewer 服务，使用端部署文档改用 author-site 命名。
- 2026-06-25：验证通过：Playwright 指定配置可列出 1 个 E2E 测试；`project-core` typecheck/test 通过；`project-admin-mcp` typecheck/test 通过；根 `pnpm check:project-core` 抽样通过。

## 审查结论

项目已经有一个比较清晰的 agent 协作入口：根 `AGENTS.md` 能说明技术栈、包边界、验证策略、文档维护规则和高风险目录，`packages/agent-service/AGENTS.md` 也能帮助 agent 避免恢复已移除的多后端架构。这是当前最有价值的基础。

但从“完全依赖 Codex/Agent 编程”的角度看，当前仍存在几类高摩擦点：入口文档与实际仓库不一致、根脚本会指向历史包、验证命令缺少一键矩阵、生成数据和报告进入 git 视野、部分新 workspace 包缺少 agent 指南。这些问题不会直接阻断开发，但会显著增加 agent 的误判、重复排查和无关改动风险。

## 关键发现

### 1. 工作入口与真实 workspace 不一致

- `pnpm-workspace.yaml` 纳入 `packages/*` 和 `OPS/CLI`，实际已有 `packages/project-core/` 与 `packages/project-admin-mcp/`，但根 `AGENTS.md` 的有效 workspace 包表没有包含它们。
- 根 `package.json` 的 `pnpm dev` 和 `pnpm dev:snapshot` 仍引用 `@opencode-workbench/snapshot-service`，而根 `AGENTS.md` 已说明该包没有 `package.json`。这会让 agent 在启动全服务时先撞到已知历史问题。
- 根 `AGENTS.md` 说 Docker `viewer-site` 需要 `--profile viewer`，但当前 `docker-compose.yml` 中 `viewer-site` 没有 profile 配置。
- 仓库没有根 `README.md`，新 agent 的稳定入口完全依赖 `AGENTS.md`。这可行，但要求 `AGENTS.md` 必须非常准确。

### 2. 长期文档保留旧架构描述

- `docs/项目文档/项目总览.md` 仍描述 Agent 服务“支持多后端切换”和“Agent Factory 多后端适配”，与当前 Pi Agent 单后端目标冲突。
- `docs/项目文档/独立Agent服务层/01-架构设计.md` 仍写“支持多后端切换”。这会误导 agent 在后端任务中恢复或补全已删除抽象。
- `test/新建-编辑-保存项目测试/AGENTS.md` 仍提到 `pnpm dev:web`、`test-logs/`、`test-reports/`，但当前根脚本没有 `dev:web`，测试实际输出在 `test/新建-编辑-保存项目测试/test-outputs/`。
- `doc-maintainer` 技能要求更新 `docs/INDEX.md`，但项目指南说明当前入口是 `docs/项目文档/INDEX.md`，且仓库根 `docs/` 下没有 `INDEX.md`。这属于跨技能规则冲突，容易让 agent 创建不符合项目现状的新索引。

### 3. 验证入口不够 agent 友好

- 根 `test:e2e` 直接执行 `playwright test`，但唯一 Playwright 配置在 `test/新建-编辑-保存项目测试/playwright.config.ts`。agent 需要额外知道 `--config`，否则可能使用默认配置运行。
- 根 `build`、`lint`、`typecheck` 当前主要覆盖 `author-site` 或少数包，没有表达“全仓最小验证矩阵”。
- `project-core` 和 `project-admin-mcp` 有 `typecheck`/`test`，但根指南没有纳入常用验证命令。
- `agent-client` 只有 `build`/`dev`，`shared` 没有真实 `typecheck`/`test`，agent 很难判断改动共享包后应该运行什么。
- E2E 测试脚本中存在固定登录账号密码和固定 `localhost:3200`，缺少环境变量化入口，后续 agent 在不同机器或干净数据目录上会难以稳定复现。

### 4. 生成物和运行数据污染工作区

- `.gitignore` 只忽略了部分 `data/` 子目录，当前 `git ls-files data` 显示大量 `data/projects/`、`data/published/`、`data/images/`、`data/agent-run-logs/` 文件已进入版本控制视野。
- `packages/agent-service/coverage/` 中存在大量已跟踪覆盖率 HTML，且内容还包含旧多后端文件名，会继续干扰文本搜索和 agent 判断。
- `packages/author-site/tsconfig.tsbuildinfo` 和 `packages/viewer-site/tsconfig.tsbuildinfo` 出现在工作区状态中，属于典型无关噪声。
- E2E 输出截图和日志位于测试目录下，虽然当前未必全部跟踪，但会持续增加未跟踪文件和上下文噪声。

### 5. 包级 agent 指南覆盖不完整

- 当前只有根 `AGENTS.md`、`packages/agent-service/AGENTS.md` 和 E2E 测试目录 `AGENTS.md`。
- `author-site` 是最大改动面，但没有包级 `AGENTS.md`。前端/API/session/project/template/screenshot 逻辑都在这里，agent 只能依赖根指南和零散项目文档。
- 新增或正在引入的 `project-core`、`project-admin-mcp` 没有包级 `AGENTS.md`，但它们承担“Web API 与 MCP 共享项目能力”的关键边界，应尽快补齐。

### 6. 环境与运行前置条件分散

- 根目录没有统一 `.env.example`；只有 `packages/author-site/.env.example` 和 `packages/viewer-site/.env.example`。
- `agent-service`、`screenshot-service`、Docker、管理后台、内部 API token、Pi Agent 模型配置分散在多个文档和 `.env.docker` 中。
- `.env.docker` 含有可运行的默认占位密钥和内网地址示例，适合部署参考，但不适合作为 agent 执行本地验证时的唯一环境说明。

## 优化方案

### P0：先修正会误导 agent 的入口信息

1. 更新根 `AGENTS.md` 的 workspace 包表：
   - 加入 `@opencode-workbench/project-core` 和 `@opencode-workbench/project-admin-mcp`。
   - 标注两个包当前是否已稳定、是否仍处于 MCP 能力建设中。
   - 明确 `packages/web/`、`.next/`、`node_modules/`、`coverage/`、`dist/`、`out/` 都不作为有效源码入口。

2. 处理 `snapshot-service` 历史脚本：
   - 推荐从根 `pnpm dev` 中移除 `snapshot` 子进程，或改名为 `dev:all:legacy` 保留历史行为。
   - 若仍需保留 `dev:snapshot`，应在脚本名或注释中显式标记“历史不可用”，避免 agent 用它判断服务健康。

3. 修正 E2E 入口：
   - 将根 `test:e2e` 改为 `playwright test --config test/新建-编辑-保存项目测试/playwright.config.ts`。
   - 同步更新 `test:e2e:ui`、`test:e2e:headed`。
   - 更新 `test/新建-编辑-保存项目测试/AGENTS.md`，删除 `pnpm dev:web`，把输出目录改为 `test-outputs/`。

4. 修正 Docker 指南：
   - 根 `AGENTS.md` 与 `docs/项目文档/创作端/06-基础设施/技术/03_Docker部署方案.md` 应以当前 `docker-compose.yml` 为准。
   - 如果 viewer 不再使用 profile，就删除 `--profile viewer` 说明；如果要恢复 profile，则在 compose 文件中显式加回。

### P1：建立 agent 可直接执行的验证矩阵

1. 增加根级脚本，用于表达常见改动范围：
   - `check:author`：author-site typecheck + test。
   - `check:agent`：agent-service typecheck + test。
   - `check:screenshot`：screenshot-service typecheck + test。
   - `check:project-core`：project-core typecheck + test。
   - `check:project-admin-mcp`：project-admin-mcp typecheck + test。
   - `check:viewer`：viewer-site typecheck，必要时 build。

2. 增加 `check:all`，但不要默认包含需要真实浏览器、真实 LLM、真实 OSS 或外部网络的验证。

3. 在根 `AGENTS.md` 中加入“按改动范围选择验证”的决策表：
   - 改 `packages/shared`：运行所有依赖 shared 的轻量 typecheck。
   - 改项目数据结构：运行 `project-core`、`author-site` 相关测试。
   - 改 AI 对话/agent-service：运行 agent-service test/typecheck，并检查 author-site agent-client 调用。
   - 改截图：运行 screenshot-service test/typecheck，并运行 author-site screenshot 相关 Jest 测试。

### P2：治理生成物、测试数据和搜索噪声

1. 明确哪些 `data/` 内容是 seed fixture，哪些是运行时数据：
   - 如果需要保留演示项目，移动到 `fixtures/` 或 `packages/*/tests/fixtures/`。
   - 运行时 `data/projects/`、`data/published/`、`data/images/`、`data/agent-run-logs/` 默认不应继续进入普通提交。

2. 更新 `.gitignore`：
   - 增加 `coverage/`、`*.tsbuildinfo`、`test/**/test-outputs/`、`data/agent-run-logs/` 等运行产物。
   - 对需要保留的 fixture 使用反向规则或迁移目录，避免一刀切误删测试输入。

3. 做一次非功能性清理提交：
   - 从版本控制中移除覆盖率 HTML、tsbuildinfo、临时 E2E 输出。
   - 对已跟踪的 `data/` 文件按“fixture 或运行数据”分流。
   - 清理后运行搜索，确认旧多后端覆盖率 HTML 不再污染 `rg` 结果。

### P3：补齐包级 agent 指南

1. 新增 `packages/author-site/AGENTS.md`：
   - 说明 App Router/API route/middleware/session/project/workspace/preview/screenshot 的边界。
   - 列出常见测试文件位置和最小验证命令。
   - 说明哪些 API 必须使用 `createApiSuccess`/`createApiError`。
   - 说明用户可见行为变更时应更新哪些项目文档。

2. 新增 `packages/project-core/AGENTS.md`：
   - 明确这是项目读写的领域服务层，Web API 和 MCP 都应复用它。
   - 说明文件系统写入、事务、模板复制、页面/文件夹结构和错误结构的约束。
   - 说明测试应优先使用临时目录，不直接操作仓库 `data/`。

3. 新增 `packages/project-admin-mcp/AGENTS.md`：
   - 明确它只做协议适配和权限/参数边界，不复制业务逻辑。
   - 说明 MCP 工具返回结构、dry-run、审计日志和本地 stdio 启动方式。

4. 视情况新增 `packages/screenshot-service/AGENTS.md`：
   - 说明 Puppeteer、本地 Chrome、缓存键、截图文件路径和 author-site `/api/compile` 依赖。

### P4：统一项目文档和技能规则

1. 将 `docs/项目文档/项目总览.md` 和 `docs/项目文档/独立Agent服务层/01-架构设计.md` 更新为 Pi Agent 单后端现状。

2. 在根 `AGENTS.md` 中明确：
   - 本项目长期文档入口是 `docs/项目文档/INDEX.md`。
   - `doc-maintainer` 技能中的 `docs/INDEX.md` 规则在本项目里应映射为 `docs/项目文档/INDEX.md`，除非后续专门建立全局 `docs/INDEX.md`。

3. 给 `docs/plans/进行中/` 增加轻量 README 或 AGENTS：
   - 说明计划文档不要求更新项目文档索引。
   - 说明完成后是否移动到 `docs/plans/已完成/` 以及归档分类规则。

4. 对 `docs/plans/进行中/` 做周期性盘点：
   - 已完成的方案移动到 `docs/plans/已完成/`。
   - 被新方案替代的文档标记状态，避免 agent 读取旧方案后重复实施。

### P5：提高本地环境可复现性

1. 新增根 `.env.example` 或 `docs/用户指南/本地开发环境.md`：
   - 按服务列出 author-site、agent-service、screenshot-service、viewer-site、Docker 需要的变量。
   - 区分“本地必填”“真实 LLM 才必填”“截图才必填”“部署才必填”。

2. E2E 登录信息环境变量化：
   - 例如 `E2E_USER`、`E2E_PASSWORD`、`E2E_BASE_URL`。
   - 同时提供本地初始化命令，避免脚本内硬编码账号密码。

3. 为 agent-service 提供无真实 LLM 的轻量健康验证：
   - 保留 `test:smoke` 作为真实集成。
   - 另建 mock backend 或 mock Pi Agent 初始化测试，供 agent 在无密钥环境下验证路由和事件结构。

## 建议落地顺序

1. 第一批：入口纠偏
   - 更新根 `AGENTS.md`、E2E AGENTS、根 E2E 脚本、Docker profile 说明。
   - 预期收益最大，风险低，能立刻减少 agent 误判。
   - 状态：已实施。`pnpm dev` 默认启动 author、agent、viewer、screenshot；`dev:snapshot:legacy` 仅作为历史入口保留。

2. 第二批：验证矩阵
   - 增加根 `check:*` 脚本和指南中的验证决策表。
   - 让 agent 修改后能直接选择命令，而不是重新推导。
   - 状态：已实施。新增 `check:author`、`check:agent`、`check:screenshot`、`check:project-core`、`check:project-admin-mcp`、`check:viewer`、`check:all`。

3. 第三批：生成物治理
   - 更新 `.gitignore`，分离 fixture 与运行数据，清理覆盖率和 tsbuildinfo。
   - 建议单独提交，避免和功能改动混在一起。
   - 状态：部分实施。已更新 `.gitignore`；未从版本控制移除已跟踪的 `data/`、coverage、tsbuildinfo，避免误删仍被测试依赖的数据。

4. 第四批：包级指南和长期文档同步
   - 新增 `author-site`、`project-core`、`project-admin-mcp` 包级 `AGENTS.md`。
   - 同步项目总览和独立 Agent 服务层文档到 Pi Agent 单后端现状。
   - 状态：已实施关键包级指南，并同步项目总览、Agent 架构、Docker 和使用端部署文档。`docs/项目文档/独立Agent服务层/03-核心模块设计.md` 仍可能包含旧结构示例，后续可单独整理。

5. 第五批：环境复现和 E2E 稳定性
   - 统一 `.env.example`，环境变量化 E2E，补齐无外部密钥的健康验证。
   - 状态：部分实施。已新增根 `.env.example`，E2E 支持 `E2E_BASE_URL`、`E2E_USER`、`E2E_PASSWORD`；无真实 LLM 的 agent-service 健康验证尚未新增。

## 后续验收建议

每批优化完成后建议运行：

| 优化批次 | 验证方式 |
| --- | --- |
| 入口纠偏 | `pnpm exec playwright test --config test/新建-编辑-保存项目测试/playwright.config.ts --list` 或等价 Playwright 列表命令，确认使用指定 config；人工核对根 `AGENTS.md` 包表与 `pnpm-workspace.yaml` 一致 |
| 验证矩阵 | 逐个执行新增 `check:*` 脚本，确认失败范围可定位到对应包 |
| 生成物治理 | `git status --short`、`git ls-files` 检查覆盖率、tsbuildinfo、E2E 输出和运行日志不再污染工作区 |
| 包级指南 | 从任一包目录开始，让 agent 能只读根指南 + 包指南判断验证命令 |
| 文档同步 | `rg -n "多后端|dev:web|snapshot-service|--profile viewer" AGENTS.md docs test packages --glob '!**/node_modules/**' --glob '!**/.next/**' --glob '!**/coverage/**'`，确认仅保留历史说明或明确标注 |

## 初步风险与待确认事项

- 当前会话未暴露 `codegraph_*` 工具，虽然仓库存在 `.codegraph/`；如后续要做符号级影响分析，需要恢复 CodeGraph MCP 调用入口。
- 当前工作区已有大量用户改动和未跟踪文件，本轮实施只做 agent 友好度相关文件的增量修改，没有回滚或整理无关改动。
- `project-core` 和 `project-admin-mcp` 当前处于未跟踪状态，但已被 `author-site` 引用；后续更新根指南前，需要确认这两包是否准备作为正式 workspace 成员提交。
- `data/` 中已有大量文件被版本控制跟踪。清理前必须先区分真实 fixture、演示数据和运行时数据，避免误删仍被测试依赖的输入。
- 长期文档同步需要注意 DRY：不要在多个文档重复描述 Pi Agent 迁移背景，应引用已完成的迁移方案或根指南。
- 本轮实施后仍需确认 `docs/项目文档/独立Agent服务层/03-核心模块设计.md` 中的旧目录示例是否要重写；该文档较长，建议单独任务处理。

## 验证方式

- 已使用仓库现有文件、脚本和文档交叉核对结论。
- 已记录后续每批优化建议对应的验证命令。
- 本轮实施后需要运行脚本级验证，重点检查 package scripts、Playwright config 解析、TypeScript/Jest/Vitest 入口是否正常。
- 已验证 Playwright config 解析和 `project-core`、`project-admin-mcp` 的 TypeScript/Vitest 入口。未运行 `check:all`，因为当前工作区存在大量无关用户改动，且该命令会扩大验证范围。

## 本次实施摘要

本方案先完成审查与沉淀，随后按 P0/P1 优先级实施第一轮优化。已直接修改协作指南、验证脚本、E2E 配置、包级 AGENTS、忽略规则、根环境示例和关键项目文档；未执行删除类清理，避免在当前脏工作区误删用户数据或 fixture。
