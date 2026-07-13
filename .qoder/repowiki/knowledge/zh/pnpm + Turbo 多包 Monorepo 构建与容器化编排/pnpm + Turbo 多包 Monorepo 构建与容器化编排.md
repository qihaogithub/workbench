---
kind: build_system
name: pnpm + Turbo 多包 Monorepo 构建与容器化编排
category: build_system
scope:
    - '**'
source_files:
    - package.json
    - turbo.json
    - pnpm-workspace.yaml
    - docker-compose.yml
    - scripts/deploy.sh
    - scripts/docker-build-check.sh
    - docker/agent-service/Dockerfile
    - docker/author-site/Dockerfile
    - scripts/check-contracts.mjs
    - scripts/check-workspace-deploy-preflight.mjs
---

## 1. 系统概览

Workbench 采用 **pnpm workspace + Turbo** 作为多包构建编排核心，配合 Docker Compose 将创作端（author-site）、预览端（viewer-site）、Agent 服务（agent-service）与截图服务（screenshot-service）串联为可本地/容器一键运行的完整平台。根 `package.json` 通过 `corepack pnpm --filter @workbench/<pkg>` 精确调度各子包的 dev/build/lint/test/typecheck 脚本，Turbo 负责跨包任务缓存与依赖顺序（`dependsOn: ["^build"]`）。

## 2. 关键文件与职责

- **顶层编排**
  - `package.json`：定义 `dev`、`dev:services`、`build`、`check:*`、`test:e2e` 等根级脚本，统一入口
  - `turbo.json`：声明 `build`/`lint` 的 `dependsOn: ["^build"]`、`outputs`（`.next/**, dist/**`），禁用 `dev` 缓存并标记持久任务
  - `pnpm-workspace.yaml`：声明 `packages/*` 与 `OPS/CLI` 两个 workspace 目录，并通过 `allowBuilds` 白名单放行原生模块构建
- **容器镜像**
  - `docker-compose.yml`：四服务编排（agent-service:3201、author-site:3200、screenshot-service:3202、viewer-site:3300），通过 `profiles: screenshot` 控制可选服务，`HEALTHCHECK` 暴露 `/health` 探针
  - `docker/{agent-service,author-site,screenshot-service,viewer-site}/Dockerfile`：多阶段构建，builder 阶段复用 pnpm store cache，仅 COPY 必要 package.json 以命中缓存层；运行阶段使用 `node:20-bookworm-slim` 最小镜像
- **部署脚本**
  - `scripts/deploy.sh`：SSH + rsync 全链路部署，支持 `DEPLOY_BUILD_MODE=local|remote`、`DEPLOY_SYNC_MODE=full|targeted`、`COMPOSE_PARALLEL_LIMIT` 并发限制；内置 Workspace Authority 预检、内存/负载保护、镜像导出/加载、健康检查闭环
  - `scripts/docker-build-check.sh`：本地快速验证 Docker 构建，默认串行避免 pnpm 安装竞争
  - `scripts/local-production-preview.mjs`、`scripts/dev-restart.mjs`：本地准生产预览与开发热重启辅助
- **契约校验与预检**
  - `scripts/check-contracts.mjs`、`scripts/check-viewer-contracts.mjs`、`scripts/check-workspace-authority-guards.mjs`、`scripts/check-workspace-deploy-preflight.mjs`：在 CI/部署前校验跨包 API 契约与工作区权限守卫

## 3. 架构与约定

- **包依赖方向**：`shared` → `preview-contract` → `sketch-core` → `sketch-react` → `demo-ui` → `author-site/viewer-site`；`agent-service` 依赖 `knowledge-core/service`、`project-*`、`preview-contract`、`sketch-core`、`shared`。Dockerfile 中显式 COPY 每个依赖包的 `package.json` 以最大化缓存命中率。
- **环境变量分层**：`NEXT_PUBLIC_*` 通过 Dockerfile `ARG` 注入编译期常量；运行时配置通过 `docker-compose.yml` `environment` 注入，`INTERNAL_API_TOKEN` 由 author-site 与 agent-service 共享用于管理后台模型配置同步。
- **数据卷与持久化**：所有服务共享 `${APP_DATA_DIR:-/opt/workbench/data}` 卷，包含 SQLite 用户库、项目快照、发布产物、截图缓存等；viewer-site 以只读挂载 (`:ro`) 防止误写。
- **原生模块处理**：`pnpm-workspace.yaml` 的 `allowBuilds` 白名单 + Dockerfile 中 `rebuild bcrypt better-sqlite3` 确保 native addon 按目标平台编译。

## 4. 开发者应遵循的规则

1. **新增包必须加入 workspace**：在 `pnpm-workspace.yaml` 的 `packages` 列表注册，并在对应 Dockerfile 中 COPY 其 `package.json` 与源码。
2. **脚本命名规范**：子包提供 `build`、`typecheck`、`test`、`lint` 标准脚本，根 `check:<pkg>` 组合调用，保持 `corepack pnpm --filter <pkg> typecheck && test` 模式一致。
3. **Docker 构建缓存优化**：先 COPY 所有依赖 `package.json`，再 `pnpm install`，最后 COPY 源码；使用 `--mount=type=cache,id=workbench-pnpm-store,target=/pnpm/store` 共享 pnpm store。
4. **环境变量安全**：敏感值（`JWT_SECRET`、`INTERNAL_API_TOKEN`、`PI_AGENT_API_KEY`）不得硬编码，全部通过 `.env.docker` 或 compose `environment` 注入；`NEXT_PUBLIC_*` 仅在编译期可见。
5. **部署前必跑**：`pnpm check:all` 覆盖类型检查与测试；`pnpm check:workspace-deploy-preflight` 验证 Workspace Authority 状态与 compose 配置一致性。
6. **截图服务可选**：默认不启用 `screenshot-service`（需 `INCLUDE_SCREENSHOT_SERVICE=true` 或 `--with-screenshot`），因其 Chromium 依赖体积大且对 x86_64 有平台限制。
