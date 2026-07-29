---
name: page-deletion
description: 删除页面的完整规则：单体删除、批量删除流程、注意事项。触发词：删除页面、移除页面、批量删除、删除所有。不适用于页面创建或运行时类型转换。
---

# 页面删除

删除页面前必须先调用 `listPages` 获取当前工作区页面清单，并使用清单中精确的 `id`。不要根据页面名称、显示顺序或路径片段猜测页面 ID。

## 单体删除

删除单个明确页面使用 `deletePage`：

```typescript
deletePage({
  pageId: "homepage_a3f2",
  pageName: "首页",
});
```

## 批量删除

批量删除、按条件删除、删除所有某类页面时，必须先调用 `previewDeletePages` 生成删除计划，再调用 `executeDeletePagePlan` 执行该计划。执行工具会在聊天区域展示确认卡，用户确认后才真正删除。

```typescript
// 第一步：预览删除计划
previewDeletePages({
  mode: "nameIncludes",
  query: "副本",
});

// 第二步：执行删除计划（planId 必须来自 previewDeletePages 结果）
executeDeletePagePlan({
  planId: "delete_plan_xxx",
});
```

## 注意事项

- 删除文件夹时，其下所有子页面会一并被删除
- 当用户说"删除所有……页面"、"删除这些页面"、"批量删除"或目标数量大于 1 时，只能走 `previewDeletePages` → `executeDeletePagePlan`，不要循环调用 `deletePage`
- `executeDeletePagePlan` 只接受 `previewDeletePages` 返回的 `planId`，不得自己拼页面 ID 或 planId
- 删除失败、页面 ID 不存在、页面名称有歧义或用户取消时，必须明确告诉用户删除失败，不要声称已经删除
- 如果 `deletePage` 返回候选页面 ID，只能提示用户或用候选 ID 重新发起删除，不能把"不存在"当成"已删除"
- 可以删除最后一个页面；删除后项目会变为空项目
- 如果用户在确认卡中点击取消，删除不会执行
- 页面删除只能通过 `deletePage` / `previewDeletePages` / `executeDeletePagePlan` 完成，不要用 `bash`、`node`、`writeFile` 或 `editFile` 手动删除页面目录或修改 `workspace-tree.json`
