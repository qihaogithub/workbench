# Agent 计划审批卡片优化

## 背景

当前 Agent 在复杂任务前可提交执行计划审批。聊天区的计划审批卡片只提供“查看计划”，用户需要先打开计划弹窗，才能批准继续执行。用户希望卡片上直接提供“批准”，减少简单确认时的操作路径；同时希望 Agent 自主判断是否需要用户审批，只有复杂、需要确认的大任务才提交审批计划。

## 目标

- 在执行计划待确认卡片上增加直接“批准”入口。
- 保留“查看计划”入口，用户仍可查看、编辑计划后再批准。
- 调整 Agent 行为规则：简单、低风险任务不要制造审批计划噪音；复杂、高影响或需要用户确认的大任务才请求计划审批。
- 补充测试与项目文档，确保交互和行为约束可追踪。

## 范围

- 前端：`PermissionDialog` 计划审批卡片。
- 测试：计划审批卡片交互单测。
- Agent 行为：创作端静态系统提示词中的计划审批规则。
- 文档：AI 对话需求与行为约束文档。

不修改删除页面确认、普通工具权限确认和 Agent 服务端审批协议。

## 方案

1. 计划审批卡片新增“批准”按钮，点击后直接提交原始计划内容。
2. “查看计划”继续打开可编辑弹窗，用户编辑后批准时提交编辑后的计划内容。
3. 系统提示词改为“自主判断 + 复杂任务审批”，明确简单任务直接执行，复杂任务审批，敏感操作仍走对应确认。
4. 更新 AI 对话模块文档，记录计划审批卡片与 Agent 自主判断规则。

## 任务清单

- [x] 创建任务追踪文档
- [x] 修改计划审批卡片 UI
- [x] 补充计划审批卡片单测
- [x] 调整 Agent 系统提示词
- [x] 同步 AI 对话项目文档
- [x] 运行相关验证

## 进度记录

- 2026-06-30：定位到计划审批卡片位于 `packages/author-site/src/components/ai-elements/permission-dialog.tsx`，审批请求由 `permission_request` 事件驱动，Agent 是否调用审批计划由 `packages/author-site/src/lib/agent/prompts/system-prompt.md` 约束。
- 2026-06-30：已在计划审批卡片新增“批准”入口，直接返回当前计划内容；“查看计划”继续支持编辑后批准。
- 2026-06-30：已调整系统提示词，要求 Agent 自主判断任务复杂度，简单低风险任务不提交审批计划。
- 2026-06-30：已同步 AI 对话需求、组件设计和行为约束文档。
- 2026-06-30：目标单测通过；author-site 完整 Jest 通过；`check:author` 在类型检查阶段因既有 `ai-chat.tsx` 类型错误失败。

## 验证方式

- 运行计划审批卡片相关 Jest 测试。
- 如时间允许，运行 `pnpm check:author` 覆盖 author-site 类型检查与测试。

## 验证结果

- `corepack pnpm --filter @opencode-workbench/author-site test -- --runTestsByPath src/components/ai-elements/__tests__/permission-dialog-plan.test.tsx src/lib/agent/__tests__/system-prompt.test.ts`：通过，2 个测试套件、20 个测试通过。
- `corepack pnpm --filter @opencode-workbench/author-site test`：通过，61 个测试套件、459 个测试通过。
- `corepack pnpm check:author`：未通过；类型检查报错 `src/components/ai-elements/ai-chat.tsx(141,5): Property 'handleCancelQueuedMessage' does not exist ...`，该文件存在本轮外的工作区改动，本任务未修改该文件。

## 风险与待确认事项

- 直接批准使用当前请求携带的原始计划内容，不经过编辑弹窗；如果用户需要调整计划，应先点击“查看计划”编辑。
- Agent 是否减少审批计划取决于模型对系统提示词的遵守；本次不增加后端硬拦截。
