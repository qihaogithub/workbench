# Agent 画布整理工具能力方案

> 创建日期：2026-06-25
> 状态：已完成
> 范围：创作端 AI agent 操作画布页面位置与大小的基础能力

## 背景

创作端画布工作台已支持用户手动拖拽、缩放和一键自动排版，布局会持久化到工作区的 `.canvas-layout.json`。当前 AI agent 只能通过页面文件与页面树元数据影响项目，缺少稳定的画布操作入口。

用户希望 agent 能整理画布中页面的位置和大小，并为未来页面连线等画布级能力打基础。

## 目标

- 为 agent-service 增加确定性的画布整理工具。
- 工具能读取当前工作区页面清单、已有画布布局和页面预览尺寸。
- 工具能整理页面位置与大小，并写回现有画布布局持久化格式。
- 系统提示明确区分“页面树顺序”和“画布布局”，引导 agent 使用专用工具。

## 范围

- 修改 `packages/agent-service/` 的 Pi Agent 工具集。
- 必要时复用或移植共享画布布局算法。
- 更新创作端 agent system prompt。
- 补充 agent-service 单元测试。

不处理：

- 不新增前端画布按钮或交互。
- 不实现页面连线。
- 不改变页面树拖拽排序接口。
- 不改变画布布局 API 的认证与读写策略。

## 方案

新增画布布局工具层，先提供 `arrangeCanvasPages`：

- 输入允许指定整理模式、可选页面 ID、可选间距、排序依据和尺寸策略。
- 默认整理所有页面，保留当前大致行列关系，复用当前页面尺寸。
- 当页面没有已保存布局时，按页面顺序生成初始布局。
- 输出整理后的页面数量、写入路径和布局摘要。
- 写回 `.canvas-layout.json`，格式与现有前端 API 保持兼容。

未来页面连线可在同一工具层继续扩展为“读取画布状态”“更新画布对象”“更新画布连线”等能力，避免 agent 直接编辑隐藏状态文件。

## 任务清单

- [x] 阅读现有画布自动排版、布局保存和 agent 工具上下文。
- [x] 创建任务计划文档。
- [x] 设计 `arrangeCanvasPages` 参数和输出。
- [x] 实现画布布局工具并注册到 Pi Agent 工具集。
- [x] 更新 system prompt 中的画布操作规则。
- [x] 补充单元测试。
- [x] 运行验证并记录结果。

## 进度记录

- 2026-06-25：确认前端已有自动排版与布局持久化，agent-service 当前没有画布专用工具。
- 2026-06-25：决定先实现最小闭环工具 `arrangeCanvasPages`，把画布状态写入现有 `.canvas-layout.json`。
- 2026-06-25：新增 `canvas-layout-tool.ts`，支持保留分组整理、网格重排、按页面预览尺寸重置大小、指定页面局部整理和视口自动适配。
- 2026-06-25：将 `.canvas-layout.json` 加入通用文件工具拒绝列表，画布布局必须通过专用工具写入。
- 2026-06-25：更新 agent system prompt，按工具能力分支说明画布整理规则。
- 2026-06-25：同步更新 AI 行为约束机制技术文档，记录画布整理工具和隐藏布局文件权限边界。
- 2026-06-25：验证通过，见下方验证结果。

## 实施摘要

- Agent Service 新增 `arrangeCanvasPages` 工具，注册进 Pi Agent 工具集，工具版本提升到 6。
- 工具读取 `workspace-tree.json` 与每个页面的 `config.schema.json`，生成或复用画布布局。
- 默认 `preserveGroups` 会沿用当前画布的大致行列关系，只做对齐、吸附和间距整理。
- `grid` 模式可按页面树顺序重新铺成规则网格；`sizeMode: "preview"` 可把画布尺寸重置为页面 `$demo.previewSize`。
- 通用文件工具不再允许直接操作 `.canvas-layout.json`，减少隐藏状态被手写破坏的风险。
- System prompt 明确区分左侧页面树 `order` 与画布页面位置/大小。
- 项目文档已记录该能力的 L1/L2 行为约束。

## 验证方式

- 运行 agent-service 画布工具单元测试。
- 运行 `pnpm --filter @opencode-workbench/agent-service typecheck`。
- 必要时运行相关 system prompt 测试。

验证结果：

- 2026-06-25：`pnpm --filter @opencode-workbench/agent-service test -- tests/unit/canvas-layout-tool.test.ts tests/unit/permissions.test.ts tests/unit/pi-agent.test.ts tests/unit/file-tools-permissions.test.ts` 通过。
- 2026-06-25：`pnpm --filter @opencode-workbench/agent-service typecheck` 通过。
- 2026-06-25：`pnpm --filter @opencode-workbench/author-site test -- --runTestsByPath src/lib/agent/__tests__/system-prompt.test.ts` 通过。
- 2026-06-25：`pnpm --filter @opencode-workbench/author-site typecheck` 通过。

## 风险与待确认事项

- 当前目标只处理页面位置和大小，不处理页面连线模型；后续连线能力可沿用本次新增的画布工具层扩展。
