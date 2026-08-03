# 原型页注册修复与 AI 工具链反馈增强

## 背景

AI 在创建原型页时，`listPages` 工具始终不返回该页面，导致 AI 陷入无诊断信息的重试循环（4 个页面 ID，~100 次工具调用）。根因是 `isCompletePageDir` 硬编码检查 `index.tsx`，而原型页的入口文件是 `prototype.html`。

本设计同时修复会话分析中发现的另外 3 个问题。

---

## 根因

`delete-page-tool.ts:197` 和 `canvas-layout-tool.ts:158` 的 `isCompletePageDir` 函数：

```typescript
function isCompletePageDir(workingDir: string, pageId: string): boolean {
  return (
    fs.existsSync(pageDir) &&
    fs.existsSync(path.join(pageDir, "index.tsx")) &&  // 原型页没有此文件
    fs.existsSync(path.join(pageDir, "config.schema.json"))
  );
}
```

`listPagesFromSnapshot` 和 `formatPages` 也有同样问题。`listPages` 工具在 live workspace 下使用 Authority 快照检查文件存在性，非 live 下直接读磁盘，但都硬编码了 `index.tsx`。

---

## 改动清单

| # | 问题 | 文件 | 改动 |
|---|------|------|------|
| 1 | `isCompletePageDir` 硬编码 | 新建 `workspace-page-utils.ts` | 提取共享工具函数 |
| 2 | 同上 | `delete-page-tool.ts` | 删除重复函数，从共享模块导入 |
| 3 | 同上 | `canvas-layout-tool.ts` | 同上 |
| 4 | `captureScreenshot` 绑定用户焦点 | `screenshot-tool.ts` | 增加可选 `pageId` 参数 |
| 5 | `listPages` 快照版本信息缺失 | `delete-page-tool.ts` | 返回值增加 `snapshotRevision` |
| 6 | workspace-tree 无效 JSON 全量重写 | `project-core/src/service.ts` | 改为抛出解析错误 |

---

### 1. 共享工具模块 `workspace-page-utils.ts`

**路径**：`packages/agent-service/src/backends/pi-tools/workspace-page-utils.ts`

#### 函数清单

**`getPageEntryFileName(runtimeType?: string): string`**

运行时类型到入口文件名的映射：

| runtimeType | 入口文件 |
|---|---|
| `"prototype-html-css"` | `prototype.html` |
| `"high-fidelity-react"` | `index.tsx` |
| `"sketch-scene"` | `scene.json` |
| 默认 | `index.tsx` |

**`isCompletePageDir(workingDir: string, pageId: string, runtimeType?: string): boolean`**

检查页面目录是否完整：
- 目录存在
- `config.schema.json` 存在
- 根据 runtimeType 对应的入口文件存在

**`isCompletePageDirFromSnapshot(resources: Record<string, string>, pageId: string, runtimeType?: string): boolean`**

同上，但检查快照资源中是否存在对应文件。

**`formatPageEntry(pageId: string, runtimeType?: string): { indexPath: string; schemaPath: string }`**

返回正确的入口文件路径和 schema 路径。

**`readWorkspaceTreeSafe(workingDir: string): WorkspaceTree`**

安全读取 workspace-tree.json，封装 JSON 解析和默认值。

**`readWorkspaceTreeFromSnapshot(resources: Record<string, string>): WorkspaceTree`**

从快照中读取 workspace-tree，封装 JSON 解析。

#### 共享的辅助函数

从两个工具文件中提取的公用函数也放入此模块：
- `isSafePageId(pageId: string): boolean`
- `getPageDir(workingDir: string, pageId: string): string`
- `getWorkspaceTreePath(workingDir: string): string`
- `WORKSPACE_TREE_FILENAME` 常量

**`WorkspacePage` 接口扩展**：`delete-page-tool.ts` 和 `canvas-layout-tool.ts` 各有一个内联 `WorkspacePage` 接口，当前只有 `id`/`name`/`order`/`parentId` 四个字段。改为从共享模块导出统一接口，增加 `runtimeType?: string` 字段：

```typescript
export interface WorkspacePage {
  id: string;
  name: string;
  order: number;
  parentId: string | null;
  runtimeType?: string;
}
```

#### 依赖

| 依赖 | 用途 |
|------|------|
| `fs` | 文件系统检查 |
| `path` | 路径拼接 |
| `@workbench/shared/contracts` | `isManagedWorkspaceResource`（如需要） |

---

### 2. `delete-page-tool.ts` 改动

**删除**：
- `isCompletePageDir` 函数（L197-204）
- `listPages` 函数（L237-244）
- `listPagesFromSnapshot` 函数（L246-272）
- `formatPages` 函数（L274-283）
- `isSafePageId` 函数（L193-195）
- `getPageDir` 函数（L189-191）
- `getWorkspaceTreePath` 函数（L185-187）
- `WORKSPACE_TREE_FILENAME` 常量（L14）

**导入**：从 `./workspace-page-utils` 导入上述函数

**`listPages` 函数（原 L237）**：改为从共享模块导入，但需要额外传递 runtimeType：

```typescript
function listPages(workingDir: string): WorkspacePage[] {
  const tree = readWorkspaceTreeSafe(workingDir);
  return tree.pages
    .filter((page) =>
      isCompletePageDir(workingDir, page.id, page.runtimeType)
    )
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}
```

**`listPagesFromSnapshot` 函数（原 L246）**：同理：

```typescript
function listPagesFromSnapshot(snapshot: WorkspaceAuthoritySnapshot): WorkspacePage[] {
  const tree = readWorkspaceTreeFromSnapshot(snapshot.resources);
  if (!tree) return [];
  return tree.pages
    .filter((page) => {
      if (!isSafePageId(page.id)) return false;
      return isCompletePageDirFromSnapshot(snapshot.resources, page.id, page.runtimeType);
    })
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}
```

**`formatPages` 函数（原 L274）**：使用 `formatPageEntry` 输出正确入口路径：

```typescript
function formatPages(pages: WorkspacePage[]): string {
  if (pages.length === 0) return "No pages found.";
  return pages
    .map((page) => {
      const { indexPath, schemaPath } = formatPageEntry(page.id, page.runtimeType);
      return `- id: ${page.id}\n  name: ${page.name}\n  indexPath: ${indexPath}\n  schemaPath: ${schemaPath}`;
    })
    .join("\n");
}
```

**`createListPagesTool` 工具返回值（L672-681）**：同步更新 `details.pages` 中的 `indexPath`：

```typescript
details: {
  pages: pages.map((page) => {
    const { indexPath, schemaPath } = formatPageEntry(page.id, page.runtimeType);
    return { id: page.id, name: page.name, indexPath, schemaPath };
  }),
  snapshotRevision: snapshot?.state.revision,
  pageCount: pages.length,
}
```

**`deletePage` 中的 `isCompletePageDir` 调用（L419）**：改为从共享模块导入，并传入 `existing.runtimeType`。

---

### 3. `canvas-layout-tool.ts` 改动

**删除**：
- `isCompletePageDir` 函数（L158-165）
- `listPages` 函数（L184-189）
- `isSafePageId` 函数（L154-156）
- `getPageDir` 函数（L150-152）
- `getWorkspaceTreePath` 函数（L146-148）
- `readWorkspaceTree` 函数（L171-182）
- `WORKSPACE_TREE_FILENAME` 常量（L10）

**导入**：从 `./workspace-page-utils` 导入上述函数

**`listPages` 函数（L184）**：改为：

```typescript
function listPages(workingDir: string): WorkspacePage[] {
  const tree = readWorkspaceTreeSafe(workingDir);
  return tree.pages
    .filter((page) => isSafePageId(page.id) && isCompletePageDir(workingDir, page.id, page.runtimeType))
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}
```

---

### 4. `captureScreenshot` 增加可选 `pageId` 参数

**文件**：`screenshot-tool.ts`

**参数定义**：`CaptureScreenshotParams` 增加可选字段：

```typescript
pageId: Type.Optional(
  Type.String({
    description: "Exact page ID to screenshot. If omitted, screenshots the user's currently focused page.",
  }),
),
```

**执行逻辑**：在 `execute` 函数开头：

```typescript
const demoId = args.pageId ?? config.demoId;
```

工具已有 `isPrototypePage = fs.existsSync(prototypeHtmlPath)` 检测，能自动区分原型页和高保真页，无需额外运行时类型判断。

---

### 5. `listPages` 返回值增加快照版本信息

**文件**：`delete-page-tool.ts` 的 `createListPagesTool`

**改动**：在 `details` 中增加 `snapshotRevision` 和 `pageCount`：

```typescript
details: {
  pages: pages.map(...),
  snapshotRevision: snapshot?.state.revision,
  pageCount: pages.length,
}
```

AI 可据此判断数据是否来自最新快照。当 `snapshotRevision` 小于预期时，AI 可等待后重试 `listPages`。

---

### 6. workspace-tree.json 无效 JSON 的优雅拒绝

**文件**：`project-core/src/service.ts`

**改动**：`readWorkspaceTree` 方法（L5621-5669）中，当 `readJsonFile` 返回 null 且文件存在时，抛出明确错误：

```typescript
private readWorkspaceTree(workspacePath: string): WorkspaceTree {
  const filePath = path.join(workspacePath, WORKSPACE_TREE_FILENAME);
  const parsed = readJsonFile<Partial<WorkspaceTree>>(filePath);
  if (parsed === null && fs.existsSync(filePath)) {
    throw new Error(
      `workspace-tree.json 解析失败，文件可能已损坏。请检查文件格式。`
    );
  }
  if (parsed) {
    // ... 正常解析逻辑，不变
  }
  // 文件不存在时降级扫描，不变
  ...
}
```

**注意**：`readJsonFile` 在 JSON 解析失败时返回 `null`。当前代码在 `parsed` 为 null 时直接降级扫描目录，丢失所有已有数据。改为仅当文件不存在时降级，文件存在但解析失败时抛错。

---

## 验证

| 验证项 | 命令 |
|--------|------|
| agent-service 类型检查 | `pnpm check:agent` |
| agent-service 单元测试 | `pnpm --filter @workbench/agent-service test` |
| project-core 类型检查 | `pnpm check:project-core` |
| project-core 单元测试 | `pnpm --filter @workbench/project-core test` |
| 全仓轻量验证 | `pnpm check:all` |

**新增测试用例**：
- `isCompletePageDir` 对 `prototype-html-css` 接受 `prototype.html` 拒绝 `index.tsx`
- `isCompletePageDir` 对 `high-fidelity-react` 接受 `index.tsx` 拒绝 `prototype.html`
- `isCompletePageDirFromSnapshot` 同上
- `formatPageEntry` 输出正确的入口文件路径
- `readWorkspaceTree` 在无效 JSON 时抛出错误而非降级

---

## 边界情况

| 场景 | 行为 |
|------|------|
| 页面目录同时有 `prototype.html` 和 `index.tsx` | 按 workspace-tree 中声明的 `runtimeType` 判断 |
| `runtimeType` 未设置 | 默认按 `high-fidelity-react` 处理（检查 `index.tsx`） |
| 快照过期 | AI 看到 `snapshotRevision` 小于预期后可重试 `listPages` |
| workspace-tree.json 完全不存在 | 保持现有降级扫描行为 |
| `captureScreenshot` 指定不存在的 `pageId` | 返回 `code_file_not_found` 错误 |