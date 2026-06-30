# 正式环境创作端部署与 data 覆盖

## 背景

用户要求将当前工作区的创作端部署到正式环境，并使用本地 `data/` 目录直接覆盖正式环境数据。

正式环境部署脚本指向 `10.130.33.131:/opt/opencode-workbench`，Docker Compose 中 `author-site`、`agent-service`、`screenshot-service`、`viewer-site` 共用 `app-data` volume，并在容器内挂载为 `/app/data`。

## 目标

- 部署当前工作区的创作端服务到正式环境。
- 使用本地 `data/` 覆盖正式环境 Docker volume 中的 `/app/data`。
- 覆盖前保留一份正式环境 data 备份，便于必要时回退。
- 部署后确认创作端可访问，相关容器处于运行状态。

## 范围

- 本地验证：创作端类型检查与测试。
- 远端操作：正式环境 `opencode-workbench` Docker Compose 项目。
- 数据操作：覆盖 Docker named volume `opencode-workbench_app-data` 内的数据。

不包含：

- 修改产品功能代码。
- 修改 `.env` 或密钥配置。
- 清理当前工作区已有的无关未提交改动。

## 方案

1. 读取部署脚本与 Compose 配置，确认服务、端口和 volume。
2. 运行本地创作端验证。
3. 远端预检：确认 SSH、Docker Compose 项目、容器与 volume。
4. 在远端创建 data 备份。
5. 同步本地 `data/` 到远端临时目录。
6. 暂停共用 data 的服务，清空 volume 内旧数据并复制新数据。
7. 部署 `author-site`，并按需恢复共用 data 的其他服务。
8. 运行远端健康检查。

## 任务清单

- [x] 确认部署脚本和 Docker Compose 的正式环境路径。
- [x] 确认本地 `data/` 覆盖目标是 Docker `app-data` volume。
- [x] 运行本地创作端验证。
- [x] 远端预检并记录当前状态。
- [x] 备份正式环境 data。
- [x] 同步本地 `data/` 到远端临时目录。
- [x] 覆盖正式环境 data。
- [x] 部署并重启创作端。
- [x] 部署后自检。

## 进度记录

- 2026-06-30：已确认 `scripts/deploy.sh` 默认排除本地 `data/`，覆盖正式 data 需要额外处理 Docker volume。
- 2026-06-30：本地 `data/` 大约 64M，包含项目、截图、发布产物、会话、用户数据库和工作区数据。
- 2026-06-30：`corepack pnpm check:author` 通过，58 个测试套件、437 个测试全部通过。
- 2026-06-30：远端 Compose 项目位于 `/opt/opencode-workbench`，`opencode-workbench_app-data` volume 挂载到容器 `/app/data`；远端 data 约 67M，顶层条目数 17。
- 2026-06-30：已创建正式环境 data 备份 `/opt/opencode-workbench/backups/data-backup-20260630-135907.tar.gz`，大小 44M，SHA-256 为 `6e0b795fa39e1b3914f6734d410bcac6b94ff8cdf959eea96558b34af775a9b9`。
- 2026-06-30：已同步本地 `data/` 到远端 staging：`/opt/opencode-workbench/.deploy-data-staging/data-20260630-1400`，staging 约 68M，顶层条目数 17。
- 2026-06-30：执行 `scripts/deploy-fast.sh author` 成功，`author-site` 远端构建、重建容器和健康检查通过。
- 2026-06-30：部署脚本的 `rsync --delete` 清理了项目目录内的 `backups/` 和 `.deploy-data-staging/`，正式 data volume 尚未覆盖；后续备份和 staging 改放到 `/opt/opencode-workbench-data-backups/` 与 `/opt/opencode-workbench-data-staging/`。
- 2026-06-30：重新创建有效覆盖前备份 `/opt/opencode-workbench-data-backups/data-backup-before-overwrite-20260630-1405.tar.gz`，大小 44M，SHA-256 为 `0815dca62f46fecf2933f7c619a2fde7463fa9d86891caf7bc04015805c98f2e`。
- 2026-06-30：重新同步 staging 到 `/opt/opencode-workbench-data-staging/data-20260630-1405`，staging 约 68M，顶层条目数 17。
- 2026-06-30：已停止 `viewer-site`、`screenshot-service`、`author-site`、`agent-service`，用 staging 覆盖 Docker volume `opencode-workbench_app-data`，随后启动四个服务。
- 2026-06-30：覆盖后远端 data volume 约 68M，顶层条目数 17。
- 2026-06-30：部署后自检通过：`agent-service`、`author-site`、`screenshot-service` 均为 healthy；`viewer-site` 正常运行；远端本机 3200/3201/3202/3300 均可访问；本机访问 `http://10.130.33.131:3200` 返回 `HTTP/1.1 200 OK`。

## 最终状态

已完成。

## 实施摘要

- 已部署当前工作区的 `author-site` 到正式环境。
- 已使用本地 `data/` 直接覆盖正式 Docker volume `opencode-workbench_app-data`。
- 有效备份保存在 `/opt/opencode-workbench-data-backups/data-backup-before-overwrite-20260630-1405.tar.gz`。

## 剩余风险

- 本次覆盖按用户要求替换了正式项目、截图、发布产物、会话、用户数据库和工作区数据。
- 当前仓库仍有既存未提交改动，本次未做清理、回滚或提交。

## 验证方式

- 本地执行 `pnpm check:author`。
- 远端检查容器状态和健康状态。
- 远端检查 `http://127.0.0.1:3200`。
- 必要时检查公开地址 `http://10.130.33.131:3200`。

## 风险与待确认事项

- data 覆盖会替换正式环境项目、截图、发布产物、会话、用户数据库和工作区数据。
- 覆盖期间需要短暂停止共享 data 的服务，正式环境会有短暂不可用窗口。
- 当前工作区存在多处未提交改动，本次部署以当前工作区内容为准，不做清理或回滚。
