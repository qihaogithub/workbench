# 非 viewer 服务自动部署当前状态

## 注册状态

- 任务：Codex Cron「workbench main 非 viewer 服务自动部署」
- 频率：每 30 分钟，Asia/Shanghai
- 代码来源：本地 `refs/heads/main`
- 部署范围：`knowledge-service`、`agent-service`、`author-site`、`screenshot-service`
- 明确排除：`viewer-site`

## 运行状态

- 尚未执行首次基线运行；`last_seen_commit`、`last_deployed_commit` 和 `pending_commit` 由自动化任务记忆维护。
- 生产部署采用现有 `scripts/deploy.sh` 的 SSH、镜像和 Workspace Authority 门禁。
- 失败不自动回滚，保留待部署状态并在下一轮重试。
