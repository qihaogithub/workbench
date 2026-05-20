# Docker 部署方案

> 更新日期：2026-05-20
> 状态：已验证可用

## 一、系统架构

### 1.1 服务拓扑

```
┌──────────────────────────────────────────────────────────────┐
│                  Docker Compose（OrbStack）                    │
│                                                              │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐       │
│  │author-site  │   │agent-service│   │opencode-serve│       │
│  │  :3200      │──▶│  :3201      │──▶│  :4096       │       │
│  │Next.js SSR  │   │  Fastify    │   │ opencode CLI  │       │
│  └─────────────┘   └─────────────┘   └─────────────┘       │
│                                                              │
│  局域网用户通过 http://<IP>:3200 访问                        │
└──────────────────────────────────────────────────────────────┘
```

### 1.2 容器说明

| 容器 | 端口 | 职责 | 必需 |
|------|------|------|------|
| `author-site` | 3200 | 创作端前端 + 用户认证 API | 是 |
| `agent-service` | 3201 | Agent 管理、消息路由 | 是 |
| `opencode-serve` | 4096 | OpenCode HTTP Server（自带免费模型） | 是 |
| `viewer-site` | 3300 | 预览端（可选） | 否 |

### 1.3 数据流

```
浏览器 → author-site(:3200)
           ↓ AGENT_SERVICE_URL
        agent-service(:3201)
           ↓ OPENCODE_SERVER_URL (opencode-http 模式)
        opencode-serve(:4096)
           ↓
        OpenCode 内置免费 LLM
```

---

## 二、关键设计决策

### 2.1 Agent 后端模式：opencode-http 而非 opencode（ACP）

agent-service 支持两种后端模式与 opencode-serve 通信：

| 模式 | 说明 | 适用场景 |
|------|------|---------|
| `opencode`（ACP） | spawn opencode CLI 子进程，通过 stdin/stdout JSON-RPC 通信 | 本地开发（opencode CLI 已安装） |
| `opencode-http` | 通过 HTTP REST API 与 opencode-serve 通信 | **Docker 部署** |

**原因**：Docker 容器内没有 opencode CLI 二进制（仅安装在 opencode-serve 容器中），ACP 模式无法 spawn 子进程。

**实现**：通过环境变量 `DEFAULT_BACKEND=opencode-http` 切换，默认 fallback 为 `opencode`（保持本地开发兼容）。

### 2.2 OpenCode Server API（实际验证）

**创建会话**
```
POST /session
Body: { "title": "session-xxx", "workingDir": "/tmp" }
注意：不支持 "model" 字段，传入会返回 BadRequest
```

**发送消息（同步）**
```
POST /session/{sessionId}/message
Body: { "parts": [{ "type": "text", "text": "hello" }] }
```

**发送消息（异步，触发 SSE）**
```
POST /session/{sessionId}/prompt_async
Body: { "parts": [{ "type": "text", "text": "hello" }] }
```

**SSE 事件流**
```
GET /event?sessionId={sessionId}
```

### 2.3 SSE 事件格式（与代码期望的格式不同）

OpenCode Server 的 SSE 事件使用 `{ id, type, properties }` 结构，不是 `{ type, content, ... }`：

| 事件类型 | 说明 | 代码对应 |
|----------|------|---------|
| `message.part.delta` | 流式文本增量，`properties.delta` 为增量字符串 | `stream` 事件 |
| `message.part.updated` | 部分完成，`properties.part.type` 指示类型（`text`/`reasoning`/`step-start`/`step-finish`） | `tool_call`/`thought` 事件 |
| `session.idle` | AI 响应完成 | `done: true` |
| `session.status` | 状态变更，`properties.status.type` 为 `busy`/`idle` | 状态同步 |

### 2.4 模型列表 API

```
GET /provider
返回: { all: [{ id, name, models: { [modelId]: { id, name } } }] }
格式: model id = "${providerId}/${modelId}"
```

当前模型从 `GET /config` 的 `model` 字段获取。

---

## 三、环境变量配置

### 3.1 docker-compose.yml（容器内部）

| 变量 | 值 | 说明 |
|------|----|------|
| `DEFAULT_BACKEND` | `opencode-http` | 强制使用 HTTP 后端（Docker 必选） |
| `OPENCODE_SERVER_URL` | `http://opencode-serve:4096` | agent-service 访问 opencode-serve |
| `PORT` | 服务端口 | Fastify/Next.js 监听端口 |
| `HOSTNAME` | `0.0.0.0` | Next.js 绑定地址 |
| `CORS_ORIGINS` | 逗号分隔的 URL | 允许的跨域来源 |

### 3.2 .env（宿主机 / Docker 环境变量注入）

| 变量 | 示例值 | 说明 |
|------|--------|------|
| `OPENCODE_API_KEY` | （留空） | OpenCode 自带免费模型，无需 API Key |
| `OPENCODE_API_BASE` | （留空） | 使用默认服务器 |
| `OPENCODE_MODELS` | （留空） | 使用默认模型 |
| `NEXT_PUBLIC_AGENT_SERVICE_URL` | `http://10.131.81.73:3201` | **局域网 IP**，浏览器端使用 |
| `NEXT_PUBLIC_WEB_URL` | `http://10.131.81.73:3200` | **局域网 IP**，浏览器端使用 |
| `CORS_ORIGINS` | `http://10.131.81.73:3200,...` | 包含局域网 IP |
| `JWT_SECRET` | `opencode-workbench-local-2026` | JWT 签名密钥 |

### 3.3 局域网访问关键点

- `NEXT_PUBLIC_*` 变量必须使用**服务器局域网 IP**，因为是浏览器直接访问的地址
- `OPENCODE_SERVER_URL` 和 `AGENT_SERVICE_URL` 使用**容器内部 DNS 名称**（Docker 网络内可解析）
- `CORS_ORIGINS` 必须同时包含局域网 IP 和 localhost

---

## 四、代码修改记录

### 4.1 agent-service 核心修改

| 文件 | 修改内容 |
|------|---------|
| `src/routes/websocket.ts` | 新增 `DEFAULT_BACKEND` 环境变量，3 处硬编码 `backend: "opencode"` 改为 `backend: DEFAULT_BACKEND` |
| `src/routes/agent.ts` | 同上，3 处 fallback 改为 `DEFAULT_BACKEND` |
| `src/backends/opencode-http.ts` | **完全重写**以匹配实际 OpenCode Server API |
| `src/routes/agent.ts` (`/api/llm/models`) | 模型列表 API 从不存在的 `/models` 改为 `/provider` |

### 4.2 opencode-http.ts 重写要点

1. **createSession()**: 移除不支持的 `model` 字段
2. **sendMessageStream()**: 先建立 SSE 连接再发送 `prompt_async`（避免丢失早期事件）
3. **handleSSEEvent()**: 处理实际事件格式（`message.part.delta` → stream，`session.idle` → done）
4. **getModelInfo()**: 从 `/provider` 获取模型列表，从 `/session/{id}` 获取当前模型
5. **EventSource 导入**: 从 `import EventSource from 'eventsource'`（错误）改为 `import { EventSource } from 'eventsource'`（正确）

---

## 五、部署流程

### 5.1 启动服务

```bash
# 构建（代码变更后需要）
docker compose build

# 启动
docker compose up -d

# 等待健康检查通过
docker compose ps

# 验证
curl http://localhost:3200           # author-site
curl http://localhost:3201/health    # agent-service
curl http://localhost:4096/global/health  # opencode-serve
```

### 5.2 常见错误排查

| 错误信息 | 原因 | 解决方案 |
|----------|------|---------|
| `No active session` | ACP 模式尝试 spawn 不存在的 opencode CLI | 设置 `DEFAULT_BACKEND=opencode-http` |
| `Failed to create OpenCode session: BadRequest` | createSession 发送了不支持的 `model` 字段 | 已在代码中移除 |
| `EventSourceClass is not a constructor` | eventsource v4 是命名导出 `{ EventSource }` | 已修复导入方式 |
| `SSE stream timeout` | SSE 事件处理逻辑与实际 API 不匹配 | 已重写 SSE 事件处理 |
| 模型列表为空 | 模型 API 端点错误 | 已从 `/models` 改为 `/provider` |

### 5.3 日志查看

```bash
# 实时日志
docker compose logs -f agent-service

# 查看最近 50 行
docker compose logs --tail=50 agent-service
```

---

## 六、相关文件索引

| 文件路径 | 说明 |
|----------|------|
| `docker-compose.yml` | 容器编排配置 |
| `docker/opencode-serve/Dockerfile` | opencode-serve 容器镜像 |
| `docker/agent-service/Dockerfile` | agent-service 容器镜像（含 esbuild 打包） |
| `docker/author-site/Dockerfile` | author-site 容器镜像（Next.js standalone） |
| `packages/agent-service/src/backends/opencode-http.ts` | HTTP 后端实现 |
| `packages/agent-service/src/routes/websocket.ts` | WebSocket 路由（含 DEFAULT_BACKEND） |
| `.env` | 环境变量配置 |
| `docs/plans/进行中/Docker部署方案.md` | 完整部署方案（设计阶段文档） |
