# AI记忆文件未默认创建-分析报告

## 一、问题背景

### 问题描述

用户在创作端文件列表中点击"AI记忆"(`memory.md`)时,提示"加载文件失败:文件不存在"。

### 预期行为

用户点击文件列表中的 `memory.md` 文件时,应能正常查看和编辑其内容。

### 实际行为

API 返回 404 错误,错误信息为"文件不存在",前端显示 toast 提示"加载文件失败"。

### 复现条件

1. 创建新项目或新建 Session
2. 在编辑页面打开文件列表
3. 点击"AI记忆"文件项
4. 触发加载失败

---

## 二、根因分析

### 调查过程

**1. 前端点击链路追踪**

用户点击"AI记忆"时,前端调用路径(证据来源:`edit/page.tsx:1372-1399`):

```typescript
onMemorySelect={async () => {
  const res = await fetch(
    `/api/sessions/${sessionId}/workspace/files/${encodeURIComponent("memory.md")}`
  );
  const data = await res.json();
  if (data.success) {
    // 打开代码对话框
  } else {
    toast({ title: "加载文件失败", description: data.error?.message });
  }
}}
```

**2. 后端 API 处理逻辑**

文件读取 API(`route.ts:92-96`)在文件不存在时返回 404:

```typescript
if (!fs.existsSync(resolvedPath)) {
  return NextResponse.json(
    createApiError("FILE_READ_ERROR", "文件不存在"),
    { status: 404 }
  );
}
```

**3. Session 创建时的文件初始化**

Session 创建流程(`fs-utils.ts:1066-1099`):

```typescript
export function createSession(projectId: string): SessionMeta {
  const workspacePath = path.join(projectPath, "workspace");
  
  ensureWorkspaceFiles(workspacePath);  // ← 初始化 workspace 文件
  
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.cpSync(workspacePath, sessionPath, { recursive: true }); // ← 复制 workspace 到 session
}
```

**4. `ensureWorkspaceFiles` 函数分析**

该函数负责初始化 workspace 目录结构(`fs-utils.ts:910-965`):

```typescript
export function ensureWorkspaceFiles(workspacePath: string) {
  // 1. 创建 workspace 目录
  if (!fs.existsSync(workspacePath)) {
    fs.mkdirSync(workspacePath, { recursive: true });
  }

  // 2. 创建 demos 目录
  const demosDir = path.join(workspacePath, "demos");
  if (!fs.existsSync(demosDir)) {
    fs.mkdirSync(demosDir, { recursive: true });
  }

  // 3. 确保知识库目录存在
  ensureKnowledgeDir(workspacePath);

  // 4. 检查已有 demo 页面
  const existing: string[] = [];
  for (const entry of fs.readdirSync(demosDir, { withFileTypes: true })) {
    // ... 扫描 demos 目录
  }

  // 5. 若无页面,创建默认页面
  if (existing.length === 0) {
    // 创建 index.tsx 和 config.schema.json
    writeWorkspaceTree(workspacePath, { folders: [], pages: [meta] });
  }

  // ❌ 未创建 memory.md 文件
}
```

**5. `memory.md` 文件的读取逻辑**

AI 对话模块中的读取函数(`scan-workspace.ts:109-126`)已经做了容错处理:

```typescript
export async function readMemoryContent(workingDir: string): Promise<string | null> {
  const memoryPath = path.join(workingDir, "memory.md");
  try {
    if (!fs.existsSync(memoryPath)) {
      return null;  // ← 文件不存在时返回 null,不会报错
    }
    const content = fs.readFileSync(memoryPath, "utf-8").trim();
    if (!content) {
      return null;
    }
    return content;
  } catch {
    return null;
  }
}
```

这说明**AI 对话系统预期 `memory.md` 可能不存在**,但**前端文件列表却暴露了这个文件让用户点击**。

### 根本原因

**`ensureWorkspaceFiles` 函数在初始化 workspace 时,创建了 demos 目录、知识库目录、默认页面等文件,但未创建 `memory.md` 文件。**

而前端文件列表或文档视图中存在"AI记忆"入口,用户点击后触发文件读取 API,因文件不存在而返回 404。

### 证据链

| 证据编号 | 证据内容 | 证据来源 | 级别 |
|---------|---------|---------|------|
| E1 | `ensureWorkspaceFiles` 函数未创建 `memory.md` | `fs-utils.ts:910-965` | A |
| E2 | 文件读取 API 在文件不存在时返回 404 | `route.ts:92-96` | A |
| E3 | `readMemoryContent` 函数预期文件可能不存在 | `scan-workspace.ts:115-116` | A |
| E4 | 前端点击 AI 记忆调用文件读取 API | `edit/page.tsx:1375-1376` | A |
| E5 | 文件编辑白名单包含 `memory.md` | `workspace-file-utils.ts:14` | A |

### 代码执行路径

```
用户点击"AI记忆"
  ↓
前端调用 onMemorySelect (edit/page.tsx:1372)
  ↓
GET /api/sessions/{sessionId}/workspace/files/memory.md
  ↓
route.ts GET 处理器检查文件存在性 (line 92)
  ↓
fs.existsSync(resolvedPath) 返回 false
  ↓
返回 404 { code: "FILE_READ_ERROR", message: "文件不存在" }
  ↓
前端显示 toast "加载文件失败"
```

---

## 三、解决方案

### 推荐方案:在 `ensureWorkspaceFiles` 中创建默认 `memory.md`

**具体做法**

在 `ensureWorkspaceFiles` 函数中,添加 `memory.md` 的创建逻辑:

```typescript
export function ensureWorkspaceFiles(workspacePath: string) {
  // ... 现有逻辑 ...

  // 确保知识库目录存在
  ensureKnowledgeDir(workspacePath);

  // 确保 memory.md 存在
  ensureMemoryFile(workspacePath);

  // ... 后续逻辑 ...
}

function ensureMemoryFile(workspacePath: string): void {
  const memoryPath = path.join(workspacePath, "memory.md");
  if (fs.existsSync(memoryPath)) return;

  const defaultMemory = `# 项目记忆

> AI 自动维护 · 最后更新：${new Date().toISOString().split('T')[0]}

## 我的偏好

- （等待用户表达偏好后自动记录）

## 关键决策

- （等待用户做出决策后自动记录）

## 项目约定

- （等待 AI 了解项目后自动补充）
`;

  fs.writeFileSync(memoryPath, defaultMemory, "utf-8");
}
```

**为何有效**

- 直接解决根因:在 workspace 初始化时就创建 `memory.md`
- 与 `ensureKnowledgeDir` 模式一致,遵循现有代码风格
- 提供默认模板,符合 `system-prompt.md` 中的文件模板规范

**影响范围**

- 影响所有新创建的 workspace(包括新 Session 和新项目)
- 已有 workspace 不受影响(因 `ensureMemoryFile` 会检查文件是否存在)

**风险**

- 极低风险:仅增加一个默认文件创建,不修改现有逻辑

**复杂度**

- 低:新增约 20 行代码,一个辅助函数

### 备选方案:前端容错处理

**具体做法**

在 `onMemorySelect` 回调中,当文件不存在时自动创建:

```typescript
onMemorySelect={async () => {
  try {
    const res = await fetch(`/api/sessions/${sessionId}/workspace/files/memory.md`);
    const data = await res.json();
    
    if (data.success) {
      setWsCodeDialogData({ ...data.data });
      setWsCodeDialogOpen(true);
    } else if (data.error?.code === "FILE_READ_ERROR") {
      // 文件不存在,创建默认内容
      const defaultContent = "# 项目记忆\n\n> AI 自动维护\n";
      await fetch(`/api/sessions/${sessionId}/workspace/files/memory.md`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: defaultContent }),
      });
      // 重新加载
      // ...
    }
  } catch { /* ... */ }
}}
```

**利弊分析**

- ✅ 优点:无需修改后端初始化逻辑
- ❌ 缺点:
  - 前端承担了文件创建职责,违反关注点分离
  - 首次点击会有延迟(先 404,再创建,再重新加载)
  - 与 `ensureKnowledgeDir` 等后端初始化模式不一致

**不推荐原因**

文件初始化应在 workspace 创建时完成,而非用户首次访问时延迟创建。

### 后续建议

1. **统一默认文件初始化逻辑**
   
   考虑将 `ensureWorkspaceFiles` 重构为更清晰的模块化结构:
   
   ```typescript
   function ensureWorkspaceFiles(workspacePath: string) {
     ensureDirectory(workspacePath);
     ensureDemosDir(workspacePath);
     ensureKnowledgeDir(workspacePath);
     ensureMemoryFile(workspacePath);      // ← 新增
     ensureDemoPages(workspacePath);
     ensureWorkspaceTree(workspacePath);
   }
   ```

2. **添加 workspace 完整性校验**
   
   在开发模式下,启动时校验 workspace 必需文件是否存在:
   
   ```typescript
   function validateWorkspace(workspacePath: string): string[] {
     const requiredFiles = ["memory.md", "workspace-tree.json"];
     const missing = requiredFiles.filter(f => 
       !fs.existsSync(path.join(workspacePath, f))
     );
     return missing;
   }
   ```

3. **完善 `memory.md` 默认模板**
   
   默认模板内容应与 `system-prompt.md` 中的模板保持一致,避免 AI 行为不一致。

---

## 四、相关代码路径

### 涉及文件

| 文件路径 | 作用 | 需修改 |
|---------|------|--------|
| `packages/author-site/src/lib/fs-utils.ts` | Workspace 文件初始化逻辑 | ✅ 是 |
| `packages/author-site/src/app/api/sessions/[sessionId]/workspace/files/[...filePath]/route.ts` | 文件读取 API，对既有 Session 的 `memory.md` 缺失做窄范围自愈 | ✅ 是 |
| `packages/author-site/src/app/demo/[id]/edit/page.tsx` | 前端文件点击处理 | ❌ 否 |
| `packages/author-site/src/lib/workspace-file-utils.ts` | 文件编辑白名单 | ❌ 否(已包含) |
| `packages/author-site/src/lib/agent/scan-workspace.ts` | AI 记忆读取函数 | ❌ 否(已容错) |
| `packages/author-site/src/lib/agent/prompts/system-prompt.md` | memory.md 文件模板 | ⚠️ 参考 |

### 调用链

```
createSession (fs-utils.ts:1066)
  ↓
ensureWorkspaceFiles (fs-utils.ts:910)
  ↓
[需新增] ensureMemoryFile
  ↓
fs.cpSync → Session 目录 (fs-utils.ts:1082)

用户点击 AI 记忆 (edit/page.tsx:1372)
  ↓
GET /api/sessions/{sid}/workspace/files/memory.md
  ↓
route.ts GET 处理器
  ↓
fs.existsSync (route.ts:92)
  ↓
[修复后] 文件存在,返回内容
```

### 相关配置

- **文件编辑白名单**: `workspace-file-utils.ts:10-15` - `memory.md` 已在白名单中
- **AI 记忆注入逻辑**: `system-prompt.ts:50-54` - L4 记忆前缀构建
- **隐藏文件配置**: `workspace-file-utils.ts:36-41` - `memory.md` 不在隐藏列表中(正确)

---

## 五、质量检查

- ✅ 根因有 A 级证据支撑(`fs-utils.ts:910-965` 直接代码证据)
- ✅ 文件路径与行号准确
- ✅ 区分了现象(加载失败)与根因(未创建文件)
- ✅ 解决方案具体可执行(提供完整代码示例)
- ✅ 未包含未验证的假设性断言
- ✅ 已对比 AI 对话系统的容错逻辑(`scan-workspace.ts:115-116`)

---

## 六、实施与验证记录

### 2026-06-25 实施摘要

- 在 `packages/author-site/src/lib/fs-utils.ts` 新增 `ensureMemoryFile`，由 `ensureWorkspaceFiles` 统一保证 workspace 根目录存在 `memory.md`。
- 默认 `memory.md` 使用项目记忆模板，包含最后更新日期、我的偏好、关键决策两个章节。
- 已存在的 `memory.md` 不会被覆盖，保留用户手写内容和 AI 已记录内容。
- 在 `packages/author-site/src/app/api/sessions/[sessionId]/workspace/files/[...filePath]/route.ts` 中，仅当读取路径为 `memory.md` 时调用 `ensureMemoryFile`，使已创建但缺少记忆文件的既有 Session 也能在点击入口时恢复。
- 在 `packages/author-site/src/lib/__tests__/fs-utils-multi-demo.test.ts` 补充断言，覆盖空 workspace、已有 demo workspace、已有记忆文件不覆盖三类场景。

### 验证结果

- `pnpm --filter @opencode-workbench/author-site test -- fs-utils-multi-demo.test.ts`：通过，22 个测试全部成功。
- `pnpm --filter @opencode-workbench/author-site typecheck`：通过。
- `pnpm --dir OPS/CLI dev system --json`：通过；author-site 3200 与 agent-service 3201 均在运行，agent-service health 正常。

### 剩余风险

- 未执行完整 author-site 测试套件和 Playwright E2E；本次变更范围集中在 workspace 文件初始化与单文件读取自愈，已用相关单测和类型检查覆盖。
