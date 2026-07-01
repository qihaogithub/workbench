# 项目级共享 Workspace 重构方案

## 归档结论

本任务已完成。项目编辑主链路从“用户临时 Workspace + 保存合并”的历史模型，调整为默认绑定项目级共享 active Workspace。Session 主要承载用户和 AI 对话上下文，不再默认创建用户私有文件副本；`projects/{id}/workspace/` 继续作为 canonical 工作区，由 active Workspace 同步推进。

隔离 Workspace 仍保留给显式 branch / transaction 场景，旧 user Workspace 可读取兼容，但未被选中的旧 Workspace 不自动删除。

## 保留经验

- Session、Workspace、Snapshot 需要分层定义：Session 是对话与用户上下文，active Workspace 是实时协同编辑面，canonical workspace 是项目正式基线。
- 关键动作应先 flush active Workspace，再同步 canonical 工作区，避免命名版本、页面恢复或发布读取旧内容。
- 旧 active Workspace 元数据和页面版本恢复路径需要兼容补齐，不能只覆盖新创建项目。

## 验证结果

- author-site 相关 Session / persist / workspace flush 测试通过：15 tests passed。
- `packages/agent-service/tests/unit/collab-persistence.test.ts` 与 `packages/project-core/src/__tests__/service.test.ts` 通过：27 tests passed。
- author-site、agent-service、project-core 的 `tsc --noEmit` 通过。
- `pnpm --filter ... test` 曾因当前 Codex runtime 使用 pnpm 11 触发联网安装和非 TTY node_modules 清理检查而未执行到测试，已改用本地 `node_modules/.bin` 入口验证。

## 项目文档索引

当前事实已同步到 `docs/项目文档/创作端/03-项目管理/` 下的需求与技术文档。

## 剩余风险

- 多实例协同不在本次实现范围内，后续仍需要共享协调层或 CRDT 更新日志。
- 当前工作树存在大量无关脏改动，本任务未触碰、未回滚。
