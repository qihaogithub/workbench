---
covers:
  - docker-compose.yml
  - docker/knowledge-service/Dockerfile
  - docker/agent-service/Dockerfile
  - docker/author-site/Dockerfile
  - docker/screenshot-service/Dockerfile
  - docker/viewer-site/Dockerfile
  - scripts/deploy.sh
  - scripts/deploy-fast.sh
---

# 测试环境 Docker 部署

> 更新日期：2026-08-27
> 适用主机：`qihao@10.130.33.131`（Ubuntu 24.04，x86_64，已安装 1Panel）
> 状态：已验证可用

本文是测试环境的操作手册。通用 Compose 架构、数据目录约束和服务资源预算见 [Docker 部署方案](./03_Docker部署方案.md)；本文只记录测试机特有的路径、代理和高效部署流程。

## 一、测试机约定

| 项目 | 约定 |
|---|---|
| 项目目录 | `/home/qihao/workbench` |
| 持久化数据 | `/opt/opencode-workbench/data` |
| 创作端 | `http://10.130.33.131:3200` |
| Agent 健康检查 | `http://10.130.33.131:3201/health` |
| 截图服务健康检查 | `http://10.130.33.131:3202/health` |
| 使用端 | `http://10.130.33.131:3300` |
| Knowledge service | 仅 Compose 网络内暴露 `3203` |
| Docker 构建代理 | `http://10.130.33.131:48179`（主机上的代理服务） |

`/opt/1panel/apps/figma-mirror` 是另一套历史应用目录，不是 Workbench 部署目录。不要把本项目同步到该目录，也不要停止其中的容器。

## 二、首次部署或目录重建

首次部署使用用户可写目录，避免依赖 root 权限。先确认 SSH、Docker 和数据目录：

```bash
ssh -i ~/.ssh/figma-mirror-ai-agent qihao@10.130.33.131 \
  'docker compose version && test -d /opt/opencode-workbench/data'
ssh -i ~/.ssh/figma-mirror-ai-agent qihao@10.130.33.131 \
  'mkdir -p /home/qihao/workbench'
```

本地 `.env.docker` 必须使用测试机地址和持久数据目录：

```dotenv
APP_DATA_DIR=/opt/opencode-workbench/data
SERVER_IP=10.130.33.131
NEXT_PUBLIC_SCREENSHOT_SERVICE_URL=http://10.130.33.131:3202
NEXT_PUBLIC_WEB_URL=http://10.130.33.131:3200
NEXT_PUBLIC_VIEWER_URL=http://10.130.33.131:3300
DOCKER_CORS_ORIGINS=http://10.130.33.131:3200,http://10.130.33.131:3300
```

同步源码时不要同步 `.env.docker`、`data/` 或 `node_modules/`，也不要使用 `rsync --delete` 清理测试机上的未知文件。示例：

```bash
rsync -az \
  --exclude '/.git/' --exclude '/.env' --exclude '/.env.docker' \
  --exclude '/data/' --exclude '/node_modules/' --exclude '/.tmp/' \
  --exclude '/docs/' --exclude '/test/' --exclude '/tests/' \
  -e 'ssh -i ~/.ssh/figma-mirror-ai-agent' ./ \
  qihao@10.130.33.131:/home/qihao/workbench/
scp -i ~/.ssh/figma-mirror-ai-agent .env.docker \
  qihao@10.130.33.131:/home/qihao/workbench/.deploy.env
ssh -i ~/.ssh/figma-mirror-ai-agent qihao@10.130.33.131 \
  'cd /home/qihao/workbench && cp .deploy.env .env.docker'
```

## 三、日常快速部署

测试机无法稳定直连 Docker Hub 和 Debian 镜像，构建时必须把代理传给 BuildKit 和 Dockerfile 中的 APT 步骤。源码已为相关 Dockerfile 提供 `HTTP_PROXY`/`HTTPS_PROXY` 参数。

```bash
ssh -i ~/.ssh/figma-mirror-ai-agent qihao@10.130.33.131 \
  'cd /home/qihao/workbench && \
   docker compose --env-file .env.docker build \
     --build-arg HTTP_PROXY=http://10.130.33.131:48179 \
     --build-arg HTTPS_PROXY=http://10.130.33.131:48179 \
     knowledge-service agent-service author-site screenshot-service viewer-site'

ssh -i ~/.ssh/figma-mirror-ai-agent qihao@10.130.33.131 \
  'cd /home/qihao/workbench && \
   docker compose --env-file .env.docker up -d --force-recreate --no-build'
```

若需要仅更新部分服务，只在 `build` 和 `up` 命令中列出目标服务，例如：

```bash
docker compose --env-file .env.docker build \
  --build-arg HTTP_PROXY=http://10.130.33.131:48179 \
  --build-arg HTTPS_PROXY=http://10.130.33.131:48179 \
  author-site viewer-site
docker compose --env-file .env.docker up -d --force-recreate --no-build author-site viewer-site
```

`scripts/deploy-fast.sh` 适合已有可用远端目录的增量部署；首次部署前若远端没有 Node.js 且 agent 容器尚未运行，脚本的 Workspace Authority 预检会提前中止，此时按本文的首次部署流程启动一次即可。

`agent-service` 与 `author-site` 的 Docker 构建上下文都需包含 `packages/whiteboard-core`（其源码被 Agent 工具链和创作端白板入口引用）；使用 targeted sync 时，部署脚本会将该 workspace 包列入两个服务的必需同步清单。若任一 Dockerfile 或同步清单缺少它，esbuild/Webpack 会在构建阶段报 `Could not resolve "@workbench/whiteboard-core"`。

通过 `scripts/deploy.sh --remote-build` 构建时，测试机应设置 `DOCKER_BUILD_HTTP_PROXY=http://10.130.33.131:48179` 与 `DOCKER_BUILD_HTTPS_PROXY=http://10.130.33.131:48179`，脚本会把代理作为 BuildKit 参数传给各服务；不需要代理的环境保持为空即可。

## 四、验收与故障定位

```bash
ssh -i ~/.ssh/figma-mirror-ai-agent qihao@10.130.33.131 \
  'cd /home/qihao/workbench && docker compose --env-file .env.docker ps'

for url in \
  http://10.130.33.131:3200 \
  http://10.130.33.131:3201/health \
  http://10.130.33.131:3202/health \
  http://10.130.33.131:3300; do
  curl -fsS -o /dev/null -w "$url %{http_code}\n" "$url"
done
```

期望结果：`knowledge-service`、`agent-service`、`author-site`、`screenshot-service` 为 `healthy`，`viewer-site` 为 `running`；四个浏览器可访问端点返回 `200`。`3203` 只在 Compose 网络内可访问，不能用宿主机 `127.0.0.1:3203` 判断失败。

常用日志命令：

```bash
docker compose --env-file .env.docker logs --tail 100 author-site
docker compose --env-file .env.docker logs --tail 100 agent-service
docker compose --env-file .env.docker logs --tail 100 screenshot-service
```

如果构建停在 `apt-get` 或 Docker Hub 元数据，先确认 `10.130.33.131:48179` 可用；不要修改 1Panel 的全局 Docker 配置。若截图服务构建报缺少 `@workbench/project-core` 或 `preview-contract`，确认远端 `docker/screenshot-service/Dockerfile` 已包含这两个 workspace 包。

## 五、数据与回滚注意事项

- 部署只重建镜像和容器，不覆盖 `/opt/opencode-workbench/data`。
- 更新 `.env.docker` 前，先在远端复制一份带时间戳的备份。
- 不执行 `docker compose down -v`，避免误删 Compose volume。
- 如新镜像异常，先查看 `docker compose logs` 和 `docker compose ps`；回滚应使用上一版镜像标签或重新构建上一 Git 提交，不要清空数据目录。
