# 配置面板交互一致性：浏览端编辑支持 + 恢复默认值按钮

## 背景

项目配置面板（`PageConfigPanel`）是创作端和浏览端共享的组件。当前存在两个不一致：

1. **浏览端配置面板始终只读**：即使登录后，配置面板仍为 `readonly`，无法增删模块、切换模块类型、拖拽排序。而浏览端已有登录系统和页面管理能力。
2. **缺少一键恢复默认值能力**：用户修改配置后无法快速回到初始默认值。"保存为默认值"仅有创作端可用，缺少对应的恢复操作。

## 目标

1. 浏览端登录后配置面板可编辑，交互与创作端一致（增删模块、切换类型、拖拽排序）
2. "保存为默认值"保持仅创作端可用
3. 新增"恢复默认值"按钮，创作端和浏览端均可使用

## 非目标

- 不修改 Schema 结构或默认值存储方式
- 不改变浏览端的配置持久化策略（恢复操作仅影响运行时状态，不写入 Schema）
- "保存为默认值"的行为和界面不做任何调整

---

## 1. 浏览端配置面板可编辑（已完成）

### 修改

**文件**：`packages/viewer-site/src/components/ViewerApp.tsx`

`PageConfigPanel` 的 `readonly` 属性从硬编码 `true` 改为根据登录状态动态决定：

```tsx
readonly={!isLoggedIn}
sessionId={isLoggedIn ? sessionId : undefined}
```

- 未登录用户：配置面板仍为只读，与原行为一致
- 已登录用户：配置面板完全可编辑，可增删模块、切换类型、拖拽排序、编辑字段值
- `sessionId` 传递给 `PageConfigPanel`，供文件上传等需要鉴权的操作使用

### 验证

- `corepack pnpm check:viewer` 通过

---

## 2. "恢复默认值"按钮

### 2.1 组件层（`PageConfigPanel.tsx`）

**位置**："本页配置"区域标题行，与"保存为默认值"按钮同行并排。

```
[本页配置: 页面名称]    [分类筛选 ▼]    [🔄 恢复默认值] [💾 保存为默认值]
```

**显示条件**：传了 `onRestoreDefaults` 回调即显示。**不受 `readonly` 限制**——即使未登录的浏览端用户也可使用，意在让所有用户都能修复配置项。

**图标**：`RotateCcw`（lucide-react）

**确认对话框**（shadcn/ui `Dialog`）：

- 标题：恢复默认配置
- 描述：将当前页面配置恢复为初始默认值，所有修改将丢失。确认恢复？
- 按钮：取消 / 确认恢复

**新增 prop**：

```ts
interface PageConfigPanelProps {
  // ... 现有 props
  onRestoreDefaults?: (pageId: string) => void;
}
```

**按钮渲染逻辑**：

```tsx
{onRestoreDefaults && (
  <Button
    type="button"
    variant="outline"
    size="sm"
    className="h-7 gap-1 px-2 text-xs"
    onClick={() => setShowRestoreDefaultsDialog(true)}
  >
    <RotateCcw className="h-3.5 w-3.5" />
    恢复默认值
  </Button>
)}
```

### 2.2 创作端实现（`author-site edit page`）

**恢复语义**：恢复到 `mergeConfigToProps` 计算的完整初始默认值。

```ts
const handleRestoreDefaults = useCallback(
  (pageId: string) => {
    const pageSchema = pageSchemaMapRef.current[pageId];
    if (!pageSchema) return;
    try {
      const mergedDefaults = mergeConfigToProps(
        projectConfigSchemaRef.current,
        pageSchema,
      );
      handlePageConfigPanelChange(pageId, mergedDefaults);
    } catch {
      // Schema 冲突等异常场景静默忽略
    }
  },
  [handlePageConfigPanelChange],
);
```

- 复用现有 `mergeConfigToProps`（来自 `@/lib/runtime-props`）
- 通过 ref 获取 `projectConfigSchema` 和 `pageSchemaMap`
- 调用现有 `handlePageConfigPanelChange` 应用恢复后的值

### 2.3 浏览端实现（`ViewerApp.tsx`）

**恢复语义**：恢复到 `mergeConfigDefaults` 计算的完整初始默认值（含项目配置值和资源 URL 解析）。

```ts
const handleRestoreDefaults = useCallback(
  (pageId: string) => {
    if (!project) return;
    const pageSchema = pageSchemaMap[pageId];
    const defaults = mergeConfigDefaults(
      project.projectConfigSchema,
      pageSchema,
      project.projectConfigValues,
      projectId,
    );
    setConfigDataMap((prev) => ({ ...prev, [pageId]: defaults }));
    if (pageId === activePageId) {
      setConfigData(defaults);
    }
  },
  [project, pageSchemaMap, projectId, activePageId],
);
```

- 复用现有 `mergeConfigDefaults`（组件内本地函数）
- 直接更新 `configDataMap` 和 `configData` state
- 不受登录状态限制，与 UI 按钮的显示逻辑一致

---

## 3. 改动范围

| 文件 | 改动 |
|------|------|
| `packages/demo-ui/src/PageConfigPanel.tsx` | 新增 `onRestoreDefaults` prop；新增按钮 + 确认对话框 |
| `packages/author-site/src/app/demo/[id]/edit/page.tsx` | 新增 `handleRestoreDefaults`；传入 `PageConfigPanel` |
| `packages/viewer-site/src/components/ViewerApp.tsx` | 新增 `handleRestoreDefaults`；传入 `PageConfigPanel` |

---

## 4. 验证

- `pnpm check:author` — 创作端类型检查 + 测试
- `pnpm check:viewer` — 浏览端类型检查 + 测试 + contract check
- 手动验证：
  - 浏览端未登录：配置面板只读，"恢复默认值"按钮可见可用
  - 浏览端已登录：配置面板可编辑（增删模块、切换类型、拖拽排序），"恢复默认值"可用，"保存为默认值"不可见
  - 创作端编辑页："恢复默认值"和"保存为默认值"均可见可用
  - "恢复默认值"点击后弹出确认框，确认后恢复为初始默认值
