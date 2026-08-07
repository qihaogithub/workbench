# AI对话与Agent-画布页面引用到对话

## 背景

在创作端画布中单选或多选页面时，工具栏需要新增“添加到对话”按钮，把选中的页面作为 `@页面名` 标签插入 AI 对话输入框。标签样式与现有可视化编辑“添加到对话”的元素标签一致，但颜色改为紫色。

## 目标

- 画布单选/多选页面 → 工具栏“添加到对话” → 输入框插入多个紫色 `@页面名` 标签。
- 标签 type 为 `page`，复用现有 `InlineTagInput` 内联标签机制。
- 提交后 AI 收到页面级 context（页面 ID、名称、源码路径 `demos/{pageId}/index.tsx`），消息区渲染紫色页面引用标签。
- 插入标签后保持画布选区不变。

## 范围

- `packages/ai-chat-shared/`：`InlineTag` 类型、`ChatInput`、`AIChat`、`message.tsx`。
- `packages/demo-ui/`：`PreviewCanvas` 选择工具栏 + `PreviewCanvasProps`。
- `packages/author-site/`：编辑页接线。
- `@workbench/shared`、`@workbench/agent-client` 类型不变。

## 方案

### 1. `@workbench/ai-chat-shared`

- `chat/inline-tag-input.tsx`：`InlineTag.type` 联合类型增加 `"page"`；`insertTag` 样式分支增加紫色（`bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300`）。
- `chat/chat-input.tsx`：
  - 新增 `ChatPageRef { id; label; context }`（与 `ChatElementRef` 同构），导出。
  - 新增 props `selectedPages?: ChatPageRef[]`、`onRemovePages?: () => void`。
  - 新增 `useEffect`：`selectedPages` 非空时遍历 `insertTag({ type: "page", ... })` 批量插入，随后 `onRemovePages?.()` 清空；用 ref 记录已处理 id 防重复。
  - `handleSubmit` 的 ref 构建增加 page 计数：`[引用页面N]`。
  - `inlineRefs.tags` 的 type union 增加 `"page"`。
- `ai-chat.tsx`：`AIChatProps` 增加 `selectedPages` / `onRemovePages` 并透传。
- `message.tsx`：`inlineRefs.tags.type` union 增加 `"page"`；渲染加紫色样式 + `FileText` 图标 + “页面引用” Dialog 标题。

### 2. `@workbench/demo-ui`

- `types.ts`：`PreviewCanvasProps` 增加 `onAddPagesToChat?: (pageIds: string[]) => void`。
- `PreviewCanvas.tsx`：页面选择工具栏（`selectionToolbarStyle` 区域）在删除按钮前新增“添加到对话”按钮，条件 `onAddPagesToChat && selectedPageIds.length > 0`（单选/多选均显示，不含 page-group）。点击调用 `onAddPagesToChat(selectedPageIds)`，不改变选区。
- `PreviewStage` 已通过 `...canvasProps` 透传，无需改动。

### 3. `@workbench/author-site`

- `app/demo/[id]/edit/page.tsx`：
  - 新增状态 `chatPageRefs`，传给 `<AIChat>`：`selectedPages={chatPageRefs}`、`onRemovePages={() => setChatPageRefs([])}`。
  - `canvasProps` 增加 `onAddPagesToChat: handleAddPagesToChat`。
  - 新增 `handleAddPagesToChat(pageIds)`：由 `demoPagesRef` 查页面名，构建每个页面 `ChatPageRef`（id、label=name、context=页面级信息 + 源码路径），`setChatPageRefs(refs)`。

## 页面 context 格式

```
当前项目的页面：{name}
- 页面ID: {pageId}
- 页面名称: {name}
- 源码文件: demos/{pageId}/index.tsx
```

## 任务清单

- [x] 确定方案并保存本文档
- [x] ai-chat-shared: page 标签类型 + ChatPageRef + 批量插入
- [x] demo-ui: PreviewCanvas 工具栏按钮
- [x] author-site: 编辑页接线
- [x] 验证 check:demo-ui / check:author
- [x] 更新项目文档 01_对话组件设计.md

## 进度记录

- 2026-08-06：方案定稿并保存。ai-chat-shared 新增 `page` 标签类型（紫色）、`ChatPageRef`、`ChatInput.selectedPages` 批量插入、`message.tsx` 页面引用渲染；demo-ui `PreviewCanvas` 选择工具栏新增“添加到对话”按钮并上抛 `onAddPagesToChat`；author-site 编辑页 `handleAddPagesToChat` 接线并传入 `AIChat.selectedPages`。验证：`pnpm check:author` 通过（139 suites / 1003 tests）、`@workbench/ai-chat-shared` typecheck 通过；`@workbench/demo-ui` typecheck 仅剩 test 文件既有 jest matcher 类型报错（改动前已存在，与本次变更无关）。项目文档 `01_对话组件设计.md` 已更新至 v2.15。

## 验证方式

- `pnpm check:demo-ui`、`pnpm check:author`。
- 手动：画布单选/多选页面 → 工具栏“添加到对话” → 输入框出现多个紫色 `@页面名` → 提交 → AI 收到页面 context → 消息区渲染紫色页面引用标签。

## 风险与待确认

- 无重大风险。`page` 标签为纯前端新增类型，`inlineRefs` 数据结构向后兼容（type 联合扩展）。