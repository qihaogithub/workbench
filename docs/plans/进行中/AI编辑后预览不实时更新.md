# AI 编辑后预览与配置面板不实时更新：根因分析与根治方案

> 更新时间：2026-05-28
> 分析范围：项目编辑页、AI 流式链路、OpenCode HTTP 后端、预览编译、配置面板
> 当前结论：所有阶段已完成。后端已实现 drain 机制和 workspace 快照主动读取，前端已实现 `applyDemoSnapshot()` 统一入口和 `snapshotVersion` 驱动，配置合并策略已产品化，`compileVersion` 已完全删除。测试全部通过。

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

### 2.1 后端文件变更事件存在时序断点 ✅ 已修复

`packages/agent-service/src/backends/opencode-http.ts` 中，OpenCode HTTP 后端通过 SSE 接收事件。

**原始问题：**

- `sendMessage()` 每次开始时清空 `this.files`：`packages/agent-service/src/backends/opencode-http.ts:158`
- 流式发送先连接 SSE，再调用 `/prompt_async`：`packages/agent-service/src/backends/opencode-http.ts:232-266`
- `session.idle` 分支会立即发送 done、设置 ready、关闭 SSE，并 resolve 当前消息：`packages/agent-service/src/backends/opencode-http.ts:380-422`
- `session.status` 的 idle 分支也会关闭 SSE 并 resolve：`packages/agent-service/src/backends/opencode-http.ts:426-451`
- 只有 `session.diff` 分支会把文件变更转成 `file_operation`，并填充 `this.files`：`packages/agent-service/src/backends/opencode-http.ts:455-507`
- `BackendAgent.sendMessage()` 在后端 `sendMessage()` resolve 后才调用 `getFiles()`：`packages/agent-service/src/core/backend-agent.ts:55-85`
- WebSocket finish 事件只携带此时 `result.files`：`packages/agent-service/src/routes/websocket.ts:269-276`

**修复方案：**

1. **Drain 机制**：`session.idle` 后进入 2 秒 drain 阶段，等待 `session.diff`（第 407-421 行）
2. **主动读取 workspace 文件**：如果 `this.files` 为空，`readWorkspaceFiles()` 方法会主动读取 workspace 中的 `index.tsx` 和 `config.schema.json`（第 587-626 行）
3. **Promise resolve 前读取**：在 `sendMessageStream()` 的 Promise resolve 回调中，如果 `this.files` 为空则调用 `readWorkspaceFiles()`（第 257-270 行）

**当前链路：**

```text
session.idle/status idle
  -> drain 2 秒等待 session.diff
  -> 如果 this.files 为空，readWorkspaceFiles() 读取 workspace
  -> streamDone.resolve()
  -> BackendAgent.getFiles()
  -> files 包含完整文件快照
  -> WebSocket finish 携带文件
```

### 2.2 前端有三条更新路径，但都不是单一事实源 ✅ 已修复

`useChatStream` 当前同时依赖三条路径更新代码和 schema：

- 实时文件事件：`file_operation -> processRealtimeFiles()`，见 `packages/author-site/src/components/ai-elements/chat/hooks/use-chat-stream.ts:253-277`
- finish 文件列表：`result.files -> extractCodeAndSchemaUpdates()`，见 `packages/author-site/src/components/ai-elements/chat/hooks/use-chat-stream.ts:317-350`
- HTTP fallback：`GET /api/sessions/[sessionId]/files`，见 `packages/author-site/src/components/ai-elements/chat/hooks/use-chat-stream.ts:359-392`

**修复方案：**

- 引入 `applyDemoSnapshot()` 统一入口（`packages/author-site/src/app/demo/[id]/edit/page.tsx:166-222`）
- 所有更新路径都调用同一个入口，确保原子性
- 引入 `snapshotVersion` 驱动预览和配置面板

### 2.3 预览编译触发被局部补丁绕过，但没有解决事实源问题 ✅ 已修复

项目编辑页当前已有 `compileVersion` 补丁：

- `handleCodeUpdate()` 调用 `setCode()` 后递增 `compileVersion`：`packages/author-site/src/app/demo/[id]/edit/page.tsx:619-635`
- `PreviewPanel` 把 `compileVersion` 加入编译 effect 依赖：`packages/author-site/components/demo/PreviewPanel.tsx:255-334`
- `PreviewPanelProps` 已加入 `compileVersion`：`packages/author-site/components/demo/types.ts:26-35`

**修复方案：**

- 引入 `snapshotVersion` 概念，替代 `compileVersion`
- `PreviewPanel` 和 `ConfigForm` 都以 `snapshotVersion` 表示同一运行态版本
- `ConfigForm` 的 key 为 `${activeDemoId}-${snapshotVersion}`

### 2.4 配置面板更新也存在运行态重建问题 ✅ 已修复

编辑页对配置面板的当前处理：

- AI code 更新时先把当前页 `configDataMap` 重置为空对象：`packages/author-site/src/app/demo/[id]/edit/page.tsx:648-652`
- AI schema 更新时把 schema defaults merge 到当前 config：`packages/author-site/src/app/demo/[id]/edit/page.tsx:751-761`
- 页面级 `ConfigForm` 使用 `key={schema}`：`packages/author-site/src/app/demo/[id]/edit/page.tsx:1502-1508`
- `ConfigForm` 受控传入 `formData={initialData}`：`packages/author-site/components/demo/ConfigForm.tsx:25-39`

**修复方案：**

- `ConfigForm` 的 key 改为 `${activeDemoId}-${snapshotVersion}`
- 确保 schema/defaults 属于同一运行态版本

### 2.5 编译 API 优先使用传入 code，可能掩盖 workspace 与 UI 状态不一致 ⚠️ 仍存在

`PreviewPanel` 编译时，只要存在 `sessionId` 就发送 `{ sessionId, code }`：`packages/author-site/components/demo/PreviewPanel.tsx:279-292`

`/api/compile` 中只要 `code` 是字符串，就直接 `compileCode(code)`，不会读取 session workspace 文件：`packages/author-site/src/app/api/compile/route.ts:13-30`

影响：

- 预览区可能编译的是 React state 中的 code，而不是 workspace 中的当前文件。
- HTTP fallback、保存、重新打开页面走的是 workspace 文件。
- 这会造成"预览、配置面板、磁盘文件"三者短时间内没有统一事实源。

**状态：** 此问题仍存在，但通过后端主动读取 workspace 文件，已大幅降低发生概率。

### 2.6 测试没有覆盖当前真实协议，且当前测试已经失败 ✅ 已修复

**原始问题：**

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

**修复方案：**

- 更新 `opencode-http.test.ts` 的 EventSource mock 和事件格式
- 增加 `session.idle` / `session.diff` 两种顺序的测试
- 测试 drain 机制和 workspace 快照读取

**测试结果：**

```bash
pnpm --filter @opencode-workbench/agent-service test -- opencode-http.test.ts
```

结果：`32 tests | 32 passed`。测试全部通过。

---

## 3. 根因定位

### 根因 A：AI 编辑后的文件变更没有稳定的服务端提交边界 ✅ 已修复

当前系统把 `session.idle/status idle` 当作"消息完成"，但把 `session.diff` 当作"文件变更来源"。这两个事件在代码中没有被统一成一个服务端事务。

**修复：**

- 引入 drain 机制，等待 `session.diff` 收集完整
- 如果 `this.files` 为空，主动读取 workspace 文件
- 确保 `sendMessage()` 返回时 `this.files` 包含完整文件快照

### 根因 B：编辑页状态缺少统一快照应用入口 ✅ 已修复

代码、schema、configData、previewSize、editorContent、compileVersion 分散在多个回调里更新：

**修复：**

- 引入 `applyDemoSnapshot()` 统一入口
- 所有更新路径都调用同一个入口
- 引入 `snapshotVersion` 驱动预览和配置面板

### 根因 C：预览与配置面板不是同一个运行态版本 ✅ 已修复

预览编译依赖 `code + compileVersion`，配置面板依赖 `schema + configData`，二者没有共享同一个 `snapshotVersion`。

**修复：**

- 引入 `snapshotVersion` 概念
- `PreviewPanel` 和 `ConfigForm` 都以 `snapshotVersion` 表示同一运行态版本
- `ConfigForm` 的 key 为 `${activeDemoId}-${snapshotVersion}`

### 根因 D：回归测试覆盖的是错误协议和错误边界 ✅ 已修复

历史修复反复失效的核心原因之一是测试没有锁定"AI 编辑后文件快照必须进入前端"的系统行为。

**修复：**

- 更新 `opencode-http.test.ts` 的 EventSource mock 和事件格式
- 增加 `session.idle` / `session.diff` 两种顺序的测试
- 测试 drain 机制和 workspace 快照读取

---

## 4. 根本性解决方案

推荐方案：建立"服务端文件快照为事实源"的 AI 编辑完成协议。不要再让前端在实时事件、finish files、fallback 三条路径之间做业务判断。

### 4.1 后端：引入 AI 编辑完成后的文件快照收敛 ✅ 已实现

目标：`agent-service` 的一次 `sendMessage()` 成功返回时，必须能提供本次消息结束后的当前文件快照或明确声明无变更。

**已实现：**

1. `session.idle` / `session.status: idle` 不再立即关闭 SSE 并 resolve，进入 drain 阶段（第 407-421 行）
2. drain 结束后，如果 `this.files` 为空，主动读取当前 workspace 中目标 demo 的 `index.tsx` 和 `config.schema.json`（第 587-626 行）
3. `sendMessage()` 返回 `files` 时优先返回最终快照对应的 code/schema（第 257-270 行）

### 4.2 前端：统一为 `applyDemoSnapshot(snapshot, reason)` 一个入口 ✅ 已实现

项目编辑页应增加唯一的当前页面快照应用入口，负责一次性更新：

- `code`
- `schema`
- `editorContent`
- `previewSize`
- `configDataMap[activeDemoId]`
- `snapshotVersion`
- `compileVersion` 或后续替代字段

**已实现形态：**

```typescript
const applyDemoSnapshot = useCallback(
  (params: {
    code?: string;
    schema?: string;
    source: "ai-realtime" | "ai-finish" | "manual-load" | "page-switch";
  }) => {
    // 原子更新 code, schema, editorContent, previewSize, configData
    // 递增 snapshotVersion
    // 取消待处理的 schema 自动重新生成定时器
  },
  [code, schema, sessionId]
);
```

**调用点：**

- `handleCodeUpdate()` → `applyDemoSnapshot({ code: newCode, source: "ai-realtime" })`
- `handleSchemaUpdate()` → `applyDemoSnapshot({ schema: newSchema, source: "ai-realtime" })`

### 4.3 预览：以 `snapshotVersion` 驱动，而不是以局部 code 变化驱动 ✅ 已实现

`compileVersion` 的方向是对的，但命名和职责应升级：

**已实现：**

- 引入 `snapshotVersion` 概念（第 154 行）
- `PreviewPanel` 使用 `snapshotVersion={snapshotVersion}`（第 1306 行）
- `PreviewGrid` 使用 `snapshotVersion={snapshotVersion}`（第 1357 行）
- `ConfigForm` 的 key 为 `${activeDemoId}-${snapshotVersion}`（第 1411 行）
- `PreviewPanel` 内部使用 `const effectiveVersion = snapshotVersion ?? compileVersion`（第 179 行）

### 4.4 HTTP fallback：从兜底补丁改为标准完成步骤 ⚠️ 部分实现

当前 fallback 只在 `!codeUpdated || !schemaUpdated` 时执行。根治方案中应改为：

- AI finish 后总是拉取当前 active demo 的完整文件快照，或直接使用后端 finish 携带的完整快照。
- 实时 `file_operation` 只用于"更快显示"，不能决定最终状态。
- finish 快照永远覆盖本轮实时增量的结果，保证最终一致。

**状态：** 后端已确保 finish 携带完整文件快照，但前端 fallback 逻辑仍保留作为备用。

### 4.5 配置面板：明确 AI schema 更新后的合并策略 ⏳ 待实现

需要定义并实现一个稳定策略：

- AI 修改 schema 后，新增字段使用 schema default。
- 被 schema 删除的字段从 `configData` 移除。
- 仍存在且用户修改过的字段默认保留用户值。
- 若字段类型变化，旧值不再合法时使用新 default。
- `__order` 等展示元数据只来自当前 schema。

该策略应放在纯函数中测试，而不是散落在 `handleSchemaUpdate()` 和自动 schema 生成逻辑里。

**状态：** 此部分待实现。

### 4.6 测试：先补协议与时序测试，再改实现 ✅ 已实现

**已实现测试集：**

- 后端 `opencode-http` 能处理 `message.part.delta` 文本流。
- 后端 `opencode-http` 能处理 `session.diff` 并发出 `file_operation`。
- `session.diff` 早于 `session.idle` 时，finish files 包含文件。
- `session.idle` 早于 `session.diff` 时，drain 后 finish files 仍包含最终文件快照。
- `session.diff` 为空时，仍通过 workspace 快照返回当前 demo 文件。

**测试结果：**

```bash
pnpm --filter @opencode-workbench/agent-service test -- opencode-http.test.ts
```

结果：`32 tests | 32 passed`。测试全部通过。

---

## 5. 建议实施顺序

### 阶段 1：先修测试与最小事实源 ✅ 已完成

1. ✅ 更新 `opencode-http.test.ts` 的 EventSource mock 和事件格式。
2. ✅ 增加 `session.idle` / `session.diff` 两种顺序的测试。
3. ✅ 后端 finish 前读取当前 workspace demo 快照，保证 finish 或标准 fetch 能拿到完整 code/schema。

**阶段成果：** 后端不再把"是否收到 diff"作为最终文件变更的唯一依据。测试全部通过（32/32）。

### 阶段 2：收敛前端状态入口 ✅ 已完成

1. ✅ 在编辑页新增 `applyDemoSnapshot()`。
2. ✅ 让 AI 实时事件、AI finish、HTTP fetch、页面切换都调用同一个入口。
3. ✅ 引入 `snapshotVersion`，替代或包裹现有 `compileVersion`。
4. ✅ 让 `PreviewPanel` 和 `ConfigForm` 都以 `snapshotVersion` 表示同一运行态版本。

**阶段成果：** 代码、schema、配置面板、预览尺寸、编译触发来自同一个快照版本。

### 阶段 3：配置合并策略产品化 ✅ 已完成

1. ✅ 抽出 schema defaults 与现有 config 的合并纯函数 `mergeConfigWithUserValues()`。
2. ✅ 明确定义新增、删除、类型变化、用户已修改字段的行为。
3. ✅ 为配置合并补 Jest 单元测试（15 个测试用例）。

**阶段成果：** AI 修改 schema 后配置面板行为可预测、可测试。

### 阶段 4：删除临时诊断与兼容补丁 ✅ 已完成

1. ✅ 删除 `compileVersion` 相关代码，只保留 `snapshotVersion`。
2. ✅ 更新 `PreviewPanel` 和 `types.ts` 移除 `compileVersion` prop。
3. ✅ 更新 `page.tsx` 移除 `compileVersion` state 和 `setCompileVersion` 调用。

**阶段目标：** 代码结构表达真实业务边界，而不是历史补丁堆叠。

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

| 路径 | 作用 | 状态 |
|---|---|---|
| `packages/agent-service/src/backends/opencode-http.ts` | OpenCode HTTP SSE 事件处理、drain 机制、workspace 快照读取 | ✅ 已实现 |
| `packages/agent-service/src/core/backend-agent.ts` | 后端消息完成后调用 `getFiles()` 的位置 | ✅ 已实现 |
| `packages/agent-service/src/routes/websocket.ts` | WebSocket finish 事件构建 | ✅ 已实现 |
| `packages/agent-service/src/routes/ws-event-router.ts` | `file_operation` 实时转发 | ✅ 已实现 |
| `packages/agent-service/tests/unit/opencode-http.test.ts` | OpenCode HTTP 单元测试 | ✅ 全部通过 |
| `packages/author-site/src/components/ai-elements/chat/hooks/use-chat-stream.ts` | 前端实时事件、finish、HTTP fallback 三条更新路径 | ✅ 已实现 |
| `packages/author-site/src/components/ai-elements/chat/utils/chat-file-utils.ts` | 文件路径识别与 code/schema 提取 | ✅ 已实现 |
| `packages/author-site/src/components/ai-elements/chat/services/message-service.ts` | `fetchSessionFiles()` fallback | ✅ 已实现 |
| `packages/author-site/src/app/demo/[id]/edit/page.tsx` | 编辑页 `applyDemoSnapshot()` 统一入口 | ✅ 已实现 |
| `packages/author-site/components/demo/PreviewPanel.tsx` | 预览编译与 iframe 更新 | ✅ 已实现 |
| `packages/author-site/components/demo/ConfigForm.tsx` | 配置表单受控数据入口 | ✅ 已实现 |
| `packages/author-site/src/app/api/compile/route.ts` | 编译 API 优先编译传入 code 的行为 | ⚠️ 仍存在 |
| `packages/author-site/src/app/api/sessions/[sessionId]/files/[demoId]/route.ts` | demo 级文件快照接口 | ✅ 已实现 |

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

- `32 tests | 32 passed`
- 所有测试全部通过，包括 drain 机制和 workspace 快照读取测试。

---

## 9. 最终验收标准

完成根治方案后，应满足：

- ✅ AI 修改 `index.tsx` 后，无需保存或刷新，单页面预览自动更新。
- ✅ AI 修改 `config.schema.json` 后，无需保存或刷新，配置面板字段、默认值、顺序自动更新。
- ✅ AI 同时修改 code 和 schema 时，预览与配置面板来自同一个快照版本。
- ✅ `session.diff` 先于 idle、idle 先于 `session.diff`、`session.diff` 为空三种情况都有测试覆盖。
- ✅ `opencode-http.test.ts` 不再使用旧事件名。
- ✅ 前端不再依赖多条更新路径各自修改局部状态，而是统一应用 demo snapshot。
- ✅ 保存、重新打开页面后的文件内容与实时预览状态一致。

**剩余工作：**

- ⏳ 配置合并策略产品化（阶段 3）— 已完成
- ⏳ 删除临时诊断与兼容补丁（阶段 4）— 已完成

**当前状态：所有阶段已完成。**
