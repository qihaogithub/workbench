# 非 viewer 服务自动部署运行手册

每次运行按以下顺序执行：

1. 读取根目录 `AGENTS.md`、`OPS/automations/AGENTS.md`、`OPS/automations/README.md`、本上下文文件和 [Docker 部署方案](../../../docs/项目文档/创作端/06-基础设施/技术/03_Docker部署方案.md)。
2. 获取任务互斥锁；已有运行时只报告跳过，不启动第二个部署。
3. 在仓库中读取 `git rev-parse refs/heads/main`。不 fetch、不 pull、不修改当前工作区。
4. 根据上次状态计算新提交范围。以下路径触发非 viewer 部署：四个目标服务源码、其 targeted-sync 依赖、`docker/`、`docker-compose.yml`、`scripts/deploy*.sh`、根 `package.json`、`pnpm-lock.yaml` 和 `pnpm-workspace.yaml`。仅 viewer、文档、测试或 OPS 自动化文件变更时跳过。
5. 首次运行仅建立基线；无新提交时保持安静。
6. 对需要部署的 HEAD 创建临时 detached worktree，并复制本机受保护的 `.env.docker`。若临时 worktree 没有依赖，执行 `corepack pnpm install --frozen-lockfile --prefer-offline`；若仓库存在 `data/`，仅创建指向原仓库 `data/` 的 symlink 供只读 Authority 检查。不使用当前工作区的未提交文件。
8. 检查显式 SSH key 或安全注入的 `SSH_PASSWORD`；不得使用 `scripts/deploy.sh` 的示例密码回退值。凭据缺失时不部署并保留待部署状态。
9. 记录远端 viewer 容器 ID、启动时间和 `http://<SERVER_IP>:3300` 状态，然后执行 `scripts/deploy-fast.sh knowledge agent author shot`。
10. 任一服务失败后立即停止，不继续部署剩余服务，也不自动回滚；保留 `pending_commit`，下一轮重试最新 HEAD。
11. 部署成功后检查四个目标服务的健康状态，并确认 viewer 容器 ID、启动时间未变化且 HTTP 200；viewer 检查失败时报告为异常，不得自动重启 viewer。
12. 清理临时 worktree 和锁，更新任务记忆，输出简洁中文结果。不得提交代码、修改真实数据、执行 `docker compose down` 或运行包含 `viewer-site` 的部署命令。
