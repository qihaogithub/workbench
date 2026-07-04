# 项目管理与 CLI 问题沉淀（兼容入口）

## 当前状态

当前仍以 [`创作端CLI.md`](./创作端CLI.md) 作为 CLI 与创作端能力对齐的主跟踪文档。

## 当前结论

- 2026-07-02 确认外部 CLI 自动维护提示词仍引用本文件名。
- 2026-07-03 同步主文档结论：`page switch-runtime` 属于已实现但此前未登记的能力清单漂移，已在主文档与项目文档中补齐。
- 2026-07-03 再次对账未发现新的 L3 只读 CLI 缺口；当前工作树中的 `project-core` 删除项目时同步清理已发布产物 / 重建索引变更属于删除、发布语义，继续按 L5 只报告。
- 2026-07-04 同步主文档结论：当前工作树已新增 `project commit-list`、`project materialize`、`project content-gc` 与 `resource version-*`，共享层与 author-site API 已完成迁移；本轮仅补齐能力清单、运行手册与状态文档，未发现新的低风险 CLI 命令缺口。另已复核知识文档 CRUD 仍直接操作 `knowledge/manifest.json` 与文件系统，GAP-004 继续保持 L1。
- 为避免自动任务因文件名漂移中断，本文件仅保留兼容入口职责，不重复维护事实正文。

## 待办

- 若外部自动化提示词后续改为直接读取 `创作端CLI.md`，可评估是否移除此兼容入口。

## 验证状态

- `corepack pnpm check:automation`：通过。
- `corepack pnpm check:project-core`：通过（31 tests passed）。
- `corepack pnpm check:project-cli`：通过。

## 风险

- 如果兼容入口与主文档同时被人工编辑，可能出现信息分叉；当前约定是只在 `创作端CLI.md` 维护正文。
