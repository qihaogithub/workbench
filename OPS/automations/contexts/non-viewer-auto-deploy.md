# 非 viewer 服务自动部署上下文

## 任务目标

每 30 分钟检查本地 `main` 分支是否产生新提交；对部署相关提交，从该提交创建独立干净工作树，自动部署 `knowledge-service`、`agent-service`、`author-site` 和 `screenshot-service`。本任务永远不构建、不重启、不替换 `viewer-site`。

## 固定边界

- 任务运行在本地 `workbench` 项目，不执行 `git fetch`、`git pull` 或远程分支同步。
- 生产目标、SSH 配置和 `.env.docker` 沿用 `scripts/deploy.sh` 的既有约定；密钥不得写入自动化提示词或仓库文件。
- 自动任务不得使用 `scripts/deploy.sh` 的示例密码回退值；必须检测到可用 SSH key 或由宿主机安全注入的显式 `SSH_PASSWORD`，否则跳过部署并告警。
- 部署命令固定为 `scripts/deploy-fast.sh knowledge agent author shot`，禁止使用会包含 viewer 的 `core` 或无服务参数的完整 Compose 命令。
- 部署失败不自动回滚；保留待部署提交，下一轮继续尝试最新的本地 `main` HEAD。
- 共享依赖变更仍部署上述四个服务，但报告必须提示 viewer 容器未更新、其共享依赖或上游 API 可能发生变化。

## 状态语义

自动化记忆至少维护 `last_seen_commit`、`last_deployed_commit`、`pending_commit`、最近一次结果和时间戳。

- 首次运行只记录当前 `main` HEAD 作为基线，不自动部署。
- viewer-only、文档、测试或 OPS 自动化上下文变更只更新 `last_seen_commit`。
- 部署相关提交触发部署；成功后更新 `last_seen_commit` 和 `last_deployed_commit`。
- 失败时不更新 `last_deployed_commit`，设置 `pending_commit`，下一轮重试。
- 如果 `main` 历史被改写、提交不是上一次状态的后代或无法创建干净工作树，停止并告警。

## 保护要求

- 使用任务级互斥锁，禁止两个部署并行执行。
- 临时 worktree 必须基于 `refs/heads/main` 的提交创建，并在退出时清理；当前工作区未提交改动不得进入镜像。
- 临时 worktree 需要使用本地 `node_modules` 安装/缓存完成 viewer 契约检查；若仓库存在 `data/`，仅以 symlink 方式提供给部署前 Authority 检查，部署同步仍排除 `data/`。
- 部署前记录远端 `viewer-site` 容器 ID、启动时间和 HTTP 状态；部署后要求 ID/启动时间不变且端口 3300 返回 200。
- 只在发现新提交、跳过提交、成功、失败或前置条件缺失时输出通知；没有新提交时保持安静。
