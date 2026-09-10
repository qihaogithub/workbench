# 非 viewer 服务自动部署运行手册

每次运行按以下顺序执行：

1. 读取根目录 `AGENTS.md`、`OPS/automations/AGENTS.md`、`OPS/automations/README.md`、本上下文文件和 [Docker 部署方案](../../../docs/项目文档/创作端/06-基础设施/技术/03_Docker部署方案.md)。
2. 获取任务互斥锁；已有运行时只报告跳过，不启动第二个部署。
3. 确认当前分支为 `main`，记录 `git status --porcelain`；工作区不干净时不得拉取、部署或 stash，只报告前置条件缺失。
4. 执行 `git fetch origin main`，比较本地 `main` 与 `origin/main`。若无更新则保持安静；若本地分支已分叉则停止并告警；若本地落后且工作区干净，执行 `git pull --ff-only origin main`。
5. 只要本轮成功拉取了一个或多个新提交，就部署四个目标服务；不按路径跳过，即使提交只改了 viewer、文档、测试或 OPS 自动化文件，也不得因此部署 `viewer-site`。
6. 首次运行若本地已与 `origin/main` 同步，仅建立基线；若本轮拉取到新提交，则按本规则部署。
7. 在当前项目工作区执行 `scripts/docker-orbstack-up.sh --without-viewer --with-screenshot`；该命令使用 `.env.docker` 的本机数据目录，只构建并启动 `knowledge-service`、`agent-service`、`author-site` 和 `screenshot-service`。
8. 部署前记录本机 `viewer-site` 容器 ID、启动时间和 `http://localhost:3300` 状态；命令参数和 Compose 服务列表中不得出现 `viewer-site`。
10. 任一服务失败后立即停止，不继续部署剩余服务，也不自动回滚；保留 `pending_commit`，下一轮重试最新 HEAD。
11. 部署成功后检查四个目标服务的健康状态，并确认 viewer 容器 ID、启动时间未变化且 HTTP 200；viewer 检查失败时报告为异常，不得自动重启 viewer。
12. 清理临时 worktree 和锁，更新任务记忆，输出简洁中文结果。不得提交代码、修改真实数据、执行 `docker compose down` 或运行包含 `viewer-site` 的部署命令。
