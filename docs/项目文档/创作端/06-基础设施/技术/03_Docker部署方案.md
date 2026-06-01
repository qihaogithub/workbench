# Docker 部署方案

> 更新日期：2026-06-01
> 状态：已验证可用（Pi Agent 单后端架构）

## 一、系统架构

### 1.1 服务拓扑

```
┌──────────────────────────────────────────────────────────────┐
│                  Docker Compose（OrbStack）                    │
│                                                              │
│  ┌─────────────┐   ┌─────────────┐       │
│  │author-site  │   │agent-service│       │
│  │  :3200      │──▶│  :3201      │       │
│  │Next.js SSR  │   │  Fastify +  │       │
│  │             │   │  Pi Agent   │       │
│  └─────────────┘   └─────────────┘       │
│                                                              │
│  局域网用户通过 http://<IP>:3200 访问                        │
└──────────────────────────────────────────────────────────────┘
```

### 1.2 容器说明

| 容器            | 端口 | 职责                                  | 必需 |
| --------------- | ---- | ------------------------------------- | ---- |
| `author-site`   | 3200 | 创作端前端 + 用户认证 API             | 是   |
| `agent-service` | 3201 | Agent 管理、消息路由（内置 Pi Agent） | 是   |
| `viewer-site`   | 3300 | 预览端（可选）                        | 否   |

### 1.3 数据流

```
浏览器 → author-site(:3200)
           ↓ AGENT_SERVICE_URL
        agent-service(:3201)
           ↓ 进程内嵌入
        Pi Agent（@earendil-works/pi-agent-core）
           ↓
        用户配置的 LLM API
```

---

## 二、关键设计决策

### 2.1 Pi Agent 单后端架构

agent-service 采用 **Pi Agent 单后端架构**（`@earendil-works/pi-agent-core` 进程内嵌入），无需外部 LLM 服务进程。

| 特性             | 说明                                                                     |
| ---------------- | ------------------------------------------------------------------------ |
| **进程内嵌入**   | Pi Agent 直接运行在 agent-service 进程内，无网络开销                     |
| **工具集**       | readFile, writeFile, listFiles, bash, schemaValidate                     |
| **Shell 白名单** | 11 个只读命令：npm, node, npx, ls, cat, head, tail, grep, find, wc, echo |
| **文件拦截**     | `beforeToolCall`/`afterToolCall` 实时捕获文件变更                        |

### 2.2 Pi Agent 模型配置

通过环境变量配置 LLM API：

| 环境变量            | 说明            | 示例                              |
| ------------------- | --------------- | --------------------------------- |
| `PI_AGENT_PROVIDER` | 提供商          | `anthropic`、`openai`、`deepseek` |
| `PI_AGENT_API_KEY`  | API 密钥        | `sk-xxx`                          |
| `PI_AGENT_MODEL`    | 模型 ID         | `claude-sonnet-4-20250514`        |
| `PI_AGENT_BASE_URL` | 自定义 API 地址 | `https://api.deepseek.com/v1`     |

---

## 三、环境变量配置

### 3.1 docker-compose.yml（容器内部）

| 变量                | 值                         | 说明                     |
| ------------------- | -------------------------- | ------------------------ |
| `PI_AGENT_PROVIDER` | `anthropic`                | 模型提供商               |
| `PI_AGENT_API_KEY`  | API 密钥                   | 用户自有的 LLM API Key   |
| `PI_AGENT_MODEL`    | `claude-sonnet-4-20250514` | 默认模型                 |
| `PI_AGENT_BASE_URL` | （空）                     | 自定义 API 地址          |
| `PORT`              | 服务端口                   | Fastify/Next.js 监听端口 |
| `HOSTNAME`          | `0.0.0.0`                  | Next.js 绑定地址         |
| `CORS_ORIGINS`      | 逗号分隔的 URL             | 允许的跨域来源           |

### 3.2 .env.docker（宿主机 / Docker 环境变量注入）

| 变量                                 | 示例值                           | 说明                        |
| ------------------------------------ | -------------------------------- | --------------------------- |
| `NEXT_PUBLIC_ALLOWED_MODEL_PREFIXES` | `xjjj/,jojo/`                    | 前端模型白名单              |
| `NEXT_PUBLIC_AGENT_SERVICE_URL`      | `http://10.130.33.131:3201`      | **局域网 IP**，浏览器端使用 |
| `NEXT_PUBLIC_WEB_URL`                | `http://10.130.33.131:3200`      | **局域网 IP**，浏览器端使用 |
| `CORS_ORIGINS`                       | `http://10.130.33.131:3200,...`  | 包含局域网 IP               |
| `JWT_SECRET`                         | `change-this-to-a-random-string` | JWT 签名密钥                |
| `USE_SECURE_COOKIE`                  | `false`                          | HTTP 内网部署时设为 false   |

### 3.3 局域网访问关键点

- `NEXT_PUBLIC_*` 变量必须使用**服务器局域网 IP**，因为是浏览器直接访问的地址
- `AGENT_SERVICE_URL` 使用**容器内部 DNS 名称**（Docker 网络内可解析）
- `CORS_ORIGINS` 必须同时包含局域网 IP 和 localhost

---

## 四、Pi Agent 工具集

Pi Agent 内置 5 个工具，通过 `beforeToolCall`/`afterToolCall` 拦截机制管理：

| 工具             | 说明                            |
| ---------------- | ------------------------------- |
| `readFile`       | 读取工作区文件（路径校验）      |
| `writeFile`      | 写入文件（路径校验 + 变更捕获） |
| `listFiles`      | 列出工作区文件（路径校验）      |
| `bash`           | 执行白名单命令（11 个只读命令） |
| `schemaValidate` | 校验 JSON Schema                |

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
```

### 5.2 常见错误排查

| 错误信息              | 原因                   | 解决方案                              |
| --------------------- | ---------------------- | ------------------------------------- |
| `No active session`   | Session 未正确初始化   | 使用新的 sessionId 重试               |
| `Pi Agent error`      | Pi Agent 进程内异常    | 检查 agent-service 日志               |
| `Model not available` | API Key 或模型配置错误 | 检查 `PI_AGENT_*` 环境变量            |
| `SSE stream timeout`  | LLM API 响应超时       | 检查网络连接或增大 `PI_AGENT_TIMEOUT` |

### 5.3 日志查看

```bash
# 实时日志
docker compose logs -f agent-service

# 查看最近 50 行
docker compose logs --tail=50 agent-service
```

---

## 六、相关文件索引

| 文件路径                                          | 说明                                                            |
| ------------------------------------------------- | --------------------------------------------------------------- |
| `docker-compose.yml`                              | 容器编排配置（3 服务：agent-service、author-site、viewer-site） |
| `docker/agent-service/Dockerfile`                 | agent-service 容器镜像（含 esbuild 打包）                       |
| `docker/author-site/Dockerfile`                   | author-site 容器镜像（Next.js standalone）                      |
| `packages/agent-service/src/backends/pi-agent.ts` | Pi Agent 后端实现                                               |
| `packages/agent-service/src/backends/pi-tools/`   | Pi Agent 工具集                                                 |
| `.env.docker`                                     | 环境变量配置模板                                                |
