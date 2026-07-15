# AI 知识库文档写入失败问题分析

> 创建时间：2026-07-15
> 触发场景：AI 对话中用户要求创建页面介绍文档，AI 尝试写入知识库失败
> 关联会话：session-1784105105872-q441aarwc

## 1. 问题背景

### 1.1 用户场景

用户在创作端编辑页与 AI 对话，要求"补一份简单的页面介绍文档"。AI 尝试将文档写入工作区的 `knowledge/` 目录，但连续三次写入均失败，最终只能将文档内容以纯文本形式直接展示给用户。

### 1.2 具体现象

AI 依次尝试了三个写入位置，全部失败：

| 次序 | 写入路径 | 返回错误 |
|---|---|---|
| 1 | `knowledge/汉字大冒险活动页面介绍.md` | `Knowledge base files are user-managed; AI agents may read them but must not modify them.` |
| 2 | `页面介绍.md`（工作区根目录） | `Error writing file: WORKSPACE_INVALID_OPERATION` |
| 3 | `demos/页面介绍.md` | `Error writing file: WORKSPACE_INVALID_OPERATION` |

AI 在 reasoning 中明确识别到知识库被保护（第 1 次），尝试降级到工作区根目录（第 2 次）和 `demos/` 目录（第 3 次），但均被 `WORKSPACE_INVALID_OPERATION` 拒绝。

### 1.3 预期行为

知识库文档应能由 AI 写入 `knowledge/` 目录，写入后自动出现在画布中。项目已实现知识库文档自动上画布机制（依赖 `knowledge/manifest.json` 更新和前端 `knowledgeItems` 状态同步），但 AI 侧的写入链路未能打通。

## 2. 事实证据

### 2.1 权限拦截层：PermissionManager 知识库写保护

`PermissionManager.validateToolCall()` 在 tool_call hook 层直接拦截所有对 `knowledge/` 路径的写操作，工具 `execute` 函数从未被调用。

**文件**：`packages/agent-service/src/backends/managers/permission-manager.ts`，第 66-75 行

```typescript
// 知识库写保护
if (toolName === 'writeFile' || toolName === 'editFile') {
  const targetPath = input?.path;
  if (targetPath && isKnowledgeBasePath(targetPath, this.config.workingDir ?? '')) {
    return {
      block: true,
      reason: 'Knowledge base files are user-managed; AI agents may read them but must not modify them.',
    };
  }
}
```

`isKnowledgeBasePath()` 判断逻辑（同文件第 15-22 行）：路径以 `knowledge/` 开头即命中。

此拦截发生在 pi-agent-core 的 tool_call hook 中，先于工具 execute 函数执行，因此 AI 调用 `writeFile` 时直接收到拦截消息作为工具返回。

### 2.2 工作区资源白名单：isManagedWorkspaceResource

`isManagedWorkspaceResource()` 定义了工作区中允许写入的资源路径白名单。

**文件**：`packages/shared/src/contracts.ts`，第 183-195 行

```typescript
export function isManagedWorkspaceResource(resourcePath: string): boolean {
  const normalized = normalizeWorkspaceResourcePath(resourcePath);
  return Boolean(normalized && (
    /^demos\/[^/]+\/(index\.tsx|prototype\.(html|css|meta\.json)|config\.schema\.json|sketch\.(scene|meta)\.json)$/.test(normalized)
    || normalized === "project.config.schema.json"
    || normalized === "project.config.values.json"
    || normalized === "workspace-tree.json"
    || normalized === ".canvas-layout.json"
    || normalized === "knowledge/manifest.json"
    || /^knowledge\/[^/]+\.(md|markdown|mdown)$/i.test(normalized)
    || /^assets\/.+/.test(normalized)
  ));
}
```

关键事实：
- `knowledge/*.md` 和 `knowledge/manifest.json` **已在白名单中**（第 191-192 行）
- `demos/` 下仅允许特定页面资源文件（`index.tsx`、`prototype.html` 等），不允许任意 `.md` 文件
- 工作区根目录下的任意 `.md` 文件不在白名单中

### 2.3 WorkspaceMutationAuthority 路径校验

`WorkspaceMutationAuthority.prepare()` 对所有写入操作执行白名单校验。

**文件**：`packages/agent-service/src/workspace/workspace-mutation-authority.ts`，`prepare()` 方法第 733-763 行（核心校验逻辑在 739-744）

```typescript
const normalized = normalizeWorkspaceResourcePath(resourcePath);
if (!normalized || !isManagedWorkspaceResource(normalized))
  throw new WorkspaceMutationAuthorityError("WORKSPACE_INVALID_OPERATION");
// ...
if (operation.type === "put_text") {
  assertManagedWorkspaceTextWrite(operation.path, operation.content);
}
```

`assertManagedWorkspaceTextWrite()`（`contracts.ts` 第 197-201 行）：

```typescript
export function assertManagedWorkspaceTextWrite(resourcePath: string, content: string): void {
  if (!isManagedWorkspaceResource(resourcePath) || /^assets\//.test(resourcePath) || content.length > 2 * 1024 * 1024) {
    throw new Error("WORKSPACE_INVALID_OPERATION");
  }
}
```

对于 `knowledge/*.md` 路径，`isManagedWorkspaceResource` 返回 `true`，`assertManagedWorkspaceTextWrite` 不会抛错。即 Authority 层**已支持**知识库文档写入。

> **注意**：Yjs-First 架构下，`prepare()` 中的 `assertExpected()` 已被移除（第 756-758 行注释明确说明）。`expectedHash` 和 `expectedAbsent` 字段虽然在接口中保留，但 Authority **不再执行基于 hash 的冲突检测**。这意味着即使 AI 写入已存在的 `knowledge/*.md` 文件，也不会因 `expectedAbsent` 冲突而失败——文件会被静默覆盖。前端 API 设置的 `expectedHash`/`expectedAbsent` 同样不生效。

### 2.4 协同资源类型映射

`resolveCollabResourceKind()` 将 `knowledge/*.md` 映射为 `"knowledge-document"` 类型。

**文件**：`packages/agent-service/src/collab/workspace-file-persistence.ts`，第 21 行

```typescript
if (/^knowledge\/[^/]+\.(md|markdown|mdown)$/i.test(normalized)) return "knowledge-document";
```

协同房间写入路径（`file-tools.ts` 第 257-297 行）在识别到 `resourceKind` 后会优先通过 Yjs collab room 写入。

### 2.5 writeFile 工具的写入流程

`writeFile` 工具的 `execute` 函数（`file-tools.ts` 第 195-395 行）在 live workspace 模式下的写入流程：

1. 权限检查（`isPathAllowed`）→ 第 199 行
2. 获取 workspace snapshot → 第 221-248 行
3. 判断 collab resource kind → 第 255 行
4. 优先走 collab room 写入 → 第 260-297 行
5. collab 不可用时降级到 Authority mutate → 第 299-352 行

工具本身**只写入单个文件**，不涉及 manifest 更新。

### 2.6 前端知识库 API 的原子写入模式

前端通过 `POST /api/knowledge` 创建知识文档时，API 路由在单次 `commitWorkspaceMutation` 调用中包含**两个操作**：

**文件**：`packages/author-site/src/app/api/knowledge/route.ts`，第 232-257 行

```typescript
const operations: WorkspaceMutationOperation[] = [
  { type: 'put_text', path: `knowledge/${fileName}`, content, expectedAbsent: true },
  { type: 'put_text', path: 'knowledge/manifest.json', content: JSON.stringify(manifest, null, 2), ... },
];
await commitWorkspaceMutation({ ..., operations });
```

即 `.md` 文件和 `manifest.json` 在同一次 mutation 中原子写入。

### 2.7 前端画布自动展示机制

知识库文档写入后自动出现在画布中，依赖以下链路：

1. `KnowledgePanel` 组件挂载时调用 `GET /api/knowledge` 获取 manifest items（`KnowledgePanel.tsx` 第 67-91 行），并监听 `knowledge-updated` 窗口事件以触发刷新（第 178-183 行）
2. 通过 `onItemsChange` 回调更新父组件 `knowledgeItems` 状态（`page.tsx` 第 1365 行）
3. 派生 `canvasKnowledgeDocuments`（过滤掉 system 来源）（`page.tsx` 第 1379-1384 行）
4. 未手动放置的文档自动创建画布节点（`page.tsx` 第 1491-1508 行）：

> **关键**：`knowledge-updated` 事件仅在**前端自身操作**时被 `window.dispatchEvent` 触发（`page.tsx` 第 1415、1446、5427、7732、7749 行），AI 的 `writeFile` 工具不会触发此事件。因此即使 AI 成功写入 `.md` 文件和 `manifest.json`，前端也不会自动发现新文档，除非用户手动刷新或重新打开页面。

```typescript
canvasKnowledgeDocuments.forEach((document, index) => {
  if (existingKnowledgeDocumentIds.has(document.id)) return;
  if (hiddenKnowledgeDocumentIds.has(document.id)) return;
  documentNodes.push({
    id: `single-doc-${document.id}`,
    kind: "document",
    title: document.title,
    knowledgeDocument: document,
    layout: { x: 80 + index * 28, y: 80 + index * 28, width: 420, height: 360 },
    createdAt: 0, updatedAt: 0,
  });
});
```

前端发现新文档的前提是 `manifest.json` 中存在对应条目。

## 3. 可能原因

### 3.1 直接阻断原因

`PermissionManager` 中的知识库写保护规则（第 66-75 行）是导致 AI 无法写入 `knowledge/` 的直接原因。该规则在 tool_call hook 层拦截，先于工具 execute 函数执行，使工具完全无法执行。

### 3.2 架构层面的结构性问题

**问题一：writeFile 工具只写单文件，知识库文档需要双文件原子写入**

知识库文档的完整创建需要同时写入 `.md` 文件和更新 `manifest.json`。前端 API 通过 `commitWorkspaceMutation` 在单次 mutation 中包含两个 `put_text` 操作实现原子写入。而 AI 的 `writeFile` 工具每次只操作一个文件路径，没有内置 manifest 同步逻辑。

即使移除 PermissionManager 的拦截，AI 写入 `knowledge/xxx.md` 后，`manifest.json` 不会自动更新，前端无法发现新文档，文档不会出现在画布中。

**附加问题：collab/Authority 写入路径不对称**

`resolveCollabResourceKind()` 将 `knowledge/*.md` 映射为 `knowledge-document`，使 AI 的 `writeFile` 工具优先通过 Yjs collab room 写入。但 `knowledge/manifest.json` 不匹配任何 collab resource kind（返回 `null`），只能走 Authority mutate 路径。

相比之下，前端 API 使用 `WorkspaceFilePersistence.commitMutation()` 直接调用 `authority.mutate()`，两个文件（`.md` + `manifest.json`）在同一 Authority mutation 中原子提交，完全绕过 collab room。这意味着 AI 的 writeFile 与前端 API 走的是**不同的写入路径**：前者走 Yjs（最终一致、CRDT 合并），后者走 Authority（即时提交、单次原子）。

**问题二：工作区白名单限制任意文档写入**

`isManagedWorkspaceResource` 白名单中，`demos/` 目录仅允许特定页面资源文件（`index.tsx`、`prototype.html` 等），根目录仅允许固定文件名（`workspace-tree.json` 等）。AI 尝试降级到非知识库路径写入时，必然被白名单拒绝。

### 3.3 基础设施就绪状态

值得注意的是，底层基础设施已全面支持知识库文档的 AI 写入：

| 组件 | 对 knowledge/*.md 的支持 | 状态 |
|---|---|---|
| `isManagedWorkspaceResource` | 白名单包含 | 已就绪 |
| `resolveCollabResourceKind` | 映射为 `knowledge-document` | 已就绪 |
| `WorkspaceMutationAuthority` | 允许 mutation | 已就绪 |
| `assertManagedWorkspaceTextWrite` | 允许写入 | 已就绪 |
| `writeFile` 工具 collab 路径 | 识别 resourceKind 后走 collab room | 已就绪 |
| 前端画布自动展示 | 从 manifest 发现并渲染 | 已就绪 |
| `PermissionManager` | 写保护拦截 | **唯一阻断点** |

## 4. 相关代码路径

### 4.1 权限拦截层

| 文件 | 关键函数/类 | 关键行 |
|---|---|---|
| `packages/agent-service/src/backends/managers/permission-manager.ts` | `PermissionManager.validateToolCall()` | 54-78 |
| `packages/agent-service/src/backends/managers/permission-manager.ts` | `isKnowledgeBasePath()` | 15-22 |

### 4.2 工作区资源白名单

| 文件 | 关键函数 | 关键行 |
|---|---|---|
| `packages/shared/src/contracts.ts` | `isManagedWorkspaceResource()` | 183-195 |
| `packages/shared/src/contracts.ts` | `normalizeWorkspaceResourcePath()` | 177-181 |
| `packages/shared/src/contracts.ts` | `assertManagedWorkspaceTextWrite()` | 197-201 |

### 4.3 AI 工具层

| 文件 | 关键函数 | 关键行 |
|---|---|---|
| `packages/agent-service/src/backends/pi-tools/file-tools.ts` | `createWriteFileTool()` / `execute` | 185-395 |
| `packages/agent-service/src/backends/pi-tools/file-tools.ts` | `isPathAllowed()` 调用 | 199 |
| `packages/agent-service/src/backends/pi-tools/permissions.ts` | `isPathAllowed()` | 40-73 |
| `packages/agent-service/src/backends/pi-tools/permissions.ts` | `DEFAULT_WORKSPACE_PERMISSIONS` | 10-38 |

### 4.4 协同与持久化层

| 文件 | 关键函数 | 关键行 |
|---|---|---|
| `packages/agent-service/src/collab/workspace-file-persistence.ts` | `resolveCollabResourceKind()` | 11-23 |
| `packages/agent-service/src/workspace/workspace-mutation-authority.ts` | `WorkspaceMutationAuthority.prepare()` | 733-763 |

### 4.5 前端知识库与画布

| 文件 | 关键逻辑 | 关键行 |
|---|---|---|
| `packages/author-site/src/app/api/knowledge/route.ts` | POST 创建文档（双文件原子写入） | 230-257 |
| `packages/author-site/src/components/demo/KnowledgePanel.tsx` | `fetchItems()` 加载 manifest | 67-91 |
| `packages/author-site/src/app/demo/[id]/edit/page.tsx` | `knowledgeItems` 状态 | 1365 |
| `packages/author-site/src/app/demo/[id]/edit/page.tsx` | `canvasKnowledgeDocuments` 派生 | 1379-1384 |
| `packages/author-site/src/app/demo/[id]/edit/page.tsx` | 文档自动添加画布节点 | 1491-1508 |

## 5. 修复方案：打通通用写入链路（已实施）

> **实施状态：已完成** — 2026-07-15
> 验证：`pnpm check:agent` 394 测试全通过，`pnpm typecheck` (author-site) 无错误。

### 5.1 设计原则

不为每种画布节点类型创建专用工具，而是打通通用 `writeFile`/`editFile` 的写入链路，使 AI 能编辑草稿工作区内所有受控资源。这样 AI 可以编辑画布内所有节点类型（页面代码、知识文档、画布布局等），而非仅限文档节点。

### 5.2 当前 AI 写入能力全览

| 画布节点类型 | 文件路径 | `isManagedWorkspaceResource` | PermissionManager 拦截 | `deniedPatterns` 拦截 | 前端实时同步 | AI 能写？ |
|---|---|---|---|---|---|---|
| 页面代码 | `demos/*/index.tsx` | ✅ | 无 | 无 | ✅ Yjs (`useCollabDocument`) | ✅ |
| 页面原型 | `demos/*/prototype.html` | ✅ | 无 | 无 | ✅ Yjs | ✅ |
| 页面配置 | `demos/*/config.schema.json` | ✅ | 无 | 无 | ✅ Yjs | ✅ |
| 草图场景 | `demos/*/sketch.scene.json` | ✅ | 无 | 无 | ✅ Yjs | ✅ |
| 画布布局 | `.canvas-layout.json` | ✅ | 无 | ~~denied~~ → 已移除 | ✅ Yjs (`canvasLayoutCollab`) | ✅ |
| 知识文档 | `knowledge/*.md` | ✅ | ~~拦截~~ → 已移除 | 无 | ❌ HTTP + `knowledge-updated` 事件（已补通知） | ✅ |
| 知识 manifest | `knowledge/manifest.json` | ✅ | ~~拦截~~ → 已移除 | 无 | ❌ HTTP（writeFile 透明同步） | ✅ |
| 工作区树 | `workspace-tree.json` | ✅ | 无 | 无 | ✅ Yjs (`workspaceTreeCollab`) | ✅ |

**结论**：两个阻断点均已移除，AI 现可编辑草稿工作区内全部受控资源。前端实时同步：非知识库资源通过 Yjs 连接自动更新；知识文档通过 writeFile 透明 manifest 同步 + `onToolUpdate` 回调 dispatch `knowledge-updated` 事件通知前端刷新。

### 5.3 已实施方案：解除阻断 + 透明 manifest 同步

#### 步骤 1：✅ 移除 PermissionManager 知识库写保护

删除 `permission-manager.ts` `validateToolCall` 中的知识库写保护代码块。`isKnowledgeBasePath()` 函数保留但不再在 `validateToolCall` 中拦截。

**文件**：`packages/agent-service/src/backends/managers/permission-manager.ts`

#### 步骤 2：✅ 移除 `.canvas-layout.json` 的 deniedPattern

删除 `permissions.ts` `deniedPatterns` 中的 `"**/.canvas-layout.json"` 条目。AI 可编辑画布布局，前端通过 `canvasLayoutCollab` Yjs 连接实时接收更新。

**文件**：`packages/agent-service/src/backends/pi-tools/permissions.ts`

#### 步骤 3：✅ writeFile 透明 manifest 同步

在 `file-tools.ts` 中新增 `syncKnowledgeManifest()` 辅助函数。当 writeFile 检测到写入路径匹配 `knowledge/*.md` 且为新建文件（`existing === null`）时，自动读取 snapshot 中的 `manifest.json`，追加新条目（id、title、fileName、addedAt 等），通过 `authority.mutate()` 提交 manifest 更新。

AI 只需调用 `writeFile('knowledge/xxx.md', content)`，manifest 自动更新。覆盖写入（编辑已存在文件）不触发同步。工具返回 details 中新增 `knowledgeDocumentCreated: boolean` 标志。

**文件**：`packages/agent-service/src/backends/pi-tools/file-tools.ts`

**tradeoff**：
- 非原子写入：`.md` 和 `manifest.json` 分两次 mutation。若 `.md` 写入成功但 manifest 更新失败，文档内容存在但前端不可见。可接受——文档未丢失，重试即可修复 manifest。manifest 同步失败是 non-fatal，不影响 writeFile 本身成功。
- manifest 竞态：并发写入 manifest 可能覆盖前写者条目。实际场景中 AI 串行创建知识文档，风险低。

#### 步骤 4：✅ 前端刷新通知

非知识库资源（页面代码、画布布局等）通过 Yjs 连接实时同步，无需额外处理。

知识库文档采用方式 A：在 `use-chat-stream.ts` 的 `onToolUpdate` 回调中检测 `update.details.knowledgeDocumentCreated` 标志，为 true 时 dispatch `window` 的 `knowledge-updated` 事件。`KnowledgePanel` 已有此事件的监听逻辑（L178-183），自动触发 `fetchItems()` 刷新。

事件链路：writeFile 工具返回 `details.knowledgeDocumentCreated` → event-mapper 发射 `tool_call_update` 事件 → ws-event-router 转发到前端 → stream-service 映射为 `ToolUpdateEvent` → `onToolUpdate` 回调检测并 dispatch 事件 → KnowledgePanel 刷新。

**文件**：`packages/author-site/src/components/ai-elements/chat/hooks/use-chat-stream.ts`

### 5.4 被否决的方案

**专用工具方案**（原方案 B）：为知识文档创建 `createKnowledgeDocument` 专用工具。否决原因：只解决知识文档一种场景，不覆盖画布布局等其他被阻断的节点类型，违背“AI 可编辑所有工作区文件”的通用性目标。每增加一种节点类型都需新建工具，导致工具碎化。

**用户确认机制**（原方案 C）：将知识库写保护改为用户确认。否决原因：增加交互摩擦，且不解决 manifest 同步和 `.canvas-layout.json` 阻断问题。可作为未来安全增强选项保留。

### 实施验证

- `pnpm check:agent`：395 个测试全通过（含 3 个 manifest 同步测试、4 个更新的权限测试）
- `pnpm typecheck` (author-site)：无错误
- 测试文件：
  - `packages/agent-service/tests/unit/permission-manager.test.ts` — 2 个测试从拦截改为放行
  - `packages/agent-service/tests/unit/permissions.test.ts` — `.canvas-layout.json` 从 denied 改为 allowed
  - `packages/agent-service/tests/unit/file-tools-live-workspace.test.ts` — 3 个 manifest 同步测试（含 `./` 前缀归一化场景）

### 5.5 跟进修复：文档保存后未显示到画布（2026-07-15）

**现象**：AI 可正常生成文档并保存到 `knowledge/` 目录，但文档未出现在画布中。

**根因**：

1. **后端路径未归一化**：AI 可能传入 `./knowledge/file.md` 或 `/knowledge/file.md`，导致：
   - `KNOWLEDGE_DOC_PATTERN` 正则不匹配 → manifest 同步被跳过
   - `resolveCollabResourceKind` 不识别 → collab room 写入被跳过
   - Authority `normalizeWorkspaceResourcePath` 不处理 `./` → `WORKSPACE_INVALID_OPERATION`
2. **前端单点故障**：`knowledge-updated` 事件仅在 `onToolUpdate` 回调中分发，依赖 WebSocket 事件链完整传递 `details.knowledgeDocumentCreated`。

**修复**：

| 层级 | 文件 | 修改 |
|---|---|---|
| 后端-入口 | `file-tools.ts` | `writeFile` execute 入口归一化 `args.path`（去除前导 `./` 或 `/`），确保 snapshot 查找、collab room、Authority、pattern 匹配全部一致 |
| 后端-入口 | `edit-file-tool.ts` | `editFile` execute 入口同样归一化 `args.path` |
| 前端-第一层 | `use-chat-stream.ts` `onToolUpdate` | 检测 `details.knowledgeDocumentCreated` 并 dispatch `knowledge-updated`（上一轮已实施） |
| 前端-第二层 | `use-chat-stream.ts` `onFinish` | 后备检查：遍历 `currentMsg.parts` 中所有 tool parts 的 `details.knowledgeDocumentCreated` |
| 前端-第三层 | `use-chat-stream.ts` `onFinish` | 后备检查：遍历 `result.files` 中是否有路径匹配 `knowledge/*.md`，不依赖 details 标志 |

三层后备机制确保即使 WebSocket 事件链某环断裂，`knowledge-updated` 仍能在 `onFinish` 时被分发。

### 待确认事项

1. **AI 写入知识文档的标题如何确定？** — 已实施：从文件名推导（去扩展名），不扩展 writeFile 参数。
2. **知识库文档的 AI 写入是否需要版本记录？** — 待确认：当前 `syncKnowledgeManifest` 不调用 `createKnowledgeVersion`，仅写入 manifest 条目。如需版本记录，需在 manifest 同步后追加调用。
3. **内容大小限制** — 已有保障：`assertManagedWorkspaceTextWrite` 限制 2MB，AI 写入同样受此约束。
4. **`.canvas-layout.json` 安全约束** — 待确认：当前无额外约束，AI 可自由编辑画布布局。Yjs CRDT 保证最终一致性，但无法防止 AI 意外清空布局。可考虑未来增加审批机制。
5. **未验证** — 未运行 E2E 测试验证端到端的 AI 创建知识文档 → 画布自动出现完整流程。建议后续补充 Playwright E2E 用例。
