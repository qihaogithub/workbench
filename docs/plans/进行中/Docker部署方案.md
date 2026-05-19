# Docker 部署方案

> 分析日期：2026-05-19
> 状态：进行中

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
| CORS 配置 | 中 | 默认只允许 localhost，生产环境需更新 |
| JWT_SECRET 硬编码 | 中 | 默认值不安全，生产环境必须更换 |
| 无 .env 文件管理 | 中 | agent-service 没有独立的 .env 文件 |
| 无 Nginx/反向代理 | 低 | 生产环境建议加 Nginx |
| 无健康检查脚本 | 低 | 各服务有 /health 端点但未编排 |

---

## 二、系统架构与依赖关系

### 2.1 服务拓扑

```
┌─────────────────────────────────────────────────────────────────┐
│                        Docker Compose                           │
│                                                                 │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐       │
│  │ author-site  │   │ viewer-site  │   │agent-service │       │
│  │   :3200      │   │   :3300      │   │   :3201      │       │
│  │ Next.js SSR  │   │ Next.js SSR  │   │ Fastify      │       │
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
│                  └──────────────┘                               │
│                                                                 │
│  ┌──────────────┐                                               │
│  │   Nginx      │  可选：反向代理 + SSL                         │
│  │   :80/:443   │                                               │
│  └──────────────┘                                               │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
   ┌──────────────┐
   │  LLM API     │  外部大模型服务（Anthropic/OpenAI/等）
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

采用 **4 容器 + 1 可选容器** 方案：

| 容器 | 基础镜像 | 端口 | 职责 |
|------|---------|------|------|
| `opencode-serve` | node:20-bookworm-slim | 4096 | OpenCode HTTP Server |
| `agent-service` | node:20-bookworm-slim | 3201 | Agent 管理服务 |
| `author-site` | node:20-bookworm-slim | 3200 | 创作端前端 + API |
| `viewer-site` | node:20-bookworm-slim | 3300 | 预览端前端 |
| `nginx` (可选) | nginx:alpine | 80/443 | 反向代理 + SSL |

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
      - CORS_ORIGINS=http://localhost:3200,http://localhost:3300
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
      - NEXT_PUBLIC_AGENT_SERVICE_URL=http://localhost:3201
      - JWT_SECRET=${JWT_SECRET}
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
      - NEXT_PUBLIC_AGENT_SERVICE_URL=http://localhost:3201
      - NEXT_PUBLIC_WEB_URL=http://localhost:3200
    depends_on:
      - agent-service
    restart: unless-stopped

volumes:
  app-data:
```

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

# === 安全配置（必填）===
JWT_SECRET=change-this-to-a-strong-random-string

# === 服务端口（可选，默认值如下）===
# AUTHOR_SITE_PORT=3200
# AGENT_SERVICE_PORT=3201
# VIEWER_SITE_PORT=3300
# OPENCODE_SERVE_PORT=4096

# === 日志级别（可选）===
# LOG_LEVEL=info

# === CORS（可选，Docker 内部已配置，仅当使用自定义域名时需要修改）===
# CORS_ORIGINS=http://your-domain.com

# === 数据目录（可选，默认使用 Docker Volume）===
# DATA_DIR=/app/data
```

---

## 五、需要修改的代码项

以下列出部署前必须或建议修改的代码配置，**不涉及业务逻辑修改**，仅是配置层面的调整：

### 5.1 必须修改

| 序号 | 修改项 | 文件 | 说明 |
|------|--------|------|------|
| 1 | 添加 `output: 'standalone'` | `packages/author-site/next.config.js` | Next.js standalone 输出模式，Docker 部署必需，否则镜像体积过大 |
| 2 | 添加 `output: 'standalone'` | `packages/viewer-site/next.config.js` | 同上 |
| 3 | `OPENCODE_SERVER_URL` 默认值 | `packages/agent-service/src/backends/opencode-http.ts:6` | 当前硬编码为 `http://localhost:4096`，Docker 环境中应为 `http://opencode-serve:4096`，需通过环境变量覆盖（已支持，但默认值不适用于 Docker） |

### 5.2 建议修改

| 序号 | 修改项 | 文件 | 说明 |
|------|--------|------|------|
| 4 | agent-service 添加 .env 支持 | `packages/agent-service/src/utils/config.ts` | 当前只读 `process.env`，建议添加 dotenv 加载，方便 Docker 环境变量管理 |
| 5 | 数据库初始化自动化 | `packages/author-site/scripts/init-db.js` | 当前 `DB_PATH` 硬编码为相对路径，需适配 Docker Volume 路径 |
| 6 | 健康检查端点统一 | 各服务 | agent-service 已有 `/health`，author-site 和 viewer-site 依赖 Next.js 默认行为，建议添加显式健康检查 |

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

## 八、生产环境增强建议

### 8.1 Nginx 反向代理（推荐）

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://author-site:3200;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /api/agent/ {
        proxy_pass http://agent-service:3201/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /viewer/ {
        proxy_pass http://viewer-site:3300/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 8.2 安全加固

| 措施 | 说明 |
|------|------|
| 不暴露内部端口 | 只暴露 Nginx 的 80/443，其他服务端口仅 Docker 内部可达 |
| JWT_SECRET 强随机 | 使用 `openssl rand -hex 32` 生成 |
| API Key 加密存储 | 使用 Docker Secrets 或外部密钥管理 |
| 限制资源 | 为每个容器设置 `mem_limit` 和 `cpus` |
| 日志集中管理 | 配置 Docker 日志驱动，统一收集 |

### 8.3 监控与告警

| 监控项 | 方式 |
|--------|------|
| 服务存活 | Docker healthcheck + 外部探针 |
| 资源使用 | cAdvisor / Prometheus |
| 应用日志 | ELK / Loki |
| 业务指标 | agent-service `/health` 端点中的 `agents` 和 `uptime` |

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
| 创建 Dockerfile（4个） | 中 | 多阶段构建，需处理原生模块 |
| 创建 docker-compose.yml | 低 | 标准编排 |
| opencode-serve 容器化 | 中 | 需验证第三方工具的容器兼容性 |
| 数据持久化配置 | 低 | 单 Volume 挂载 |
| 环境变量管理 | 低 | 创建 .env 模板 |
| Next.js standalone 配置 | 低 | 添加一行配置 |
| Nginx 反向代理 | 低 | 可选，标准配置 |
| 验证与测试 | 中 | 端到端功能验证 |

### 9.3 推荐实施顺序

1. 验证 `opencode serve` 容器化可行性（最高优先级，决定方案可行性）
2. 添加 Next.js `output: 'standalone'` 配置
3. 创建各服务 Dockerfile
4. 创建 docker-compose.yml + .env 模板
5. 端到端测试
6. （可选）添加 Nginx 反向代理
