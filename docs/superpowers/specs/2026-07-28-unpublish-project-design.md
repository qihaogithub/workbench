# 撤销发布功能设计

**日期**: 2026-07-28  
**状态**: 设计中

---

## 背景

创作端发布项目后，`data/published/{projectId}/` 下会生成完整发布产物，使用端通过 `projects-index.json` 发现并加载已发布项目。当前没有独立的"撤销发布"能力——删除项目虽然会连带删除发布产物，但无法在不删除项目的情况下取消发布。

## 目标

支持用户在不删除项目的前提下撤销发布，使项目在使用端不可见，创作端恢复到"从未发布"状态。

## 范围

- 新增 `DELETE /api/projects/[projectId]/publish` API 端点
- 创作端编辑页工具栏"已发布"按钮旁新增更多操作气泡菜单，含「撤销发布」
- 撤销发布后彻底删除 `published/{projectId}/` 产物目录并从 `projects-index.json` 移除条目
- 删除项目时已有的发布产物删除逻辑保持不变（等价于撤销发布 + 删项目）

## 非范围

- 不保留被撤销的发布产物（无软删除、无版本历史回退）
- 不在使用端提供撤销发布入口
- 不在项目管理列表页提供撤销发布入口

---

## 设计

### 后端变更

#### 1. `publish-manager.ts` — 新增 `unpublishProject`

```ts
export async function unpublishProject(projectId: string): Promise<void>
```

逻辑：
1. 删除 `published/{projectId}/` 整个目录（如目录不存在也视为成功）
2. 调用 `regenerateProjectsIndex()` 重建 `projects-index.json`
3. 清除项目元数据：`project.publishedVersion = undefined`，`project.publishedAt = undefined`
4. 保存项目文件

原子性说明：目录删除和索引重建非原子操作，但二者任一失败均有错误处理且不影响创作端核心数据。

#### 2. API Route — 新增 DELETE 端点

**路径**: `DELETE /api/projects/[projectId]/publish`

**鉴权**: JWT，复用现有中间件

**请求**: 无 body

**成功响应**: `{ success: true, data: { projectId } }`

**错误响应**: `{ success: false, error: { code: "UNPUBLISH_FAILED", message: "..." } }`

#### 3. `project-api.ts` — 新增 Client 方法

```ts
async unpublishProject(projectId: string): Promise<{ success: boolean }>
```

#### 4. `useVersionControl.ts` — 新增 `handleUnpublish`

```ts
const [unpublishing, setUnpublishing] = useState(false);

const handleUnpublish = async () => {
  setUnpublishing(true);
  try {
    await projectApiClient.unpublishProject(demoId);
    setPublishStatus("never_published");
    setPublishedVersion(null);
    toast({ description: "已撤销发布" });
  } catch {
    toast({ variant: "destructive", description: "撤销发布失败" });
  } finally {
    setUnpublishing(false);
  }
};
```

返回值新增: `unpublishing`, `handleUnpublish`

### 前端变更

#### 5. 编辑页工具栏 — 更多按钮 + 气泡菜单

仅当 `publishStatus === "published"` 时渲染：

```
[已发布按钮] [MoreVertical 按钮]
                  └── 点击展开 Popover 气泡
                      └── "撤销发布" 菜单项
```

- `MoreVertical` 按钮：`size="icon"`，`variant="ghost"`
- Popover 定位在按钮下方右侧对齐
- 菜单项使用红色/破坏性样式（`text-destructive`）

#### 6. 确认对话框

点击「撤销发布」弹出 AlertDialog：

- **标题**: 撤销发布
- **描述**: 撤销后，使用端将无法访问该项目。确认撤销？
- **按钮**: "取消" + "撤销发布"（红色破坏性按钮）
- 确认后调用 `handleUnpublish()`

### 状态流转

```
published → 点击更多 → 点击撤销发布 → 确认对话框 → 确认
  → unpublish API → 删除产物 + 重建索引 + 清除元数据
  → publishStatus = "never_published"
  → 更多按钮消失，发布按钮恢复为"发布"
```

加载中和错误态：
- 撤销进行中：确认按钮显示 spinner，"撤销中..."
- 失败：toast 提示错误，状态不变

### 删除项目等价性

`project-core` 中 `deleteProjectExecute` 已调用 `deletePublishedProjectArtifact()`，该逻辑不变。删除项目 = 撤销发布 + 删除项目数据，行为一致。

---

## 文件变更清单

| 文件 | 变更类型 |
|---|---|
| `packages/author-site/src/lib/publish-manager.ts` | 新增 `unpublishProject()` |
| `packages/author-site/src/app/api/projects/[projectId]/publish/route.ts` | 新增 DELETE handler |
| `packages/author-site/src/lib/project-api.ts` | 新增 `unpublishProject()` |
| `packages/author-site/src/app/demo/[id]/edit/hooks/useVersionControl.ts` | 新增 `handleUnpublish` |
| `packages/author-site/src/app/demo/[id]/edit/page.tsx` | 新增更多按钮 + Popover + 确认对话框 |
| `packages/author-site/src/lib/__tests__/publish-manager-status.test.ts` | 新增 unpublish 测试用例 |

---

## 验证

```bash
pnpm check:author
pnpm --filter @workbench/author-site test -- --testPathPattern="publish-manager-status"
```
