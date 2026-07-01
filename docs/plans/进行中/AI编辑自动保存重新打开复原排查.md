# AI编辑自动保存重新打开复原排查

## 背景

用户反馈：创作端 AI 编辑页面右上角显示“已自动保存”，但返回首页后重新打开项目，刚才由 AI 修复的内容又恢复到旧状态。

## 目标

- 确认“已自动保存”对应的数据是否真正进入可重新打开的项目当前态。
- 修复 AI 或协同编辑后的自动保存链路，避免重新打开项目时读取旧项目工作区。
- 补充最小测试，防止自动检查点只生成历史快照但未推进项目当前态。

## 范围

- 创作端编辑页的自动检查点链路。
- Session Workspace 与项目 canonical workspace 的同步关系。
- 相关项目文档中的实时保存语义。

不处理发布、命名版本、页面恢复和截图服务的无关改动。

## 方案

1. 读取编辑页、自动检查点 API、Session 管理和 Workspace 同步实现。
2. 确认自动检查点成功后是否把 Session Workspace 写回项目当前 Workspace。
3. 若没有写回，则复用现有 `syncEditSessionToProjectWorkspace`，让自动检查点成功后同步项目当前态，并在同步失败时返回错误。
4. 复查即时返回路径：右上角“已自动保存”来自协同自动保存，不等同于自动检查点。
5. 新增普通 Workspace 持久化接口，让协同自动保存和返回首页前同步都推进项目当前态。
6. 增加 checkpoint API 和普通持久化 API 测试，覆盖同步成功和同步失败的返回行为。
7. 更新项目文档，明确普通自动保存和自动检查点都会推进项目当前态。

## 任务清单

- [x] 定位自动保存、checkpoint、重新打开项目加载链路。
- [x] 确认根因：checkpoint 只创建版本快照，未同步项目当前 workspace。
- [x] 修改 checkpoint API。
- [x] 复查即时返回路径并补充普通自动保存持久化。
- [x] 补充自动检查点和普通持久化 API 测试。
- [x] 运行相关验证。
- [x] 更新项目文档。
- [x] 补充 AI 文件写入后当前页协同文本刷新，避免后续 flush 把旧内容写回 canonical workspace。

## 进度记录

- 2026-07-01：`/api/sessions/[sessionId]/checkpoint` 会从 Session Workspace 创建 `auto_checkpoint` 版本快照，但不调用 `syncEditSessionToProjectWorkspace`。编辑页右上角协同状态显示为“已自动保存”，自动 checkpoint 成功后还会清理未保存标记，因此用户返回首页后若重新进入项目读取项目 canonical workspace，就会看到旧内容。
- 2026-07-01：项目文档 `实时保存与协同编辑` 已要求重新进入项目优先复用活跃 Session 或 Workspace，同时说明自动检查点不会结束 Session。为覆盖新建 Session、复用失败或 Session 过期兜底路径，自动检查点成功后应同步项目当前 workspace。
- 2026-07-01：已修改 checkpoint API：flush 和预览校验通过后，先调用 `syncEditSessionToProjectWorkspace` 推进项目当前 workspace，再创建 `auto_checkpoint` 版本记录；同步失败时返回 `FILE_WRITE_ERROR`，不再创建检查点版本。
- 2026-07-01：已补充 checkpoint route 测试，覆盖同步成功和同步失败两条路径。
- 2026-07-01：复查发现第一版修复只覆盖自动检查点触发后的情况；用户可以在检查点触发前看到右上角“已自动保存”并立刻返回首页。已新增 `/api/sessions/[sessionId]/persist-workspace`，用于不创建版本记录地把 Session Workspace 同步到项目当前 Workspace。
- 2026-07-01：编辑页延迟协同自动保存成功后会调用普通持久化接口；返回首页前如果仍有待同步或未保存工作区变更，也会先同步项目当前 Workspace。只有该步骤成功后才清除同步状态。
- 2026-07-01：用户截图复现同一项目反复触发 `DUPLICATE_TOP_LEVEL_DECLARATION` 自动修复。排查发现 active Workspace 中目标文件已是单份组件，但项目 canonical `workspace/` 曾保留重复块；风险点在 AI 文件写入后，编辑页刷新了页面状态但没有确保当前页 Yjs 协同文本同步到修复后的磁盘内容，后续 Workspace flush 可能把旧协同文本再次写回。已调整 `handleAiFilesChange`：当刷新到的 active page 未切换时，通过 `applyDemoSnapshot(..., source: "ai-finish")` 应用代码和 Schema，同时更新协同文本、refs、预览缓存和待同步标记；页面切换兜底路径也同步维护 `codeRef` / `schemaRef`。

## 验证方式

- 已通过：`../../node_modules/.bin/jest --runTestsByPath 'src/app/api/sessions/[sessionId]/checkpoint/route.test.ts' 'src/app/api/sessions/[sessionId]/persist-workspace/route.test.ts'`（在 `packages/author-site` 下运行）。
- 已通过：`../../node_modules/.bin/tsc --noEmit`（在 `packages/author-site` 下运行）。
- 未运行完整 `pnpm check:author`：当前运行时 `pnpm` 为 11.x，与仓库 `pnpm@8.15.0` 锁文件不兼容，触发安装检查且网络受限。

## 风险与待确认事项

- 自动检查点会推进项目当前态，让项目列表和后续新 Session 看到最新草稿；命名版本仍作为人工历史节点保留。
- 若项目 workspace 同步失败，checkpoint API 返回失败，前端保留未保存状态并允许后续重试。
