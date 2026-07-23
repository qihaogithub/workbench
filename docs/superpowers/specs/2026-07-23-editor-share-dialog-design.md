# 编辑器分享对话框设计

**日期**: 2026-07-23
**状态**: 设计完成

## 概述

在创作端编辑器顶部栏新增"分享"按钮，点击弹出分享对话框，支持切换编辑链接和浏览链接两种类型，一键复制链接。同时移除顶部栏原有的撤销/重做视觉按钮。

## 架构

### 新增文件

| 文件 | 作用 |
|------|------|
| `packages/author-site/src/components/share/ShareDialog.tsx` | 分享对话框主体组件 |

### 修改文件

| 文件 | 改动 |
|------|------|
| `packages/author-site/src/app/demo/[id]/edit/page.tsx` | 删除撤销/重做按钮（约行 6089-6115）；在右侧区域新增分享按钮 |

### 组件层级

```
DemoEditPage (page.tsx)
  └── 顶部栏右侧
      ├── ShareButton (Share2 图标)    ← 新增，替代撤销/重做位置
      │   └── <Dialog>
      │       └── ShareDialog           ← 新增组件
      ├── 诊断导出按钮                   (不变)
      ├── 协同状态指示器                 (不变)
      └── 发布按钮                       (不变)
```

### ShareDialog 内部结构

```
ShareDialog(projectId, open, onOpenChange)
  ├── DialogHeader
  │   └── Tabs: "编辑链接" | "浏览链接"（默认选中编辑链接）
  ├── DialogContent
  │   ├── 链接展示区（只读 Input + 复制按钮 + Copy 图标）
  │   ├── 发布状态提示（仅浏览链接 tab：未发布/发布中/已发布）
  │   └── 复制成功 Toast
  └── 关闭按钮
```

- 创作端链接：`window.location.origin + /demo/{projectId}/edit`
- 浏览端链接：`NEXT_PUBLIC_VIEWER_URL + /{projectId}`；环境变量缺失时降级为相对路径 `/{projectId}`

## 数据流与状态

### 内部状态

| 状态 | 类型 | 说明 |
|------|------|------|
| `activeTab` | `"edit" \| "view"` | 当前选中的标签页，默认 `"edit"` |
| `publishState` | `"idle" \| "publishing" \| "published" \| "error"` | 浏览链接 tab 的发布状态 |
| `publishError` | `string \| null` | 发布失败时的错误信息 |

### 编辑链接 Tab

1. 立即显示创作端编辑页完整链接
2. 无需异步请求
3. 点击复制 → `navigator.clipboard.writeText()` → Toast "已复制"

### 浏览链接 Tab

1. 切换到该 Tab → 调用 `GET /api/projects/[projectId]/publish-status`
   - 已发布 → 显示浏览端链接 + 复制按钮
   - 未发布 → 显示提示 "项目尚未发布，需要先发布才能获取浏览链接" + "发布并获取链接" 按钮
2. 点击"发布并获取链接" → 调用 `POST /api/projects/[projectId]/publish`
   - `publishing`：按钮显示 Loader2 + "发布中..."，输入框禁用
   - `published`：显示链接 + 复制按钮
   - `error`：显示红色错误提示 + "重试"按钮
3. 点击复制 → 写入剪贴板 → Toast "已复制"

### 组件卸载/重开

- 对话框关闭时重置 `activeTab` 为 `"edit"`，`publishState` 为 `"idle"`
- 对话框关闭后重新打开：重新请求 publish-status（不缓存）

### 依赖的现有 API

| API | 用途 | 状态 |
|-----|------|------|
| `GET /api/projects/[projectId]/publish-status` | 检查是否已发布 | 已存在 |
| `POST /api/projects/[projectId]/publish` | 触发发布 | 已存在 |

无需新增后端代码。

## UI 规格

- **分享按钮**：`Button variant="ghost" size="icon"`，图标 `Share2`（lucide-react），位于诊断导出按钮左侧
- **对话框宽度**：约 `400px`（`sm:max-w-md`），使用 shadcn/ui `Dialog`
- **Tab 切换**：shadcn/ui `Tabs`，两个 Tab："编辑链接" / "浏览链接"
- **链接展示**：只读 `Input` + 右侧 `Button size="icon"` + `Copy` 图标
- **复制反馈**：按钮短暂变为 "已复制" 状态（1.5s），同时触发全局 Toast

### 编辑链接 Tab 布局

```
┌─────────────────────────────────────┐
│  [编辑链接]   [浏览链接]              │
│                                     │
│  ┌──────────────────────────────┐   │
│  │ https://xxx.com/demo/abc/....│   │
│  └──────────────────────────────┘   │
│                         [📋 复制]   │
│                                     │
│              [关闭]                  │
└─────────────────────────────────────┘
```

### 浏览链接 Tab（未发布）

```
┌─────────────────────────────────────┐
│  [编辑链接]   [浏览链接]              │
│                                     │
│  项目尚未发布，需要先发布才能获取链接   │
│                                     │
│        [发布并获取链接]              │
│                                     │
│              [关闭]                  │
└─────────────────────────────────────┘
```

## 撤销/重做按钮移除

- 仅移除顶部栏中的 `Undo2` / `Redo2` 按钮组件
- `useCommandHistory` hook 及其逻辑保持不变
- 键盘快捷键 `Cmd+Z` / `Cmd+Shift+Z` / `Cmd+Y` 继续正常工作

## 错误处理

| 场景 | 处理 |
|------|------|
| 发布状态查询失败 | 显示 "无法获取发布状态"，提供重试按钮 |
| 发布请求失败 | 显示 API 返回的 `error.message`，提供重试按钮 |
| 复制到剪贴板失败 | Toast "复制失败，请手动复制"，链接保持可见可选中 |
| 剪贴板 API 不可用 | Input 内容自动全选（`input.select()`），用户手动复制 |
| `NEXT_PUBLIC_VIEWER_URL` 未配置 | 降级显示相对路径 `/{projectId}`，Toast 提示 |
| 切换 Tab 时发布仍在进行中 | 保留发布状态，不中断不发重置 |
| 对话框关闭后重开 | 重置所有状态为初始值 |

## 测试策略

| 层级 | 内容 | 工具 |
|------|------|------|
| 单元测试 | ShareDialog Tab 切换、状态转换、复制逻辑 | Jest + Testing Library |
| 集成测试 | 分享按钮在顶部栏渲染、撤销/重做按钮已移除 | Jest + Testing Library |
| E2E | 完整流程：打开对话框 → 切换 Tab → 发布 → 复制 | Playwright |

### 关键测试用例

1. 默认显示编辑链接 Tab，链接包含正确的 projectId
2. 切换到浏览链接 Tab，未发布时显示发布按钮
3. 点击"发布并获取链接" → 发布成功 → 显示链接
4. 发布失败 → 显示错误信息和重试按钮
5. 复制按钮点击后剪贴板内容正确，Toast 提示
6. 撤销/重做按钮不在顶部栏渲染
7. Cmd+Z / Cmd+Shift+Z 键盘快捷键仍然可用
