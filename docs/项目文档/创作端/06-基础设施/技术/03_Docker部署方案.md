# Docker 部署方案

> 更新日期：2026-06-29
> 状态：已验证可用（Pi Agent 单后端架构）

```yaml
covers:
  - docker-compose.yml
  - docker/agent-service/Dockerfile
  - docker/author-site/Dockerfile
  - docker/screenshot-service/Dockerfile
  - docker/viewer-site/Dockerfile
  - scripts/deploy.sh
  - packages/author-site/src/middleware.ts
  - scripts/build-preview-runtime.mjs
  - packages/author-site/public/preview-runtime/manifest.json
  - packages/viewer-site/public/preview-runtime/manifest.json
```

## 一、系统架构

### 1.1 服务拓扑

```
┌──────────────────────────────────────────────────────────────┐
│                  Docker Compose（正式环境）                    │
│                                                              │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐       │
│  │author-site  │   │agent-service│   │screenshot   │       │
│  │  :3200      │──▶│  :3201      │   │  :3202      │       │
│  │Next.js SSR  │   │  Fastify +  │   │Puppeteer    │       │
│  │             │   │  Pi Agent   │   │Core         │       │
│  └─────────────┘   └─────────────┘   └─────────────┘       │
│          │                                                  │
│          └──────────────────────────▶ viewer-site(:3300)    │
│                                                              │
│  局域网用户通过 http://<IP>:3200 访问                        │
└──────────────────────────────────────────────────────────────┘
```

### 1.2 容器说明

| 容器            | 端口 | 职责                                  | 必需 |
| --------------- | ---- | ------------------------------------- | ---- |
| `author-site`   | 3200 | 创作端前端 + 用户认证 API             | 是   |
| `agent-service` | 3201 | Agent 管理、消息路由（内置 Pi Agent） | 是   |
| `screenshot-service` | 3202 | 页面截图与缩略图生成             | 是   |
| `viewer-site`   | 3300 | 使用端/预览端                         | 是   |

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
| `SCREENSHOT_SERVICE_URL` | `http://screenshot-service:3202` | author-site 调用截图服务的 Docker 内网地址 |
| `NEXT_PUBLIC_AGENT_SERVICE_URL` | 局域网或公网 URL | author-site/viewer-site 浏览器端访问 agent-service |
| `NEXT_PUBLIC_SCREENSHOT_SERVICE_URL` | 局域网或公网 URL | author-site 浏览器端访问 screenshot-service |
| `NEXT_PUBLIC_DATA_BASE` | `/data` 或外部数据基址 | viewer-site 静态导出时的数据基址 |
| `PREVIEW_RUNTIME_SOURCE` | `local` | 预览 iframe 默认使用同源 preview-runtime；设为 `cdn` 时走远程 CDN 回退 |
| `PREVIEW_SHELL_MODE` | `fixed` | author-site 默认固定 shell；viewer-site 生产静态导出默认 inline shell |

### 3.2 .env.docker（宿主机 / Docker 环境变量注入）

| 变量                                 | 示例值                           | 说明                        |
| ------------------------------------ | -------------------------------- | --------------------------- |
| `NEXT_PUBLIC_ALLOWED_MODEL_PREFIXES` | `xjjj/,jojo/`                    | 前端模型白名单              |
| `NEXT_PUBLIC_AGENT_SERVICE_URL`      | `http://10.130.33.131:3201`      | **局域网 IP**，浏览器端使用 |
| `NEXT_PUBLIC_SCREENSHOT_SERVICE_URL` | `http://10.130.33.131:3202`      | **局域网 IP**，浏览器端使用 |
| `NEXT_PUBLIC_DATA_BASE`              | `/data`                          | viewer-site 静态导出的数据基址 |
| `NEXT_PUBLIC_WEB_URL`                | `http://10.130.33.131:3200`      | **局域网 IP**，浏览器端使用 |
| `CORS_ORIGINS`                       | `http://10.130.33.131:3200,...`  | 包含局域网 IP               |
| `PREVIEW_RUNTIME_SOURCE`             | `local`                          | preview runtime 来源；仅诊断时改为 `cdn` |
| `JWT_SECRET`                         | `change-this-to-a-random-string` | JWT 签名密钥                |
| `USE_SECURE_COOKIE`                  | `false`                          | HTTP 内网部署时设为 false   |

### 3.3 局域网访问关键点

- `NEXT_PUBLIC_*` 变量必须使用**服务器局域网 IP**，因为是浏览器直接访问的地址
- `AGENT_SERVICE_URL` 使用**容器内部 DNS 名称**（Docker 网络内可解析）
- `SCREENSHOT_SERVICE_URL` 在容器内使用 `http://screenshot-service:3202`
- `CORS_ORIGINS` 必须同时包含创作端、使用端的真实访问来源和必要的 localhost 来源
- `author-site` 的 CORS 中间件会读取 `CORS_ORIGINS`，并在认证逻辑之前响应 API/viewer 路由的 OPTIONS 预检
- `docker-compose.yml` 默认 `USE_SECURE_COOKIE=false`，匹配 `http://<IP>:3200` 的内网访问方式；若改为 HTTPS 域名访问，应显式设置为 `true`。

### 3.4 Docker 构建上下文约束

各服务 Dockerfile 使用最小 workspace 构建上下文，必须显式复制目标包及其 workspace 传递依赖的 `package.json` 和源码目录：

| 镜像 | 需要复制的 workspace 包 |
| ---- | ----------------------- |
| `agent-service` | `agent-service`、`shared`、`knowledge-core`、`knowledge-service` |
| `author-site` | `author-site`、`agent-client`、`demo-ui`、`knowledge-core`、`knowledge-service`、`project-core`、`project-scaffold`、`shared` |
| `viewer-site` | `viewer-site`、`demo-ui`、`shared` |

如果新增 workspace 依赖，只更新本地 `package.json` 不足以保证 Docker build 通过；必须同步更新对应 Dockerfile 的复制清单和 `next.config.js` 的 `transpilePackages`。

### 3.5 preview runtime 构建约束

author-site 和 viewer-site 构建前会执行 `corepack pnpm --workspace-root build:preview-runtime`，产出同源预览运行时：

- author-site: `packages/author-site/public/preview-runtime/`
- viewer-site: `packages/viewer-site/public/preview-runtime/`

该目录包含 `manifest.json` 和 vendor chunks，是预览 iframe 的默认 React/lucide/framer/`@preview/sdk` 来源。Docker build 必须保留这一步，否则固定 shell 和发布包中的同源 runtime 会回退到缺失资源。需要临时诊断远程 CDN 时，设置 `PREVIEW_RUNTIME_SOURCE=cdn`。

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

### 5.1 部署脚本

正式环境通过 `scripts/deploy.sh` 执行部署。脚本行为：

- 从 `.env.docker` 读取所有合法 `KEY=VALUE` 变量写入临时 `.deploy.env`，避免新增部署变量后脚本遗漏。
- 默认补充 `USE_SECURE_COOKIE=false`，适配 HTTP 内网部署。
- 通过 `rsync` 同步源码到远程服务器，排除 `data/`、测试目录、pnpm store、构建产物和常见截图输出，避免把本地运行数据带入线上。
- 在远程执行 `docker compose --env-file .deploy.env build` 和 `docker compose --env-file .deploy.env up -d`。
- 部署后检查容器状态、健康检查和四个服务端口。

### 5.2 手动启动服务

```bash
# 构建（代码变更后需要）
docker compose build

# 启动
docker compose up -d

# 等待健康检查通过
docker compose ps

# 验证
curl http://localhost:3200                # author-site
curl http://localhost:3201/health         # agent-service
curl http://localhost:3202/health         # screenshot-service
curl http://localhost:3300                # viewer-site
```

### 5.3 常见错误排查

| 错误信息              | 原因                   | 解决方案                              |
| --------------------- | ---------------------- | ------------------------------------- |
| `No active session`   | Session 未正确初始化   | 使用新的 sessionId 重试               |
| `Pi Agent error`      | Pi Agent 进程内异常    | 检查 agent-service 日志               |
| `Model not available` | API Key 或模型配置错误 | 检查 `PI_AGENT_*` 环境变量            |
| `SSE stream timeout`  | LLM API 响应超时       | 检查网络连接或增大 `PI_AGENT_TIMEOUT` |
| `Cannot find module` 或类型声明缺失 | Dockerfile 未复制 workspace 传递依赖或包内缺少声明依赖 | 补齐 Dockerfile 复制清单、`transpilePackages` 和包级依赖 |
| CORS 预检返回 405 | author-site 未在路由处理前响应 OPTIONS | 检查 `CORS_ORIGINS` 是否包含使用端来源，并确认中间件先处理预检 |

### 5.4 日志查看

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
| `docker-compose.yml`                              | 容器编排配置（agent-service、author-site、screenshot-service、viewer-site） |
| `docker/agent-service/Dockerfile`                 | agent-service 容器镜像（含 esbuild 打包）                       |
| `docker/author-site/Dockerfile`                   | author-site 容器镜像（Next.js standalone）                      |
| `docker/screenshot-service/Dockerfile`            | screenshot-service 容器镜像（Chromium + Puppeteer Core）        |
| `docker/viewer-site/Dockerfile`                   | viewer-site 容器镜像                                            |
| `scripts/deploy.sh`                               | 正式环境同步、构建、启动和自检脚本                              |
| `packages/agent-service/src/backends/pi-agent.ts` | Pi Agent 后端实现                                               |
| `packages/agent-service/src/backends/pi-tools/`   | Pi Agent 工具集                                                 |
| `.env.docker`                                     | 环境变量配置模板                                                |
