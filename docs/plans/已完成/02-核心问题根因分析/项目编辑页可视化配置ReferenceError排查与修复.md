# 项目编辑页可视化配置 ReferenceError 排查与修复

## 背景

2026-06-27，创作端项目编辑页 `/demo/proj_1782286923644/edit` 在浏览器中出现 Next.js 运行时错误：`ReferenceError: visualConfigCandidates is not defined`。错误位置指向 `packages/author-site/src/app/demo/[id]/edit/page.tsx` 的可视化配置候选项依赖数组。

## 目标

- 消除编辑页首屏渲染时的 `visualConfigCandidates` 未定义错误。
- 确认同一轮 Hook 抽取是否还存在其他未接回页面作用域的状态。
- 运行 author-site 类型检查，避免只修复一个运行时报错后留下编译问题。

## 范围

- `packages/author-site/src/app/demo/[id]/edit/page.tsx`
- `docs/项目文档/创作端/04-配置与预览/技术/06_可视化批注与编辑机制.md`

## 方案

页面已有 `useVisualEditState` 和 `useVersionControl` Hook 调用，但旧页面实现仍直接使用已经移入 Hook 的状态变量。修复方案是在 Hook 调用后解构页面仍需消费的状态、setter 和 handler，保持现有页面逻辑可运行；不在本次改动中删除大量历史 handler，避免扩大影响面。

## 任务清单

- [x] 定位报错变量来源和当前页面 Hook 接入状态。
- [x] 从 `useVisualEditState` 返回值补齐可视化编辑相关状态解构。
- [x] 从 `useVersionControl` 返回值补齐版本与发布相关状态、handler 解构。
- [x] 更新可视化编辑长期技术文档的状态归属约束。
- [x] 运行 author-site 类型检查。

## 进度记录

- 2026-06-27：根据截图确认运行时报错来自 `visualConfigCandidates` 渲染期引用。
- 2026-06-27：发现页面注释显示可视化编辑状态已迁入 `useVisualEditState`，但旧 handler 仍在使用未解构变量。
- 2026-06-27：首次类型检查进一步暴露 `useVersionControl` 也存在同类返回值未解构问题。
- 2026-06-27：补齐两个 Hook 的返回值解构后，`pnpm --filter @opencode-workbench/author-site typecheck` 通过。
- 2026-06-27：继续运行 `pnpm check:author`，author-site 类型检查与 48 个 Jest 测试套件全部通过。

## 验证方式

- `pnpm --filter @opencode-workbench/author-site typecheck`
- `pnpm check:author`

## 风险与待确认事项

- 当前修复以最小改动接回 Hook 返回值，保留了页面中的部分历史 handler。后续可继续把这些重复 handler 删除，进一步降低状态归属混乱风险。
