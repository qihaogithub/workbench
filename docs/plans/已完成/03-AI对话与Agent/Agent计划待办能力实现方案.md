# Agent计划待办能力实现方案

## 背景

当前 Agent 已支持工具调用、子 Agent 委派和前端工具进度展示，但缺少结构化计划/待办能力。前端已有 `plan` 事件监听和计划面板雏形，后端事件类型也预留了 `plan`，但 Pi Agent 实际工具集中没有通用计划更新工具，后端也不会稳定发出计划事件。

## 目标

- 为 Pi Agent 增加会话内结构化计划/待办更新能力。
- 让 Agent 可在复杂任务开始前提交用户可查阅、可编辑、需批准的 Markdown 执行计划。
- 让 Agent 在提交审批计划前先澄清高影响不确定问题，避免带着模糊需求生成计划。
- 让 Agent 在批准后使用自用待办，并在执行过程中更新每个待办项状态。
- 前端以计划审批弹窗展示用户计划，以待办面板展示 pending、in_progress、completed、failed 四类自用状态。
- v1 不做跨会话持久化，不提供用户手动勾选或编辑待办。

## 范围

- 后端：`packages/agent-service/` 的 Pi 工具注册、计划工具、事件映射和测试。
- 前端：`packages/agent-client/` 类型、`packages/author-site/` 计划事件处理、计划面板和测试。
- 文档：本任务计划文档与 Agent 行为提示词。

不处理历史 `data/` 脏数据、截图缓存、已有无关文档改动、会话历史落盘和人工编辑计划能力。

## 方案

1. 新增 `requestPlanApproval` Pi 工具，接收 Markdown 计划并阻塞等待用户查看、编辑和批准。
2. 扩展现有 `permission_request`/`permission_response` 链路，允许前端回传用户编辑后的 Markdown。
3. 新增 `updatePlan` Pi 工具，接收稳定 id、标题和状态列表，返回结构化 `details.items`，作为 Agent 自用待办。
4. 将两个计划相关工具注册到 Workbench 工具集，并递增工具版本。
5. 在 `PiAgentBackend` 内维护 `planItems`，当 `updatePlan` 成功返回时发出应用层 `plan` 事件。
6. 复用现有 WebSocket `plan` 事件，内容使用 JSON 字符串 `{ "items": [...] }`，减少协议面变更。
7. 前端解析结构化待办；解析失败时保留旧纯文本展示兼容。
8. 更新 system prompt，引导 Agent 复杂任务先澄清关键问题，再请求用户批准 Markdown 计划，批准后再维护自用待办。
9. 补充后端和前端单元测试，覆盖工具校验、事件转发、审批编辑和 UI 展示。

## 任务清单

- [x] 建立任务文档，确认实施范围。
- [x] 实现 `requestPlanApproval` 工具和用户审批链路。
- [x] 实现 `updatePlan` 工具和工具注册。
- [x] 实现后端计划状态与 `plan` 事件转发。
- [x] 补齐 `agent-client` 类型。
- [x] 改造前端计划解析和展示。
- [x] 更新 Agent 行为提示词。
- [x] 补充审批计划前澄清关键问题的行为规则。
- [x] 补充单元测试。
- [x] 运行验证命令并记录结果。

## 进度记录

- 2026-06-25：用户确认按方案实现 Agent 计划与待办能力。
- 2026-06-25：初步检查确认现有工具集无 `updatePlan`，后端未映射通用 `plan` 事件，前端已有 `ChatPlan` 和 `plan` 事件监听。
- 2026-06-25：已新增 `updatePlan` 工具、工具注册和后端 plan 事件转发；工具版本递增到 4。
- 2026-06-25：前端计划面板已改为结构化待办列表，并保留旧文本 plan 事件回退展示。
- 2026-06-25：已更新 system prompt，引导主 Agent 在复杂任务中创建并维护计划。
- 2026-06-25：后端、前端目标测试、完整测试和类型检查均已通过。
- 2026-06-25：根据用户反馈将“计划”和“待办”拆分：复杂任务先通过 `requestPlanApproval` 弹窗审批 Markdown 计划，批准后 Agent 再使用 `updatePlan` 维护自用待办。
- 2026-06-25：计划审批弹窗支持 Markdown 预览、用户编辑和批准后回传编辑内容；工具版本递增到 5。
- 2026-06-25：根据用户反馈补充 Codex 式澄清阶段：复杂任务如果目标、范围、验收标准或高影响偏好不清楚，Agent 必须先提问确认，再提交审批计划。
- 2026-06-25：根据用户截图反馈，将计划审批弹窗从左右双栏改为复用项目现有 `DocumentEditor` 的单栏 Markdown 编辑器。

## 实施摘要

- Agent 工具集新增 `requestPlanApproval`，用于提交用户审批的 Markdown 执行计划，并等待用户批准后继续。
- Agent 工具集新增 `updatePlan`，用于提交完整的当前任务待办项列表。
- `PiAgentBackend` 在 `updatePlan` 成功后维护内存态 `planItems`，并通过既有 `plan` 事件向前端发送 JSON 载荷。
- 现有权限确认链路已扩展为可回传用户编辑后的计划内容，删除确认仍只使用允许/拒绝。
- `agent-client` 补齐 `"plan"` 事件类型。
- 前端 `ChatPlan` 改为展示待办状态、标题和整体进度；非 JSON 内容仍按旧纯文本计划展示。
- 前端权限弹窗针对计划审批展示“查看计划”入口，点击后打开单栏 Markdown 编辑器；编辑器复用项目现有 `DocumentEditor`，通过工具栏切换编辑/预览。
- Agent system prompt 新增用户审批计划与待办规则：复杂任务先获批计划，再执行和维护自用待办。
- Agent system prompt 新增审批计划前澄清规则：关键问题不清楚时先普通回复提问并等待用户回答，不直接输出审批计划。

## 验证方式

- `pnpm --filter @opencode-workbench/agent-service test`
- `pnpm --filter @opencode-workbench/author-site test`
- `pnpm --filter @opencode-workbench/agent-service typecheck`
- `pnpm --filter @opencode-workbench/author-site typecheck`

验证结果：

- `pnpm --filter @opencode-workbench/agent-service test -- tests/unit/plan-tool.test.ts tests/unit/pi-agent.test.ts tests/unit/file-tools-permissions.test.ts`：通过，55 tests passed。
- `pnpm --filter @opencode-workbench/author-site test -- --testPathPatterns=chat-plan.test.tsx --testPathPatterns=stream-service-plan.test.ts`：通过，5 tests passed。
- `pnpm --filter @opencode-workbench/agent-service typecheck`：通过。
- `pnpm --filter @opencode-workbench/author-site typecheck`：通过。
- `pnpm --filter @opencode-workbench/agent-service test`：通过，159 tests passed。
- `pnpm --filter @opencode-workbench/author-site test`：通过，303 tests passed；Jest 结束时提示 worker 进程被强制退出，测试本身全部通过。
- `pnpm --filter @opencode-workbench/agent-service test -- tests/unit/plan-approval-tool.test.ts tests/unit/plan-tool.test.ts tests/unit/pi-agent.test.ts tests/unit/file-tools-permissions.test.ts`：通过，59 tests passed。
- `pnpm --filter @opencode-workbench/author-site test -- --testPathPatterns=permission-dialog-plan.test.tsx --testPathPatterns=chat-plan.test.tsx --testPathPatterns=stream-service-plan.test.ts`：通过，6 tests passed。
- `pnpm --filter @opencode-workbench/agent-service typecheck`：再次通过。
- `pnpm --filter @opencode-workbench/author-site typecheck`：再次通过。
- `pnpm --filter @opencode-workbench/agent-service test`：再次通过，163 tests passed。
- `pnpm --filter @opencode-workbench/author-site test`：再次通过，304 tests passed。
- `pnpm --filter @opencode-workbench/author-site test -- --testPathPatterns=system-prompt.test.ts`：通过。
- `pnpm --filter @opencode-workbench/author-site typecheck`：再次通过。
- `pnpm --filter @opencode-workbench/author-site test -- --testPathPatterns=permission-dialog-plan.test.tsx`：通过。
- `pnpm --filter @opencode-workbench/author-site typecheck`：再次通过。

## 风险与待确认事项

- v1 计划状态只在当前后端实例内存中存在，刷新或恢复历史会话后不会回放计划状态。
- Agent 是否主动调用 `requestPlanApproval` / `updatePlan` 依赖 system prompt 和模型遵循度，后续可根据实际表现继续强化提示词。
- Agent 是否先澄清再提交计划同样依赖 system prompt 遵循度；如果后续需要强约束，可考虑增加专用澄清工具或前端表单式确认。
- 复用 `plan` 字符串事件承载 JSON，前端必须保留旧文本回退，避免历史/异常事件导致展示失败。
- 计划审批当前复用权限确认通道，不新增独立的计划历史存储；用户批准后的 Markdown 会返回给 Agent，但不单独落盘。
