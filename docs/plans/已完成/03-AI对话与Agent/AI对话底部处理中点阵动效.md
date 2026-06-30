# AI 对话底部处理中点阵动效

> 状态：已完成
> 创建日期：2026-06-29

## 背景

AI 对话信息流底部已有“AI 正在处理”的轻量提示。用户希望将该提示替换为截图所示的点阵循环动效，减少文字干扰，同时保留“AI 正在处理”的状态表达。

## 目标

- 将 streaming 空窗期的信息流底部提示替换为靠左、紧凑的 5x5 点阵动效。
- 动效仅表达处理中状态，不引入进度估算或日志入口。
- 保留无障碍语义，使屏幕阅读器仍能识别“AI 正在处理”。

## 范围

- 创作端 AI 对话消息展示组件。
- 点阵动效所需的全局样式。
- 现有组件测试与 AI 对话模块技术文档。

## 方案

- 在 `AssistantMessage` 内将 `RunProgressPanel` 的可见内容替换为点阵动效组件。
- 使用 CSS keyframes 控制点阵亮点沿固定轨道循环，并在 `prefers-reduced-motion` 下展示静态高亮点。
- 更新测试断言，验证处理中状态仍存在且不暴露日志入口。
- 更新 AI 对话“运行进度与事件日志”文档，记录点阵提示的展示语义。

## 任务清单

- [x] 定位现有运行中提示实现与相关测试。
- [x] 实现点阵动效组件与样式。
- [x] 更新测试断言。
- [x] 更新 AI 对话项目文档。
- [x] 运行匹配验证并记录结果。

## 进度记录

- 2026-06-29 10:56：确认当前提示位于 `packages/author-site/src/components/ai-elements/assistant-message.tsx` 的 `RunProgressPanel`，现状为图标、文字和三个弹跳点。
- 2026-06-29 11:06：将 `RunProgressPanel` 替换为只显示点阵的状态提示，新增 CSS 动效和 `prefers-reduced-motion` 静态降级，并同步更新组件测试与 AI 对话文档。
- 2026-06-29 11:14：`corepack pnpm --filter @opencode-workbench/author-site typecheck` 通过；聚焦测试 `assistant-message-subagent.test.tsx` 通过。`corepack pnpm check:author` 的 typecheck 通过，但完整 Jest 受本机 `better-sqlite3` native binding 缺失影响，在数据库相关测试文件失败。
- 2026-06-29 15:46：根据截图反馈，将点阵从居中大块调整为靠左紧凑状态提示，缩小点尺寸并减弱光晕。
- 2026-06-29 15:48：复调后 `corepack pnpm --filter @opencode-workbench/author-site typecheck` 与聚焦测试 `assistant-message-subagent.test.tsx` 均通过。
- 2026-06-29 15:55：根据交互建议，将点阵缩小到约 23px，并改为仅在请求空窗期显示；出现“思考中...”、工具调用或文本输出后隐藏点阵，避免重复状态表达。
- 2026-06-29 15:57：空窗期互斥规则调整后，`corepack pnpm --filter @opencode-workbench/author-site typecheck` 与聚焦测试 `assistant-message-subagent.test.tsx` 均通过。

## 验证方式

- 运行 `corepack pnpm --filter @opencode-workbench/author-site test -- --testPathPatterns=assistant-message-subagent.test.tsx`。
- 如范围需要，补充运行 `corepack pnpm check:author`。

## 实施摘要

- `RunProgressPanel` 改为只在空窗期渲染靠左点阵状态提示，移除原先的图标、可见文字和三点弹跳。
- 点阵采用约 23px 的紧凑 5x5 布局，亮点沿固定轨道循环，并在减少动态效果设置下展示静态高亮点。
- 出现真实 reasoning、工具调用或文本内容时，点阵隐藏，由已有处理过程承担状态反馈。
- 状态容器保留 `role="status"` 和 `aria-label="AI 正在处理"`，保证无障碍语义不丢失。
- AI 对话模块技术文档和索引已同步更新为点阵处理中提示。

## 验证结果

- 通过：`corepack pnpm --filter @opencode-workbench/author-site typecheck`
- 通过：`corepack pnpm --filter @opencode-workbench/author-site test -- --testPathPatterns=assistant-message-subagent.test.tsx`
- 通过：15:46 靠左紧凑微调后再次运行上述 typecheck 和聚焦测试。
- 通过：15:55 空窗期互斥规则调整后再次运行上述 typecheck 和聚焦测试，聚焦测试为 12 个用例通过。
- 部分通过：`corepack pnpm check:author` 的 typecheck 通过；完整 Jest 因本机 `better-sqlite3` native binding 缺失，在 `external-auth.test.ts`、`user-model-config.test.ts`、`dingtalk-login.test.ts` 失败。

## 风险与待确认事项

- 点阵动效应避免占用过多空间，不能影响消息流底部自动滚动。
- 动效视觉以用户截图为准，但具体轨迹采用本地 CSS 实现，不引入新 UI 依赖。
- 未做浏览器截图验证；当前验证覆盖组件渲染、无障碍状态和类型检查。
