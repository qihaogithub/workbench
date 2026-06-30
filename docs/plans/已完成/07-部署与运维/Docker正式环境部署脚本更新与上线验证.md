# Docker 正式环境部署脚本更新与上线验证

## 背景

项目通过 Docker Compose 部署到正式环境，但部署脚本和镜像构建清单已落后于当前 monorepo 包依赖。当前任务需要检查部署相关功能，修复部署链路，并完成线上部署与可用性验证。

## 目标

- 确认 Docker Compose、Dockerfile、部署脚本与当前 workspace 包结构一致。
- 修复会导致正式环境构建、启动或健康检查失败的问题。
- 执行最小充分的本地验证和线上部署后自检。
- 更新长期项目文档中的部署说明。

## 范围

- `docker-compose.yml`
- `docker/*/Dockerfile`
- `docker/viewer-site/nginx.conf`
- `scripts/deploy.sh`
- 部署相关项目文档

不处理当前工作区中既有的数据目录、截图输出、E2E 测试文件等无关脏改动。

## 方案

1. 对照当前 package 依赖检查各 Dockerfile 构建阶段复制的 workspace 包。
2. 更新部署脚本，使环境变量、远程同步、构建启动、自检与当前服务拓扑一致。
3. 本地运行与部署相关的构建/类型检查验证，必要时直接用 Docker build 验证镜像。
4. 通过部署脚本上线，并用远程容器状态、健康接口和外部访问地址验证。

## 任务清单

- [x] 读取现有部署文档、Compose、Dockerfile 和部署脚本。
- [x] 识别 Dockerfile workspace 包复制清单滞后的问题。
- [x] 更新 Dockerfile/部署脚本。
- [x] 运行本地验证。
- [x] 更新 `docs/项目文档/` 中部署相关文档。
- [x] 执行正式环境部署。
- [x] 验证线上服务可用。

## 进度记录

- 2026-06-29 10:40：确认当前会话未暴露 `codegraph_*` 工具，改用文件读取和 `rg` 审计部署范围。
- 2026-06-29 10:45：确认 `author-site` 当前依赖 `agent-client`、`demo-ui`、`knowledge-service`、`project-core`、`project-scaffold`、`shared`，但 Dockerfile 只复制了部分包。
- 2026-06-29 10:45：确认 `viewer-site` 当前依赖 `demo-ui` 和 `shared`，但 Dockerfile 未复制 `demo-ui`。
- 2026-06-29 10:45：确认 `agent-service` 当前依赖 `knowledge-core`、`knowledge-service`、`shared`，但 Dockerfile 未复制知识库包。
- 2026-06-29 10:55：已补齐 agent、author、viewer 三个 Dockerfile 的 workspace 包复制清单；viewer 镜像新增构建期 `NEXT_PUBLIC_AGENT_SERVICE_URL` 和 `NEXT_PUBLIC_DATA_BASE` 注入。
- 2026-06-29 10:55：部署脚本改为完整透传 `.env.docker` 中的键值，避免新增环境变量遗漏；同步排除 `data/`、`.pnpm-store/` 和 `test/`，降低把本地运行数据带到线上风险。
- 2026-06-29 10:55：author-site CORS 来源改为读取 `CORS_ORIGINS`，保留本地 viewer 默认来源，并补齐 OPTIONS 预检响应。
- 2026-06-29 11:05：本地 `bash -n scripts/deploy.sh` 通过，`docker compose --env-file .env.docker config` 通过，author/viewer/agent 类型检查通过，`check:viewer` 通过。
- 2026-06-29 11:05：author-site Jest 运行到 52/55 个测试套件通过，剩余 3 个套件失败原因为本机 Node 24 与 Node 20 编译的 `better-sqlite3` 原生模块 ABI 不匹配；该失败与本次代码改动无直接关系。
- 2026-06-29 11:08：本机 Docker daemon 不可用，无法在本机执行镜像构建；后续改为在正式机部署过程中验证 Docker build。
- 2026-06-29 11:20：首次远程部署在 `viewer-site` 镜像构建阶段失败，根因为容器最小 workspace 中 `demo-ui` 缺少 `markdown-it` 类型声明依赖；已补到 `packages/demo-ui/package.json`。
- 2026-06-29 11:20：根据首次同步日志，继续收紧部署同步排除规则，排除 `.tmp/`、`tmp/`、根级 png、包级 `dist/`、`tsconfig.tsbuildinfo`、OPS/CLI 构建产物和 node_modules。
- 2026-06-29 11:35：第二次远程部署通过 viewer 镜像构建，但 author-site `next build` 在 `assistant-message.tsx` 的 `Map.get(index)` 类型推断处失败；已将顺序表构造显式声明为 `Map<number, number>`。
- 2026-06-29 11:55：第三次远程部署构建并启动成功，部署脚本自检确认 agent、author、screenshot、viewer 四个容器运行正常，author/agent/screenshot 健康检查通过，viewer HTTP 检查通过。
- 2026-06-29 12:05：外部访问验证确认 `author-site:3200`、`agent-service:3201/health`、`screenshot-service:3202/health`、`viewer-site:3300` 均可访问；发现 author-site 对使用端的真实 OPTIONS 预检仍返回 405。
- 2026-06-29 12:10：将 author-site CORS 预检处理提前到认证和路由分支之前；重新部署后外部 `OPTIONS /api/templates` 返回 `204 No Content`，并带有 `Access-Control-Allow-Origin: http://10.130.33.131:3300`。
- 2026-06-29 12:18：补齐 `.env.docker` 中的 `NEXT_PUBLIC_SCREENSHOT_SERVICE_URL=http://10.130.33.131:3202`，避免正式环境构建期 public env 落到 localhost 默认值。
- 2026-06-29 12:22：最终重新部署成功，部署脚本自检通过；外部验证再次确认 author、viewer、agent、screenshot 可访问，CORS 预检返回 `204 No Content`。
- 2026-06-29 12:25：同步更新 Docker 部署方案与使用端 CORS 配置文档，任务完成。

## 验证方式

- 本地：运行部署相关包的类型检查/构建检查。
- Docker：至少验证受影响镜像能够构建。
- 线上：检查 Docker Compose 服务状态、健康检查、端口 HTTP 响应。

## 验证结果

- `bash -n scripts/deploy.sh`：通过。
- `docker compose --env-file .env.docker config`：通过。
- `corepack pnpm --filter @opencode-workbench/author-site typecheck`：通过。
- `corepack pnpm --filter @opencode-workbench/viewer-site typecheck`：通过。
- `corepack pnpm --filter @opencode-workbench/agent-service typecheck`：通过。
- `corepack pnpm check:viewer`：通过。
- `corepack pnpm --filter @opencode-workbench/viewer-site build`：通过。
- `corepack pnpm --filter @opencode-workbench/author-site build`：通过；首次本地构建因沙箱 DNS 无法访问 Google Fonts 失败，放开网络后构建通过。
- `corepack pnpm --filter @opencode-workbench/author-site test -- --runInBand`：52/55 个测试套件通过，3 个失败为本机 Node 24 与现有 Node 20 `better-sqlite3` 原生模块 ABI 不匹配。
- `bash scripts/deploy.sh`：最终部署成功，脚本自检通过。
- 外部线上验证：`http://10.130.33.131:3200` 返回 200，`http://10.130.33.131:3300` 返回 200，`http://10.130.33.131:3201/health` 返回 `status: ok`，`http://10.130.33.131:3202/health` 返回 `status: ok` 且浏览器 `ready`。
- CORS 验证：带 `Origin: http://10.130.33.131:3300` 访问 author-site API 返回允许来源；`OPTIONS /api/templates` 返回 `204 No Content`。
- 部署环境验证：`docker compose --env-file .env.docker config` 确认 `NEXT_PUBLIC_SCREENSHOT_SERVICE_URL` 解析为 `http://10.130.33.131:3202`；部署脚本已重新生成并上传 `.deploy.env`。

## 最终状态

已完成。正式环境 Docker 部署链路已更新并上线验证通过，访问地址为 `http://10.130.33.131:3200`。

## 风险与待确认事项

- 正式环境部署依赖 SSH、Docker 与远程镜像源，后续仍可能受网络和服务器状态影响。
- 当前工作区存在大量与本任务无关的脏改动，本次未回滚或整理；部署脚本已排除 `data/`、测试目录和常见构建产物，降低误同步风险。
