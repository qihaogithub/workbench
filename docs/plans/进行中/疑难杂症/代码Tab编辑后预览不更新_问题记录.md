# 代码Tab编辑后预览不更新 — 问题记录

> 创建时间：2026-06-03
> 状态：**待修复**

---

## 问题描述

在「代码」Tab 中直接编辑 demo 页面代码文件（`index.tsx` / `config.schema.json`），保存后预览区不更新。

---

## 已完成修复（未解决）

共实施 5 个方案，涉及 6 个文件，typecheck + lint 全部通过：

| 方案 | 说明 | 是否有效 |
|------|------|----------|
| 方案二 | `applyDemoSnapshot` deps 加入 `activeDemoId`；`source` 参数由调用方传递 | ✅ 正确性提升 |
| 方案一-A | HTTP 兜底条件 `\|\|` → `&&`（一行改） | ✅ 解决 AI 完成时的覆盖问题 |
| 方案三 | `PreviewPanel` 编译 deps 移除 `snapshotVersion` | ✅ 减少多余编译 |
| 方案六 | `WorkspaceCodeDialog` 新增 `onSaved` prop → `handleWorkspaceFileSaved` → `applyDemoSnapshot` | ❌ 保存后预览未更新 |
| 方案四 | `ConfigForm` key 改为 `{activeDemoId}` | ✅ 不强制重建 |

---

## 关键架构发现

### PreviewPanel（单页）+ GridIframe（宫格）编译路径不同

| 组件 | 编译 API 请求 | code 来源 | 需要 snapshotVersion？ |
|------|-------------|----------|----------------------|
| `PreviewPanel` | `{ sessionId, code }` | React 状态 `code` | **不需要** — code prop 变化即触发 |
| `GridIframe` | `{ sessionId, demoId }` | **文件系统**（compileSession) | **需要** — page.code 始终为 undefined |

GridIframe 在 author 模式下发送 `{ sessionId, demoId }`，编译 API 调用 `compileSession()` 从文件系统读取代码。即使用户在代码 Tab 保存了文件，GridIframe 的编译 effect deps（`page.id`、`page.code`）均无变化，不会重新触发编译。

- `page.code` 来自 `demoPages: DemoPageMeta[]`，该类型**无 `code` 字段**，始终为 undefined
- 方案六通过 `applyDemoSnapshot` 更新了全局 `code` 状态，但 `demoPages` 数组未被更新

---

## 代码Tab 保存 → 预览同步的完整调用链

```
用户保存 → onSave(PUT API 写入文件系统)
  → onSaved({ filePath, content })
  → handleWorkspaceFileSaved(path, content)
    → extractDemoIdFromPath(path) → 匹配 activeDemoId
    → applyDemoSnapshot({ code: content, source: "manual-load" })
      → setCode(新代码)           → PreviewPanel code prop 变化 → 编译 ✅
      → invalidateCompileCache    → 清除缓存
      → setSnapshotVersion +1    → GridIframe snapshotVersion 变化 → 编译 ✅
```

调用链逻辑正确，但实际预览不更新。需进一步排查。

---

## 涉及文件

| 文件 | 作用 |
|------|------|
| `page.tsx:768-789` | `handleWorkspaceFileSaved` — 保存后同步预览的入口 |
| `page.tsx:1715-1717` | `onSaved` 回调 wiring |
| `WorkspaceCodeDialog.tsx:67-84` | `handleSave` — 保存成功后调用 `onSaved` |
| `PreviewPanel.tsx:337-347` | 编译 effect deps（已移除 snapshotVersion） |
| `PreviewGrid.tsx:280-288` | GridIframe 编译 effect deps（**保留** snapshotVersion） |
| `compile-cache.ts` | 编译缓存，key 为 `sessionId:demoId` |
| `compiler.ts:287` | `compileSession` — 从文件系统读取代码编译 |

---

## 下一步排查方向

1. **用 `console.log` 验证调用链**：在 `handleWorkspaceFileSaved`、`applyDemoSnapshot`、GridIframe 编译 effect 入口加日志
2. **检查编译缓存**：`invalidateCompileCache` 是否真正清除了 GridIframe 使用的缓存键（`sessionId:pageId`）
3. **检查 `onSaved` 是否被调用**：在 `WorkspaceCodeDialog.handleSave` 中确认 `onSaved` 不为 undefined
4. **验证文件系统写入**：PUT API 是否真正写入了正确的路径，compileSession 是否从同一路径读取
