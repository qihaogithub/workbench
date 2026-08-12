# AI 对话与 Agent 问题沉淀

> 模块沉淀文档：记录 AI 对话、Agent 工具、评论 @AI 异步任务等问题的根因、修复与后续事项。
> 只保留仍未解决、待验证、可复用根因、验证结论与后续动作；不使用流水账。

## 评论 @AI 改动落在错误工作区，预览不生效

**现象**：用户在评论 @AI 后，AI 回复「已完成修改」，但编辑页预览毫无变化。实测某项目三条评论（换图、按钮改橙色、页面汉化）AI 均回复成功，预览仍为旧版。

**根因**：评论 @AI 任务的 workingDir 解析错误，改动写入预览不读的目录。

- 预览/编辑会话数据源是 **live workspace**（`data/workspaces/projects/<proj>/live-<id>/demos/`），由 session 绑定 `workspaceId = live-...` 决定。
- 评论任务 `comment-ai-task.ts` 的 `resolveProjectWorkingDir()` 用 `projectWorkspaceManager.getProject(projectId).workspacePath`，返回的是 **project workspace**（静态 `data/projects/<proj>/workspace/`）。
- 对比磁盘：project workspace 的 `prototype.html` 已是 AI 改后的中文版/橙色按钮；live workspace 仍是英文旧版。AI 改错目录，预览当然不变。这些改动也未走提交/材料化流程。

**修复摘要**（`packages/agent-service/src/routes/comment-ai-task.ts`）：
- `resolveProjectWorkingDir()` 优先解析到项目 `activeWorkspaceId` 对应的 live workspace（用 `discoverLiveWorkspaces(dataDir)` 按 projectId+workspaceId 匹配）；未命中或项目无 activeWorkspaceId 时回退 `project.workspacePath`。
- 导出 `resolveProjectWorkingDir` 以便测试；新增单测 `tests/unit/comment-ai-task.test.ts`（4 用例：命中 live / 未命中回退 / 无 activeWorkspaceId / 项目不存在）。
- 注意：`project-workspace-manager` 的 `PROJECTS_DIR` 在模块加载时由 `DATA_DIR` 计算，测试需先设 `DATA_DIR` 再动态 import，否则读错目录。

**验证状态**：`pnpm check:agent` ✅ 60 文件 / 485 用例全过（含新增 4 用例）。

**待办/后续事项**：
- 需重新部署 `workbench-agent-service` Docker 容器使修复生效，然后重发一条 @AI 验证改动落在 live workspace 且预览更新。
- 已产生的错误改动（AI 已写入 project workspace 的英文→中文等）未同步到 live workspace，是否需要人工回填或让用户重新 @AI 触发，待确认。
- `resolveProjectWorkingDir` 与预览数据源（live workspace）的目录约定值得沉淀为架构约束，避免后续其它后台 Agent 任务重蹈覆辙。

**相关文件**：`packages/agent-service/src/routes/comment-ai-task.ts`、`tests/unit/comment-ai-task.test.ts`、`packages/agent-service/src/workspace/workspace-authority-migration.ts`（`discoverLiveWorkspaces`）。