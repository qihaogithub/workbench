# 项目管理与 CLI 问题沉淀

## 当前状态

CLI 与创作端能力对齐仍需长期跟踪。最近更新：2026-07-03。

主线结论：CLI 对账未发现新的共享层能力缺口，也未发现全命令测试漏覆盖问题。`commands --json` 与 `register(...)` 列表保持一致，`cli-all-commands` 末尾仍用反查守卫覆盖所有已注册命令。本轮唯一差异是低风险文档漂移：`page switch-runtime` 已完成共享层承载和 CLI 覆盖，但此前未登记到能力清单，现已补齐。剩余 4 个结构性缺口继续维持只报告策略。

## 当前缺口

| 编号 | 状态 | 自动化等级 | 缺口 | 当前判断 |
| --- | --- | --- | --- | --- |
| GAP-002 | 待处理 | L1 | 会话管理缺失 | Web 会话创建/删除依赖 agent-service、模型配置和外部鉴权同步；`project-core` 尚无共享会话生命周期能力 |
| GAP-003 | 待处理 | L1 | 工作区管理缺失 | Web 工作区仍停留在 author-site 本地 manager；`project-core` 尚无统一工作区服务 |
| GAP-004 | 待处理 | L1 | 知识文档 CRUD 缺失 | Web 侧知识文档直接操作 `workingDir/knowledge` 与 manifest，缺少适用于 CLI 的共享领域封装 |
| GAP-005 | 待处理 | L1 | 截图任务命令缺失 | 截图任务依赖 author-site 代理与 screenshot-service；当前 `project-core` 只有健康状态查询，未具备任务级共享能力 |

## 已关闭项

- GAP-000：`project duplicate` 参数顺序回归已关闭，当前 `packages/project-cli/src/index.ts` 与全命令测试正常。
- GAP-001：页面版本历史/快照查询缺失已关闭，当前已覆盖 `page version-list`、`page version-get`、`page version-create` 与既有 `page restore-version`。
- GAP-006：`corepack pnpm` 标准验证环境阻塞已关闭。
- GAP-007：runtime contract 校验 CLI 缺口已关闭，当前已覆盖 `project validate-runtime`、`page validate-runtime`，并由 `packages/project-core/src/service.ts` 提供共享能力。
- GAP-008：HTML/CSS 原型页 CLI 缺口已关闭，当前 `page create` 已支持 `runtimeType: "prototype-html-css"` 与原型页文件输入，`page update-prototype`、`page switch-runtime` 已注册并复用 `packages/project-core/src/service.ts` 的共享文件读写、运行时切换、版本快照与静态安全校验。

## 验证状态

- `corepack pnpm check:automation`：通过。
- `corepack pnpm ops:automation report --json`：通过，当前仍为 13 个 active 入口（`tools.json` 3 / `tests.json` 6 / `scripts.json` 4）。
- `corepack pnpm exec tsx packages/project-cli/src/index.ts commands --json`：通过；返回的命令清单与 `packages/project-cli/src/index.ts` 注册项一致。
- `packages/project-cli/src/cli-all-commands.test.ts`：仍以 `registeredCommands.filter((command) => !executed.has(command))` 断言没有未覆盖命令。
- `corepack pnpm check:project-core`：通过（27 tests passed），确认原型页能力的共享层实现可通过类型检查与单元测试。
- `corepack pnpm check:project-cli`：通过，确认 `page update-prototype` 与扩展后的 `page create` 仍满足全命令回归。
- `corepack pnpm check:author`：失败；失败项集中在既有 `src/components/demo/home-page.test.tsx` 与 `src/components/demo/preview-canvas-interaction-mode.test.tsx` 超时，不属于本轮 CLI 对齐阻塞。
- 未运行 `corepack pnpm check:project-scaffold`：最近一轮未修改 project-scaffold。
- 2026-07-03 对账：`corepack pnpm exec tsx packages/project-cli/src/index.ts commands --json` 输出包含 `page switch-runtime`；同时该命令已存在于 `packages/project-cli/src/index.ts`、`packages/project-cli/src/cli-all-commands.test.ts`、`packages/project-core/src/service.ts` 与 `packages/author-site/src/app/api/projects/[projectId]/demos/[demoId]/runtime/route.ts`，本轮只修正文档登记遗漏。
- 2026-07-03 当前工作树验证：`corepack pnpm check:project-core` 通过（31 tests passed）；`corepack pnpm check:project-cli` 通过。删除已发布产物的共享层改动未引入新的 CLI 注册或测试覆盖缺口。

## 当前结论

- `project-core` 仍未提供通用 `session *`、`workspace *`、`knowledge *` 或截图任务级共享服务；当前相关能力仍主要停留在 author-site 路由与本地 manager 层。
- `packages/project-core/src/service.ts` 现已承载 HTML/CSS 原型页的创建、更新、运行时切换、版本快照、恢复和静态安全校验，`packages/project-cli/src/index.ts` 通过 `page create`、`page update-prototype` 与 `page switch-runtime` 复用该能力完成对齐，不需要在 CLI 侧复制 author-site 组件逻辑。
- 原型页能力当前仅确认创作端编辑事务与本地测试链路；根据 [`docs/项目文档/创作端/10-CLI/技术/01_CLI能力层实现设计.md`](../../项目文档/创作端/10-CLI/技术/01_CLI能力层实现设计.md)，发布、viewer 与本地项目包协议仍不应被自动推断为已完整支持。
- `packages/author-site/src/app/api/sessions/route.ts`、`workspaces/route.ts`、`knowledge/route.ts`、`screenshots/generate-batch/route.ts` 继续证明上述 4 个缺口属于共享层缺口，不适合在 CLI 侧直接复制 Web 逻辑。
- 当前工作树中的 `packages/project-core/src/service.ts` 已出现 `project_delete_execute` 同步删除已发布产物并重建 `published/projects-index.json` 的语义扩展；它落在删除 / 发布链路，自动化等级继续按 L5 只报告，不触发新的 CLI 自动实现。
- 外部自动化提示词仍使用历史文件名 `CLI与创作端能力对齐长期跟踪.md`；兼容入口继续保留，但正文仍只在本文件维护。

## 下次检查重点

- `packages/project-core/src/service.ts` 是否新增会话、工作区、知识文档或截图任务的共享能力。
- `packages/project-cli/src/index.ts` 是否新增 `session *`、`workspace *`、`knowledge *`、`screenshot *` 相关命令。
- HTML/CSS 原型页是否进一步进入 publish、viewer 或 project-scaffold；在共享层明确前，不要把这些链路误记为已完成 CLI 对齐。
- author-site 新增项目、模板、页面、配置、资产、预览、发布、AI 会话或审计路由时，是否已经在 CLI 能力清单留下对齐决策。
- 若会话、工作区、知识、截图能力仍只存在于 author-site 本地实现，继续按 L1 报告，不在 CLI 侧复制 Web 逻辑。
