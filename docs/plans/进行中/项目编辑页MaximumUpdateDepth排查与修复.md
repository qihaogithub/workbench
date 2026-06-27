# 项目编辑页 Maximum update depth 排查与修复

## 背景

打开项目编辑页后，前端抛出 `Maximum update depth exceeded`。附件堆栈显示最终触发点在 React 更新队列与 `@radix-ui/react-compose-refs` 的 `setRef`，页面无法正常进入编辑态。

## 目标

- 定位编辑页打开后反复触发 React state 更新的根因。
- 修复无限更新，确保项目编辑页可正常渲染。
- 记录验证方式和剩余风险，便于后续继续排查。

## 范围

- 涉及文件：
  - `packages/author-site/src/hooks/useCollabDocument.ts`
  - `packages/author-site/src/app/demo/[id]/edit/page.tsx`
  - `packages/shared/src/demo/PreviewPanel.tsx`
  - `packages/shared/src/demo/PreviewCanvas.tsx`
  - `docs/项目文档/创作端/04-配置与预览/技术/08_协同草稿驱动预览.md`
- 不处理现有无关脏数据、历史计划文档和生成文件。

## 方案

自动化浏览器复现后，控制台在 `Maximum update depth exceeded` 前持续输出协同 WebSocket 被创建后立即关闭的警告。`DemoEditPage` 每次渲染都会用 inline object 构造 5 个 `CollabRoomDescriptor`，`useCollabDocument` 又把整个 `descriptor` 对象放入 effect 依赖。父组件任意状态更新都会让 descriptor 引用变化，进而销毁并重建 Yjs `WebsocketProvider`，provider 初始化中的 `setProvider`、`setYdoc`、`setYtext`、`setStatus` 又触发下一轮渲染，形成“渲染 -> 新 descriptor 引用 -> 重建 provider -> setState -> 再渲染”的循环。

修复方式是在 `useCollabDocument` 内部按 `projectId`、`workspaceId`、`sessionId`、`resourcePath`、`kind` 生成稳定 key，并用稳定 descriptor 驱动 provider 生命周期。调用方即使传入新对象，只要房间字段不变，就不会重建 provider。

此前已加入的 positionable sizes 等价去重仍保留，作为预览 iframe 高频尺寸上报的无意义渲染防线，但它不是本次仍复现的主因。

## 任务清单

- [x] 收集报错堆栈与复现场景。
- [x] 使用 CodeGraph 定位编辑页、画布和预览组件链路。
- [x] 增加 positionable sizes 等价去重。
- [x] 使用 Playwright CLI 登录本地账号复现，抓取控制台日志。
- [x] 修复 `useCollabDocument` 的 descriptor 引用不稳定导致的 provider 重建循环。
- [x] 更新长期技术文档中的状态回写约束。
- [x] 运行 author-site 类型验证。

## 进度记录

- 2026-06-27：确认 CodeGraph 索引可用，定位到编辑页同时挂载 `PreviewCanvas` 和单页 `PreviewPanel`，两处均把 `setPositionableItemSizes` 传给预览组件。
- 2026-06-27：确认 `PreviewPanel` 在 `POSITIONABLE_SIZES_RESULT` 中直接调用 `onPositionableSizes`，iframe 上报对象每次都是新引用。
- 2026-06-27：在编辑页增加 `arePositionableSizesEqual` 和 `handlePositionableSizes`，两处预览入口统一使用等价去重回调。
- 2026-06-27：Playwright CLI 登录 `qihao` 后复现编辑页，控制台显示 `Maximum update depth exceeded` 前出现大量 `y-websocket` 连接被关闭日志，组件栈定位到 `DemoEditPage`。
- 2026-06-27：确认 `DemoEditPage` 向 `useCollabDocument` 传入 inline descriptor object，而 hook effect 依赖整个 `descriptor`，导致每次父级渲染都销毁并重建 provider。
- 2026-06-27：在 `useCollabDocument` 内按协同房间字段稳定 descriptor，provider 生命周期只随实际房间变化。
- 2026-06-27：执行 `pnpm --filter @opencode-workbench/author-site typecheck` 通过；页面热更新后未再出现新的 `Maximum update depth exceeded`。此前重连风暴触发的 agent-service 429 仍会让旧浏览器会话里的 WebSocket 自行重试，需要等待限流恢复或重启相关服务后再做干净浏览器复测。
- 2026-06-27：执行 `pnpm check:author` 通过，48 个 Jest 测试套件、369 个测试全部通过。

## 验证方式

- 已运行 `pnpm --filter @opencode-workbench/author-site typecheck`，`tsc --noEmit` 通过。
- 已运行 `pnpm check:author`，类型检查和 Jest 全量 author-site 测试通过。
- 已用 Playwright CLI 打开 `/demo/proj_1782286923644/edit` 并复现；修复后重新加载页面，新的控制台日志未再出现 `Maximum update depth exceeded`。
- 干净复测建议：关闭现有测试浏览器会话，等待 agent-service 429 限流恢复后重新打开 `/demo/:id/edit`，确认协同状态不再形成连接风暴。

## 风险与待确认事项

- 当前修复只过滤尺寸内容完全相同的上报；如果 iframe 内容真实变化导致宽高变化，仍会正常更新配置表单可定位元素尺寸。
- 堆栈截图最终显示在 Radix ref 组合层，但控制台组件栈和 WebSocket 日志表明更上层根因是协同 provider 生命周期循环；若干净复测仍出现 Radix 栈，需要单独排查 Tooltip/Dialog/Select ref 抖动。
- 本次 `pnpm check:author` 已通过；剩余风险主要是浏览器会话若在修复前触发过大量连接，agent-service 可能短时间返回 429，需要等待限流恢复或重启服务后再刷新页面。
