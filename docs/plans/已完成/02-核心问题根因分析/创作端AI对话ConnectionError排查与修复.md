# 创作端 AI 对话 Connection error 排查与修复

## 背景

用户反馈创作端 AI 对话在发送“你能阅读哪些知识库。”后返回“错误: Connection error.”，AI 对话无法使用。

## 目标

- 定位创作端 AI 对话连接失败的根因。
- 修复 WebSocket 或 HTTP 调用链中导致连接失败的问题。
- 运行与改动范围匹配的验证命令。
- 同步更新相关项目文档。

## 范围

- 创作端 `packages/author-site` 的 AI 对话连接逻辑。
- `packages/agent-service` 的 WebSocket/HTTP 健康和路由兼容性。
- 不涉及模型能力、知识库问答质量或外部 LLM 返回内容优化。

## 方案

1. 收集运行状态：确认 author-site、agent-service 端口、健康接口与环境变量。
2. 追踪调用链：确认前端如何构造 WebSocket URL、如何处理连接错误和降级请求。
3. 验证根因：用本地 HTTP/WebSocket 请求复现连接失败。
4. 最小修复：优先修复连接地址、代理或回退逻辑，不改变 AI 对话业务语义。
5. 文档和验证：更新 AI 对话模块文档并运行相关检查。

## 任务清单

- [x] 建立排查文档
- [x] 确认 agent-service `/health` 状态
- [x] 定位 WebSocket URL 和错误处理代码
- [x] 复现连接失败根因
- [x] 实施修复
- [x] 更新项目文档
- [x] 运行验证命令

## 进度记录

- 2026-06-27：用户截图显示 AI 对话消息返回“错误: Connection error.”。
- 2026-06-27：`http://localhost:3201/health` 返回 `status: ok`，agent-service 已运行。
- 2026-06-27：端口检查显示 author-site `3200`、agent-service `3201`、screenshot-service `3202`、viewer-site `3300` 均有监听。
- 2026-06-27：根目录 `.env` 存在 `NEXT_PUBLIC_AGENT_SERVICE_URL=http://localhost:3201`；`packages/author-site/.env.local` 存在 `AGENT_SERVICE_URL=http://localhost:3201`。
- 2026-06-27：`ops-cli system --json` 因当前 pnpm 运行时版本与 lockfile 不兼容而未能执行，后续改用 HTTP 状态、端口和源码路径验证。
- 2026-06-27：本地 WebSocket 测试 `ws://localhost:3201/api/agent/test-codex-stream/stream` 成功建立连接并收到 `status: ready`，排除浏览器到 agent-service 的基础 WebSocket 端点不可用。
- 2026-06-27：最近失败日志显示 agent-service 已进入 `processing`，随后上游模型返回 `MESSAGE_SEND_ERROR: Connection error.`，当时使用历史后台配置中的 `jojo/deepseek-v4-flash`。
- 2026-06-27：当前 agent-service 重启后 `/models` 返回 `mydeepseek/deepseek-v4-flash`，最小 HTTP 消息进一步暴露当前阻断点为 `previewDeletePages` 工具 schema 顶层 union 被上游拒绝。
- 2026-06-27：已将 `previewDeletePages` 参数 schema 改为顶层 object，并在执行阶段按 `mode` 校验 `query` / `pageIds`；工具能力版本从 11 升至 12。
- 2026-06-27：已修复 HTTP 非流式消息接口忽略 `result.success` 的问题，底层 Agent 失败时返回 `{ success: false, error }`。
- 2026-06-27：运行中的 agent-service 已热重载到 toolVersion 12；最小 HTTP 消息验证成功返回内容，AI 对话链路恢复。
- 2026-06-27：最小 WebSocket 流式消息验证成功收到 `finish` 事件，确认创作端默认流式链路也恢复。

## 验证方式

- WebSocket 端点本地连接测试：已通过。
- agent-service 类型检查：已通过 `node_modules\.bin\tsc.cmd -p packages\agent-service\tsconfig.json --noEmit`。
- agent-service 相关单元测试：已通过 `node_modules\.bin\vitest.cmd run packages/agent-service/tests/unit/ws-event-router.test.ts packages/agent-service/tests/unit/permissions.test.ts packages/agent-service/tests/unit/file-tools-permissions.test.ts`，共 46 个测试。
- 运行中服务验证：`/api/tools/capabilities` 返回 `toolVersion: 12`；最小 HTTP 消息成功返回内容。
- WebSocket 流式验证：`ws://localhost:3201/api/agent/codex-diagnose-ws-2/stream` 成功返回 `finish` 事件。

## 风险与待确认事项

- 根脚本 `corepack pnpm check:agent` 仍会因当前依赖目录 lockfile 与运行时 pnpm 检查不兼容而尝试清理 `node_modules`，无 TTY 下被 pnpm 阻止；本次改用已有依赖中的 TypeScript/Vitest 二进制完成等价范围验证。
- 用户浏览器实际访问地址若不是 `localhost:3200`，直接使用 `localhost:3201` 连接 agent-service 可能存在跨主机或混合内容问题。

## 最终状态

已完成。根因分为两层：历史运行时供应商配置导致上游连接失败；服务重启后当前主要阻断点是 `previewDeletePages` 顶层 union schema 被 OpenAI 兼容接口拒绝。代码已修复 schema 兼容性和 HTTP 错误传播，运行中 agent-service 已热重载并通过最小 AI 请求验证。
