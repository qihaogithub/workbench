# AI 对话超时与会话工作区文件变更未同步 - 分析报告

> 日期：2026-06-25  
> 文档名称：`AI对话超时与会话工作区文件变更未同步-分析报告.md`  
> 关联项目：`proj_1782286923644`  
> 关联会话：`session-1782352064983-nss8n7bgy`  
> 关联日志：`data/agent-run-logs/session-1782352064983-nss8n7bgy/msg-1782352296553.jsonl`  
> 当前状态：已补充修复；AI 文件变更会实时刷新，WebSocket 超时已从固定 300 秒硬上限改为连续 300 秒无 Agent 事件才取消

## 1. 问题背景

用户在创作端 AI 对话中输入复杂多页面生成需求后，聊天窗口显示：

```text
错误: 消息处理超时（300s 无响应），已自动取消
```

同时用户在聊天流中看到 AI 已经创建多个页面，但预览区和页面列表没有出现新增页面。

经复查，项目编辑页本来就应使用会话工作区，而不是直接使用正式项目工作区。本问题的准确表述不是“AI 写错工作区”，而是：AI 已在本轮会话工作区写入页面文件，但文件变更事件和错误收束路径没有把这些变更稳定传回前端，导致预览区和页面列表没有刷新。

本次诊断使用 `ops-cli system --json` 确认运行状态：

- author-site 端口 `3200` 正在运行。
- agent-service 端口 `3201` 正在运行且 health 正常。
- agent-service 当前有 1 个活跃 Agent。

## 2. 证据链

### 2.1 本次不是“空回复成功”，而是 300 秒硬超时

运行日志最后记录：

```json
{
  "eventType": "finish",
  "summary": "stream=396, finish=0, tools=26, subagents=2",
  "payload": {
    "success": false,
    "error": {
      "code": "MESSAGE_TIMEOUT",
      "message": "消息处理超时（300s 无响应），已自动取消"
    }
  }
}
```

日志统计显示本轮共有：

- `thought`: 2217 条
- `tool_call`: 26 条
- `tool_call_update`: 26 条
- `cancel`: 2 条
- `finish`: 1 条

结论：模型确实在工作，并调用了工具和子 Agent；最终失败点是 WebSocket 路由的 300 秒 watchdog。

相关代码：`packages/agent-service/src/routes/websocket.ts:285` 到 `packages/agent-service/src/routes/websocket.ts:335`。超时分支会 `agent.cancel()` 并返回 `MESSAGE_TIMEOUT`，失败时只发送 `error` 事件，不发送携带 `files` 的 `finish` 事件。

### 2.2 页面实际写到了编辑页使用的会话工作区

项目正式工作区：

```text
data/projects/proj_1782286923644/workspace
```

只包含默认页面：

```json
{
  "pages": [
    {
      "id": "default-page_r9mr",
      "name": "默认页面"
    }
  ]
}
```

本次 Agent 实际工作区，也就是编辑页本轮应使用的独立会话工作区：

```text
data/workspaces/a5862615-26bb-4688-924d-7fd68c132e21/proj_1782286923644/ws-1782352065007-pda264omc
```

该目录中已经出现多个页面目录：

```text
challenge-homepage_a4b2
activity-rules_c7d9
lottery-page_x4k9
level-list_b2v6
task-detail_f8n1
settlement-page_m3p7
leaderboard_h5j0
prize-center_w2q8
```

结论：AI 创建页面的说法不是幻觉；它写入的是编辑页应当读取的会话工作区。正式项目工作区未更新只说明这些改动尚未保存/合并，不构成本问题根因。编辑页看不到新增页面的直接问题在会话工作区变更同步链路。

### 2.3 会话工作区自身也未完成

会话工作区的 `workspace-tree.json` 只登记了 3 个页面：

```text
默认页面
活动首页
活动规则
```

磁盘目录中还有 5 个完整页面未登记到 tree：

```text
lottery-page_x4k9
leaderboard_h5j0
settlement-page_m3p7
task-detail_f8n1
level-list_b2v6
```

另有 1 个半成品页面：

```text
prize-center_w2q8
```

该目录只有 `config.schema.json`，缺少 `index.tsx`。

结论：即使立即同步工作区，也会带入一个未完成页面，且页面树元数据不完整。

### 2.4 系统提示词存在路径误导

系统提示词要求创建页面后修改：

```text
workspace/workspace-tree.json
```

证据：`packages/author-site/src/lib/agent/prompts/system-prompt.md:54` 和 `:69`。

但 Agent 工具的工作目录已经是 workspace 根目录，正确路径应是：

```text
workspace-tree.json
```

本次日志中也出现了对应失败：

```text
Error reading file: ENOENT ... /ws-1782352065007-pda264omc/workspace/workspace-tree.json
```

结论：路径提示错误会直接干扰模型读写页面树，导致新页面目录存在但页面列表元数据缺失或不稳定。

### 2.5 后端没有把 writeFile 结果稳定汇总为文件变更

`PiAgentBackend` 目前只在 `tool_result` hook 中调用 `recordToolFileChange()` 累积 `this.files`：

- `packages/agent-service/src/backends/pi-agent.ts:566`
- `packages/agent-service/src/backends/pi-agent.ts:641`

但本轮运行日志中：

```text
fileOperationCount=0
fileCount=0
```

与此同时，日志里有多次 `writeFile` 的 `tool_execution_end` 结果，例如成功写入：

```text
demos/task-detail_f8n1/index.tsx
demos/leaderboard_h5j0/index.tsx
demos/prize-center_w2q8/config.schema.json
```

`tool_execution_end` 当前只转发 `tool_call_update`，没有调用文件变更记录逻辑。证据：`packages/agent-service/src/backends/pi-agent.ts:889` 到 `:900`。

结论：当前 Pi Agent 事件来源有两条路径，但文件变更捕获只覆盖 hook 路径。真实工具执行事件进入了日志和前端详情，却没有进入 `result.files`。

### 2.6 编辑页初始加载和刷新都以会话工作区为准

编辑页创建 Session 后会保存 `workspaceId` 和 `tempWorkspace`，随后调用 `/api/sessions/{sessionId}/files` 读取会话工作区文件并设置页面列表。证据：`packages/author-site/src/app/demo/[id]/edit/page.tsx:780` 到 `:812`。

AI 运行中的页面结构刷新则依赖 `handleAiFilesChange`。它只在文件变化包含 `workspace-tree.json` 或 demos 删除时，才调用 `/api/sessions/{sessionId}/files` 刷新页面列表。证据：`packages/author-site/src/app/demo/[id]/edit/page.tsx:1017` 到 `:1053`。

会话文件 API 本身会返回页面列表：

- `packages/author-site/src/app/api/sessions/[sessionId]/files/route.ts:50`
- `packages/author-site/src/app/api/sessions/[sessionId]/files/route.ts:59`

并且 `listDemoPages()` 会兜底发现磁盘上有但 `workspace-tree.json` 缺失的完整页面：

- `packages/author-site/src/lib/fs-utils.ts:1039`
- `packages/author-site/src/lib/fs-utils.ts:1056`

结论：编辑页的数据源确实是会话工作区，且刷新 API 具备发现完整页面目录的能力；问题是本次 AI 写文件没有稳定触发编辑页刷新。

### 2.7 复查补充：子 Agent 完成后未实时触发画布刷新

2026-06-25 复查用户截图对应的新会话：

```text
session-1782353884261-qnvyodeb1
```

会话状态为 `error`，工作区为：

```text
data/workspaces/a5862615-26bb-4688-924d-7fd68c132e21/proj_1782286923644/ws-1782353884285-e3ul5xt4t
```

本轮 JSONL 日志：

```text
data/agent-run-logs/session-1782353884261-qnvyodeb1/msg-1782353896659.jsonl
```

日志统计显示：

```text
fileOperationCount=0
fileCount=13
subagentResultCount=1
error.code=MESSAGE_TIMEOUT
```

同时会话工作区最终已有 6 个新增页面文件和更新后的 `workspace-tree.json`：

```text
challenge-home_a3f2
challenge-rules_b7k1
challenge-quiz_c9m4
challenge-lottery_d2p8
challenge-result_e5r6
challenge-prizes_f1t3
```

这与用户截图一致：子 Agent 已报告完成前 3 个页面时，画布仍只显示默认页；后续主 Agent 继续写剩余页面并最终触发 300 秒超时，超时错误携带 `files` 后，前端才刷新出新页面。

代码层面的关键差异是：

- 主 Agent 的普通 `writeFile` 在 `tool_execution_end` 中会调用 `emitFileOperationForTool()`，实时发出 `file_operation`。
- 子 Agent 在 `runSubagent()` 中只调用 `setupToolHooks(harness, unsubs)` 收集 `this.files`，没有把子 Agent 内部的 `writeFile/editFile` 实时映射为父会话的 `file_operation`。
- 前端流式阶段的画布刷新依赖 `file_operation` 进入 `onFileOperation`，再经 `processFileChanges()` 调用编辑页的 `handleAiFilesChange()`。
- 超时错误路径会把 `agent.getFiles()` 放进 `error.files`，所以最终错误出现时前端能补刷页面。

结论：原修复已经让“最终错误路径”可补偿刷新，但没有覆盖“子 Agent 完成瞬间”的实时刷新。子 Agent 写入的文件只进入最终 `files` 汇总，不进入实时 `file_operation` 事件流。

## 3. 根因分析

### 根因 1：复杂多页面任务超出固定 300 秒 watchdog

模型在 300 秒内仍持续输出 thought 并执行工具，说明不是无响应死锁。固定 300 秒超时直接取消了正在进行的页面生成任务。

影响：

- 最终回复为空。
- 最后一页生成中断。
- 前端收到错误消息，而不是完成事件。

2026-06-25 复查再次确认该问题：新会话 `session-1782355822577-53v4avwm8` 从 `03:08:57` 到 `03:13:58` 报错，正好约 300 秒。截图中 AI 在 300 秒内已经创建并刷新出多个页面，说明旧逻辑不是“连续无响应超时”，而是总耗时达到固定上限即取消。

### 根因 2：页面树路径提示错误

系统提示词把页面树路径写成 `workspace/workspace-tree.json`，但工具工作目录已经是 workspace 根目录。

影响：

- 模型读写页面树失败。
- 新增页面目录与页面元数据不一致。
- 页面列表可能缺页。

### 根因 3：文件变更捕获未覆盖 `tool_execution_end`

真实工具事件已通过 `tool_execution_start/end` 进入应用层事件流，但 `this.files` 只依赖 `tool_result` hook 累积。

影响：

- `result.files` 为空。
- 运行日志 `fileCount=0`。
- 前端 finish 阶段无法通过 `files` 刷新代码、Schema 和页面列表。

### 根因 4：失败路径不会给前端一次最终会话工作区刷新机会

WebSocket 失败分支只发送 `error`，不发送带 `files` 的 `finish` 或 `partial_files`。

影响：

- 即使会话工作区已有可用半成品，前端也无法重新读取 `/api/sessions/{sessionId}/files`。
- 用户只能看到“超时取消”，页面列表仍停留在 AI 运行前的内存状态。

### 根因 5：子 Agent 文件变更只做最终汇总，没有实时桥接到父会话文件事件

`runSubagent()` 会让子 Agent 与主 Agent 共享 `this.files`，因此最终 `result.files` 能包含子 Agent 写入的文件。但子 Agent 内部 harness 没有注册 `setupEventMapping()` 里的 `tool_execution_end -> file_operation` 转发逻辑，导致前端在子 Agent 完成时收不到可触发画布刷新的实时文件事件。

影响：

- 子 Agent 结果块可以显示“完成 3 个页面”，因为 `delegateTask` 工具结果已回到聊天区。
- 右侧画布仍不刷新，因为没有 `file_operation` 事件驱动 `handleAiFilesChange()`。
- 后续只有主 Agent 普通写文件、正常 finish 或 timeout error 携带 `files` 时，画布才会补刷。

## 4. 已落地修复

### 4.1 页面树路径提示

已将系统提示词中的页面树路径从 `workspace/workspace-tree.json` 修正为会话工作区根目录下的 `workspace-tree.json`，避免模型在会话工作区内再错误追加一层 `workspace/`。

相关文件：`packages/author-site/src/lib/agent/prompts/system-prompt.md`。

### 4.2 文件变更捕获

已在 `tool_execution_end` 事件处理中兼容提取工具入参，并把成功的 `writeFile` 结果补充记录为文件变更，同时发出前端可消费的 `file_operation` 事件。

相关文件：

- `packages/agent-service/src/backends/pi-agent.ts`
- `packages/agent-service/tests/unit/pi-agent.test.ts`

### 4.3 超时错误路径

已在 WebSocket 超时分支取消 Agent 后读取当前已捕获文件列表，并把这些部分文件变更放入错误事件。前端收到错误事件后也会处理其中的 `files`，从而触发会话工作区刷新。

相关文件：

- `packages/agent-service/src/core/backend-agent.ts`
- `packages/agent-service/src/routes/websocket.ts`
- `packages/author-site/src/components/ai-elements/chat/services/stream-service.ts`
- `packages/author-site/src/components/ai-elements/chat/hooks/use-chat-stream.ts`

### 4.4 编辑页刷新触发

已将编辑页的 AI 文件变更刷新条件从“仅 `workspace-tree.json` 或删除 `demos/` 文件”扩展为“任意 `demos/` 下文件变更”。这样即使 AI 暂未更新 `workspace-tree.json`，`/api/sessions/{sessionId}/files` 仍可通过会话工作区磁盘目录发现完整页面。

相关文件：`packages/author-site/src/app/demo/[id]/edit/page.tsx`。

### 4.5 回归诊断脚本

新增诊断脚本：

```bash
pnpm test:ai-workspace-refresh
```

脚本会执行三类检查：

- 静态检查系统提示词不再包含 `workspace/workspace-tree.json`。
- 静态检查编辑页会对 `demos/` 文件变更触发刷新。
- 运行 agent-service 相关单元测试，并汇总最近的 AI JSONL 运行日志。

报告输出位置：

```text
tmp/ai-workspace-refresh-test/report.json
```

最新验证结果：脚本通过，报告中保留了旧日志证据：本次真实失败运行里 `writeFile` 工具多次成功写入 `demos/...`，但旧逻辑的 `fileOperationCount=0` 且 `fileCount=0`。

### 4.6 后续风险

本次修复保证“已捕获的会话工作区文件变更”能回传并触发刷新，但复杂多页面任务仍可能超过 300 秒 watchdog。后续仍建议对批量页面生成增加更明确的任务收束规则：

- 优先先创建完整页面树。
- 每个页面完成 `index.tsx` 与 `config.schema.json` 后再进入下一页。
- 超时前尽量避免留下只有 schema 的页面目录。

对本次已经生成的半成品，不建议直接保存到正式项目；`prize-center_w2q8` 缺 `index.tsx`，应由 AI 继续补齐当前会话工作区后再保存。

### 4.7 复查补充修复：所有 AI 文件变更都实时触发文件事件

已补充修复：

1. 主 Agent 的 `tool_execution_end` 对 `writeFile`、`editFile`、`deletePage`、`deletePages`、`executeDeletePagePlan` 统一生成实时 `file_operation`。
2. `editFile` 成功后会从会话工作区读回最新文件内容并推给前端，避免只等最终 finish。
3. 子 Agent 的 `tool_result` hook 在汇总 `this.files` 的同时，也向父会话发实时 `file_operation`。
4. 前端 `onFileOperation` 不再只接受 `fs/write_text_file`，而是对任意带 `path` 的文件操作触发刷新；删除类操作标记为 `deleted`，其他操作标记为 `modified`。
5. 编辑页在画布模式下发现 AI 新增页面后，会自动聚焦第一个新增页面，避免页面已进入列表但画布视口仍停在空白区域。
6. 单元测试覆盖主 Agent `writeFile`、主 Agent `editFile` 和子 Agent `writeFile` 的实时文件事件。

该修复保持现有最终 `files` 汇总不变，同时补齐流式阶段的实时刷新链路。为避免同一路径重复推送，后端增加了单轮消息内的文件事件去重。

### 4.8 超时策略修复：从硬上限改为活动续期

已将 WebSocket 消息处理超时从固定 300 秒硬上限改为活动续期：

1. `WebSocketEventRouter` 新增活动回调，任意 Agent 事件（stream、thought、tool、file、status 等）都会刷新最近活动时间。
2. `websocket.ts` 的 timeout promise 不再在 300 秒总耗时后直接取消，而是定期检查“距离最近 Agent 事件是否已经连续超过 300 秒”。
3. 超时文案调整为“连续 300s 无响应”，与真实语义一致。
4. 单元测试覆盖事件路由器活动回调，防止后续退回硬超时。

## 5. 验证记录

已执行并通过：

```bash
pnpm test:ai-workspace-refresh
pnpm --filter @opencode-workbench/agent-service typecheck
pnpm --filter @opencode-workbench/author-site typecheck
pnpm --filter @opencode-workbench/author-site test -- --runTestsByPath src/components/ai-elements/__tests__/assistant-message-subagent.test.tsx
```

## 6. 相关代码路径

- `packages/author-site/src/lib/agent/prompts/system-prompt.md`
- `packages/agent-service/src/backends/pi-agent.ts`
- `packages/agent-service/src/core/backend-agent.ts`
- `packages/agent-service/src/routes/websocket.ts`
- `packages/agent-service/src/routes/ws-event-router.ts`
- `packages/author-site/src/components/ai-elements/chat/hooks/use-chat-stream.ts`
- `packages/author-site/src/components/ai-elements/chat/services/stream-service.ts`
- `packages/author-site/src/app/demo/[id]/edit/page.tsx`
- `packages/author-site/src/app/api/sessions/[sessionId]/files/route.ts`
- `packages/author-site/src/lib/fs-utils.ts`
- `scripts/development/test-ai-workspace-refresh.mjs`
