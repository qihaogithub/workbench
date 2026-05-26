# opencode 模型不能对话 — 问题记录

> 日期：2026-05-26 → 2026-05-27 | 状态：✅ 已修复并验证

### 现象

选择 opencode 分组的模型（如 `opencode/DeepSeek V4 Flash Free`），发送消息后 AI 回复「抱歉，我没有收到有效的回复。」，但选择 jojo 分组的模型可以正常对话。

### 根因分析

**`opencode-http.ts` 中三处 API 调用均不携带 `model` 参数**，OpenCode Server 在接收消息时使用的是它自己默认的会话模型：

| API 端点 | model 是否携带 | 影响 |
|---|---|---|
| `POST /session`（创建会话） | ❌ 不携带 | OpenCode Server 用自己默认模型 |
| `POST /session/{id}/message`（同步消息） | ❌ 不携带 | 同上 |
| `POST /session/{id}/prompt_async`（流式消息） | ❌ 不携带 | 同上 |

`setModel()` 方法仅在 agent-service 内存中存储 `this.config.model`，从未传给 OpenCode Server。

**真实根因**：OpenCode 内置供应商 `opencode` 运行时读取 `OPENCODE_API_KEY` 环境变量来连接 OpenCode Zen。但之前 `OPENCODE_API_KEY` 存储的是 xjjj 平台的 API 密钥，导致 opencode 供应商认证失败，消息发送后 OpenCode Zen 返回空回复。

**jojo 为什么成功**：jojo 分组的 API 密钥在 `entrypoint.sh` 中写入 `opencode.json` 作为供应商配置，凭据正确。

**opencode 为什么失败后「假装成功」**：opencode 供应商凭据错误时，OpenCode Zen 仍返回 200 但 reply 为空字符串，agent-service 无法区分「无回复」和「正常回复」，最终前端收到「抱歉，我没有收到有效的回复。」

### 关键决策记录

| 尝试 | 做法 | 结果 |
|---|---|---|
| 在 `createSession()` 中加入 `body.model` | 将 `this.config.model` 传给 OpenCode Server 创建会话 | ❌ 回退：`POST /session` 不支持 model 参数，做 PATCH 回退太复杂 |
| 在 `sendMessageSync()`/`sendMessageStream()` 中加入 `body.model` | 将 `this.config.model` 传给消息接口 | ✅ 保留：OpenCode Server 消息端点接受 `model?` 请求体字段 |
| 用 `OPENCODE_JOJO_API_KEY` 分离两套密钥 | 修改 entrypoint.sh、docker-compose.yml、.env | ✅ 保留：确保 opencode 内置供应商有正确凭据 |
| 前端隐藏 opencode 模型 | 移除 `{ matcher: "opencode/" }`，注释掉名称过滤 | ⏪ 回退：凭据修复后 opencode 模型可用，恢复显示 |

### 排查方向

| 方向 | 说明 | 结论 |
|---|---|---|
| **A：OpenCode Server 是否支持运行时切换模型？** | 查 OpenCode Server API 文档，确认是否有 `PATCH /session/{id}` 或类似端点来切换模型 | ⏭️ 未实现：`POST /session` 不支持 model 参数，PATCH 更不可能 |
| **B：OpenCode Server 消息接口是否接受 model 参数？** | 查 OpenCode Server API，`POST /session/{id}/message` 或 `POST /session/{id}/prompt_async` 的请求体是否支持 `model` 字段 | ✅ 已采用：消息接口接受 `model?`，已在 `opencode-http.ts` 中实现 |
| **C：在 entrypoint.sh 中为 opencode 供应商配置凭据** | 如果 opencode 下的模型可以使用 xjjj 相同的 API Key，在 `OPENCODE_PROVIDERS` JSON 中为 opencode 供应商添加相同凭据 | ⏭️ 不需要：opencode 供应商是 CLI 内置的，不从 `opencode.json` 读 API Key |
| **D：正确配置 `OPENCODE_API_KEY`** | opencode 内置供应商运行时读取 `OPENCODE_API_KEY`，将其设为正确的 OpenCode Zen 密钥 | ✅ 已修复：密钥分离，`OPENCODE_API_KEY` 放 Zen 密钥，`OPENCODE_JOJO_API_KEY` 放 xjjj 密钥 |

### 最终修复方案

**问题根因**：OpenCode 内置供应商 `opencode` 读取 `OPENCODE_API_KEY` 环境变量来连接 OpenCode Zen。但之前 `OPENCODE_API_KEY` 被设置为 xjjj 的 API 密钥，导致 opencode 供应商认证失败。同时 `opencode-http.ts` 的消息接口未传递用户选择的 model 参数。

**修复内容**：

1. **`.env` — 密钥分离**：将 `OPENCODE_API_KEY` 改为 OpenCode Zen 密钥（opencode 内置供应商使用），新增 `OPENCODE_JOJO_API_KEY` 存放 xjjj 平台密钥（jojo 供应商使用）

2. **`entrypoint.sh` — 供应商配置使用独立密钥**：简单模式优先使用 `OPENCODE_JOJO_API_KEY` 生成 opencode.json 供应商配置；若未设置则回落使用 `OPENCODE_API_KEY`（兼容旧配置）

3. **`docker-compose.yml` — 传递新环境变量**：opencode-serve 容器新增 `OPENCODE_JOJO_API_KEY` 环境变量

4. **`opencode-http.ts` — 消息接口传递模型**：`sendMessageSync()` 和 `sendMessageStream()` 中传递 `this.config.model` 给 OpenCode Server，确保使用用户选择的模型

### 验证步骤

1. ✅ 部署后使用 `opencode/DeepSeek V4 Flash Free` 模型发送消息，获得正常回复
2. ⏭️ `curl /provider` 查看模型列表 — 未实际执行（直接在前端验证）
3. ⏭️ `docker logs` 查看 OpenCode Server 日志 — 未实际执行（问题已通过密钥修复解决）

### 架构经验

- **OpenCode 内置供应商凭据来源**：opencode 分组模型（`opencode/xxx`）来自 OpenCode CLI 内置供应商，其 API 密钥**不在** `opencode.json` 中配置，而是通过环境变量 `OPENCODE_API_KEY` 在运行时读取。修改 `entrypoint.sh` 或 `opencode.json` 对此供应商无效。
- **jojo 等自定义供应商凭据来源**：由 `entrypoint.sh` 写入 `opencode.json`，使用 `OPENCODE_JOJO_API_KEY` 配置。两套密钥机制不同，必须分离。
- **消息端点 vs 会话端点**：`POST /session` 不支持 model 参数（只接受 `parentID?` 和 `title?`），而 `POST /session/{id}/message` 和 `POST /session/{id}/prompt_async` 接受 `model?`。模型选择只需在消息级别传递，无需修改会话创建。

---

## 修改记录

| 文件 | 修改内容 | 状态 |
|---|---|---|
| `packages/agent-service/src/backends/opencode-http.ts` | `sendMessageSync()`、`sendMessageStream()` 传递 `this.config.model`（字符串）给 OpenCode Server | ✅ 已修复 |
| `packages/agent-service/src/backends/opencode-http.ts` | `setModel()` 中新增 `this.modelInfoCache = null` | ✅ 已保留 |
| `.env` | `OPENCODE_API_KEY` 改为 OpenCode Zen 密钥；新增 `OPENCODE_JOJO_API_KEY` 存放 xjjj 平台密钥 | ✅ 已修复 |
| `docker/opencode-serve/entrypoint.sh` | 简单模式优先使用 `OPENCODE_JOJO_API_KEY` 生成供应商配置，回落 `OPENCODE_API_KEY` | ✅ 已修复 |
| `docker-compose.yml` | opencode-serve 新增 `OPENCODE_JOJO_API_KEY` 环境变量 | ✅ 已修复 |
| `packages/author-site/.env.local` | 新建，包含前端环境变量 | ✅ 已创建 |
| `docker-compose.yml` | author-site 补充 `NEXT_PUBLIC_MODEL_NAME_FILTERS` | ✅ 已修复 |
| `scripts/deploy.sh` | 补充读取和写入 `NEXT_PUBLIC_MODEL_NAME_FILTERS` | ✅ 已修复 |
| `docker/author-site/Dockerfile` | 补充缺失的 ARG 声明 | ✅ 已修复 |

## 相关文件

| 文件 | 作用 |
|---|---|
| `packages/agent-service/src/backends/opencode-http.ts` | OpenCode Server HTTP 后端适配器（创建会话、发送消息、切换模型） |
| `packages/agent-service/src/routes/websocket.ts` | WebSocket 路由（处理 set_model、message 等消息类型） |
| `packages/author-site/src/components/ai-elements/chat/hooks/use-chat-models.ts` | 前端模型状态管理 |
| `packages/author-site/src/lib/ai-models.ts` | 前端模型过滤逻辑（白名单/黑名单/名称过滤） |
| `packages/author-site/.env.local` | 前端环境变量 |
| `docker/opencode-serve/entrypoint.sh` | OpenCode Server 容器启动配置（生成 opencode.json） |
| `.env` | OpenCode Server 环境变量（API Key、模型等） |
