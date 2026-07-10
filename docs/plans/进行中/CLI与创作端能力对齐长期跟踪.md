# 项目管理与 CLI 问题沉淀（兼容入口）

## 当前状态

当前仍以 [`创作端CLI.md`](./创作端CLI.md) 作为 CLI 与创作端能力对齐的主跟踪文档。

## 当前结论

- 2026-07-10 同步主文档结论：`page create` 默认运行时已切到 `prototype-html-css`，author-site 页面创建入口也同步默认写入原型页文件；CLI 若要稳定创建高保真 React 页，应显式传 `--runtime-type high-fidelity-react` 或提供页面代码。大型 Figma HTML 原型页上限也已放宽到 2MB，这两项都属于共享层当前事实，不新增 CLI 命令缺口。
- 2026-07-09 同步主文档结论：`projectConfigValues` 已进一步进入 viewer 默认值与发布前 canonical workspace 回填链路，但写回语义仍停留在 author-site 路由层，`project-core` / `project-scaffold` 仍未形成共享闭环，因此 GAP-011 继续按 L1 report-only 处理，不新增 CLI 命令。
- 2026-07-02 确认外部 CLI 自动维护提示词仍引用本文件名。
- 2026-07-03 同步主文档结论：`page switch-runtime` 属于已实现但此前未登记的能力清单漂移，已在主文档与项目文档中补齐。
- 2026-07-03 再次对账未发现新的 L3 只读 CLI 缺口；当前工作树中的 `project-core` 删除项目时同步清理已发布产物 / 重建索引变更属于删除、发布语义，继续按 L5 只报告。
- 2026-07-04 同步主文档结论：当前工作树已新增 `project commit-list`、`project materialize`、`project content-gc` 与 `resource version-*`，共享层与 author-site API 已完成迁移；本轮仅补齐能力清单、运行手册与状态文档，未发现新的低风险 CLI 命令缺口。另已复核知识文档 CRUD 仍直接操作 `knowledge/manifest.json` 与文件系统，GAP-004 继续保持 L1。
- 2026-07-05 同步主文档结论：当前工作树已新增 `page update-sketch`，`page create --runtime-type sketch-scene`、`project-core` 与 author-site `/demos` / `/runtime` 入口已完成共享层对齐；本轮仅补齐能力清单、运行手册、state 与长期跟踪文档，未发现新的低风险 CLI 命令缺口。
- 2026-07-06 同步主文档结论：本轮发现 CLI `project create` / `project update` 的项目元数据参数面落后于 `project-core` 与 author-site 项目路由，已补齐 `--category`、`--authoring-preferences`、`--sketch-editor-engine` 与 `--clear-authoring-preferences`，并通过 CLI 回归验证；该能力继续按 L4 维护。
- 2026-07-07 同步主文档结论：本轮未发现新的 L3 / L4 CLI 对齐缺口；`commands --json`、`register(...)` 与 `cli-all-commands` 反查守卫仍保持一致。会话、工作区、知识文档 CRUD 与截图任务继续停留在 author-site 路由或代理层，仍按共享层未完成处理。
- 2026-07-08 同步主文档结论：`project-core.listProjects()` 新增的“忽略缺少 `project.json` 的残留目录”行为已同时进入 CLI `project list` 与 author-site 项目列表读取路径；同日还确认 `project-core.getProject()` / `exportProjectPackage()` 已带出 `projectConfigValues`，但 author-site `/api/projects/[projectId]/config-values` 写入仍停留在路由层，`project-scaffold` 也尚未把 `project.config.values.json` 纳入本地项目包协议，因此新增 GAP-011 并继续按 L1 report-only 处理。`check:author` 在当前工作树下已恢复通过。
- 为避免自动任务因文件名漂移中断，本文件仅保留兼容入口职责，不重复维护事实正文。

## 待办

- 若外部自动化提示词后续改为直接读取 `创作端CLI.md`，可评估是否移除此兼容入口。

## 验证状态

- `corepack pnpm check:automation`：通过。
- `corepack pnpm check:project-core`：2026-07-10 通过。
- `corepack pnpm check:project-cli`：2026-07-10 通过。
- `corepack pnpm check:project-core`：2026-07-09 通过（34 tests passed）。
- `corepack pnpm check:project-cli`：2026-07-09 通过（含命令集与全命令回归复核）。
- `corepack pnpm check:project-scaffold`：2026-07-09 通过。
- `corepack pnpm check:author`：2026-07-09 通过（102 test suites / 677 tests）；正式仓库路径下当前 author-site 本地测试链路已恢复全绿。

## 风险

- 如果兼容入口与主文档同时被人工编辑，可能出现信息分叉；当前约定是只在 `创作端CLI.md` 维护正文。
