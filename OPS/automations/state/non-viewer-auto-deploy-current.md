# 非 viewer 服务自动部署当前状态

## 注册状态

- 任务：Codex Cron「workbench main 非 viewer 服务自动部署」
- 频率：每 1 小时，Asia/Shanghai
- 代码来源：`origin/main`；拉取到本地 `main` 后在当前 Mac OrbStack 部署
- 部署范围：`knowledge-service`、`agent-service`、`author-site`、`screenshot-service`
- 明确排除：`viewer-site`

## 运行状态

- 尚未执行首次基线运行；`last_seen_commit`、`last_deployed_commit` 和 `pending_commit` 由自动化任务记忆维护。
- 本机部署采用 `scripts/docker-orbstack-up.sh --without-viewer --with-screenshot`，不使用 SSH 远程部署。
- 失败不自动回滚，保留待部署状态并在下一轮重试。
