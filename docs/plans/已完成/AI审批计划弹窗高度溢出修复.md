# AI 审批计划弹窗高度溢出屏幕

## 背景

创作端 AI 对话中，Agent 在执行复杂任务前会调用 `requestPlanApproval` 提交一份 Markdown 执行计划，等待用户查看、编辑并批准。审批请求以 `PermissionDialog` 组件（`variant="inline"`）渲染在对话消息流中，用户点击「查看计划」按钮后会弹出一个全屏遮罩弹窗，内含可编辑的 `DocumentEditor` 编辑器。

## 涉及组件

| 组件 / 文件 | 所在包 | 角色 |
| --- | --- | --- |
| `PermissionDialog` | `@workbench/ai-chat-shared` (`packages/ai-chat-shared/src/permission-dialog.tsx`) | 审批弹窗 UI |
| `DocumentEditor` | `@workbench/demo-ui` (`packages/demo-ui/src/DocumentEditor.tsx`) | 计划内容编辑器 |
| `AIChat` | `@workbench/ai-chat-shared` (`packages/ai-chat-shared/src/ai-chat.tsx`) | 以 `variant="inline"` 渲染 PermissionDialog |

## 现象

1. 用户在创作端 AI 对话中收到 Agent 提交的审批计划卡片。
2. 用户点击「查看计划」按钮，弹出全屏遮罩弹窗。
3. 弹窗总高度超出浏览器视口高度（viewport height），底部操作按钮（取消 / 批准执行）被挤出屏幕不可见。
4. 用户无法点击底部按钮完成审批操作。

## 当前代码关键样式

弹窗遮罩层（第 88 行）：
```
fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm
```

弹窗内容容器（第 89 行）：
```
mx-4 flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border bg-background shadow-xl
```

编辑器滚动区域（第 107 行）：
```
min-h-0 flex-1 overflow-auto p-4
```

DocumentEditor 传入的 className（第 113 行）：
```
min-h-[420px]
```

## 待排查与修复

- 已修复：移除 `PermissionDialog` 中 `DocumentEditor` 的 `className="min-h-[420px]"`。

## 根因

弹窗容器使用 `max-h-[86vh]` 限制最大高度，但 `DocumentEditor` 的 `min-h-[420px]` 强制编辑器区域至少 420px。当视口高度较小时，header(~50px) + padding(32px) + 420px + footer(~50px) ≈ 552px 超过 86vh（如 600px 视口下 86vh=516px），导致底部按钮被 `overflow-hidden` 裁剪。

## 修复

`packages/ai-chat-shared/src/permission-dialog.tsx:113` 移除 `DocumentEditor` 的 `className="min-h-[420px]"`。编辑器依靠内部 `min-h-[200px]` 保证基本高度，`flex-1` 自然填充剩余空间。

## 验证

- [ ] 在 600px~800px 视口高度下测试弹窗底部按钮可见性
- [ ] 运行 `pnpm check:agent` 确保无类型错误
