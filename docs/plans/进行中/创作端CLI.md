# 项目管理与 CLI 问题沉淀

## 当前状态

CLI 与创作端能力对齐仍需长期跟踪。最近更新：2026-07-01。

主线结论：CLI 对账未发现新的注册命令漏登记问题，也未发现全命令测试漏覆盖问题。runtime contract 校验能力已补齐；剩余 4 个结构性缺口继续维持只报告策略。

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

## 验证状态

- `corepack pnpm check:automation`：通过。
- `corepack pnpm ops:automation report --json`：通过，当前仍为 13 个 active 入口（`tools.json` 3 / `tests.json` 6 / `scripts.json` 4）。
- `corepack pnpm check:project-core`：通过。
- `corepack pnpm check:project-cli`：通过。
- 未运行 `corepack pnpm check:author`：最近一轮未修改 author-site API 或 shared 契约。
- 未运行 `corepack pnpm check:project-scaffold`：最近一轮未修改 project-scaffold。

## 下次检查重点

- `packages/project-core/src/service.ts` 是否新增会话、工作区、知识文档或截图任务的共享能力。
- `packages/project-cli/src/index.ts` 是否新增 `session *`、`workspace *`、`knowledge *`、`screenshot *` 相关命令。
- author-site 新增项目、模板、页面、配置、资产、预览、发布、AI 会话或审计路由时，是否已经在 CLI 能力清单留下对齐决策。
- 若会话、工作区、知识、截图能力仍只存在于 author-site 本地实现，继续按 L1 报告，不在 CLI 侧复制 Web 逻辑。
