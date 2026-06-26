# 使用端只读 AI 问答方案

## 背景

使用端需要增加 AI 问答能力，帮助只读使用者理解当前项目、页面和配置。该能力应复用与创作端一致的项目上下文来源，但不能开放创作端的编辑、删除、保存、执行命令等能力。

## 目标

- 在使用端预览页提供可收起 AI 抽屉。
- AI 面向非技术使用者回答问题，表达侧重用途、含义和使用方式。
- AI 只读运行，不能修改项目或调用写入/执行类工具。
- 对话历史保存在浏览器本地，并按项目隔离。

## 范围

- 涉及 `packages/agent-service/` 的只读问答接口和 Pi Agent 只读模式。
- 涉及 `packages/viewer-site/` 的 AI 抽屉、API client 和环境变量说明。
- 涉及 `docs/项目文档/` 中使用端和独立 Agent 服务层的同步更新。
- 不包含流式输出、模型切换、服务端历史持久化、工具进度展示或权限确认。

## 方案

1. 在 agent-service 增加 viewer AI 路由，按 `projectId` 读取项目正式工作区并构造与创作端一致的上下文。
2. 为 Pi Agent 增加只读工具模式，只挂载读取类工具或完全依赖预注入上下文，确保返回结果不含文件变更。
3. 在 viewer-site 预览页 Header 增加 AI 图标按钮和可收起抽屉，发送当前项目、页面、配置和最近历史。
4. 使用 `localStorage` 保存 `viewer-ai:${projectId}` 历史。

## 任务清单

- [x] 创建任务文档并确认现有模块边界。
- [x] 实现 agent-service 只读工具模式与 viewer AI 路由。
- [x] 实现 viewer-site AI API client 与可收起抽屉。
- [x] 更新项目文档和环境变量说明。
- [x] 运行 `pnpm check:agent` 与 `pnpm check:viewer`，记录验证结果。

## 进度记录

- 2026-06-26：开始实施，已确认 viewer-site 生产为静态导出，因此使用端 AI 接口放在 agent-service。
- 2026-06-26：完成 agent-service `viewer-readonly` 工具模式、`/api/viewer-ai/chat` 路由和上下文构造模块；只读工具集仅包含读取类工具。
- 2026-06-26：完成 viewer-site AI API client、预览页左下角悬浮入口和左侧可收起问答侧栏；AI 栏作为主布局同级栏位出现，会挤压目录、预览区和配置栏；历史按 `viewer-ai:{projectId}` 存储。
- 2026-06-26：新增使用端 AI 问答项目文档，并更新独立 Agent 服务层接口规范、viewer `.env.example` 和 CORS 配置说明。
- 2026-06-26：验证通过：`pnpm check:agent`、`pnpm check:viewer`。

## 最终状态

已完成。使用端预览页已具备可收起的只读 AI 问答抽屉；agent-service 提供 `/api/viewer-ai/chat` 只读接口，并通过 `viewer-readonly` 工具模式隔离写入和执行类能力。

## 验证方式

- `pnpm check:agent`
- `pnpm check:viewer`
- 手动打开使用端项目预览页，验证抽屉打开/收起、问答、刷新历史保留和只读拒绝编辑类请求。

## 风险与待确认事项

- 当前工作区已有大量未提交改动，实施时只做局部修改，不覆盖无关变更。
- agent-service 侧上下文构造需要控制长度，避免一次请求注入过多页面源码。
