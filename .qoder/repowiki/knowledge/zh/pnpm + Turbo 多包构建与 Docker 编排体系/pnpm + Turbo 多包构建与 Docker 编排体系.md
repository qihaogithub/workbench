---
kind: build_system
name: pnpm + Turbo 多包构建与 Docker 编排体系
category: build_system
scope:
    - '**'
source_files:
    - package.json
    - turbo.json
    - pnpm-workspace.yaml
    - docker-compose.yml
    - .github/workflows/check.yml
    - scripts/deploy.sh
    - scripts/docker-build-check.sh
    - docker/author-site/Dockerfile
    - docker/agent-service/Dockerfile
    - docker/viewer-site/Dockerfile
---

## 系统概览

Workbench 采用 **pnpm workspace + Turbo** 作为多包构建编排核心，通过共享契约类型与 docker-compose 将创作端（author-site）、预览端（viewer-site）、Agent 服务、截图服务等子服务串联成可本地或容器一键运行的完整平台。

## 核心工具链

- **包管理**: pnpm@8.15.0（通过 `packageManager` 字段锁定），workspace 声明在 `pnpm-workspace.yaml`，包含 `packages/*` 与 `OPS/CLI`
- **构建缓存**: Turbo 配置在 `turbo.json`，定义 `build` 任务依赖 `^build`（上游产物）并缓存 `.next/**` 与 `dist/**`
- **Node 版本**: 要求 Node ≥18，Docker 镜像基于 `node:20-bookworm-slim`
- **原生模块**: 通过 `pnpm allowBuilds` 显式允许 bcrypt、better-sqlite3、esbuild 等需要编译的包

## 开发工作流

根 `package.json` 提供统一脚本入口：
- `pnpm dev`: 启动 author-site 热重载
- `pnpm dev:services`: 并发启动 author/agent/viewer/screenshot 四个服务
- `pnpm check:all`: 串行执行所有包的 typecheck + test
- `pnpm build`: 仅构建 author-site（Next.js standalone）

每个子包独立维护自己的 `package.json` scripts，根脚本通过 `--filter @workbench/<pkg>` 精确调用。

## 构建与打包

### 本地构建
- Next.js 站点使用 Next.js 内置构建，输出到 `.next/standalone`
- viewer-site 输出到 `out/` 目录供 nginx 静态托管
- TypeScript 项目通过各自 tsconfig 编译，产物位于 `dist/`

### Docker 构建
每个服务有独立 Dockerfile，采用多阶段构建：
- **builder 阶段**: node:20 + pnpm 安装依赖并执行构建
- **runtime 阶段**: 最小化镜像，仅复制构建产物
- 支持通过 ARG 注入 NEXT_PUBLIC_* 环境变量实现构建期配置
- 使用 `--mount=type=cache,id=workbench-pnpm-store,target=/pnpm/store` 共享 pnpm 缓存层

### 部署流程
`scripts/deploy.sh` 提供完整的一键部署能力：
- 支持 `DEPLOY_BUILD_MODE=local|remote` 两种模式
- local 模式：本地构建镜像 → gzip 导出 → rsync 上传 → 远端 load 并启动
- remote 模式：rsync 代码后在远端直接构建（带内存/负载预检保护）
- 支持 `DEPLOY_SYNC_MODE=full|targeted` 增量同步
- 部署前后自动执行 Workspace Authority 静态检查与健康验证

## CI/CD

GitHub Actions (`.github/workflows/check.yml`)：
- 触发条件：push/PR 到 main/master
- 步骤：checkout → pnpm@8.15.0 → node@18 → install → `pnpm check:all` → `pnpm lint:all`
- 超时 30 分钟，无缓存配置（依赖 GitHub Actions cache）

## 关键约定

1. **包间依赖**：通过 pnpm workspace 内部引用，禁止跨包直接 import 源码，必须通过已发布的包名
2. **环境变量**：运行期配置通过 docker-compose environment 注入，构建期配置通过 Dockerfile ARG 注入
3. **健康检查**：每个服务暴露 `/health` 或根路径，docker-compose 配置 healthcheck
4. **数据持久化**：所有服务共享宿主机 `/opt/workbench/data` 卷，通过 `APP_DATA_DIR` 环境变量挂载
5. **服务发现**：容器内通过 docker-compose 网络名访问（如 `http://agent-service:3201`）

## 开发者注意事项

- 新增包需在 `pnpm-workspace.yaml` 中声明
- 修改 Dockerfile 需同步更新 `deploy.sh` 中的 targeted sync 包列表
- 构建期环境变量必须以 `NEXT_PUBLIC_` 前缀才能在浏览器端访问
- 原生模块变更需确保在 Dockerfile 中正确 rebuild
