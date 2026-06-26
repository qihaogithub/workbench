# AI 对话空回复与子智能体事件缺失 - 进度记录

> 创建日期：2026-06-25  
> 状态：进行中  
> 类型：问题分析与修复进度记录  
> 关联项目：`proj_1782286923644`  
> 关联模块：创作端 AI 对话、agent-service、Pi Agent、子 Agent `delegateTask`

## 一、问题背景

创作端 AI 对话在复杂页面生成任务中出现不可用现象。用户使用如下提示词时，聊天区可能长时间停留在 AI 处理中，或最终显示空回复兜底文案：

```text
给我绘制一个闯关活动的所有页面。包括首页、活动规则、抽奖页、结算页等等一切你觉得应该存在的页面
```

该任务预期会调用 Pi Agent 的工具能力，必要时通过 `delegateTask` 委派子 Agent 并行创建或检查页面文件。

## 二、用户侧现象

### 主要现象

1. AI 对话返回：
   - `抱歉，我没有收到有效的回复。`
2. 聊天区执行状态长期显示类似：
   - `当前执行`
   - `模型响应`
   - `等待模型响应`
   - `运行中`
3. 用户无法判断 AI 是否真的在工作。
4. 子 Agent 任务即使被模型描述为“已委派”，前端也可能没有可验证的任务过程、结果详情或文件变更。
5. 前端日志入口对普通用户不友好，用户要求日志保存在后端，便于开发者检查。

### 用户体验约束

1. 不做百分比进度。
2. 不做“无输出时长”提示，避免增加焦虑。
3. 普通用户界面不放运行日志入口。
4. 聊天底部只保留轻量处理中动效。
5. 子 Agent 详情可以通过弹窗查看，但不在主聊天流中铺开。

## 三、已定位的根因

### 根因 1：Pi Agent 返回错误消息时被当作成功空回复

后端日志显示，部分失败轮次的 Pi Agent 返回对象包含：

- `role`
- `content`
- `api`
- `provider`
- `model`
- `usage`
- `stopReason`
- `timestamp`
- `errorMessage`

但 `content` 为空数组，之前后端只提取文本内容，没有把 `errorMessage` 转成失败结果，导致前端收到“成功但无内容”，再显示兜底文案。

典型日志位置：

```text
data/agent-run-logs/session-1782295754063-4mliiv81a/msg-1782295778399.jsonl
data/agent-run-logs/session-1782295754063-4mliiv81a/msg-1782295831089.jsonl
```

典型 finish 摘要：

```text
finishContentLength=0
accumulatedStreamLength=0
toolResultCount=0
subagentResultCount=0
fileOperationCount=0
```

### 根因 2：WebSocket 路由读取当前模型时漏了 `await`

`BackendAgent.getModelInfo()` 是异步方法，WebSocket 路由曾按同步函数读取，导致 `currentModelId` 可能读不到，运行日志中出现 `model: ""`。

这会影响：

- 运行日志可诊断性。
- 会话复用时的模型选择链路。
- 后续排查供应商错误时的定位效率。

### 根因 3：子 Agent 工具事件来源判断不完整

Pi Agent Harness 存在两类事件：

1. Harness hook：
   - `tool_call`
   - `tool_result`
2. 底层 Agent loop 事件：
   - `tool_execution_start`
   - `tool_execution_end`

`harness.on("tool_call" / "tool_result")` 是 hook，不会自动进入 `harness.subscribe()`。如果只在 `subscribe()` 中等待 `tool_call` / `tool_result`，真实工具执行过程可能不会进入应用层 WebSocket 事件和后端 JSONL 日志。

因此子 Agent 可能实际被调用，但前端和日志看不到 `delegateTask` 的开始、结束、details、文件变更或错误。

### 根因 4：诊断工具端口过期

OPS/CLI 曾默认检查 `3101`，但当前 agent-service 实际端口为 `3201`。这会导致 `ops-cli system --json` 误报 agent-service 未运行。

## 四、已实施方案

### 1. 后端错误响应转失败

Pi Agent 返回的 assistant message 如果包含 `errorMessage`，后端应把本轮结果转为失败，不再作为成功空回复传给前端。

已覆盖行为：

- `errorMessage` 存在时抛出错误。
- 空内容且无文件变更时返回明确错误。
- 失败结果附带 `metadata.emptyResponseDebug`。
- JSONL finish 日志能保留响应结构摘要和错误摘要。

相关文件：

```text
packages/agent-service/src/backends/pi-agent.ts
packages/agent-service/src/core/backend-agent.ts
packages/agent-service/tests/unit/pi-agent.test.ts
packages/agent-service/tests/unit/update-system-prompt.test.ts
```

### 2. 扩展后端运行日志

新增事件日志落盘，默认路径：

```text
data/agent-run-logs/<sessionId>/<messageId>.jsonl
```

日志包含：

- `run_start`
- `stream_start`
- `thought`
- `tool_call`
- `tool_call_update`
- `permission_request`
- `file_operation`
- `plan`
- `status`
- `error`
- `cancel`
- `finish`

finish 必须记录：

- 最终回复内容长度。
- 累计 stream 长度。
- 工具结果数量。
- 子 Agent 结果数量。
- 文件操作数量。
- 文件结果数量。
- 错误或空回复调试 metadata。

敏感字段会脱敏：

- `apiKey`
- `api_key`
- `token`
- `authorization`
- `password`
- `secret`

相关文件：

```text
packages/agent-service/src/session/run-log-store.ts
packages/agent-service/src/routes/ws-event-router.ts
packages/agent-service/src/routes/websocket.ts
packages/agent-service/tests/unit/ws-event-router.test.ts
```

### 3. 修复工具执行事件映射

将底层 Pi Agent loop 的真实工具事件映射到应用层：

| Pi Agent 事件 | 应用层事件 |
|---|---|
| `tool_execution_start` | `tool_call` |
| `tool_execution_end` | `tool_call_update` |

这样 `delegateTask` 的以下信息可以进入 WebSocket、前端和 JSONL 日志：

- 任务入参 `task`
- 补充上下文 `context`
- 输出摘要 `content`
- 文件变更 `files`
- 耗时 `durationMs`
- 错误原因 `error`
- 原始 `details`

相关文件：

```text
packages/agent-service/src/backends/pi-agent.ts
packages/agent-service/tests/unit/pi-agent.test.ts
packages/agent-service/tests/unit/ws-event-router.test.ts
packages/author-site/src/components/ai-elements/chat/services/stream-service.ts
packages/author-site/src/components/ai-elements/chat/utils/chat-stream-utils.ts
```

### 4. 简化前端运行中提示

前端不再向普通用户展示“当前执行 / 模型响应 / 日志”等内部状态入口。

已调整为：

- 聊天底部只展示 `AI 正在处理` 轻量动效。
- 子 Agent 仍可点击打开详情弹窗。
- 详情弹窗展示任务、上下文、摘要、文件变更、失败原因和原始 details。

相关文件：

```text
packages/author-site/src/components/ai-elements/assistant-message.tsx
packages/author-site/src/components/ai-elements/message.tsx
packages/author-site/src/components/ai-elements/__tests__/assistant-message-subagent.test.tsx
```

### 5. 修复模型链路和诊断端口

已处理：

- WebSocket 路由中读取 `getModelInfo()` 时补 `await`。
- `OPS/CLI` 默认 URL 从 `3101` 调整为 `3201`。
- `ops-cli system --json` 可识别当前 agent-service。

相关文件：

```text
packages/agent-service/src/routes/websocket.ts
OPS/CLI/src/index.ts
OPS/CLI/src/commands/system.ts
OPS/CLI/README.md
OPS/CLI/QUICKSTART.md
```

## 五、验证进度

### 已通过的本地验证

```text
pnpm --filter @opencode-workbench/agent-service test
pnpm --filter @opencode-workbench/agent-service typecheck
pnpm --filter @opencode-workbench/author-site test
pnpm --filter @opencode-workbench/author-site typecheck
pnpm --filter @opencode-workbench/agent-client build
pnpm --filter @opencode-workbench/cli-tools build
```

截至记录创建时，测试结果：

| 范围 | 结果 |
|---|---|
| agent-service 全量测试 | 150 tests passed |
| author-site 全量测试 | 291 tests passed |
| agent-service typecheck | passed |
| author-site typecheck | passed |
| agent-client build | passed |
| OPS/CLI build | passed |

### 已通过的安全运行验证

对 `proj_1782286923644` 执行 WebSocket `get_models`，不发送用户提示词，不触发外部模型生成。

验证结果：

```text
currentModelId: jojo/deepseek-v4-flash
canSwitch: true
```

说明：

- agent-service 可用。
- 项目下模型链路可用。
- 当前模型不再为空字符串。

## 六、未完成与阻塞项

### 未完成验收

最终目标要求使用真实提示词验证：

```text
给我绘制一个闯关活动的所有页面。包括首页、活动规则、抽奖页、结算页等等一切你觉得应该存在的页面
```

验收应确认：

1. AI 对话不再返回空回复兜底。
2. 运行日志生成在 `data/agent-run-logs/...`。
3. 日志中出现 `delegateTask` 或明确证明子 Agent 被正常调用。
4. `delegateTask` 有完整入参、结果、details、耗时、文件变更或错误。
5. 工作区实际生成多页面文件。
6. 页面列表或 `workspace-tree.json` 反映新增页面。
7. 前端运行提示不再卡在“模型响应 / 当前执行”。

### 当前阻塞

真实提示词测试会把项目 workspace 和用户提示词发送给外部模型提供方。此前同类命令已被审批拦截。继续验收需要用户明确授权外部模型调用。

## 七、下一次接续处理步骤

1. 确认本地服务：

```text
curl http://127.0.0.1:3201/health
pnpm --dir OPS/CLI dev system --json
```

2. 打开或复用项目：

```text
proj_1782286923644
data/projects/proj_1782286923644/workspace
```

3. 在用户明确授权后，使用指定提示词发送真实 WebSocket 消息。

4. 测试完成后检查最新日志：

```text
find data/agent-run-logs -type f -name "*.jsonl" | sort | tail
```

重点查看：

- `finish.payload.finishContentLength`
- `finish.payload.accumulatedStreamLength`
- `finish.payload.toolResultCount`
- `finish.payload.subagentResultCount`
- `tool_call` 是否包含 `delegateTask`
- `tool_call_update.payload.details.files`
- `metadata.emptyResponseDebug`

5. 检查工作区页面产物：

```text
data/projects/proj_1782286923644/workspace/workspace-tree.json
data/projects/proj_1782286923644/workspace/demos/
```

6. 如果仍为空回复：

- 先看 `finish.payload.metadata.emptyResponseDebug.errorMessage`。
- 再看 `model`、`provider`、`stopReason`。
- 再确认 `tool_execution_start/end` 是否进入日志。

7. 如果子 Agent 未出现：

- 检查系统提示词是否注入运行时工具列表。
- 检查 `delegateTask` 是否在 activeTools 中。
- 检查 `PI_AGENT_SUBAGENTS_ENABLED` 或用户模型配置。
- 检查 `packages/agent-service/src/backends/pi-tools/subagent-tool.ts` 是否被 `createWorkbenchTools` 启用。

## 八、相关文件路径

### 后端核心

```text
packages/agent-service/src/backends/pi-agent.ts
packages/agent-service/src/backends/pi-tools/subagent-tool.ts
packages/agent-service/src/core/backend-agent.ts
packages/agent-service/src/core/types.ts
packages/agent-service/src/routes/websocket.ts
packages/agent-service/src/routes/ws-event-router.ts
packages/agent-service/src/session/run-log-store.ts
```

### 前端核心

```text
packages/author-site/src/components/ai-elements/assistant-message.tsx
packages/author-site/src/components/ai-elements/message.tsx
packages/author-site/src/components/ai-elements/chat/hooks/use-chat-stream.ts
packages/author-site/src/components/ai-elements/chat/services/stream-service.ts
packages/author-site/src/components/ai-elements/chat/utils/chat-stream-utils.ts
```

### Client 与诊断工具

```text
packages/agent-client/src/client.ts
OPS/CLI/src/index.ts
OPS/CLI/src/commands/system.ts
OPS/CLI/README.md
OPS/CLI/QUICKSTART.md
```

### 测试

```text
packages/agent-service/tests/unit/pi-agent.test.ts
packages/agent-service/tests/unit/ws-event-router.test.ts
packages/agent-service/tests/unit/update-system-prompt.test.ts
packages/author-site/src/components/ai-elements/__tests__/assistant-message-subagent.test.tsx
```

### 相关文档

```text
docs/项目文档/创作端/05-AI对话/技术/07_运行进度与事件日志.md
docs/项目文档/创作端/05-AI对话/INDEX.md
docs/plans/进行中/创作端子Agent聊天展示方案.md
```

## 九、当前结论

当前代码层面已经修复了已确认的三类问题：

1. Pi Agent 错误响应被误判为空成功响应。
2. 子 Agent 工具执行事件没有稳定进入应用层事件流。
3. 诊断工具和模型链路存在误导性空模型/旧端口问题。

剩余风险集中在真实外部模型调用：

- 供应商是否继续返回 `errorMessage`。
- 模型是否愿意实际调用 `delegateTask`。
- 指定复杂提示词是否能在超时时间内完成多页面生成。

这些风险必须通过用户授权后的真实运行日志和工作区文件结果来最终确认。

