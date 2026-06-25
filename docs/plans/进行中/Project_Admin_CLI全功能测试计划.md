# Project Admin CLI 全功能测试计划

> 状态：已完成  
> 日期：2026-06-25

## 背景

Project Admin 主路径已经切换为 JSON-first CLI。现在需要对 CLI 注册表中的全部主命令做一次系统性验证，避免只覆盖核心 happy path，遗漏边缘命令、删除确认链路或外部服务降级路径。

## 目标

- 枚举 `ow commands --json` 中的全部主命令。
- 在临时 `DATA_DIR` 中执行每个主命令至少一次。
- 对成功路径断言 `ok: true`，对预期失败或外部服务不可用路径断言稳定 `error.code` 与 `nextActions`。
- 保持测试不污染仓库 `data/`。

## 范围

- 覆盖 `packages/project-cli/src/index.ts` 注册的主命令。
- 覆盖项目、模板、事务、页面、文件夹、配置、资产、预览、发布、AI 会话、审计、管理员锁定和本地项目包工作流。
- 不做真实 author-site、agent-service、screenshot-service 网络调用；相关命令验证本地降级或 mock 响应。

## 方案

- 新增一个 CLI 全功能测试脚本，复用 CLI 的 `runCli()` 入口。
- 测试中捕获 stdout，解析 JSON 输出。
- 使用临时目录创建项目和本地项目包，按真实操作顺序构造后续命令所需的 `projectId`、`editId`、`pageId`、`folderId`、`templateId`、`planId`、`confirmToken` 和 `auditId`。
- 测试末尾读取 `commands` 结果，要求所有主命令都被执行记录覆盖。

## 任务清单

- [x] 新增 CLI 全功能测试脚本。
- [x] 接入 `project-cli` 测试命令。
- [x] 跑通 `pnpm check:project-cli`。
- [x] 视影响范围运行补充验证。
- [x] 更新本计划的结果与剩余风险。

## 进度记录

- 2026-06-25：开始测试范围梳理，确认 CLI 注册表当前包含 71 个主命令。
- 2026-06-25：新增 `packages/project-cli/src/cli-all-commands.test.ts`，并接入 `@opencode-workbench/project-cli` 的 `test` 脚本。
- 2026-06-25：首次运行发现空字符串位置参数会被 CLI 解析为布尔值、`--input-json` 需要 `@file` 前缀；已调整测试输入方式。`pnpm check:project-cli` 通过，新增全命令测试覆盖 71 个主命令入口。
- 2026-06-25：补充运行 `pnpm check:project-core` 和 `pnpm check:project-scaffold`，均通过。
- 2026-06-25：最终运行 `pnpm check:all` 通过。完整验证链路包括 project-core、project-scaffold、project-cli、agent-service、screenshot-service、author-site 和 viewer-site。

## 验证方式

- `pnpm check:project-cli`
- 必要时补跑 `pnpm check:project-core` 和 `pnpm check:project-scaffold`
- `pnpm check:all`

## 风险与待确认事项

- 外部服务相关命令只能验证 CLI 行为、降级提示和 mock 响应，不能替代真实联调。
- 删除类命令会在临时数据目录中执行，必须确保所有命令都带 `--data-dir`。

## 最终结果

- 已新增 CLI 全功能测试脚本，并纳入 `pnpm check:project-cli`。
- 测试通过 `ow commands --json` 获取主命令注册表，并断言 71 个主命令入口全部执行过。
- 测试数据全部写入临时 `DATA_DIR`，未使用仓库 `data/`。
- 外部服务相关命令采用本地降级路径或 mock 响应验证 CLI 行为。

验证结果：

- `pnpm check:project-cli` 通过。
- `pnpm check:project-core` 通过。
- `pnpm check:project-scaffold` 通过。
- `pnpm check:all` 通过。

剩余风险：

- `ai send-message` 使用 mock agent-service 响应验证 CLI 调用链，不代表真实 agent-service 联调。
- `publish project` 的本地路径已覆盖；author-site 正式发布路径仍由现有 CLI 契约测试 mock API 响应覆盖。
- `preview screenshot` 和 `preview healthcheck` 验证服务不可用时的 CLI 结构化返回，不启动真实 screenshot-service 执行截图任务。
