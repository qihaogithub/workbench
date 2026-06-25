# Project Admin CLI 使用指南

> 更新日期：2026-06-25

Project Admin CLI 面向管理员、开发者和高级创作者，用于在本地 shell 或 Codex 中管理创作端项目。普通用户仍使用创作端 Web 页面完成创建、编辑、预览和发布。

## 使用前提

- 本地仓库已执行 `pnpm install`。
- 本地项目数据目录使用默认 `data/`，或通过 `DATA_DIR` 指向目标数据目录。
- CLI 入口命令为 `ow`，也可以通过包内脚本运行 `packages/project-cli/src/index.ts`。
- 如需限制服务账号可访问项目，设置 `PROJECT_ADMIN_ALLOWED_PROJECTS=proj_xxx,proj_yyy`。
- 如需通过 CLI 向在线 AI 会话发消息，确认 `AGENT_SERVICE_URL` 或 `NEXT_PUBLIC_AGENT_SERVICE_URL` 指向 agent-service。
- 如需触发正式 Web 发布链路，设置 `AUTHOR_SITE_URL` 和 `AUTHOR_SITE_AUTH_TOKEN`。

## 安全规则

- 修改线上项目前，优先使用 `ow project pull <projectId> <dir> --json` 拉取本地项目包。
- 本地修改后先运行 `ow validate --json` 和 `ow diff --json`。
- 提交回创作端使用 `ow submit --json`，CLI 会检查线上版本是否已变化。
- 项目删除、模板删除、页面批量删除、文件夹删除等高风险操作仍需要先预览影响，再携带确认 token 执行。
- 不要直接编辑 `data/`、`project.json`、`workspace-tree.json` 或 `.session.json`。

## 常用流程

### 拉取、修改并提交项目

```bash
ow project pull proj_xxx ./local-project --json
cd ./local-project
pnpm install
pnpm dev
ow validate --json
ow diff --json
ow submit --json
```

### 创建项目并查看详情

```bash
ow project create --name "新项目" --json
ow project list --json
ow project get proj_xxx --json
```

### 本地脚手架升级

```bash
ow upgrade --dry-run --json
ow upgrade --json
ow validate --json
ow diff --json
```

`ow upgrade` 只刷新脚手架托管文件和 `scaffoldVersion`，不会重写页面源码、页面 Schema 或资产。

### 发布项目

```bash
ow publish proj_xxx --json
```

配置 `AUTHOR_SITE_URL` 和 `AUTHOR_SITE_AUTH_TOKEN` 后，CLI 会调用 author-site 正式发布链路，并返回发布产物摘要和访问入口。未配置时，CLI 只执行本地发布状态降级路径，并在 `warnings` 和 `nextActions` 中提示后续操作。

## 当前能力边界

已可用：

- 项目、模板、事务、页面、文件夹、配置、资产、审计基础命令。
- 本地项目包拉取、校验、diff、提交和脚手架升级。
- 删除预览计划和确认执行。
- Schema JSON 校验与项目级/页面级字段冲突检查。
- 图片资产上传、替换、删除预览、删除执行和引用扫描。
- `preview healthcheck` 可检查截图服务健康状态。
- AI 会话摘要、运行日志、工作区上下文读取，以及在线会话消息发送。
- 模板支持 `personal`、`team`、`official` 分层和 `official` 官方标记。
- `template health-check` 可生成模板健康报告。
- `commands` 可输出机器可读命令清单。
- 所有 `--json` 失败结果都会包含 `error.code`、`error.message` 和 `nextActions`。

## 相关文档

- [管理员模板维护手册](./Project-Admin-CLI管理员模板维护手册.md)
- [故障排查](./Project-Admin-CLI故障排查.md)

## 验证命令

```bash
pnpm check:project-core
pnpm check:project-scaffold
pnpm check:project-cli
pnpm check:author
pnpm check:all
```
