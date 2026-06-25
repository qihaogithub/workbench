# Project Admin MCP 使用指南

> 更新日期：2026-06-25

Project Admin MCP 面向管理员、开发者和高级创作者，用于在 Codex 中管理创作端项目。普通用户仍使用创作端 Web 页面完成创建、编辑、预览和发布。

## 使用前提

- 本地仓库已执行 `pnpm install`。
- 本地项目数据目录使用默认 `data/`，或通过 `DATA_DIR` 指向目标数据目录。
- Codex MCP 配置中启动命令指向：

```bash
pnpm --filter @opencode-workbench/project-admin-mcp start
```

## 安全规则

- 修改项目必须先调用 `edit_begin` 打开编辑事务。
- 页面、文件夹和配置写入必须发生在事务工作空间内。
- 提交前必须调用 `edit_validate` 和 `edit_diff`。
- 项目删除、模板删除、页面批量删除、文件夹删除等操作必须先调用对应 `*_preview` 工具，再携带 `confirmToken` 执行。
- 不要让 Codex 直接编辑 `data/`、`project.json`、`workspace-tree.json` 或 `.session.json`。

## 常用流程

### 创建项目并新增页面

1. 调用 `admin_capabilities` 查看权限。
2. 调用 `template_list` 或 `template_recommend` 选择模板。
3. 调用 `project_create` 或 `template_instantiate` 创建项目。
4. 调用 `edit_begin` 打开事务。
5. 调用 `page_create`、`page_update_code`、`page_update_schema` 完成编辑。
6. 调用 `edit_validate`、`edit_diff`。
7. 调用 `edit_commit` 保存版本。

### 整理页面树

1. 调用 `project_get` 查看正式项目结构。
2. 调用 `edit_begin`。
3. 使用 `folder_create`、`folder_update`、`page_update_meta` 或 `page_reorder` 调整结构。
4. 删除页面或文件夹前先调用 `page_delete_preview` 或 `folder_delete_preview`。
5. 调用 `edit_validate`、`edit_diff`、`edit_commit`。

### 保存模板

1. 调用 `project_get` 确认项目页面和配置。
2. 调用 `publish_check` 做发布前静态检查。
3. 调用 `template_create_from_project` 保存模板快照。
4. 调用 `template_get` 确认模板与源项目隔离。

## 当前能力边界

已可用：

- 本地 stdio MCP。
- 项目、模板、事务、页面、文件夹、配置、资产、审计基础工具。
- 删除预览计划和确认执行。
- Schema JSON 校验与项目级/页面级字段冲突检查。
- 图片资产上传、替换、删除预览、删除执行和引用扫描。
- `preview_healthcheck` 可检查 screenshot-service 健康状态；`preview_screenshot` 会返回截图服务可用性和后续触发建议。
- `ai_session_list`、`ai_session_get`、`ai_run_logs`、`ai_workspace_context` 可读取本地 AI 会话摘要、日志和工作区文件列表。
- 首页 `MCP` 入口和 `/mcp` 安装介绍页。

降级或后续接入：

- `publish_project` 当前更新发布状态并执行发布前检查，完整发布产物编译仍使用 author-site 发布 API。
- `ai_send_message` 当前仍由 author-site 与 agent-service 的在线会话链路管理，MCP 暂不直接发送 AI 消息。
- 远程 HTTP MCP、组织级授权和服务账号治理尚未落地。

## 验证命令

```bash
pnpm --filter @opencode-workbench/project-core typecheck
pnpm --filter @opencode-workbench/project-core test
pnpm --filter @opencode-workbench/project-admin-mcp typecheck
pnpm --filter @opencode-workbench/project-admin-mcp test
pnpm --filter @opencode-workbench/author-site typecheck
pnpm --filter @opencode-workbench/author-site test -- --runInBand
pnpm --filter @opencode-workbench/author-site build
```
