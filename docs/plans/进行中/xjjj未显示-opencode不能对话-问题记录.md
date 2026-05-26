# xjjj 分组未显示 & opencode 模型不能对话 — 问题记录

> 日期：2026-05-26 | 状态：待修复

## 问题一：xjjj 分组未在模型选择列表中显示

### 现象

创作端项目编辑页 AI 对话区的模型选择下拉框中，xjjj 分组的模型不显示。

### 已确认正确

- `.env.local`（`packages/author-site/`）中已配置 `NEXT_PUBLIC_ALLOWED_MODEL_PREFIXES=xjjj/,jojo/`
- [ai-models.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/author-site/src/lib/ai-models.ts) 的 `buildModelConfigs()` 中 `parseDynamicPrefixes()` 会从该环境变量读取前缀并生成白名单规则
- 代码逻辑正确，typecheck 通过

### 排查方向

| 方向 | 说明 |
|---|---|
| **编译缓存问题（最可能）** | Next.js `NEXT_PUBLIC_*` 变量是编译时内联的。创建/修改 `.env.local` 后必须完全重启 dev server（`Ctrl+C` 后重新 `pnpm dev`），热重载不会重新读取环境变量 |
| **后端模型列表来源** | OpenCode Server 的 `/provider` 接口返回的模型中，xjjj 分组模型是否存在？需确认 `OPENCODE_PROVIDER_NAME=xjjj` 在 entrypoint.sh 中正确生成了配置 |
| **过滤链排查** | 在 `applyModelConfigs()` 入口加 `console.log` 输出原始模型列表和过滤后列表，确认 xjjj 模型是"没从后端来"还是"被过滤掉" |

### 验证步骤

1. **完全重启 dev server**：停止所有进程 → `pnpm dev` 重新启动
2. **浏览器无痕模式**：避免 Next.js HMR 缓存干扰
3. **检查编译产物**：在浏览器 DevTools → Sources → 搜索 `NEXT_PUBLIC_ALLOWED_MODEL_PREFIXES`，看值是否正确
4. **抓 WebSocket 数据**：在浏览器 Network → WS → 筛选 `models` 事件 → 查看原始模型列表是否包含 xjjj

---

## 问题二：opencode 分组模型不能对话

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
| `packages/author-site/src/components/ai-elements/chat/hooks/use-chat-models.ts` | 默认模型 fallback 从 `event.currentModelId` 改为 `models[0]?.id` | ✅ 已修复 |
| `packages/agent-service/src/backends/opencode-http.ts` | `setModel()` 中新增 `this.modelInfoCache = null` | ✅ 已保留 |
| `packages/agent-service/src/backends/opencode-http.ts` | 三处 API 调用新增 `body.model`（后回退） | 🔙 已回退 |
| `packages/agent-service/src/backends/opencode-http.ts` | `setModel()` 中新增 `PATCH /session/{id}`（后回退） | 🔙 已回退 |
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
