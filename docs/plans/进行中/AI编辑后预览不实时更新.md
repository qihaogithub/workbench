# AI 编辑后预览与配置面板不实时更新：根因分析与根治方案

> 更新时间：2026-05-27
> 分析范围：项目编辑页、AI 流式链路、OpenCode HTTP 后端、预览编译、配置面板
> 当前结论：问题不是单点 bug，而是“文件变更事实源不稳定 + 前端状态派生分散 + 回归测试失效”的架构问题。继续追加局部补丁会反复复发。

---

## 1. 问题背景

在项目编辑页使用 AI 修改页面相关代码后，预期行为是：

- 预览区立即展示 AI 修改后的最新页面。
- 配置面板立即反映 AI 修改后的 `config.schema.json` 和默认配置。
- 单页面预览、网格预览、代码查看、保存后的项目文件读取保持一致。

当前实际表现是：

- AI 修改完成后，文件可能已经写入 workspace，但预览区仍显示旧内容。
- 配置面板有时不跟随 schema/defaults 更新。
- 手动保存、重新打开页面后能看到新内容，说明底层文件可能已更新，但编辑页运行态没有可靠同步。
- 该问题经历多次局部修复后仍复发，说明根因不在某一个 `useEffect` 依赖或一次 HTTP fallback。

---

## 2. 当前证据链

### 2.1 后端文件变更事件存在时序断点

`packages/agent-service/src/backends/opencode-http.ts` 中，OpenCode HTTP 后端通过 SSE 接收事件。

关键代码事实：

- `sendMessage()` 每次开始时清空 `this.files`：`packages/agent-service/src/backends/opencode-http.ts:133-136`
- 流式发送先连接 SSE，再调用 `/prompt_async`：`packages/agent-service/src/backends/opencode-http.ts:190-220`
- `session.idle` 分支会立即发送 done、设置 ready、关闭 SSE，并 resolve 当前消息：`packages/agent-service/src/backends/opencode-http.ts:333-359`
- `session.status` 的 idle 分支也会关闭 SSE 并 resolve：`packages/agent-service/src/backends/opencode-http.ts:362-370`
- 只有 `session.diff` 分支会把文件变更转成 `file_operation`，并填充 `this.files`：`packages/agent-service/src/backends/opencode-http.ts:374-436`
- `BackendAgent.sendMessage()` 在后端 `sendMessage()` resolve 后才调用 `getFiles()`：`packages/agent-service/src/core/backend-agent.ts:56-69`
- WebSocket finish 事件只携带此时 `result.files`：`packages/agent-service/src/routes/websocket.ts:269-276`

因此，只要 `session.idle` 或 `session.status: idle` 早于 `session.diff` 被处理，链路就会变成：

```text
session.idle/status idle
  -> closeSSE()
  -> streamDone.resolve()
  -> BackendAgent.getFiles()
  -> files 仍为空
  -> WebSocket finish 不携带文件
  -> 前端只能依赖 HTTP fallback
```

这不是前端能彻底兜住的问题。实时事件层已经把“本次 AI 修改了哪些文件”这个事实丢失或延迟到了 finish 之后。

### 2.2 前端有三条更新路径，但都不是单一事实源

`useChatStream` 当前同时依赖三条路径更新代码和 schema：

- 实时文件事件：`file_operation -> processRealtimeFiles()`，见 `packages/author-site/src/components/ai-elements/chat/hooks/use-chat-stream.ts:253-277`
- finish 文件列表：`result.files -> extractCodeAndSchemaUpdates()`，见 `packages/author-site/src/components/ai-elements/chat/hooks/use-chat-stream.ts:317-350`
- HTTP fallback：`GET /api/sessions/[sessionId]/files`，见 `packages/author-site/src/components/ai-elements/chat/hooks/use-chat-stream.ts:359-392`

这些路径会分别触发 `onCodeUpdate`、`onSchemaUpdate`、`onFilesChange`，但没有一个统一的“AI 修改事务完成后，重新拉取当前页面完整文件快照并一次性替换编辑页状态”的机制。

这会导致几个稳定风险：

- 实时事件先到、finish 后到、fallback 再到时，代码、schema、configData 可能被不同路径分批覆盖。
- 某一路径只拿到 code，另一路径稍后拿到 schema，配置面板会经历中间态。
- 如果事件缺失或时序不同，前端行为依赖 fallback 是否刚好读到最新文件。

### 2.3 预览编译触发被局部补丁绕过，但没有解决事实源问题

项目编辑页当前已有 `compileVersion` 补丁：

- `handleCodeUpdate()` 调用 `setCode()` 后递增 `compileVersion`：`packages/author-site/src/app/demo/[id]/edit/page.tsx:619-635`
- `PreviewPanel` 把 `compileVersion` 加入编译 effect 依赖：`packages/author-site/components/demo/PreviewPanel.tsx:255-334`
- `PreviewPanelProps` 已加入 `compileVersion`：`packages/author-site/components/demo/types.ts:26-35`

这个补丁只能强制 `PreviewPanel` 重新运行编译 effect。它不能保证传入的 `code`、`schema`、`configData` 已经是同一次 AI 修改后的完整状态，也不能解决后端 `session.diff` 丢失、finish 文件为空、fallback 读到旧快照等问题。

结论：`compileVersion` 可以保留为短期保护，但不能作为根治方案。

### 2.4 配置面板更新也存在运行态重建问题

编辑页对配置面板的当前处理：

- AI code 更新时先把当前页 `configDataMap` 重置为空对象：`packages/author-site/src/app/demo/[id]/edit/page.tsx:648-652`
- AI schema 更新时把 schema defaults merge 到当前 config：`packages/author-site/src/app/demo/[id]/edit/page.tsx:751-761`
- 页面级 `ConfigForm` 使用 `key={schema}`：`packages/author-site/src/app/demo/[id]/edit/page.tsx:1502-1508`
- `ConfigForm` 受控传入 `formData={initialData}`：`packages/author-site/components/demo/ConfigForm.tsx:25-39`

风险点：

- `key={schema}` 只在 schema 字符串变化时重挂载。若 AI 只改代码，自动 schema 生成得到相同字段，配置面板不会按新一轮 AI 编辑事务重建。
- `handleCodeUpdate()` 与 `handleSchemaUpdate()` 分别更新 `code/schema/configDataMap/previewSize/editorContent`，没有事务边界；React 批处理只能保证渲染合并，不能保证业务状态语义一致。
- 默认值 merge 策略会保留旧字段值，适合用户手动编辑，但不适合作为“AI 修改 schema 后刷新配置面板”的唯一策略。

### 2.5 编译 API 优先使用传入 code，可能掩盖 workspace 与 UI 状态不一致

`PreviewPanel` 编译时，只要存在 `sessionId` 就发送 `{ sessionId, code }`：`packages/author-site/components/demo/PreviewPanel.tsx:279-292`

`/api/compile` 中只要 `code` 是字符串，就直接 `compileCode(code)`，不会读取 session workspace 文件：`packages/author-site/src/app/api/compile/route.ts:13-30`

影响：

- 预览区可能编译的是 React state 中的 code，而不是 workspace 中的当前文件。
- HTTP fallback、保存、重新打开页面走的是 workspace 文件。
- 这会造成“预览、配置面板、磁盘文件”三者短时间内没有统一事实源。

### 2.6 测试没有覆盖当前真实协议，且当前测试已经失败

当前 `opencode-http.test.ts` 仍大量使用旧事件名，例如：

- `agent_message_chunk`
- `agent_message_done`
- `agent_thought_chunk`
- `file_operation`
- `permission_request`

而 `opencode-http.ts` 当前实际处理的是新版事件：

- `message.part.delta`
- `message.part.updated`
- `session.idle`
- `session.status`
- `session.diff`

本次运行结果：

```bash
pnpm --filter @opencode-workbench/agent-service test -- opencode-http.test.ts
```

结果：`33 tests | 15 failed`。典型失败包括 `handlers.onmessage is not a function`、旧事件断言不成立、异步 fetch mock 不完整等。

结论：当前测试既不能证明旧修复有效，也不能防止该问题再次复发。必须先把测试改成真实协议和真实时序模型。

---

## 3. 根因定位

### 根因 A：AI 编辑后的文件变更没有稳定的服务端提交边界

当前系统把 `session.idle/status idle` 当作“消息完成”，但把 `session.diff` 当作“文件变更来源”。这两个事件在代码中没有被统一成一个服务端事务。

真正需要的完成语义不是“模型不再输出文本”，而是：

```text
AI 本轮响应完成
并且本轮可能产生的文件变更已经收集完毕
并且服务端能提供当前目标 demo 的完整文件快照
```

当前后端没有这个语义，所以前端只能用多条路径猜测。

### 根因 B：编辑页状态缺少统一快照应用入口

代码、schema、configData、previewSize、editorContent、compileVersion 分散在多个回调里更新：

- `handleCodeUpdate()`
- `handleSchemaUpdate()`
- `onFilesChange`
- 自动 schema 生成定时器
- 页面切换加载逻辑

这些入口没有统一的 `applyDemoSnapshot()`，也没有“本次 AI 编辑事务版本号”。因此任何事件时序变化都可能让局部状态不同步。

### 根因 C：预览与配置面板不是同一个运行态版本

预览编译依赖 `code + compileVersion`，配置面板依赖 `schema + configData`，二者没有共享同一个 `snapshotVersion`。这导致预览可能已经刷新，但配置面板还停留在旧 schema/defaults，或反过来。

### 根因 D：回归测试覆盖的是错误协议和错误边界

历史修复反复失效的核心原因之一是测试没有锁定“AI 编辑后文件快照必须进入前端”的系统行为。当前测试既没有覆盖新版 `session.diff`，也没有覆盖 `session.idle` 早于 `session.diff` 的时序，更没有覆盖前端收到 finish 后必须刷新当前 demo 快照。

---

## 4. 根本性解决方案

推荐方案：建立“服务端文件快照为事实源”的 AI 编辑完成协议。不要再让前端在实时事件、finish files、fallback 三条路径之间做业务判断。

### 4.1 后端：引入 AI 编辑完成后的文件快照收敛

目标：`agent-service` 的一次 `sendMessage()` 成功返回时，必须能提供本次消息结束后的当前文件快照或明确声明无变更。

建议实现：

1. `session.idle` / `session.status: idle` 不再立即关闭 SSE 并 resolve。
2. idle 后进入短暂 drain 阶段，等待 `session.diff`、`file.edited` 或 OpenCode 事件队列稳定。
3. drain 结束后，不依赖 `this.files` 是否非空，主动读取当前 workspace 中目标 demo 的 `index.tsx` 和 `config.schema.json`。
4. `sendMessage()` 返回 `files` 时优先返回最终快照对应的 code/schema，而不是只返回 SSE diff 中出现过的文件。
5. 若 OpenCode 提供可靠 diff API，可用 diff API 做加速；但最终仍应以 workspace 文件快照作为提交结果。

关键原则：

- `session.diff` 可以作为实时增量事件，但不能作为最终事实源。
- `session.idle` 只能表示模型输出完成，不能表示文件系统变更收敛完成。
- finish 事件必须携带可用于刷新当前 demo 的完整文件结果，或者前端必须收到明确指令去拉取快照。

### 4.2 前端：统一为 `applyDemoSnapshot(snapshot, reason)` 一个入口

项目编辑页应增加唯一的当前页面快照应用入口，负责一次性更新：

- `code`
- `schema`
- `editorContent`
- `previewSize`
- `configDataMap[activeDemoId]`
- `snapshotVersion`
- `compileVersion` 或后续替代字段

建议形态：

```text
applyDemoSnapshot({
  demoId,
  code,
  schema,
  source: "ai-finish" | "ai-realtime" | "manual-load" | "page-switch",
})
```

应用规则：

- code 和 schema 必须来自同一份快照。
- `previewSize` 从同一份 schema 计算。
- config 默认值从同一份 schema 计算。
- 对用户已手动修改过的 config 字段，需有明确策略：保留用户值、重置为 AI defaults，或按字段来源合并。不要隐式混用。
- 每次应用快照递增 `snapshotVersion`，预览区和配置面板都依赖该版本。

### 4.3 预览：以 `snapshotVersion` 驱动，而不是以局部 code 变化驱动

`compileVersion` 的方向是对的，但命名和职责应升级：

- 改为 `snapshotVersion` 或 `previewVersion`。
- 它表示“当前 demo 运行态快照版本”，不是单纯“强制编译”。
- `PreviewPanel` 的编译 effect 依赖 `code + sessionId + demoId + snapshotVersion`。
- `ConfigForm` 的 key 也应包含 `activeDemoId + snapshotVersion`，确保 schema/defaults 属于同一运行态版本。

这样预览和配置面板会被同一次快照更新驱动，而不是各自监听自己的局部字段。

### 4.4 HTTP fallback：从兜底补丁改为标准完成步骤

当前 fallback 只在 `!codeUpdated || !schemaUpdated` 时执行。根治方案中应改为：

- AI finish 后总是拉取当前 active demo 的完整文件快照，或直接使用后端 finish 携带的完整快照。
- 实时 `file_operation` 只用于“更快显示”，不能决定最终状态。
- finish 快照永远覆盖本轮实时增量的结果，保证最终一致。

建议优先改用 demo 级接口：

```text
GET /api/sessions/[sessionId]/files/[demoId]
```

而不是继续依赖兼容接口：

```text
GET /api/sessions/[sessionId]/files
```

原因：项目已经是多页面架构，兼容接口会返回所有 demos，再由前端选择目标 demo。根治方案应减少“选择第一个页面”“fallback targetId”等兼容逻辑。

### 4.5 配置面板：明确 AI schema 更新后的合并策略

需要定义并实现一个稳定策略：

- AI 修改 schema 后，新增字段使用 schema default。
- 被 schema 删除的字段从 `configData` 移除。
- 仍存在且用户修改过的字段默认保留用户值。
- 若字段类型变化，旧值不再合法时使用新 default。
- `__order` 等展示元数据只来自当前 schema。

该策略应放在纯函数中测试，而不是散落在 `handleSchemaUpdate()` 和自动 schema 生成逻辑里。

### 4.6 测试：先补协议与时序测试，再改实现

最低测试集：

- 后端 `opencode-http` 能处理 `message.part.delta` 文本流。
- 后端 `opencode-http` 能处理 `session.diff` 并发出 `file_operation`。
- `session.diff` 早于 `session.idle` 时，finish files 包含文件。
- `session.idle` 早于 `session.diff` 时，drain 后 finish files 仍包含最终文件快照。
- `session.diff` 为空时，仍通过 workspace 快照返回当前 demo 文件。
- 前端 `useChatStream` 在 finish 后应用完整 demo 快照。
- 编辑页 `applyDemoSnapshot()` 一次性更新 code/schema/configData/previewSize/snapshotVersion。
- `ConfigForm` 在 snapshotVersion 变化时按新 schema/defaults 重建。

验收测试不能只断言“某个日志出现”或“某个 effect 触发”。必须断言最终用户可见状态：

- 预览 iframe 收到新编译代码。
- 配置面板出现新字段或移除旧字段。
- 当前 active demo 与被 AI 修改的 demo 一致。
- 重新打开页面看到的文件与当前预览一致。

---

## 5. 建议实施顺序

### 阶段 1：先修测试与最小事实源

1. 更新 `opencode-http.test.ts` 的 EventSource mock 和事件格式。
2. 增加 `session.idle` / `session.diff` 两种顺序的测试。
3. 后端 finish 前读取当前 workspace demo 快照，保证 finish 或标准 fetch 能拿到完整 code/schema。

阶段目标：后端不再把“是否收到 diff”作为最终文件变更的唯一依据。

### 阶段 2：收敛前端状态入口

1. 在编辑页新增 `applyDemoSnapshot()`。
2. 让 AI 实时事件、AI finish、HTTP fetch、页面切换都调用同一个入口。
3. 引入 `snapshotVersion`，替代或包裹现有 `compileVersion`。
4. 让 `PreviewPanel` 和 `ConfigForm` 都以 `snapshotVersion` 表示同一运行态版本。

阶段目标：代码、schema、配置面板、预览尺寸、编译触发来自同一个快照版本。

### 阶段 3：配置合并策略产品化

1. 抽出 schema defaults 与现有 config 的合并纯函数。
2. 明确定义新增、删除、类型变化、用户已修改字段的行为。
3. 为配置合并补 Jest 单元测试。

阶段目标：AI 修改 schema 后配置面板行为可预测、可测试。

### 阶段 4：删除临时诊断与兼容补丁

1. 删除大量临时 console/SSE-DIAG 日志，保留结构化 debug 日志。
2. 将 `compileVersion` 语义升级为 `snapshotVersion`。
3. 逐步减少对 `GET /api/sessions/[sessionId]/files` 兼容聚合接口的依赖，改用 demo 级接口。

阶段目标：代码结构表达真实业务边界，而不是历史补丁堆叠。

---

## 6. 方案取舍

不推荐继续做的修复：

- 只给 `PreviewPanel` 再加依赖项。
- 只延长 `setTimeout` 等待 `session.diff`，但 finish 不读取最终文件快照。
- 只在前端多调用一次 `fetchSessionFiles()`，但不统一快照应用入口。
- 只修改 `ConfigForm key`，但不定义 schema/config 合并策略。

这些方案只能降低复现概率，不能消除复发条件。

推荐架构判断：

```text
后端负责把 AI 响应和文件系统变更收敛成一次完成结果。
前端负责把完成结果作为一个 demo 快照原子应用。
预览区和配置面板都订阅同一个 snapshotVersion。
测试覆盖协议事件顺序和最终用户可见状态。
```

---

## 7. 相关代码路径

| 路径 | 作用 |
|---|---|
| `packages/agent-service/src/backends/opencode-http.ts` | OpenCode HTTP SSE 事件处理、`session.idle` / `session.diff` 时序断点 |
| `packages/agent-service/src/core/backend-agent.ts` | 后端消息完成后调用 `getFiles()` 的位置 |
| `packages/agent-service/src/routes/websocket.ts` | WebSocket finish 事件构建 |
| `packages/agent-service/src/routes/ws-event-router.ts` | `file_operation` 实时转发 |
| `packages/agent-service/tests/unit/opencode-http.test.ts` | 当前失效的 OpenCode HTTP 单元测试 |
| `packages/author-site/src/components/ai-elements/chat/hooks/use-chat-stream.ts` | 前端实时事件、finish、HTTP fallback 三条更新路径 |
| `packages/author-site/src/components/ai-elements/chat/utils/chat-file-utils.ts` | 文件路径识别与 code/schema 提取 |
| `packages/author-site/src/components/ai-elements/chat/services/message-service.ts` | `fetchSessionFiles()` fallback |
| `packages/author-site/src/app/demo/[id]/edit/page.tsx` | 编辑页 code/schema/config/preview 状态分散更新的位置 |
| `packages/author-site/components/demo/PreviewPanel.tsx` | 预览编译与 iframe 更新 |
| `packages/author-site/components/demo/ConfigForm.tsx` | 配置表单受控数据入口 |
| `packages/author-site/src/app/api/compile/route.ts` | 编译 API 优先编译传入 code 的行为 |
| `packages/author-site/src/app/api/sessions/[sessionId]/files/[demoId]/route.ts` | demo 级文件快照接口 |

---

## 8. 当前验证记录

环境诊断：

```bash
cd OPS/CLI && pnpm dev system --json
```

结果摘要：

- Node：`24.10.0`
- pnpm：`8.15.0`
- TypeScript：`5.9.3`
- agent-service：未运行
- CLI 后端：opencode、claude、codex、gemini、qwen、kimi、qoder 可用

测试验证：

```bash
pnpm --filter @opencode-workbench/agent-service test -- opencode-http.test.ts
```

结果摘要：

- `33 tests | 15 failed`
- 失败集中在旧 SSE 事件格式、EventSource mock、异步 fetch mock、模型断言等问题。
- 该测试文件当前不能作为本问题修复的回归保障。

---

## 9. 最终验收标准

完成根治方案后，应满足：

- AI 修改 `index.tsx` 后，无需保存或刷新，单页面预览自动更新。
- AI 修改 `config.schema.json` 后，无需保存或刷新，配置面板字段、默认值、顺序自动更新。
- AI 同时修改 code 和 schema 时，预览与配置面板来自同一个快照版本。
- `session.diff` 先于 idle、idle 先于 `session.diff`、`session.diff` 为空三种情况都有测试覆盖。
- `opencode-http.test.ts` 不再使用旧事件名。
- 前端不再依赖多条更新路径各自修改局部状态，而是统一应用 demo snapshot。
- 保存、重新打开页面后的文件内容与实时预览状态一致。
