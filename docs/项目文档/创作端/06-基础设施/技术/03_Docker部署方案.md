# Docker 部署方案

> 更新日期：2026-07-06
> 状态：已验证可用（Pi Agent 单后端架构）

```yaml
covers:
  - docker-compose.yml
  - docker/agent-service/Dockerfile
  - docker/author-site/Dockerfile
  - docker/screenshot-service/Dockerfile
  - docker/viewer-site/Dockerfile
  - .dockerignore
  - package.json
  - packages/author-site/next.config.js
  - packages/viewer-site/next.config.js
  - scripts/docker-orbstack-up.sh
  - scripts/docker-orbstack-verify.sh
  - scripts/docker-screenshot-deep-health.sh
  - scripts/docker-build-check.sh
  - scripts/docker-prepull.sh
  - scripts/deploy.sh
  - scripts/deploy-fast.sh
  - packages/preview-contract/package.json
  - packages/sketch-core/package.json
  - packages/sketch-react/package.json
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
| `screenshot-service` | 3202 | 页面截图与缩略图生成             | 否；本地默认通过 `screenshot` profile 启动 |
| `viewer-site`   | 3300 | 使用端/预览端                         | 是   |

### 1.3 容器资源上限

正式环境和本地 Compose 配置会限制每个业务容器的 CPU、内存和进程数，避免单个服务或浏览器进程把宿主机资源耗尽：

| 容器 | CPU 上限 | 内存上限 | 进程数上限 | 说明 |
| ---- | -------- | -------- | ---------- | ---- |
| `author-site` | 1.0 CPU | 1GB | 512 | Next.js SSR 与 API |
| `agent-service` | 1.0 CPU | 1GB | 512 | Agent 会话与工具调用 |
| `screenshot-service` | 1.0 CPU | 1536MB | 768 | Chromium 截图任务；额外配置 256MB `/dev/shm` |
| `viewer-site` | 0.5 CPU | 512MB | 256 | Nginx 静态预览端 |

这些限制只约束运行中的容器。Docker build 阶段仍可能消耗宿主机资源，因此部署脚本还会控制构建并发和默认部署范围。

本地 OrbStack 默认只启动 `agent-service`、`author-site` 和 `viewer-site`，让创作端和使用端先快速可用。`screenshot-service` 通过 `screenshot` profile 独立启用，避免 Chromium 兼容性或镜像下载阻塞主流程部署。

### 1.4 数据流

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
| `FIGMA_OAUTH_CLIENT_ID` | Figma OAuth app client id | author-site 启动用户级 Figma 授权 |
| `FIGMA_OAUTH_CLIENT_SECRET` | Figma OAuth app client secret | author-site 交换和刷新 Figma OAuth token |
| `FIGMA_OAUTH_REDIRECT_URI` | author-site callback URL | 必须与 Figma OAuth app 配置完全一致 |
| `FIGMA_OAUTH_SCOPES` | `file_content:read` | author-site 请求的 Figma OAuth scope，必须是 Figma app 已选择 scope 的子集 |
| `FIGMA_MCP_URL` | Figma MCP endpoint | agent-service 调用 Figma MCP；未配置时使用官方默认 endpoint |
| `FIGMA_MCP_REGION` | 区域标识 | agent-service 调用 Figma MCP 时透传的可选区域配置 |
| `PREVIEW_RUNTIME_SOURCE` | `local` | 预览 iframe 默认使用同源 preview-runtime；设为 `cdn` 时走远程 CDN 回退 |
| `PREVIEW_SHELL_MODE` | `fixed` | author-site 默认固定 shell；viewer-site 生产静态导出默认 inline shell |
| `DATA_DIR` | `/app/data` | 容器内应用数据目录；由宿主机 `APP_DATA_DIR` 绑定持久化 |
| `INTERNAL_API_TOKEN` | 共享随机密钥 | author-site 调用 agent-service 内部配置接口的鉴权密钥，两个容器必须一致 |

### 3.2 .env.docker（宿主机 / Docker 环境变量注入）

| 变量                                 | 示例值                           | 说明                        |
| ------------------------------------ | -------------------------------- | --------------------------- |
| `NEXT_PUBLIC_ALLOWED_MODEL_PREFIXES` | `xjjj/,jojo/`                    | 前端模型白名单              |
| `APP_DATA_DIR`                       | `/opt/workbench/data`    | 宿主机持久数据目录，绑定到容器 `/app/data` |
| `NEXT_PUBLIC_AGENT_SERVICE_URL`      | `http://10.130.33.131:3201`      | **局域网 IP**，浏览器端使用 |
| `NEXT_PUBLIC_SCREENSHOT_SERVICE_URL` | `http://10.130.33.131:3202`      | **局域网 IP**，浏览器端使用 |
| `NEXT_PUBLIC_DATA_BASE`              | `/data`                          | viewer-site 静态导出的数据基址 |
| `NEXT_PUBLIC_WEB_URL`                | `http://10.130.33.131:3200`      | **局域网 IP**，浏览器端使用 |
| `CORS_ORIGINS`                       | `http://10.130.33.131:3200,...`  | 包含局域网 IP               |
| `PREVIEW_RUNTIME_SOURCE`             | `local`                          | preview runtime 来源；仅诊断时改为 `cdn` |
| `JWT_SECRET`                         | `change-this-to-a-random-string` | JWT 签名密钥                |
| `USE_SECURE_COOKIE`                  | `false`                          | HTTP 内网部署时设为 false   |
| `INTERNAL_API_TOKEN`                 | 随机长字符串                     | 管理后台模型配置同步到 agent-service 的内部接口密钥 |
| `FIGMA_OAUTH_CLIENT_ID`              | Figma OAuth app client id         | 启用聊天内 Figma MCP 用户授权 |
| `FIGMA_OAUTH_CLIENT_SECRET`          | Figma OAuth app client secret     | 用于交换和刷新用户 Figma token |
| `FIGMA_OAUTH_REDIRECT_URI`           | `http://10.130.33.131:3200/api/user/external-auth/figma/callback` | Figma OAuth 回调地址，必须与 Figma app 配置一致 |
| `FIGMA_OAUTH_SCOPES`                 | `file_content:read` | 必须与 Figma OAuth scopes 页已选择权限匹配 |

### 3.3 局域网访问关键点

- `NEXT_PUBLIC_*` 变量必须使用**服务器局域网 IP**，因为是浏览器直接访问的地址
- `AGENT_SERVICE_URL` 使用**容器内部 DNS 名称**（Docker 网络内可解析）
- `SCREENSHOT_SERVICE_URL` 在容器内使用 `http://screenshot-service:3202`
- `INTERNAL_API_TOKEN` 必须在 author-site 和 agent-service 中保持同一个非空值，否则管理后台保存的后端供应商配置只能写入数据库，无法同步到 agent-service 运行时。
- Figma MCP 用户授权必须先配置 Figma OAuth app；OAuth scopes 页至少选择 `file_content:read`，Embed API 的 allowed origins 不影响 OAuth 授权。
- `CORS_ORIGINS` 必须同时包含创作端、使用端的真实访问来源和必要的 localhost 来源
- `author-site` 的 CORS 中间件会读取 `CORS_ORIGINS`，并在认证逻辑之前响应 API/viewer 路由的 OPTIONS 预检
- `docker-compose.yml` 默认 `USE_SECURE_COOKIE=false`，匹配 `http://<IP>:3200` 的内网访问方式；若改为 HTTPS 域名访问，应显式设置为 `true`。

### 3.4 本地 OrbStack 命令入口

本地 OrbStack 不直接使用 `.env.docker` 中的远程 IP 作为浏览器访问地址，而是由脚本注入 `localhost` 覆盖值。固定入口如下：

| 命令 | 作用 |
| ---- | ---- |
| `corepack pnpm docker:orbstack` | 构建并启动主应用服务：`agent-service`、`author-site`、`viewer-site` |
| `corepack pnpm docker:orbstack:screenshot` | 构建并启动主应用服务和 `screenshot-service` |
| `corepack pnpm docker:orbstack:verify` | 验证本地 `3200`、`3201`、`3300` 的 HTTP 表面 |
| `corepack pnpm docker:screenshot:deep-health` | 单独验证截图服务 Chromium 深度健康检查 |
| `corepack pnpm docker:prepull` | 预拉常用基础镜像，减少部署时等待 |
| `corepack pnpm check:docker-build` | 串行构建主应用镜像，提前发现 Dockerfile workspace 依赖缺口 |

`scripts/docker-orbstack-up.sh` 默认设置：

- `APP_DATA_DIR=$PWD/data`
- `NEXT_PUBLIC_AGENT_SERVICE_URL=http://localhost:3201`
- `NEXT_PUBLIC_SCREENSHOT_SERVICE_URL=http://localhost:3202`
- `NEXT_PUBLIC_WEB_URL=http://localhost:3200`
- `CORS_ORIGINS` 同时包含 `localhost` 和 `127.0.0.1` 的创作端、使用端来源。

`scripts/docker-build-check.sh` 默认串行构建 `agent-service`、`author-site` 和 `viewer-site`，降低本地 OrbStack 首次冷构建时多个 `pnpm install` 同时争抢 registry 带宽的概率。需要压测并行构建时显式添加 `--parallel`。

### 3.5 健康检查分层

Docker 容器健康检查只判断服务进程是否可用：

- `author-site`: `http://localhost:3200`
- `agent-service`: `http://localhost:3201/health`
- `screenshot-service`: `http://localhost:3202/health`

Chromium 是否能真实启动属于截图能力诊断，不作为默认容器健康条件。需要验证截图浏览器能力时，执行 `corepack pnpm docker:screenshot:deep-health`，对应 `http://localhost:3202/health?deep=1`。

### 3.6 数据持久化

`docker-compose.yml` 使用 `${APP_DATA_DIR:-/opt/workbench/data}:/app/data` 绑定宿主机目录。这个目录是生产数据源，至少包含：

- `users.db`、`users.db-wal`、`users.db-shm`：用户、管理后台配置、个人模型配置和外部授权配置。
- `projects/`、`sessions/`、`published/`：项目、会话和发布数据。
- `screenshots/`：截图缓存，可按容量策略单独备份或重建。

不要把管理后台配置只依赖 Docker named volume。named volume 会受 compose project 名称、`down -v` 和平台清理策略影响。生产环境应固定 `APP_DATA_DIR`，部署脚本会在远端启动前创建该目录。备份 SQLite 时应停服务，或同时保留 `users.db`、`users.db-wal` 和 `users.db-shm`。

### 3.7 Docker 构建上下文约束

各服务 Dockerfile 使用最小 workspace 构建上下文，必须显式复制目标包及其 workspace 传递依赖的 `package.json` 和源码目录：

| 镜像 | 需要复制的 workspace 包 |
| ---- | ----------------------- |
| `agent-service` | `agent-service`、`shared`、`knowledge-core`、`knowledge-service`、`preview-contract`、`sketch-core` |
| `author-site` | `author-site`、`agent-client`、`demo-ui`、`knowledge-core`、`knowledge-service`、`preview-contract`、`project-core`、`project-scaffold`、`sketch-core`、`sketch-react`、`shared` |
| `screenshot-service` | `screenshot-service`、`sketch-core`、`shared` |
| `viewer-site` | `viewer-site`、`demo-ui`、`sketch-core`、`sketch-react`、`shared` |

如果新增 workspace 依赖，只更新本地 `package.json` 不足以保证 Docker build 通过；必须同步更新对应 Dockerfile 的复制清单和 `next.config.js` 的 `transpilePackages`。例如页面运行契约包 `preview-contract` 同时被 author-site、agent-service、project-core 和 project-cli 复用，相关服务镜像必须在 `pnpm install` 前复制它的 `package.json`，并在构建前复制源码目录。

`.dockerignore` 是 Docker 构建上下文的一部分，必须排除 `.workbench/`、`.codegraph/`、`data/`、`test/`、包内 `.next/`、`dist/` 和本地依赖目录，避免把本地工作区、缓存、诊断数据或测试输出复制进镜像构建上下文。

各服务 Dockerfile 的 `pnpm install` 使用同一个 BuildKit cache mount：`id=workbench-pnpm-store,target=/pnpm/store`。首次冷构建仍需下载依赖；之后主应用镜像串行构建会复用同一份 pnpm store，避免每个服务重复从 registry 拉取同一批依赖。

### 3.8 screenshot-service Chromium 运行约束

`screenshot-service` 依赖容器内 Chromium 执行深度健康检查和页面截图。Apple Silicon + OrbStack 本地环境中，Debian arm64 Chromium 可能在 headless 启动时触发 `SIGTRAP`，或者在启用沙箱时被 namespace 权限限制拦截。因此 `docker-compose.yml` 将 `screenshot-service` 放入 `screenshot` profile，并对该服务默认使用 `SCREENSHOT_SERVICE_PLATFORM=linux/amd64`，通过 `PUPPETEER_DISABLE_SANDBOX=true` 显式附加 `--no-sandbox`、`--disable-setuid-sandbox`。其他服务仍可保持宿主原生架构运行。

如果部署到 Linux 服务器或已验证 arm64 Chromium 可用的环境，可显式设置：

```bash
COMPOSE_PROFILES=screenshot SCREENSHOT_SERVICE_PLATFORM=linux/arm64 PUPPETEER_DISABLE_SANDBOX=false docker compose --env-file .env.docker up -d --build screenshot-service
```

截图服务镜像运行时使用 `node:20-bookworm-slim`，安装 Debian `chromium` 和 `chromium-sandbox`，并以非 root `node` 用户启动 Node 进程。

### 3.9 preview runtime 构建约束

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
- 默认部署 `agent-service`、`author-site`、`viewer-site`，不重建 `screenshot-service`，避免 Chromium 系统依赖安装拖慢或拖垮正式机。
- 同步阶段会排除历史 `packages/web/`、历史 `packages/snapshot-service/`、根 `.workbench/`、包内 `.next/`、包内 `data/`、包内 `.workbench/` 和各类依赖/构建产物，避免把本地缓存、历史工作区或测试数据传入正式机。
- 默认设置 `COMPOSE_PARALLEL_LIMIT=1`，降低远程构建并发。
- 在远端启动前根据 `.env.docker` 中的 `APP_DATA_DIR` 创建稳定持久数据目录。
- 在远程执行限定服务集合的 `docker compose --env-file .env.docker build` 和 `docker compose --env-file .env.docker up -d`。
- 部署前校验 `.env.docker` 必须包含非空 `INTERNAL_API_TOKEN`。
- 部署后检查本次部署服务的容器状态、健康检查和端口；当部署范围包含 author-site 或 agent-service 时，还会用 `INTERNAL_API_TOKEN` 调用 agent-service 内部模型配置接口，确认管理后台配置同步链路可用。

需要更新截图服务时，显式开启：

```bash
INCLUDE_SCREENSHOT_SERVICE=true scripts/deploy.sh
```

需要临时指定部署服务时，使用空格分隔的白名单服务名：

```bash
DEPLOY_SERVICES="author-site viewer-site" scripts/deploy.sh
```

允许的服务名只有 `agent-service`、`author-site`、`screenshot-service`、`viewer-site`。脚本会拒绝其他值，避免环境变量被误用为 Compose 参数。

`screenshot-service` 镜像会先安装 Chromium 和运行时依赖，再复制业务构建产物。这样普通服务代码变更只会刷新最后的业务文件层，避免每次截图服务代码改动都重新下载 Chromium。

为了降低频繁部署时的输入成本，仓库还提供 `scripts/deploy-fast.sh` 作为快捷入口。它只把短名翻译为 `DEPLOY_SERVICES` 后转交给 `scripts/deploy.sh`，不改变同步、构建、启动和自检逻辑：

```bash
scripts/deploy-fast.sh author        # author-site
scripts/deploy-fast.sh agent         # agent-service
scripts/deploy-fast.sh viewer        # viewer-site
scripts/deploy-fast.sh author viewer # author-site + viewer-site
scripts/deploy-fast.sh shot          # screenshot-service
scripts/deploy-fast.sh core          # agent-service + author-site + viewer-site
```

需要确认展开结果但不真正部署时，可使用：

```bash
scripts/deploy-fast.sh --dry-run author viewer
```

### 5.2 手动启动服务

```bash
# 构建（代码变更后需要）
COMPOSE_PARALLEL_LIMIT=1 docker compose build agent-service author-site viewer-site

# 启动
docker compose up -d agent-service author-site viewer-site

# 仅在截图服务代码或 Chromium 镜像依赖变化时更新截图服务
COMPOSE_PARALLEL_LIMIT=1 docker compose build screenshot-service
docker compose up -d screenshot-service

# 等待健康检查通过
docker compose ps

# 验证
curl http://localhost:3200                # author-site
curl http://localhost:3201/health         # agent-service
curl -H "x-internal-token: $INTERNAL_API_TOKEN" \
  http://localhost:3201/internal/backend-providers
curl http://localhost:3202/health         # screenshot-service
curl http://localhost:3300                # viewer-site
```

### 5.3 常见错误排查

| 错误信息              | 原因                   | 解决方案                              |
| --------------------- | ---------------------- | ------------------------------------- |
| `No active session`   | Session 未正确初始化   | 使用新的 sessionId 重试               |
| `Pi Agent error`      | Pi Agent 进程内异常    | 检查 agent-service 日志               |
| `Model not available` | API Key 或模型配置错误 | 检查 `PI_AGENT_*` 环境变量            |
| 管理后台配置重启后丢失 | `/app/data` 未绑定到稳定宿主机目录，或误删了持久数据目录 | 检查 `APP_DATA_DIR` 是否固定，确认 `users.db` 及 WAL 文件存在 |
| 管理后台显示 `INTERNAL_API_TOKEN 未配置` | author-site 容器没有读取到内部接口密钥 | 检查 `.env.docker` 是否包含非空 `INTERNAL_API_TOKEN`，并用部署脚本重建 author-site |
| agent-service 显示不可达或模型供应商回退 | 运行时内存配置尚未恢复，或 author-site 与 agent-service 的 `INTERNAL_API_TOKEN` 不一致 | 重新部署 `author-site agent-service`，确认部署后内部模型配置接口自检通过，并检查 author-site 日志中的 `BackendProviders Sync` |
| `SSE stream timeout`  | LLM API 响应超时       | 检查网络连接或增大 `PI_AGENT_TIMEOUT` |
| `Cannot find module` 或类型声明缺失 | Dockerfile 未复制 workspace 传递依赖或包内缺少声明依赖 | 补齐 Dockerfile 复制清单、`transpilePackages` 和包级依赖 |
| CORS 预检返回 405 | author-site 未在路由处理前响应 OPTIONS | 检查 `CORS_ORIGINS` 是否包含使用端来源，并确认中间件先处理预检 |
| 部署时 SSH 或 HTTP 无响应 | 正式机被 Docker build、Chromium 依赖安装或并发构建压满 | 恢复控制面后终止残留 build/apt 进程；下一次只部署核心服务，截图服务单独低峰更新 |

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
