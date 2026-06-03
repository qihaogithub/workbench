# Docker 部署方案（局域网内部工具）

> 分析日期：2026-05-19
> 状态：已实施
> 场景：局域网内公司内部工具部署，避免过度工程化

---

## 〇、方案审查与修正记录

> 实施前对方案进行了代码级验证，发现以下问题并已修正：

| # | 问题 | 严重程度 | 修正措施 |
|---|------|---------|---------|
| 1 | agent-service Dockerfile 中直接复制 pnpm node_modules 不可行（符号链接丢失 + shared 包 main 指向 .ts 源码） | 🔴 致命 | 改用 esbuild 打包为单文件，运行时镜像中 `npm install` 生产依赖 |
| 2 | author-site 的 `serverExternalPackages` 缺少 `better-sqlite3` 和 `bcrypt` | 🔴 致命 | 已添加到 serverExternalPackages，standalone 输出才能正确处理原生模块 |
| 3 | docker-compose.yml 中 author-site 缺少 `AGENT_SERVICE_URL`（服务端环境变量） | 🔴 致命 | 已添加，Docker 内部用 `http://agent-service:3201` |
| 4 | healthcheck 使用 curl 但 `node:20-bookworm-slim` 无 curl | 🟡 中等 | 改用 Node.js 原生 fetch 做健康检查 |
| 5 | `init-db.js` 的 `DB_PATH` 硬编码，未读取 `DATA_DIR` 环境变量 | 🔴 致命 | 已修正为读取 `DATA_DIR`，从"建议修改"升级为"必须修改" |
| 6 | author-site Dockerfile 运行阶段安装 python3/make/g++ 不必要 | 🟡 中等 | standalone + serverExternalPackages 正确配置后，运行阶段无需编译工具 |
| 7 | `docker-compose.yml` 中 `version: "3.8"` 已弃用 | 🟢 轻微 | 已移除 |
| 8 | viewer-site 无 `public` 目录 | 🟢 轻微 | Dockerfile 中不复制 public |

---

## 〇、方案适用性评估

**本方案针对局域网内部工具场景设计**，遵循 AGENTS.md 中"避免过度工程化设计"原则，做出以下简化决策：

| 决策 | 理由 |
|------|------|
| 不使用 Nginx 反向代理 | 局域网内直接通过 IP:端口 访问，无需域名和 SSL |
| 不使用 Docker Secrets | 局域网内 .env 文件管理即可，无需外部密钥管理服务 |
| 不部署 Prometheus/ELK 等监控 | 内部工具用 docker compose 自带 healthcheck 足够 |
| 不限制容器资源 | 单机局域网部署，无多租户竞争 |
| viewer-site 按需部署 | 如果不需要演示预览功能，可以不启动此容器 |

---

## 一、现状分析

### 1.1 项目能否直接 Docker 部署？

**不能。** 当前项目没有任何 Docker 相关配置文件（无 Dockerfile、docker-compose.yml、.dockerignore），也没有部署脚本或自动化部署流程。项目处于纯开发阶段，仅支持本地 `pnpm dev` 启动。

### 1.2 核心问题：opencode serve 依赖

这是部署的最大阻碍。系统架构依赖一个独立的 **OpenCode Server** 进程：

```
用户浏览器 → author-site(:3200) → agent-service(:3201) → OpenCode Server(:4096)
                                                               ↑
                                                          opencode serve
                                                          需要预装 opencode CLI
```

| 问题 | 说明 |
|------|------|
| **opencode CLI 未预装** | 服务器没有 opencode，无法执行 `opencode serve` |
| **opencode 无官方 Docker 镜像** | opencode 是一个 CLI 工具，没有官方容器化方案 |
| **opencode 安装方式** | `npm install -g opencode`，需要 Node.js 环境 |
| **opencode serve 需要配置** | 启动时需要环境变量：`OPENCODE_API_KEY`、`OPENCODE_API_BASE`、`OPENCODE_MODELS` |

### 1.3 其他需要解决的问题

| 问题 | 严重程度 | 说明 |
|------|---------|------|
| 无 Dockerfile | 高 | 需要从零创建 |
| 原生模块编译 | 高 | `better-sqlite3` 和 `bcrypt` 需要 C++ 编译工具链 |
| 数据持久化 | 高 | SQLite 数据库 + 文件存储需要 Volume 挂载 |
| CORS 配置 | 中 | 默认只允许 localhost，局域网需添加服务器 IP |
| JWT_SECRET 默认值 | 中 | 默认值不安全，需更换 |
| 局域网 IP 配置 | 中 | `NEXT_PUBLIC_*` 环境变量需要使用服务器局域网 IP |

---

## 二、系统架构与依赖关系

### 2.1 服务拓扑

```
┌─────────────────────────────────────────────────────────────────┐
│                     Docker Compose（局域网服务器）               │
│                                                                 │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐       │
│  │ author-site  │   │ viewer-site  │   │agent-service │       │
│  │   :3200      │   │   :3300      │   │   :3201      │       │
│  │ Next.js SSR  │   │ Next.js SSR  │   │ Fastify      │       │
│  │ (必需)       │   │ (可选)       │   │ (必需)       │       │
│  └──────┬───────┘   └──────┬───────┘   └──────┬───────┘       │
│         │                  │                   │               │
│         │  AGENT_SERVICE_URL                   │               │
│         └──────────────────┼───────────────────┘               │
│                            │                                   │
│                            │  OPENCODE_SERVER_URL              │
│                            ▼                                   │
│                  ┌──────────────┐                               │
│                  │opencode-serve│                               │
│                  │   :4096      │                               │
│                  │ opencode CLI │                               │
│                  │ (必需)       │                               │
│                  └──────────────┘                               │
│                                                                 │
│  局域网用户直接通过 http://<服务器IP>:<端口> 访问               │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
   ┌──────────────┐
   │  LLM API     │  外部大模型服务（需要服务器能访问互联网）
   └──────────────┘
```

### 2.2 包间依赖关系

```
shared (零依赖，纯类型) ← 被所有包依赖
agent-client (零运行时依赖) ← 仅被 author-site 依赖
author-site → agent-service (运行时 HTTP 调用)
viewer-site → agent-service + author-site (运行时 HTTP 调用)
agent-service → opencode-serve (运行时 HTTP/SSE 调用)
```

### 2.3 数据存储

| 服务 | 存储类型 | 路径 | 环境变量覆盖 |
|------|---------|------|-------------|
| author-site | SQLite (用户认证) | `{DATA_DIR}/users.db` | `DATA_DIR` |
| author-site | 文件 (项目/会话/快照) | `{DATA_DIR}/projects/`, `sessions/`, `workspaces/`, `snapshots/` | `DATA_DIR` |
| agent-service | 文件 (项目工作空间) | `{DATA_DIR}/projects/` | `DATA_DIR` 或 `PROJECTS_BASE_DIR` |
| agent-service | 临时文件 | `/tmp/opencode-workspaces/` | 系统临时目录 |
| opencode-serve | 会话数据 | opencode 内部管理 | — |

**关键发现**：author-site 和 agent-service 共享同一套 `data/` 目录，必须挂载到同一个 Volume。

---

## 三、部署方案设计

### 3.1 容器拆分策略

采用 **3 容器（核心）+ 1 可选容器** 方案：

| 容器 | 基础镜像 | 端口 | 必要性 | 职责 |
|------|---------|------|--------|------|
| `opencode-serve` | node:20-bookworm-slim | 4096 | 必需 | OpenCode HTTP Server |
| `agent-service` | node:20-bookworm-slim | 3201 | 必需 | Agent 管理服务 |
| `author-site` | node:20-bookworm-slim | 3200 | 必需 | 创作端前端 + API |
| `viewer-site` | node:20-bookworm-slim | 3300 | 可选 | 预览端前端（如不需要演示预览可不部署） |

### 3.2 opencode-serve 容器化方案

这是最关键的容器。有两种方案：

#### 方案 A：独立容器运行 opencode serve（推荐）

```dockerfile
FROM node:20-bookworm-slim

RUN npm install -g opencode

ENV OPENCODE_API_KEY=""
ENV OPENCODE_API_BASE=""
ENV OPENCODE_MODELS=""

EXPOSE 4096

CMD ["opencode", "serve", "--port", "4096", "--hostname", "0.0.0.0"]
```

**优点**：
- 容器化隔离，不污染宿主机
- 可独立升级 opencode 版本
- 与 agent-service 通过 Docker 网络通信

**注意事项**：
- opencode serve 的会话数据持久化需要验证（是否需要 Volume）
- opencode 内部可能使用文件系统存储会话，需要确认数据目录并挂载

#### 方案 B：将 opencode 安装到 agent-service 容器中

```dockerfile
FROM node:20-bookworm-slim

# 安装 opencode
RUN npm install -g opencode

# 安装项目依赖
WORKDIR /app
COPY packages/agent-service/ ./packages/agent-service/
# ... 其他依赖

# 使用 supervisord 或启动脚本同时运行两个进程
```

**缺点**：一个容器运行两个进程，违反容器最佳实践，不推荐。

### 3.3 author-site 容器化要点

author-site 有两个原生模块需要编译：

- **better-sqlite3**：C++ SQLite 绑定，需要 `python3`、`make`、`g++`
- **bcrypt**：C++ 加密绑定，需要 `make`、`g++`

**解决方案**：使用多阶段构建，编译阶段安装构建工具，运行阶段只复制编译产物。

### 3.4 数据持久化

```yaml
volumes:
  app-data:
    driver: local
```

所有服务共享同一个 Volume，挂载到各自的 `/app/data` 目录：

| 容器 | 挂载点 | 用途 |
|------|--------|------|
| author-site | `/app/data` | users.db + 项目/会话/快照文件 |
| agent-service | `/app/data` | 项目工作空间（与 author-site 共享） |
| opencode-serve | 待确认 | opencode 会话数据（需验证是否需要持久化） |

---

## 四、详细实现方案

### 4.1 目录结构

```
opencode-workbench/
├── docker/
│   ├── opencode-serve/
│   │   └── Dockerfile
│   ├── agent-service/
│   │   └── Dockerfile
│   ├── author-site/
│   │   └── Dockerfile
│   └── viewer-site/
│       └── Dockerfile
├── docker-compose.yml
├── .dockerignore
└── .env.docker          # Docker 部署专用环境变量
```

### 4.2 docker-compose.yml 核心结构

```yaml
version: "3.8"

services:
  opencode-serve:
    build:
      context: .
      dockerfile: docker/opencode-serve/Dockerfile
    ports:
      - "4096:4096"
    environment:
      - OPENCODE_API_KEY=${OPENCODE_API_KEY}
      - OPENCODE_API_BASE=${OPENCODE_API_BASE}
      - OPENCODE_MODELS=${OPENCODE_MODELS}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4096/global/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  agent-service:
    build:
      context: .
      dockerfile: docker/agent-service/Dockerfile
    ports:
      - "3201:3201"
    environment:
      - PORT=3201
      - HOST=0.0.0.0
      - OPENCODE_SERVER_URL=http://opencode-serve:4096
      - CORS_ORIGINS=${CORS_ORIGINS:-http://localhost:3200,http://localhost:3300}
      - DATA_DIR=/app/data
    volumes:
      - app-data:/app/data
    depends_on:
      opencode-serve:
        condition: service_healthy
    restart: unless-stopped

  author-site:
    build:
      context: .
      dockerfile: docker/author-site/Dockerfile
    ports:
      - "3200:3200"
    environment:
      - AGENT_SERVICE_URL=http://agent-service:3201
      - NEXT_PUBLIC_AGENT_SERVICE_URL=${NEXT_PUBLIC_AGENT_SERVICE_URL:-http://localhost:3201}
      - JWT_SECRET=${JWT_SECRET:-change-this-in-production}
      - DATA_DIR=/app/data
    volumes:
      - app-data:/app/data
    depends_on:
      - agent-service
    restart: unless-stopped

  viewer-site:
    build:
      context: .
      dockerfile: docker/viewer-site/Dockerfile
    ports:
      - "3300:3300"
    environment:
      - NEXT_PUBLIC_AGENT_SERVICE_URL=${NEXT_PUBLIC_AGENT_SERVICE_URL:-http://localhost:3201}
      - NEXT_PUBLIC_WEB_URL=${NEXT_PUBLIC_WEB_URL:-http://localhost:3200}
    depends_on:
      - agent-service
    profiles:
      - viewer
    restart: unless-stopped

volumes:
  app-data:
```

> **局域网访问说明**：
> - `NEXT_PUBLIC_AGENT_SERVICE_URL` 需要改为 `http://<服务器局域网IP>:3201`，因为这是浏览器端使用的地址
> - `NEXT_PUBLIC_WEB_URL` 需要改为 `http://<服务器局域网IP>:3200`
> - `CORS_ORIGINS` 需要包含 `http://<服务器局域网IP>:3200` 和 `http://<服务器局域网IP>:3300`
> - viewer-site 使用 `profiles: [viewer]`，默认不启动，需要时用 `docker compose --profile viewer up -d` 启动

### 4.3 各服务 Dockerfile 设计

#### opencode-serve/Dockerfile

```dockerfile
FROM node:20-bookworm-slim

RUN npm install -g opencode

EXPOSE 4096

CMD ["opencode", "serve", "--port", "4096", "--hostname", "0.0.0.0"]
```

#### agent-service/Dockerfile（多阶段构建）

```dockerfile
# 阶段1：安装依赖 + 编译
FROM node:20-bookworm-slim AS builder

RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/agent-service/package.json ./packages/agent-service/

RUN pnpm install --frozen-lockfile

COPY packages/shared/ ./packages/shared/
COPY packages/agent-service/ ./packages/agent-service/

RUN pnpm --filter @opencode-workbench/agent-service build

# 阶段2：运行时
FROM node:20-bookworm-slim

WORKDIR /app

COPY --from=builder /app/packages/agent-service/dist ./dist
COPY --from=builder /app/packages/agent-service/node_modules ./node_modules
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3201

CMD ["node", "dist/server.js"]
```

#### author-site/Dockerfile（多阶段构建，含原生模块编译）

```dockerfile
# 阶段1：安装依赖（含原生模块编译）
FROM node:20-bookworm-slim AS builder

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/agent-client/package.json ./packages/agent-client/
COPY packages/author-site/package.json ./packages/author-site/

RUN pnpm install --frozen-lockfile

COPY packages/shared/ ./packages/shared/
COPY packages/agent-client/ ./packages/agent-client/
COPY packages/author-site/ ./packages/author-site/

RUN pnpm --filter @opencode-workbench/author-site build

# 阶段2：运行时
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/packages/author-site/.next/standalone ./
COPY --from=builder /app/packages/author-site/.next/static ./packages/author-site/.next/static
COPY --from=builder /app/packages/author-site/public ./packages/author-site/public

EXPOSE 3200

CMD ["node", "packages/author-site/server.js"]
```

> **注意**：author-site 的 Dockerfile 需要使用 Next.js `standalone` 输出模式。当前 `next.config.js` 未配置 `output: 'standalone'`，这是必须添加的配置项。

#### viewer-site/Dockerfile

```dockerfile
# 阶段1：构建
FROM node:20-bookworm-slim AS builder

RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/viewer-site/package.json ./packages/viewer-site/

RUN pnpm install --frozen-lockfile

COPY packages/shared/ ./packages/shared/
COPY packages/viewer-site/ ./packages/viewer-site/

RUN pnpm --filter @opencode-workbench/viewer-site build

# 阶段2：运行时
FROM node:20-bookworm-slim

WORKDIR /app

COPY --from=builder /app/packages/viewer-site/.next/standalone ./
COPY --from=builder /app/packages/viewer-site/.next/static ./packages/viewer-site/.next/static
COPY --from=builder /app/packages/viewer-site/public ./packages/viewer-site/public

EXPOSE 3300

CMD ["node", "packages/viewer-site/server.js"]
```

### 4.4 .env.docker 环境变量模板

```bash
# === LLM 配置（必填）===
OPENCODE_API_KEY=sk-your-api-key-here
OPENCODE_API_BASE=https://api.anthropic.com
OPENCODE_MODELS=claude-3-5-sonnet-20240620,claude-opus-4-5

# === 局域网访问地址（必填，替换为服务器实际 IP）===
# 这些地址是浏览器端使用的，必须是局域网用户能访问到的地址
NEXT_PUBLIC_AGENT_SERVICE_URL=http://192.168.x.x:3201
NEXT_PUBLIC_WEB_URL=http://192.168.x.x:3200

# === CORS（必填，包含局域网访问地址）===
CORS_ORIGINS=http://192.168.x.x:3200,http://192.168.x.x:3300,http://localhost:3200,http://localhost:3300

# === 安全配置 ===
# JWT_SECRET 用于用户认证，局域网内可简单设置但不要留空
JWT_SECRET=change-this-to-a-random-string

# === 日志级别（可选）===
# LOG_LEVEL=info
```

---

## 五、已完成的代码修改

> 以下修改已在实施过程中完成：

### 5.1 已完成的必须修改

| 序号 | 修改项 | 文件 | 状态 |
|------|--------|------|------|
| 1 | 添加 `output: 'standalone'` | `packages/author-site/next.config.js` | ✅ 已完成 |
| 2 | 添加 `output: 'standalone'` | `packages/viewer-site/next.config.js` | ✅ 已完成 |
| 3 | 添加 `better-sqlite3`、`bcrypt` 到 `serverExternalPackages` | `packages/author-site/next.config.js` | ✅ 已完成 |
| 4 | `init-db.js` 读取 `DATA_DIR` 环境变量 | `packages/author-site/scripts/init-db.js` | ✅ 已完成 |
| 5 | 添加 esbuild 打包脚本 `build:docker` | `packages/agent-service/package.json` | ✅ 已完成 |
| 6 | 添加 esbuild 开发依赖 | `packages/agent-service/package.json` | ✅ 已完成 |

### 5.2 审查中发现的额外问题（已修正）

| 序号 | 修改项 | 说明 |
|------|--------|------|
| 7 | docker-compose.yml 添加 `AGENT_SERVICE_URL` | author-site 服务端也需要连接 agent-service |
| 8 | healthcheck 改用 Node.js 原生 fetch | slim 镜像无 curl |
| 9 | agent-service Dockerfile 改用 esbuild 打包 | 原方案复制 pnpm node_modules 不可行 |
| 10 | author-site Dockerfile 运行阶段移除编译工具 | standalone + serverExternalPackages 正确配置后无需编译工具 |

---

## 六、部署流程

### 6.1 首次部署

```bash
# 1. 克隆代码
git clone <repo-url> && cd opencode-workbench

# 2. 配置环境变量
cp .env.docker .env
# 编辑 .env，填写 OPENCODE_API_KEY、OPENCODE_API_BASE、OPENCODE_MODELS、JWT_SECRET

# 3. 构建并启动
docker compose up -d --build

# 4. 初始化数据库（首次部署）
docker compose exec author-site node scripts/init-db.js

# 5. 验证服务
curl http://localhost:3200    # author-site
curl http://localhost:3201/health  # agent-service
curl http://localhost:3300    # viewer-site
curl http://localhost:4096/global/health  # opencode-serve
```

### 6.2 更新部署

```bash
# 拉取最新代码
git pull

# 重新构建并启动（数据卷不会丢失）
docker compose up -d --build

# 如果数据库 schema 有变更
docker compose exec author-site node scripts/init-db.js
```

### 6.3 数据备份

```bash
# 备份整个数据卷
docker run --rm -v opencode-workbench_app-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/data-backup-$(date +%Y%m%d).tar.gz -C /data .

# 恢复
docker run --rm -v opencode-workbench_app-data:/data -v $(pwd):/backup \
  alpine sh -c "cd /data && tar xzf /backup/data-backup-XXXXXXXX.tar.gz"
```

---

## 七、opencode-serve 容器化的待验证项

以下问题需要在实际部署前验证，因为 opencode 是第三方工具，其内部行为不完全透明：

| 序号 | 验证项 | 风险 | 验证方法 |
|------|--------|------|---------|
| 1 | `opencode serve` 是否支持 Docker 内运行 | 中 | 在容器中启动并测试 API 调用 |
| 2 | 会话数据是否持久化到文件系统 | 高 | 检查容器重启后会话是否丢失 |
| 3 | 会话数据存储路径 | 高 | 运行后检查容器内文件变化 |
| 4 | `opencode serve` 健康检查端点 | 低 | 已知有 `/global/health`，需确认可用性 |
| 5 | opencode 是否需要特殊系统依赖 | 中 | 在 slim 镜像中测试安装和运行 |
| 6 | 多会话并发性能 | 中 | 压测验证 |
| 7 | `opencode serve` 的 graceful shutdown | 低 | 发送 SIGTERM 后观察行为 |

**验证脚本建议**：

```bash
# 快速验证 opencode serve 容器化可行性
docker run -d --name opencode-test \
  -e OPENCODE_API_KEY=your-key \
  -e OPENCODE_API_BASE=https://api.anthropic.com \
  -e OPENCODE_MODELS=claude-3-5-sonnet-20240620 \
  -p 4096:4096 \
  node:20-bookworm-slim \
  sh -c "npm install -g opencode && opencode serve --port 4096 --hostname 0.0.0.0"

# 等待启动
sleep 10

# 测试健康检查
curl http://localhost:4096/global/health

# 测试创建会话
curl -X POST http://localhost:4096/session \
  -H "Content-Type: application/json" \
  -d '{"title":"test","model":"claude-3-5-sonnet-20240620"}'

# 清理
docker rm -f opencode-test
```

---

## 八、局域网部署注意事项

### 8.1 网络访问

| 场景 | 访问方式 |
|------|---------|
| 创作端 | `http://<服务器IP>:3200` |
| 预览端（如需） | `http://<服务器IP>:3300` |
| Agent 服务（内部） | `http://<服务器IP>:3201`（一般不需要直接访问） |

### 8.2 LLM API 网络要求

opencode-serve 需要访问外部 LLM API（如 Anthropic、OpenAI），有两种网络场景：

| 场景 | 解决方案 |
|------|---------|
| 服务器可直连互联网 | 直接配置 `OPENCODE_API_BASE`，无需额外处理 |
| 服务器无法直连互联网 | 需要配置 HTTP 代理，或在局域网内部署 LLM API 代理/中转服务 |

### 8.3 数据安全

局域网内部工具的安全要求较低，但建议：

| 措施 | 说明 |
|------|------|
| JWT_SECRET 不要留空 | 即使局域网内也需要基本的用户认证 |
| LLM API Key 妥善保管 | 写在 .env 文件中，不要提交到代码仓库 |
| 定期备份数据 | 参考第六节备份方案 |

### 8.4 日常运维

```bash
# 查看所有服务状态
docker compose ps

# 查看某个服务日志
docker compose logs -f author-site
docker compose logs -f agent-service
docker compose logs -f opencode-serve

# 重启某个服务
docker compose restart agent-service

# 更新代码后重新部署
git pull && docker compose up -d --build

# 停止所有服务
docker compose down

# 停止并删除数据（谨慎！）
docker compose down -v
```

---

## 九、总结

### 9.1 当前不可直接部署的原因

1. **无 Docker 配置文件** — 需从零创建
2. **opencode 未安装** — 服务器无 opencode CLI，`opencode serve` 无法启动
3. **Next.js 未配置 standalone 输出** — Docker 镜像会过大
4. **数据持久化未规划** — 需要 Volume 挂载方案

### 9.2 部署工作量评估

| 任务 | 复杂度 | 说明 |
|------|--------|------|
| 创建 Dockerfile（3~4个） | 中 | 多阶段构建，需处理原生模块 |
| 创建 docker-compose.yml | 低 | 标准编排 |
| opencode-serve 容器化 | 中 | 需验证第三方工具的容器兼容性 |
| 数据持久化配置 | 低 | 单 Volume 挂载 |
| 环境变量配置 | 低 | 创建 .env 模板，填写局域网 IP |
| Next.js standalone 配置 | 低 | 添加一行配置 |
| 验证与测试 | 中 | 端到端功能验证 |

### 9.3 推荐实施顺序

1. **验证 `opencode serve` 容器化可行性**（最高优先级，决定方案可行性）
2. 添加 Next.js `output: 'standalone'` 配置
3. 创建各服务 Dockerfile
4. 创建 docker-compose.yml + .env 模板
5. 端到端测试

### 9.4 局域网场景下的替代方案

如果 Docker 对运维来说过于复杂，还有一个更简单的方案：**直接在服务器上安装运行**。

```bash
# 1. 安装 Node.js 20+
# 2. 安装 pnpm
npm install -g pnpm@8.15.0
# 3. 安装 opencode
npm install -g opencode
# 4. 克隆代码
git clone <repo-url> && cd opencode-workbench
pnpm install
# 5. 启动 opencode serve（后台运行）
OPENCODE_API_KEY=xxx OPENCODE_API_BASE=xxx OPENCODE_MODELS=xxx \
  nohup opencode serve --port 4096 --hostname 0.0.0.0 &
# 6. 构建并启动各服务
pnpm build
# 7. 使用 pm2 管理进程
npm install -g pm2
pm2 start "pnpm --filter @opencode-workbench/agent-service start" --name agent-service
pm2 start "pnpm --filter @opencode-workbench/author-site start" --name author-site
pm2 start "pnpm --filter @opencode-workbench/viewer-site start" --name viewer-site
pm2 save && pm2 startup
```

**Docker vs 直装对比**：

| 维度 | Docker | 直装（pm2） |
|------|--------|-------------|
| 环境隔离 | 强（容器隔离） | 弱（共享系统环境） |
| 部署复杂度 | 中（需写 Dockerfile） | 低（直接安装运行） |
| opencode 管理 | 容器内安装，干净 | 全局安装，可能版本冲突 |
| 运维门槛 | 需要 Docker 知识 | 只需基本 Linux 知识 |
| 可复现性 | 强（镜像一致） | 弱（依赖系统环境） |
| 适合场景 | 多环境部署、团队协作 | 单机快速部署 |

> **建议**：如果服务器只有一台且团队小，直装 + pm2 更简单；如果希望环境可复现或未来可能迁移，选 Docker。
