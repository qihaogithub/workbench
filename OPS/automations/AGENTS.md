# AGENTS.md - OPS automations

本目录存放 Codex 定时任务和维护型自动任务的项目内上下文。它的主要读者是自动运行的 AI，不是产品需求评审或架构文档读者。

## 维护原则

- 以可执行为优先：写清读取顺序、判断规则、命令、输出位置和停机条件。
- 状态文件覆盖更新：`state/` 下只保留当前仍成立的结论，不追加逐次流水账。
- 运行手册保持短路径：`runbooks/` 面向某一种触发频率或任务，不重复长期背景。
- 高频排查路径放在 `diagnostics/`，可复用分类经验放在 `knowledge/`。
- 长期语义仍引用 `docs/项目文档/`，不要在这里复制业务规则。
- 自动任务记录问题时，优先复用已有 `docs/plans/进行中/` 跟踪文档。
- 不提交运行产物、截图、trace、日志、缓存、数据库或 `.env`。

## 与项目文档的区别

`OPS/automations/` 不适用 `docs/项目文档/` 的需求文档/技术文档拆分规范。这里允许使用 runbook、checklist、状态账本和自动任务提示词式结构。

如果发现可复用的业务规则、接口契约或架构边界，应沉淀回 `docs/项目文档/` 对应模块；如果只是自动任务执行上下文，留在本目录。

## 标准读取顺序

自动任务每次运行前按顺序读取：

1. 根目录 `AGENTS.md`。
2. 本文件。
3. `README.md`。
4. 对应 `contexts/*.md`。
5. 对应 `runbooks/*.md`。
6. 对应 `state/*.md`。
7. 任务指向的业务模块文档、代码、测试或运行现场。

## 修改边界

可以自动修改：

- 本目录下的 context、runbook 和 state。
- 与本次任务直接相关的测试、脚本、OPS 工具和项目文档链接。
- 对应进行中计划文档的当前状态。
- `registry/` 机器账本、`diagnostics/` 诊断包和 `knowledge/` 失败模式。

必须停止并等待人工确认：

- 需要定义新产品行为。
- 涉及权限、鉴权、管理后台、发布、回滚、删除或真实数据清理。
- 需要密钥、生产环境、真实外部服务或不可控网络。
- 目标文件存在无法理解的用户改动。

## 验证

仓库脚本使用 `corepack pnpm ...`，不要直接依赖全局 `pnpm`。

常用入口：

- `corepack pnpm check:repo`
- `corepack pnpm check:automation`
- `corepack pnpm check:project-cli`
- `corepack pnpm check:project-core`
- `corepack pnpm check:author`
- `corepack pnpm check:agent`
- `corepack pnpm check:all`
- `corepack pnpm test:e2e`
