# 版本 Tab 回退功能失效 — 问题分析报告

## 1. 问题背景

### 问题描述
编辑页左侧栏"版本"Tab 中展示了项目的历史版本列表，每个非最新版本都有"恢复"按钮。点击"恢复"后，虽然界面显示"恢复成功"的提示，版本列表也刷新了，但编辑器中的代码和页面内容并未发生任何变化——回退实际上没有生效。

### 发生场景
- **环境**：author-site (Next.js 14, port 3200) + agent-service (Fastify, port 3201)
- **触发条件**：在编辑页左侧栏切换到"版本"Tab，点击某个历史版本的"恢复"按钮
- **稳定性**：可稳定复现

### 预期行为
点击"恢复"后，编辑器中的代码/Schema/预览应立即切换为目标版本的对应内容。后续保存时应将恢复后的内容存入项目工作区。

### 实际行为
弹窗确认 → 显示"恢复成功"Toast → 版本列表刷新 → 编辑器内容**完全不变**。

更严重的是：恢复后用户若点击"保存"，会将当前编辑器中的旧内容写回项目工作区，**覆盖刚恢复的正确内容**，等同于恢复被静默撤销。即使刷新页面，若未创建新会话，则仍然使用旧会话工作区，同样看不到恢复后的内容。

---

## 2. 根因分析

### 数据架构概述

作者端的数据涉及两个独立系统和三层数据存储（共享同一个 `DATA_DIR`）：

| 层级 | 路径 | 说明 |
|------|------|------|
| 项目工作区 | `data/projects/<id>/workspace/` | agent-service 恢复操作的目标 |
| 会话工作区 | `data/workspaces/<uid>/<pid>/<wsId>/` | 编辑器实际读写的数据源 |
| React 状态 | 前端内存中的 `code` / `schema` / `editorContent` | 用户看到的内容 |

**关键事实**：会话工作区在 `createEditSession` 时从项目工作区一次性复制生成（`workspace-manager.ts:37-43`），此后独立演进，不再自动同步。

### 保存流程（正确实现，用于对比）

```
编辑器修改 → handleSave()  page.tsx:700-746
  ↓ ① PUT /api/sessions/:sid/files/:did  写入会话工作区
  ↓ ② POST /api/sessions/:sid/save → saveEditSession()  session-manager.ts:311-434
        a. 先快照当前项目工作区 → data/snapshots/<id>/vN/
        b. 再将会话工作区内容复制回项目工作区
        c. 记录版本到 project.json
        d. 删除过期会话
  ↓ router.push("/")  返回项目列表
```

### 恢复流程（存在缺陷）

```
点击"恢复" → handleRestoreVersion()  page.tsx:628-656
  ↓ ① POST http://localhost:3201/api/projects/:id/restore  → agent-service
        → ProjectWorkspaceManager.restoreVersion()  project-workspace-manager.ts:450-509
           a. 备份当前项目工作区 → data/snapshots/<id>/vN_backup/  ⚠️ 非标准路径
           b. 恢复目标版本快照 → 覆盖项目工作区  ✅ 磁盘已正确恢复
           c. 记录新版本，但 snapshotPath 指向 a 的备份  ⚠️ 语义错误
  ↓ ② toast("恢复成功")  ✅ 前端提示成功
  ↓ ③ loadVersionHistory()  ✅ 版本列表已刷新
  ↓ ④ getPublishStatus()  ✅ 发布状态已刷新
  🚫 未同步会话工作区（会话工作区仍是旧内容）
  🚫 未更新 React 状态（code / schema / editorContent 仍是旧内容）
```

### 四个问题点

**问题点 1 — 前端未重载编辑状态（主问题、直接原因）**

`page.tsx:628-656` — 恢复成功后只做了 Toast + 刷新版本列表 + 刷新发布状态：
- 没有调用 `applyDemoSnapshot()` 更新 `code`/`schema`/`editorContent`/`previewSize`/`configDataMap`
- 没有触发编译缓存失效以刷新预览 iframe

**问题点 2 — 会话工作区未同步（主问题、根本原因）**

`workspace-manager.ts:37-43` — `createWorkspace` 仅创建时复制一次，此后独立：
- 编辑器数据源 `GET /api/sessions/[sid]/files` 从 `findWorkspacePath(workspaceId)` 读取（`files/route.ts:50-67`）
- 恢复操作只更新了 `data/projects/<id>/workspace/`，未触碰 `data/workspaces/<uid>/<pid>/<wsId>/`
- 即便前端调用 `GET /api/sessions/[sid]/files` 重新读取，读到的仍是旧内容

**问题点 3 — 保存后恢复被静默撤销（严重副作用）**

`session-manager.ts:311-434` 中 `saveEditSession()`：
- L356-361：先快照当前项目工作区（此时已是恢复后的正确内容）
- L363-380：**再将会话工作区内容（旧内容！）复制覆盖项目工作区**

后果：
```
用户恢复到 v3 → 项目工作区 = v3 ✅
用户点击保存   → 项目工作区 = 旧内容 ❌（恢复被静默撤销）
版本列表出现异常条目：
  vN:   snapshotPath = _backup（agent-service 备份，语义错误）
  vN+1: snapshotPath = v3（快照是恢复后内容，但 workspace 已被覆盖）
```

**问题点 4 — agent-service `restoreVersion` 的 snapshotPath 指向备份（数据一致性问题）**

`project-workspace-manager.ts:474-481`：
```
const newVersion: VersionInfo = {
  snapshotPath: backupPath,  // ⚠️ 指向恢复前的备份，不是恢复后的状态
  note: `从 ${versionId} 恢复`,
};
```

对比 `fs-utils.ts:891-893` 中的正确实现（创建恢复后状态的快照）：
```
const restoreSnapshotPath = getSnapshotPath(projectId, restoreVersionId);
fs.cpSync(workspacePath, restoreSnapshotPath, { recursive: true });  // ✅
```

### 证据链

| 证据 | 级别 | 来源 | 说明 |
|------|------|------|------|
| handleRestoreVersion 未调用 applyDemoSnapshot | A | `page.tsx:628-656` | 恢复后未更新 code/schema/editorContent |
| createWorkspace 复制后不再同步 | A | `workspace-manager.ts:37-43` | 会话工作区独立于项目工作区 |
| GET /api/sessions/:sid/files 读自会话工作区 | A | `files/route.ts:50-67` | 编辑器数据源是会话工作区，非项目工作区 |
| saveEditSession 用会话工作区覆盖项目工作区 | A | `session-manager.ts:376-380` | 恢复后保存会撤销恢复 |
| agent-service snapshotPath 指向 backupPath | A | `project-workspace-manager.ts:474-481` | 新版本快照内容与 note 不一致 |
| 首次加载 demoId = URL params.id | A | `page.tsx:88-96` | projectId 即为 demoId |
| 两方 readProjectMeta 共享同一 project.json | A | `fs-utils.ts:748` / `project-workspace-manager.ts:109` | 共享 DATA_DIR |
| projectApiClient 默认连接 port 3201 | A | `project-api.ts:28,51` | 恢复请求发往 agent-service |
| applyDemoSnapshot 支持 manual-load source | A | `page.tsx:232` | 可复用为恢复后状态重载函数 |
| 无现有会话工作区同步 API | A | 全局 grep | 需要新建路由 |

### 根本原因

恢复操作在 agent-service 端正确更新了项目工作区（磁盘层面），但存在三层断层：
1. **会话工作区**未同步 — 编辑器读写的"工作副本"仍是旧内容
2. **React 状态**未更新 — 用户看到的内容仍是旧内容
3. **保存流程会覆盖** — 恢复后若点保存，会话工作区旧内容会写回项目工作区，静默撤销恢复

### 完整代码执行路径

```
[用户打开编辑页]
  loadDemo → POST /api/sessions { demoId }  session/route.ts:17-108
    → findActiveSession → 复用活跃会话（若有）
    ─ 或 ─
    → createEditSession  session-manager.ts:192-259
        → createWorkspace  workspace-manager.ts:26-68
            → cp projectWorkspacePath → workspacePath  ⬜ 一次性复制
  → GET /api/sessions/:sid/files  files/route.ts:17-77
    → 从会话工作区读取 demos/*/index.tsx + config.schema.json
  → setCode / setSchema / setEditorContent  ⬜ React 状态 = 会话工作区

[用户点击"恢复"]
  → handleRestoreVersion  page.tsx:628
    → projectApiClient.restoreVersion(demoId, { versionId })  project-api.ts:72
      → POST http://localhost:3201/api/projects/:id/restore
        → agent-service routes/projects.ts:309
          → projectWorkspaceManager.restoreVersion  project-workspace-manager.ts:450
            → 备份 → backupPath  ⚠️ 非标准 _backup 后缀
            → 恢复快照 → 项目工作区  ✅ 磁盘已正确恢复
            → 记录版本 (snapshotPath = backupPath)  ⚠️ 语义错误
    → toast("恢复成功")  ✅
    → loadVersionHistory()  ✅
    → getPublishStatus()  ✅
    → 🚫 未同步会话工作区
    → 🚫 未更新 React 状态

[恢复后点"保存"]
  → handleSave  page.tsx:700
    → PUT 写入会话工作区（仍是旧内容）
    → POST /api/sessions/:sid/save → saveEditSession  session-manager.ts:311
      → 快照项目工作区（恢复后内容）→ vN+1  ✅
      → 复制会话工作区（旧内容）→ 项目工作区  ❌ 覆盖恢复结果
      → router.push("/")
    → 恢复被静默撤销！
```

---

## 3. 解决方案

### 方案一：恢复后同步会话工作区并重载编辑器（推荐）

修复**问题点 1+2+3**。在恢复成功后增加两步：同步会话工作区 → 重载编辑器状态。

**原理**：恢复后 `data/projects/<id>/workspace/` 已是正确内容，只需将其复制到会话工作区，然后重新读取文件更新 React 状态。之后保存也会将正确内容写回项目工作区。

**影响范围**（3 个文件）：
- `packages/author-site/src/lib/workspace-manager.ts` — 新增 `syncSessionFromProject` 函数
- 新建 `packages/author-site/src/app/api/sessions/[sessionId]/sync-project/route.ts` — API 路由
- `packages/author-site/src/app/demo/[id]/edit/page.tsx` — 修改 `handleRestoreVersion`

**复杂度**：低（~60 行核心代码）

**风险**：低。恢复操作本身是破坏性的，同步会话工作区不会引入额外风险。

**具体实现如下：**

**Step 1** — 在 `packages/author-site/src/lib/workspace-manager.ts` 末尾新增：

```typescript
import { findWorkspacePath, getProjectPath, getWorkspaceMeta, writeWorkspaceMeta } from "./fs-utils";
import path from "path";
import fs from "fs";

/**
 * 将会话工作区替换为项目工作区的最新内容。
 * 用于版本恢复后同步会话工作区。
 */
export function syncSessionFromProject(
  userId: string,
  projectId: string,
  workspaceId: string,
): string | null {
  const wsPath = findWorkspacePath(workspaceId);
  if (!wsPath) return null;

  const projectPath = getProjectPath(projectId);
  const projectWorkspacePath = path.join(projectPath, "workspace");
  if (!fs.existsSync(projectWorkspacePath)) return null;

  fs.rmSync(wsPath, { recursive: true, force: true });
  fs.cpSync(projectWorkspacePath, wsPath, { recursive: true });

  const meta = getWorkspaceMeta(workspaceId);
  if (meta) {
    meta.updatedAt = Date.now();
    writeWorkspaceMeta(workspaceId, meta);
  }

  return wsPath;
}
```

**Step 2** — 新建 `packages/author-site/src/app/api/sessions/[sessionId]/sync-project/route.ts`：

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getEditSession } from "@/lib/session-manager";
import { syncSessionFromProject } from "@/lib/workspace-manager";
import { createApiSuccess, createApiError } from "@/lib/fs-utils";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";

export async function POST(
  _request: NextRequest,
  { params }: { params: { sessionId: string } },
) {
  try {
    const token = getAuthCookie();
    if (!token) {
      return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), { status: 401 });
    }
    const payload = await verifyToken(token);
    if (!payload) {
      return NextResponse.json(createApiError("UNAUTHORIZED", "登录已过期"), { status: 401 });
    }

    const { sessionId } = params;
    const sessionMeta = getEditSession(sessionId);
    if (!sessionMeta) {
      return NextResponse.json(createApiError("SESSION_NOT_FOUND"), { status: 404 });
    }
    if (!sessionMeta.workspaceId) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "Session 未绑定 workspaceId"),
        { status: 400 },
      );
    }

    const syncedPath = syncSessionFromProject(
      sessionMeta.userId || payload.userId,
      sessionMeta.demoId,
      sessionMeta.workspaceId,
    );
    if (!syncedPath) {
      return NextResponse.json(
        createApiError("FILE_WRITE_ERROR", "同步工作区失败"),
        { status: 500 },
      );
    }
    return NextResponse.json(createApiSuccess({ syncedPath }));
  } catch (error) {
    console.error("Error syncing session workspace:", error);
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "同步会话工作区失败"),
      { status: 500 },
    );
  }
}
```

**Step 3** — 修改 `packages/author-site/src/app/demo/[id]/edit/page.tsx` 中 `handleRestoreVersion` 函数（L628-656）：

```typescript
const handleRestoreVersion = async (version: VersionInfo) => {
  if (!confirm(`确定要恢复到 ${version.versionId} 吗？当前状态将被保存为新版本。`)) {
    return;
  }

  setRestoring(version.versionId);
  try {
    // ① 调用 agent-service 恢复项目工作区
    const result = await projectApiClient.restoreVersion(demoId, {
      versionId: version.versionId,
      username: "user",
    });

    // ② 【新增】将项目工作区同步到当前会话工作区
    const syncRes = await fetch(`/api/sessions/${sessionId}/sync-project`, {
      method: "POST",
    });
    if (!syncRes.ok) {
      throw new Error("同步会话工作区失败");
    }

    // ③ 【新增】重新从会话工作区加载文件，更新编辑器状态
    const filesRes = await fetch(`/api/sessions/${sessionId}/files`);
    const filesData = await filesRes.json();
    if (filesData.success) {
      const multi = filesData.data;
      const pageIds = (multi.demoPages || []).map((p: { id: string }) => p.id);
      const newActiveId = pageIds.includes(activeDemoId) ? activeDemoId : pageIds[0];
      const targetDemo = multi.demos?.[newActiveId];

      if (newActiveId && newActiveId !== activeDemoId) {
        setActiveDemoId(newActiveId);
      }

      if (targetDemo) {
        applyDemoSnapshot({
          code: targetDemo.code ?? "",
          schema: targetDemo.schema ?? "",
          source: "manual-load",
        });
      }

      // 更新页面列表（恢复可能导致页面增删）
      setDemoPages(pageIds.map((id) => ({
        id,
        name: multi.demoPages.find((p: { id: string }) => p.id === id)?.name || id,
        order: 0,
        parentId: null,
      })));
      setDemoFolders(multi.demoFolders || []);
      setProjectConfigSchema(multi.projectConfigSchema);
    }

    toast({ title: "恢复成功", description: `已恢复到新版本 ${result.newVersionId}` });
    await loadVersionHistory();
    const statusResult = await projectApiClient.getPublishStatus(demoId);
    setPublishStatus(statusResult.status);
    setPublishedVersion(statusResult.publishedVersion);
  } catch (err) {
    toast({
      title: "恢复失败",
      description: err instanceof Error ? err.message : "恢复版本失败",
      variant: "destructive",
    });
  } finally {
    setRestoring(null);
  }
};
```

### 方案二：修复 agent-service restoreVersion 的 snapshotPath（修数据一致性问题）

修复**问题点 4**。

**影响范围**：仅 `packages/agent-service/src/workspace/project-workspace-manager.ts:474-481`

**修改**：
```typescript
// 修改前：
const newVersion: VersionInfo = {
  versionId: newVersionId,
  snapshotPath: backupPath,  // ⚠️ 指向备份
  // ...
};

// 修改后：
const restoreSnapshotPath = path.join(SNAPSHOTS_DIR, projectId, newVersionId);
await copyDirectory(project.workspacePath, restoreSnapshotPath);  // 创建恢复后状态快照
const newVersion: VersionInfo = {
  versionId: newVersionId,
  snapshotPath: restoreSnapshotPath,  // ✅ 指向恢复后的状态
  // ...
};
```

**复杂度**：低（~5 行变更）

### 方案三（备选）：恢复后强制重建会话

如果不想新增 API 路由，可简化实现：恢复后通过 `forceNew` 参数创建新会话，并用新数据重载。

**影响范围**：仅 `page.tsx`

**实现**：
```typescript
// 在 handleRestoreVersion 成功回调中：
const newSessionRes = await fetch("/api/sessions", {
  method: "POST",
  body: JSON.stringify({ demoId, forceNew: true }),
});
const newSessionData = await newSessionRes.json();
// 更新 sessionId / workspaceId / tempWorkspace
// 然后重新加载文件...
```

**缺点**：会丢弃当前 AI 对话历史，且 redirect 到 "/" 后用户需重新进入编辑页。

### 后续建议

1. 方案一和方案二应同时实施，方案一解决回退不生效，方案二防止版本回溯数据不一致
2. 当前 `fs-utils.ts`（author-site）和 `project-workspace-manager.ts`（agent-service）各自维护一套 `restoreVersion` 实现，建议统一入口
3. 恢复成功后应额外触发 `invalidateCompileCache(sessionId, activeDemoId)` 确保预览 iframe 也刷新

---

## 4. 相关代码路径

### 涉及文件

| 文件路径 | 行号 | 说明 |
|---------|------|------|
| `packages/author-site/src/app/demo/[id]/edit/page.tsx` | L628-L656 | `handleRestoreVersion` — 恢复入口，缺少同步和重载 |
| `packages/author-site/src/app/demo/[id]/edit/page.tsx` | L232-L254 | `applyDemoSnapshot` — 可用于重载编辑器状态 |
| `packages/author-site/src/app/demo/[id]/edit/page.tsx` | L342-L481 | `loadDemo` — 初始加载：创建会话 → 读文件 → 设状态 |
| `packages/author-site/src/app/demo/[id]/edit/page.tsx` | L700-L746 | `handleSave` — 保存：写入会话 → commit 到项目 → 返回列表 |
| `packages/author-site/src/lib/project-api.ts` | L28, L72-L89 | `restoreVersion` — 代理请求到 agent-service |
| `packages/author-site/src/lib/workspace-manager.ts` | L26-L68 | `createWorkspace` — 复制项目工作区→会话工作区 |
| `packages/author-site/src/lib/session-manager.ts` | L192-L259 | `createEditSession` — 创建编辑会话 |
| `packages/author-site/src/lib/session-manager.ts` | L311-L434 | `saveEditSession` — 快照→覆盖项目工作区→记录版本（L376-380 覆盖逻辑） |
| `packages/author-site/src/app/api/sessions/route.ts` | L17-L108 | `POST /api/sessions` — 创建/复用会话 |
| `packages/author-site/src/app/api/sessions/[sessionId]/files/route.ts` | L17-L77 | `GET` — 从会话工作区读取文件 |
| `packages/author-site/src/lib/fs-utils.ts` | L81-L83 | `getProjectPath` — 项目路径 = `DATA_DIR/projects/<id>` |
| `packages/author-site/src/lib/fs-utils.ts` | L748-L777 | `readProjectMeta` — 读 project.json |
| `packages/author-site/src/lib/fs-utils.ts` | L848-L914 | `restoreVersion` — 本地正确实现（未被 UI 调用） |
| `packages/author-site/src/lib/fs-utils.ts` | L1012-L1046 | `findWorkspacePath` / `getWorkspaceDir` — 会话工作区路径查找 |
| `packages/agent-service/src/routes/projects.ts` | L309-L356 | `POST /api/projects/:id/restore` — 恢复路由 |
| `packages/agent-service/src/workspace/project-workspace-manager.ts` | L450-L509 | `restoreVersion` — snapshotPath 指向备份（缺陷） |

### 调用链

```
[恢复按钮 onClick]
  → page.tsx:handleRestoreVersion()
    → project-api.ts:restoreVersion()
      → HTTP POST port 3201 → agent-service:routes/projects.ts:309
        → project-workspace-manager.ts:restoreVersion()
          → 备份 → 恢复快照 → 记录版本（snapshotPath 有缺陷）
      ← HTTP 200
    → loadVersionHistory()       [仅刷新列表]
    → getPublishStatus()         [仅刷新状态]
    → 🚫 缺失：sync-project → 同步会话工作区
    → 🚫 缺失：GET files → applyDemoSnapshot → 更新 React 状态

[恢复后点保存]
  → page.tsx:handleSave()
    → PUT 写入会话工作区（旧内容）
    → POST /api/sessions/:sid/save → session-manager.ts:saveEditSession()
      → 快照项目工作区（恢复后内容）→ vN+1  ← 意外保留了恢复内容
      → 用会话工作区（旧内容）覆盖项目工作区   ← 恢复被撤销
      → router.push("/")
```

### 相关配置

- `DATA_DIR` — author-site 和 agent-service 共享的数据目录（默认 `<项目根>/data/`）
- `AGENT_SERVICE_URL` / `NEXT_PUBLIC_AGENT_SERVICE_URL` — agent-service 地址（默认 `http://localhost:3201`）
- `MAX_VERSIONS_KEEP` (shared 包) — 保留最大版本数
