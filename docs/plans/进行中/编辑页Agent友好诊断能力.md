# 编辑页Agent友好诊断能力

## 背景

项目编辑页的问题常分布在实时协作、自动保存、AI 对话和预览区之间。当前各链路已有局部日志和状态，但缺少统一时序视图，Codex 排查时需要在前端控制台、后端运行日志、协同状态和项目数据之间反复拼接。

## 目标

- 为编辑页建立统一 `editorSessionId` 和事件时序，方便定位问题发生在哪条链路。
- 将诊断事件持久化为后端 JSONL，便于 Codex 在本机直接读取。
- 提供隐藏导出入口，普通用户界面不常驻诊断面板。
- 避免保存完整源码、完整 AI 提示词、密钥或数据库快照。

## 范围

- 创作端编辑页 `/demo/[id]/edit`。
- author-site 内的诊断事件写入、导出 API 和前端 Hook。
- 与实时协作、自动保存、AI 对话、预览区的关键事件接入。
- 对应项目文档更新和最小测试。

不处理生产日志平台、完整数据库快照、全站埋点或 agent-service 协议重构。

## 方案

1. 新增编辑页诊断类型、脱敏、JSONL 存储与导出组装能力。
2. 新增 `POST /api/editor-diagnostics/events` 和 `GET /api/editor-diagnostics/export`。
3. 新增前端 `useEditorDiagnostics`，负责本地缓冲、批量上报、导出包下载、隐藏快捷键。
4. 在编辑页接入协同状态、自动保存、AI 文件变更、预览错误和导出入口。
5. 增加 API 与核心工具测试，更新项目文档。

## 任务清单

- [x] 创建诊断类型、存储和 API。
- [x] 创建前端诊断 Hook。
- [x] 接入编辑页关键事件和隐藏导出入口。
- [x] 补充测试。
- [x] 更新项目文档。
- [x] 运行验证并记录结果。

## 进度记录

- 2026-07-01：开始实施。当前工作区存在大量用户/生成改动，本任务只追加诊断相关文件和必要编辑页接入，不清理 data、截图、日志或其他无关改动。
- 2026-07-01：已新增 `editor-diagnostics` 类型、脱敏、JSONL 写入、导出组装和 API 路由。事件写入 `data/editor-diagnostics/<editorSessionId>.jsonl`，导出包附带 agent run log 索引。
- 2026-07-01：已新增 `useEditorDiagnostics`，提供前端本地缓冲、批量上报、`?diagnostics=1` 隐藏按钮和 `Cmd/Ctrl+Shift+D` 导出快捷键。
- 2026-07-01：已接入编辑页协同状态快照、自动保存 flush、退出前 flush、AI stream/message/file change、预览 runtime console、预览加载完成和 `previewDiagnostic` 错误事件。
- 2026-07-01：已新增基础设施项目文档 `05_编辑页诊断日志.md` 并更新模块索引。

## 验证方式

- 已通过：`../../node_modules/.bin/jest --runTestsByPath src/lib/editor-diagnostics/types.test.ts src/lib/editor-diagnostics/store.test.ts src/app/api/editor-diagnostics/events/route.test.ts src/app/api/editor-diagnostics/export/route.test.ts src/components/demo/useEditorDiagnostics.test.tsx`。
- 已通过：`../../node_modules/.bin/jest --runTestsByPath src/components/ai-elements/__tests__/use-chat-stream-auto-repair.test.tsx src/components/demo/useConsoleBuffer.test.tsx`。
- 未通过：`../../node_modules/.bin/tsc --noEmit`，当前阻断为既有测试文件 `src/app/api/sessions/[sessionId]/workspace-flush/route.test.ts(1,7): Duplicate identifier 'TestResponse'`。本任务新增的同名测试已通过 `export {}` 限定为模块作用域。
- 待手工检查：用 `?diagnostics=1` 打开编辑页，触发协同、自动保存、AI 修改和预览错误后导出 JSON。

## 风险与待确认事项

- 编辑页主文件已有较多未提交改动，本次只在现有状态机上追加诊断事件；后续合并时需要注意不要覆盖这些既有改动。
- 后端 JSONL 是排查产物，应保持在 `data/editor-diagnostics/`，不纳入版本控制。
- 完整 `check:author` 需要先处理既有 route test 全局 `TestResponse` 命名冲突，或把相关测试统一改为模块作用域。
