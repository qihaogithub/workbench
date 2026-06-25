# Project Admin CLI 故障排查

> 更新日期：2026-06-25

本文补充 [Project Admin CLI 使用指南](./Project-Admin-CLI使用指南.md) 中的异常处理场景。

## 命令不可用

- 先运行 `ow doctor --json` 查看当前工作目录、数据目录和操作者信息。
- 运行 `ow commands --json` 查看当前可用命令与别名。
- 如果 shell 找不到 `ow`，先确认本地依赖已安装，并使用仓库内 CLI 入口执行同一命令。

## 项目不可见

- 检查 `DATA_DIR` 是否指向目标数据目录。
- 检查 `PROJECT_ADMIN_ALLOWED_PROJECTS` 是否只允许了部分项目。
- 使用 `ow project list --json` 确认当前操作者实际可见项目。

## 本地项目包校验失败

- 运行 `ow validate --json`，只根据 `validation.issues` 修复 blocking 级问题。
- 缺少 `.opencode/sync-state.json` 时，重新运行 `ow project pull <projectId> <dir> --force --json`。
- 页面入口、页面 Schema 或项目级 Schema 缺失时，先恢复对应文件，再运行 `ow diff --json`。

## 提交冲突

`ow submit --json` 返回 `EDIT_CONFLICT` 时，说明线上项目已经有新版本。处理方式：

1. 备份本地未提交修改。
2. 按 `nextActions` 重新拉取项目。
3. 将必要修改重新应用到新项目包。
4. 再执行 `ow validate --json`、`ow diff --json`、`ow submit --json`。

## 预览或截图失败

- 调用 `ow preview healthcheck --json` 查看 screenshot-service 是否可用。
- 如果 screenshot-service 不可用，先启动 `pnpm dev:screenshot`。
- 如果页面 Schema 报错，先运行配置校验相关命令或 `ow validate --json`。

## 发布失败

- 先运行 `ow publish check proj_xxx --json`，处理 blocking 级问题。
- 项目没有页面时不能发布。
- 正式发布需要 `AUTHOR_SITE_URL` 和 `AUTHOR_SITE_AUTH_TOKEN`。
- 未配置正式发布环境时，`ow publish --json` 会退回本地发布状态路径，并在 `warnings` 和 `nextActions` 中说明下一步。

## AI 会话失败

- `ai send-message` 依赖 agent-service 在线。
- 确认 `AGENT_SERVICE_URL` 或 `NEXT_PUBLIC_AGENT_SERVICE_URL` 指向正确服务。
- 会话不存在时，先在 Web 创作端创建或恢复编辑会话，再用 `ow ai session-list <projectId> --json` 查看可用会话。
