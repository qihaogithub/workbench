# OpenCodeHttpBackend — API 设计

> 本文档包含：所有 API 端点设计（系统级/用户级/内部使用）
>
> 关联文档：[00-总览.md](./00-总览.md) | [01-方案基础.md](./01-方案基础.md) | [03-部署与集成.md](./03-部署与集成.md) | [04-阶段详细计划.md](./04-阶段详细计划.md) | [05-当前进度.md](./05-当前进度.md)

---

## 一、系统级 LLM 配置 API（管理员）

> **说明**：系统级 LLM 配置**不在 agent-service 中管理**，而是通过 OpenCode Server 的 Provider 配置直接设置。agent-service 仅提供读取接口供前端展示。

### 1.1 获取系统 LLM 配置

> **⚠️ 当前系统未实现此 API**。系统级 LLM 配置通过 OpenCode Server 环境变量管理，agent-service 不直接管理 Provider 配置。
>
> **临时方案**：前端通过 `/backends` 端点获取已注册后端列表，模型选择由 OpenCode Server 统一管理。

```
GET /api/admin/llm-config

响应：
{
  "success": true,
  "data": {
    "providerType": "anthropic",  // anthropic | openai | gemini | custom
    "providerId": "enterprise",
    "apiBase": "https://api.anthropic.com",
    "models": ["claude-3-5-sonnet-20240620", "claude-opus-4-5"],
    "isConfigured": true
  }
}
```

> **数据来源**：从 OpenCode Server 的 Provider 配置或环境变量读取，agent-service 不存储 API Key。
>
> **实现建议**：如需此 API，需扩展 OpenCode Server 提供查询接口，或在 agent-service 中缓存配置状态。

### 1.2 更新系统 LLM 配置

> **⚠️ 当前系统未实现此 API**。配置变更需直接修改 OpenCode Server 环境变量并重启服务。

```
PUT /api/admin/llm-config

请求：
{
  "providerType": "anthropic",
  "apiKey": "sk-xxx-xxx",  // 加密存储
  "apiBase": "https://api.anthropic.com",
  "models": ["claude-3-5-sonnet-20240620", "claude-opus-4-5"]
}

响应：
{
  "success": true,
  "data": {
    "message": "系统配置已保存"
  }
}
```

> **实现方式**：调用 OpenCode Server 的 Provider 配置端点（如 `/auth/enterprise`），或在配置变更后重启 OpenCode Server。

### 1.3 获取可用模型列表

> **⚠️ 当前系统未实现此 API**。模型列表由 OpenCode Server 内部管理，HTTP 后端暂不支持动态获取。
>
> **当前行为**：`OpenCodeHttpBackend` 在创建会话时通过 `model` 参数指定模型（`opencode-http.ts:52-55`），但无法获取可用模型列表。

```
GET /api/llm/models

响应：
{
  "success": true,
  "data": {
    "models": [
      { "id": "claude-3-5-sonnet-20240620", "label": "Claude Sonnet 4.5" },
      { "id": "claude-opus-4-5", "label": "Claude Opus 4.5" },
      { "id": "gpt-4-turbo", "label": "GPT-4 Turbo" }
    ]
  }
}
```

---

## 二、用户会话 API

### 2.1 发送消息（选择后端）

```
POST /api/agent/:sessionId/message

请求：
{
  "content": "帮我写一个用户注册接口",
  "demoId": "demo-001",        // 可选
  "backend": "opencode-http",  // 可选，默认 "opencode"（当前）→ 未来改为 "opencode-http"
  "workingDir": "/path/to/workspace",  // 可选
  "options": {
    "timeout": 120000,         // 可选，默认 120s
    "stream": true             // 可选，是否启用流式响应（HTTP 后端暂不支持）
  }
}

响应：
{
  "success": true,
  "data": {
    "sessionId": "sess-xxx-xxx",
    "content": "好的，我来帮你...",
    "files": [...],
    "metadata": {
      "model": "claude-3-5-sonnet-20240620",
      "duration": 5000
    }
  }
}
```

> **内部处理**：
>
> 1. agent-service 根据 `backend` 参数选择后端：
>    - `"opencode-http"`（默认，Phase 3 切换）→ `OpenCodeHttpBackend`
>    - `"opencode"` → `OpenCodeAcpBackend`（ACP 子进程）
> 2. 首次发送消息时自动创建对应后端的会话
> 3. 后续消息复用已有后端会话，无需重复创建
> 4. SessionStore 记录后端类型和对应会话 ID
>
> **当前实现**：`agent.ts:93-99` 中 `model` 硬编码为 `sensenova/deepseek-v4-flash`，需改为从配置或请求参数获取。

### 2.2 获取会话信息

```
GET /api/agent/:sessionId

响应：
{
  "success": true,
  "data": {
    "sessionId": "sess-xxx-xxx",
    "status": "ready",
    "backend": "opencode-http",
    "createdAt": "2026-05-08T10:00:00Z",
    "lastActivityAt": "2026-05-08T10:05:00Z",
    "messageCount": 5,
    "workingDir": "/path/to/workspace"
  }
}
```

### 2.3 销毁会话

```
DELETE /api/agent/:sessionId

响应：
{
  "success": true,
  "data": {
    "sessionId": "sess-xxx-xxx",
    "destroyed": true
  }
}
```

---

## 三、OpenCode Server 集成 API（内部使用）

> 以下端点由 `OpenCodeHttpBackend` 内部调用，不直接暴露给前端。

### 3.1 系统级 Provider 配置

```
# 启动时或配置变更时设置一次
PUT /auth/enterprise

请求：
{
  "apiKey": "sk-ant-xxx-xxx",
  "apiBase": "https://api.anthropic.com"
}

说明：
- 管理员配置一次，所有用户共用
- 配置变更时重新设置
- 实际实现中，OpenCode Server 可能通过环境变量或配置文件读取 Provider 配置，而非通过 HTTP API 动态设置
```

### 3.2 创建会话

```
POST /session

请求：
{
  "title": "session-xxx",
  "model": "claude-3-5-sonnet-20240620",  // 用户选择的模型
  "workingDir": "/path/to/workspace"       // 可选，工作目录隔离
}

响应：
{
  "id": "oc-session-xxx-xxx"  // OpenCode 会话 ID
}
```

### 3.3 发送消息（同步）

```
POST /session/:id/message

请求：
{
  "parts": [{ "type": "text", "text": "帮我写代码" }]
}

响应：
{
  "parts": [
    { "type": "text", "text": "好的，我来帮你..." }
  ]
}
```

> **当前实现**：`opencode-http.ts:82-89` 已实现同步消息发送。

### 3.4 发送消息（异步）

```
POST /session/:id/prompt_async

请求：
{
  "parts": [{ "type": "text", "text": "帮我写代码" }]
}

响应：
{
  "success": true
}
```

> **说明**：异步发送后，需通过 SSE `/event` 接收流式响应。
> **当前状态**：未实现（Phase 2）。

### 3.5 SSE 流式响应

```
GET /event

说明：
- 建立 SSE 连接接收流式事件
- 需要在请求头中指定 session ID 或会话标识
- 返回事件类型：message_chunk, tool_call, tool_call_update, error 等
```

> **当前状态**：未实现（Phase 2）。`OpenCodeHttpBackend` 目前仅模拟流式事件（`opencode-http.ts:102-109`），在同步响应完成后一次性发送 `stream` 事件。

---

## 附录：OpenCode HTTP API 关键端点

| 端点 | 方法 | 用途 | 备注 |
|:---|:---|:---|:---|
| `/global/health` | GET | 健康检查 | OpenCodeHttpBackend.checkHealth() 使用 |
| `/auth/enterprise` | PUT | 设置系统级 Provider | 可能通过环境变量替代 |
| `/session` | POST | 创建会话 | 传入 model 和 workingDir |
| `/session/:id/message` | POST | 发送消息 | 同步响应 |
| `/session/:id/prompt_async` | POST | 异步发送消息 | 配合 SSE 使用 |
| `/event` | GET | SSE 事件流 | 流式响应 |
