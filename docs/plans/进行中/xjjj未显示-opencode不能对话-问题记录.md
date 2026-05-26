# opencode 模型不能对话 — 问题记录

> 日期：2026-05-26 | 状态：已修复（openCode Zen 密钥已配置）

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

**openCode 为什么失败**：openCode 分组来自 OpenCode CLI 内置供应商，未在 `entrypoint.sh` 或 `opencode.json` 中配置 API 凭据。即使前端选择了 opencode 模型，OpenCode Server 实际也是用默认模型（`xjjj/deepseek-v4-flash`）——但消息有时会因模型不匹配失败。

**jojo 为什么成功**：jojo 分组可能也有内置凭据或回退机制使其可用。

### 曾尝试的修复及回退原因

| 尝试 | 做法 | 回退原因 |
|---|---|---|
| 在 `createSession()`/`sendMessageSync()`/`sendMessageStream()` 中添加 `body.model` | 将 `this.config.model` 传给 OpenCode Server | 选 opencode 模型时，OpenCode Server 会真的尝试用 opencode 分组（无凭据）→ 直接失败，比原来更差 |
| 在 `setModel()` 中添加 `PATCH /session/{id}` | 同步模型变更到 OpenCode Server | OpenCode Server 可能不支持 PATCH 或模型 ID 格式不对 → 已回退 |

唯一保留的修改是 `setModel()` 中的 `this.modelInfoCache = null`（切换模型时清除缓存），这不影响对话。

### 排查方向

| 方向 | 说明 |
|---|---|
| **A：OpenCode Server 是否支持运行时切换模型？** | 查 OpenCode Server API 文档，确认是否有 `PATCH /session/{id}` 或类似端点来切换模型。如果有，在 `setModel()` 中正确调用 |
| **B：OpenCode Server 消息接口是否接受 model 参数？** | 查 OpenCode Server API，`POST /session/{id}/message` 或 `POST /session/{id}/prompt_async` 的请求体是否支持 `model` 字段。如果支持，传递 model ID 即可实现按选择模型发送 |
| **C：在 entrypoint.sh 中为 opencode 供应商配置凭据** | 如果 opencode 下的模型可以使用 xjjj 相同的 API Key，在 `OPENCODE_PROVIDERS` JSON 中为 opencode 供应商添加相同凭据 |
| **D：在会话创建时设置初始模型** | `POST /session` 请求体如果支持 `model` 字段，可以在创建会话时就指定模型，但需要确保该模型有凭据可用 |

### 最终修复方案

**问题根因**：OpenCode 内置供应商 `opencode` 读取 `OPENCODE_API_KEY` 环境变量来连接 OpenCode Zen。但之前 `OPENCODE_API_KEY` 被设置为 xjjj 的 API 密钥，导致 opencode 供应商认证失败。同时 `opencode-http.ts` 的消息接口未传递用户选择的 model 参数。

**修复内容**：

1. **`.env` — 密钥分离**：将 `OPENCODE_API_KEY` 改为 OpenCode Zen 密钥（opencode 内置供应商使用），新增 `OPENCODE_JOJO_API_KEY` 存放 xjjj 平台密钥（jojo 供应商使用）

2. **`entrypoint.sh` — 供应商配置使用独立密钥**：简单模式优先使用 `OPENCODE_JOJO_API_KEY` 生成 opencode.json 供应商配置；若未设置则回落使用 `OPENCODE_API_KEY`（兼容旧配置）

3. **`docker-compose.yml` — 传递新环境变量**：opencode-serve 容器新增 `OPENCODE_JOJO_API_KEY` 环境变量

4. **`opencode-http.ts` — 消息接口传递模型**：`sendMessageSync()` 和 `sendMessageStream()` 中传递 `this.config.model` 给 OpenCode Server，确保使用用户选择的模型

### 验证步骤

1. 直接 curl OpenCode Server API，确认模型是否可用：
   ```bash
   # 查看所有模型
   curl http://localhost:4096/provider

   # 查看会话详情（model 字段）
   curl http://localhost:4096/session/{sessionId}
   ```
2. 在 `opencode-http.ts` 的 `sendMessageSync` 中临时加 `console.log` 输出请求体和响应体
3. 看 OpenCode Server 日志（docker logs），确认模型切换/调用时的错误信息

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
