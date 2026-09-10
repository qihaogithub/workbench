# 非 viewer 服务自动部署上下文

## 任务目标

每 1 小时检查 `origin/main` 是否有更新；有更新时，在本地 `main` 工作区干净且可快进的前提下拉取，并在当前 Mac 的 OrbStack 中自动部署 `knowledge-service`、`agent-service`、`author-site` 和 `screenshot-service`。本任务永远不构建、不重启、不替换 `viewer-site`。

## 固定边界

- 任务运行在本地 `workbench` 项目；每次先执行 `git fetch origin main` 检查远端，只有当前分支为 `main`、工作区干净且本地落后于远端时才执行 `git pull --ff-only origin main`。不得 stash、reset、clean、merge 或改写历史。
- 本机部署使用 `.env.docker` 的宿主机数据目录和 `scripts/docker-orbstack-up.sh --without-viewer --with-screenshot`；不得改用远程 SSH 部署脚本。
- 部署命令固定包含 `--without-viewer`，禁止运行默认启动范围、完整 Compose 命令、`core` 或 `viewer` 目标。
- 部署失败不自动回滚；保留待部署提交，下一轮继续尝试最新的本地 `main` HEAD。
- 共享依赖变更仍部署上述四个服务，但报告必须提示 viewer 容器未更新、其共享依赖或上游 API 可能发生变化。

## 状态语义

自动化记忆至少维护 `last_seen_commit`、`last_deployed_commit`、`pending_commit`、最近一次结果和时间戳。

- 首次运行若当前 `main` 已与 `origin/main` 同步，只记录当前 HEAD 作为基线；若首次运行需要从 `origin/main` 拉取新提交，则按正常规则部署。
- `origin/main` 的任意新提交都会触发上述四个非 viewer 服务部署；成功后更新 `last_seen_commit` 和 `last_deployed_commit`。
- 失败时不更新 `last_deployed_commit`，设置 `pending_commit`，下一轮重试。
- 如果 `main` 历史被改写、提交不是上一次状态的后代或无法创建干净工作树，停止并告警。

## 保护要求

- 使用任务级互斥锁，禁止两个部署并行执行。
- 自动拉取成功后直接在干净的项目工作区部署；当前工作区未提交改动不得进入自动部署。
- 部署前记录本机 `viewer-site` 容器 ID、启动时间和 HTTP 状态；部署后要求 ID/启动时间不变且端口 3300 返回 200。
- 只在发现新提交、跳过提交、成功、失败或前置条件缺失时输出通知；没有新提交时保持安静。
