# 创作端 AI 消息 Markdown 渲染修复

## 背景

创作端项目编辑页的 AI 对话区中，用户输入普通 Markdown 内容后，消息气泡左侧显示原文，右侧预留区域为空。用户期望普通 Markdown 能展示为渲染后的效果，而不是出现空白预览区。

## 目标

- 修复 AI 对话消息中 Markdown 渲染区域为空的问题。
- 明确用户消息、助手消息在 Markdown 内容下的展示边界。
- 保持创作端项目编辑页现有 AI 对话交互和布局不被 unrelated 改动影响。

## 范围

- 主要范围：`packages/author-site/src/components/ai-elements/` 下消息展示相关组件。
- 关联范围：必要的前端单元测试与 AI 对话模块文档记录。
- 不处理：agent-service 流式协议、模型配置、截图服务、历史数据目录。

## 方案

1. 定位消息内容渲染链路，确认普通文本、Markdown、工具调用、子 Agent 事件各自对应的 UI 分支。
2. 修复用户消息 Markdown 预览为空或布局异常的问题，优先复用现有 Markdown 渲染依赖与样式。
3. 补充最小测试覆盖，验证普通 Markdown 用户消息能渲染为预览内容。
4. 运行 author-site 相关测试或类型检查，记录验证结果。

## 任务清单

- [x] 建立任务记录，限定改动范围。
- [x] 定位 AI 消息展示组件和 Markdown 渲染实现。
- [x] 修复 Markdown 预览空白问题。
- [x] 补充或更新相关测试。
- [x] 运行匹配范围的验证命令。
- [x] 更新最终实施摘要和剩余风险。

## 进度记录

- 2026-06-25 11:50：根据截图确认问题集中在创作端项目编辑页 AI 对话消息展示；CodeGraph 工具未暴露，降级使用 `rg` 定位。
- 2026-06-25 11:52：读取 AI 对话模块文档，确认消息展示位于 `ai-elements` 组件层。
- 2026-06-25 12:03：确认助手消息已有 `Streamdown` 渲染，普通用户消息仍为纯文本 `whitespace-pre-wrap`；输入框保留了旧的 `pr-20` 右侧内边距，造成大段文本输入时右侧空白明显。
- 2026-06-25 12:08：已将普通用户消息切换为 `Streamdown` 渲染，并增加 `min-w-0`、代码块和表格横向滚动约束；同时移除输入框旧的超大右侧 padding。
- 2026-06-25 12:12：新增 `Message` 用户消息测试，验证普通 Markdown 用户消息进入 Markdown 渲染器。

## 实施摘要

- `packages/author-site/src/components/ai-elements/message.tsx`：普通用户消息改用现有 `Streamdown` 渲染 Markdown，避免 Markdown 表格、列表、代码块只显示为原文。
- `packages/author-site/src/components/ai-elements/prompt-input.tsx`：移除 textarea 旧的 `pr-20`，减少截图中输入区右侧空白。
- `packages/author-site/src/components/ai-elements/__tests__/message.test.tsx`：补充用户消息 Markdown 渲染回归测试。
- `packages/author-site/src/components/ai-elements/prompt-input.tsx`：输入框改为布局阶段同步高度，按 `minHeight/maxHeight` 自动拉高，超过最大高度后启用内部滚动。
- `packages/author-site/src/components/ai-elements/__tests__/prompt-input.test.tsx`：补充长文本自动拉高到最大高度的回归测试。

## 验证结果

- `pnpm --filter @opencode-workbench/author-site test -- --testPathPattern="ai-elements"`：未执行成功，原因是 Jest 30 将该参数替换为 `--testPathPatterns`。
- `pnpm --filter @opencode-workbench/author-site test -- --testPathPatterns="ai-elements"`：通过，3 个测试套件、8 个测试通过。
- `pnpm --filter @opencode-workbench/author-site typecheck`：通过。

## 验证方式

- 优先运行：`pnpm --filter @opencode-workbench/author-site test -- --testPathPattern="ai-elements"`
- 必要时运行：`pnpm --filter @opencode-workbench/author-site test`
- 若测试环境受已有脏改影响，记录失败原因和剩余风险。

## 风险与待确认事项

- 当前工作区存在大量未提交改动，本任务只追加局部修复，不回滚或整理既有改动。
- `message.tsx` 在本次修改前已有其他未提交字段扩展，本次未回退或整理。
