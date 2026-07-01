# 项目级共享 Workspace 重构方案

## 背景

当前项目编辑链路仍保留“用户临时 Workspace + 保存合并”的历史模型。实时协同层已经以 Workspace 为边界，但默认 Session 创建仍可能为不同用户创建不同 Workspace，导致多人协作和实时保存语义不一致。

## 目标

- 默认编辑路径绑定项目级共享 active Workspace。
- Session 只承载用户和 AI 对话上下文，不默认创建用户私有文件副本。
- `projects/{id}/workspace/` 保留为 canonical 工作区，由 active Workspace 同步推进。
- 隔离 Workspace 只用于显式 branch/transaction 场景。

## 范围

- author-site 的 Project / Workspace / Session 元数据与 API 主链路。
- agent-service 协同持久化对项目级 Workspace 路径的识别。
- project-core 事务工作区语义标注。
- 项目管理相关需求、技术文档同步。

## 方案

1. 在项目元数据中引入 `activeWorkspaceId`、`activeWorkspaceUpdatedAt`、`canonicalSyncedWorkspaceId`、`canonicalSyncedAt`。
2. 新增项目级 live Workspace 创建与懒迁移能力，默认路径为 `data/workspaces/projects/{projectId}/{workspaceId}`。
3. `/api/sessions` 默认绑定项目 active Workspace，不再按用户查找或创建私有 Workspace。
4. 关键动作统一执行 flush active Workspace，再同步 canonical 工作区。
5. 保留旧 user Workspace 读取兼容，未被选中的旧 Workspace 不自动删除。
6. 更新测试和项目文档，使“Session / Workspace / Snapshot”三层语义一致。

## 任务清单

- [x] 建立项目级 active Workspace 元数据和路径工具。
- [x] 改造 Session 创建、复用、归档、过期清理逻辑。
- [x] 改造 persist / sync / save / checkpoint / publish 相关同步边界。
- [x] 调整 agent-service 协同持久化定位项目级 Workspace。
- [x] 标注 project-core branch transaction 工作区语义。
- [x] 补充/更新单元测试。
- [x] 同步更新 `docs/项目文档/创作端/03-项目管理/`。
- [x] 运行相关验证命令。

## 进度记录

- 2026-07-01：完成方案确认，开始实现。
- 2026-07-01：完成项目级 live Workspace 主链路、Session 清理保护、关键动作 flush+sync、branch 事务标识和初始测试补充。
- 2026-07-01：完成项目管理需求、草稿工作区、实时协同、版本管理和生命周期文档同步。
- 2026-07-01：完成 targeted test 与受影响包 typecheck 验证。
- 2026-07-01：继续复查并修正命名版本项目元数据覆盖风险、旧 active Workspace 元数据补齐、页面版本恢复 active/canonical 同步边界。

## 验证方式

- `../../node_modules/.bin/jest ... --config jest.config.ts --runInBand`（author-site 相关 Session / persist / workspace flush 测试）：通过，15 tests passed。
- `./node_modules/.bin/vitest run packages/agent-service/tests/unit/collab-persistence.test.ts packages/project-core/src/__tests__/service.test.ts`：通过，27 tests passed。
- `../../node_modules/.bin/tsc --noEmit`（author-site、agent-service、project-core）：通过。
- `pnpm --filter ... test` 曾因当前 Codex runtime 使用 pnpm 11 触发联网安装和非 TTY node_modules 清理检查而未执行到测试，已改用本地 `node_modules/.bin` 入口验证。

## 风险与待确认事项

- 当前工作树已有大量无关脏改动，本任务不触碰、不回滚。
- 多实例协同仍不在本次实现范围内，后续需要共享协调层或 CRDT 更新日志。
