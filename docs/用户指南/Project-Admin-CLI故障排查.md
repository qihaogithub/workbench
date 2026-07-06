# Project Admin CLI 故障排查

> 更新日期：2026-07-05

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
- 缺少 `.workbench/sync-state.json` 时，重新运行 `ow project pull <projectId> <dir> --force --json`。
- 页面入口、页面 Schema 或项目级 Schema 缺失时，先恢复对应文件，再运行 `ow diff --json`。
- 如果只是想快速判断改动规模，运行 `ow diff --summary --json`。

## 输入内容被误判

- 运行 `ow help input --json` 查看当前输入契约。
- `@file` 只有在参数整体形如 `@/abs/path`、`@./rel/path` 或 `@../rel/path` 时才展开。
- CSS `@media`、`@supports`、`@keyframes`、`@font-face` 等 at-rule 会作为普通内容处理；如果仍然失败，优先改用 `--input-json @./args.json`。

## 批量命令部分失败

- `asset upload-dir` 和 `page update-prototypes` 不会静默吞掉失败项。
- 先查看 JSON 中的 `failed`、`warnings` 和 `resumeCommand`。
- 对 `project import-prototype`，先记录返回的 `editId` 和失败阶段，再按 `nextActions` 运行 `edit verify`、`edit diff --summary` 或 resume 命令。

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
- `ow project visual-check --json` 会生成离线检查报告和 SVG 截图工件。它用于代理证据链，不等同于 author-site/screenshot-service 的浏览器级正式截图。
- `visual-check` 报 `VISUAL_BLANK_PAGE` 时，先检查页面是否只有透明 GIF、空图片、截图占位或极少文本。
- `VISUAL_ASSET_MISSING` 表示页面引用了工作区不存在的 `assets/...` 资源，先运行 `ow project verify <projectId> --json` 或 `ow edit verify <editId> --checks assets --json`。

## 发布失败

- 先运行 `ow publish check proj_xxx --json`，处理 blocking 级问题。
- 项目没有页面时不能发布。
- 正式发布需要 `AUTHOR_SITE_URL` 和 `AUTHOR_SITE_AUTH_TOKEN`。
- 未配置正式发布环境时，`ow publish --json` 会退回本地发布状态路径，并在 `warnings` 和 `nextActions` 中说明下一步。

## AI 会话失败

- `ai send-message` 依赖 agent-service 在线。
- 确认 `AGENT_SERVICE_URL` 或 `NEXT_PUBLIC_AGENT_SERVICE_URL` 指向正确服务。
- 会话不存在时，先在 Web 创作端创建或恢复编辑会话，再用 `ow ai session-list <projectId> --json` 查看可用会话。
