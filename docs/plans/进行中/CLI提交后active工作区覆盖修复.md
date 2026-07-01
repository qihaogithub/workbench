# CLI 提交后 active 工作区覆盖修复

## 背景

`proj_1779608460371` 的重复顶层声明修复曾通过 Project Admin CLI 生成干净版本快照，但后续预览和自动修复仍在 active live workspace 中读到重复拼接块。复查确认 CLI 提交链路与创作端 active workspace 同步链路存在权威边界缺口。

## 目标

- CLI / ProjectAdmin 分支事务提交后，项目基准工作区与最新版本快照成为权威状态。
- 旧 active live workspace 不得继续复用，也不得通过保存、flush、自动修复或恢复动作覆盖项目基准工作区。
- 过期工作区返回明确错误，提示用户刷新或重新打开项目。

## 范围

- `project-core` 分支事务提交与版本快照生成。
- author-site 项目工作区创建、复用和 active -> canonical 同步。
- 相关回归测试与项目管理工作区技术文档。

## 方案

1. ProjectAdmin commit 写入 canonical 和快照时剥离 `.workspace.json` / `.session.json`。
2. ProjectAdmin commit 成功后清空项目 active workspace 指针，记录 canonical 同步时间。
3. 打开项目时只复用 `baseVersion` 等于最新版本的 live workspace。
4. active -> canonical 同步前校验 workspaceId 仍是当前 active workspace，且 baseVersion 未过期。
5. 过期工作区返回 `WORKSPACE_STALE`，调用方透传可识别错误。

## 任务清单

- [x] 复核 `proj_1779608460371` 时间线、版本快照、active workspace 与自动修复日志。
- [x] 修复 ProjectAdmin commit 的 active 指针清理与元数据剥离。
- [x] 修复 active workspace 复用和同步入口的陈旧版本保护。
- [x] 补充 project-core 与 author-site 回归测试。
- [x] 更新项目工作区长期技术文档。
- [x] 运行完整验证命令并记录结果。

## 进度记录

- 2026-07-01：确认根因不是 CLI 提交失败；v8/v9 快照干净，残留来自后续 active live workspace 继续参与预览/自动修复与同步。
- 2026-07-01：完成系统侧修复：branch commit 后失效 active workspace；过期 live workspace 不再复用，且不能同步覆盖 canonical。
- 2026-07-01：已通过 targeted 回归：`project-core` 全量测试与 author-site `session-manager.test.ts`。
- 2026-07-01：`check:project-cli` 通过；`check:author` 的 typecheck 通过，全量 Jest 剩余 2 个既有失败：`editor-diagnostics/types.test.ts` 的源码长度期望不一致，以及 `preview-canvas-interaction-mode.test.tsx` 的文字工具用例超时。

## 验证方式

- `corepack pnpm --filter @opencode-workbench/project-core test`
- `corepack pnpm --filter @opencode-workbench/author-site test -- --runTestsByPath src/lib/__tests__/session-manager.test.ts --runInBand`
- `corepack pnpm check:project-cli`
- `corepack pnpm check:author`

## 风险与待确认事项

- 当前工作树已有大量无关改动和 data 目录修复，本任务不整理这些内容。
- 并行打开的旧页面会收到工作区过期错误，需要刷新或重新打开项目后继续编辑。
