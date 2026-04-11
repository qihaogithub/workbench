# Session 文件堆积问题分析报告（用户系统版）

## 一、问题描述

**现象**：在 `packages/web/data/sessions/{userId}/proj_1775482091324/` 目录中存在多个 session 文件夹

**影响**：
- 磁盘空间浪费
- 文件系统混乱，难以管理
- 可能影响 session 查找性能（遍历目录时）
- **多用户场景下问题放大**：每个用户都会独立堆积 session 文件

---

## 二、问题根因分析

### 核心问题：过期 session 从未被自动清理

经过代码审查，发现 **session 清理机制存在多个致命缺陷**：

### 2.1 `cleanupExpiredSessions()` 函数存在但从未被调用

**位置**：`packages/web/src/lib/session-manager.ts` 第 242-271 行

```typescript
export function cleanupExpiredSessions(): string[] {
  // 这个函数可以正确清理过期 session
  // 但整个项目中没有任何地方调用它！
}
```

**验证**：grep 搜索显示该函数只有定义，没有调用者。

**用户系统影响**：需要改造为支持按 userId 或全局清理

### 2.2 Cleanup API 路由是空壳

**位置**：`packages/web/src/app/api/sessions/cleanup/route.ts`

```typescript
export async function POST() {
  const agentClient = getAgentClient();
  const health = await agentClient.health();
  // 只做了健康检查，没有实际清理！
  return NextResponse.json(createApiSuccess({
    cleaned: [],  // 永远为空
    count: 0,     // 永远为 0
  }));
}
```

**问题**：这个 API 路由完全没有调用清理函数，形同虚设。

**用户系统改造要求**：
- 需要从 JWT Cookie 读取 userId
- 仅清理当前用户的过期 session（或管理员可全局清理）
- 添加认证和权限校验

### 2.3 没有后台自动清理调度

- Next.js 没有配置定时任务（缺少 `instrumentation.ts`）
- 过期 session 会**永久留在磁盘上**，除非：
  - 用户手动运行 `cleanup-sessions.ps1`
  - 用户手动删除
  - session 被复用时发现过期（但当前也不会主动删除）

**用户系统影响**：多用户环境下，后台任务应清理所有用户的过期 session

### 2.4 每次访问编辑页面都可能创建新 session

**位置**：`packages/web/src/app/demo/[id]/edit/page.tsx` 第 73-80 行

```typescript
useEffect(() => {
  const loadDemo = async () => {
    const sessionRes = await fetch("/api/sessions", {
      method: "POST",  // 每次加载都调用创建接口
      body: JSON.stringify({ demoId }),
    });
    // ...
  };
  loadDemo();
}, [demoId]);
```

**触发时机**：
- 用户进入编辑页面
- 用户刷新编辑页面
- 用户从首页点击"编辑 Demo"

**用户系统改造**：
- API 路由需要从 JWT Cookie 读取 userId
- Session 路径变为 `{sessionsDir}/{userId}/{projectId}/`

### 2.5 Session 复用机制不完善（改造前）

**位置**：`packages/web/src/lib/session-manager.ts` 第 114-137 行

**改造前代码**：
```typescript
export function findActiveSession(projectId: string): string | null {
  // 只检查 expiresAt，不检查 session 状态
  if (Date.now() <= meta.expiresAt) {
    return meta.sessionId;  // 找到未过期的就返回
  }
  // 过期的 session 只是跳过，不会主动删除
}
```

**问题**：
- 只检查过期时间，不检查 session 是否被用户"放弃"
- 发现过期 session 时不会删除，只是跳过
- 下次遍历还会再次检查这些过期文件

**用户系统改造**：
- 函数签名改为 `findActiveSession(userId: string, projectId: string)`
- Session 路径：`{sessionsDir}/{userId}/{projectId}/`
- 添加防御性检查：如果 `.session.json` 中的 userId 与路径不匹配，记录警告

### 2.6 取消操作的错误被忽略

**位置**：`packages/web/src/app/demo/[id]/edit/page.tsx` 第 231-240 行

```typescript
const handleCancel = async () => {
  try {
    if (sessionId) {
      await fetch(`/api/sessions/${sessionId}`, {
        method: "DELETE",
      });
    }
  } catch {
    // ignore - 错误被静默忽略！
  }
  router.push("/");
};
```

**问题**：
- DELETE 请求失败时 session 不会被删除
- 错误被静默忽略，无法排查问题

**用户系统改造**：
- DELETE API 需要验证 JWT，确保用户只能删除自己的 session
- 添加权限校验逻辑

### 2.7 缺少用户级别的权限控制

**新增问题**：引入用户系统后，需要确保：
- 用户只能查看/操作自己的 session
- 跨用户 session 访问应返回 403 Forbidden
- 管理员角色（如有）可查看所有 session

---

## 三、Session 存储结构

### 3.1 目录组织（用户系统改造后）

```
packages/web/data/sessions/
├── {userId_1}/                        # 用户 1 的 session
│   └── proj_1775482091324/           # 项目目录
│       ├── session-1775482100000-abc123/   # Session 1（可能已过期）
│       │   ├── .session.json
│       │   ├── index.tsx
│       │   └── config.schema.json
│       ├── session-1775482200000-def456/   # Session 2（可能已过期）
│       │   ├── .session.json
│       │   ├── index.tsx
│       │   └── config.schema.json
│       └── session-1775482300000-ghi789/   # Session 3（当前活跃）
│           ├── .session.json
│           ├── index.tsx
│           └── config.schema.json
└── {userId_2}/                        # 用户 2 的 session
    └── proj_1775482091324/           # 项目目录（同一项目，不同用户）
        └── session-1775482400000-jkl012/
            ├── .session.json
            ├── index.tsx
            └── config.schema.json
```

### 3.2 `.session.json` 内容（新增 userId 字段）

```json
{
  "sessionId": "session-1775482100000-abc123",
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "demoId": "proj_1775482091324",
  "opencodeSessionId": null,
  "createdAt": 1775482100000,
  "expiresAt": 1775489300000
}
```

### 3.3 过期时间配置

- **过期时长**：2 小时（`2 * 60 * 60 * 1000` 毫秒）
- **定义位置**：
  - `packages/web/src/lib/fs-utils.ts` 第 14 行
  - `packages/web/src/lib/session-manager.ts` 第 12 行

---

## 四、Session 生命周期完整流程

### 4.1 创建流程（用户系统版）

```
用户访问编辑页面（需先登录）
      │
      ▼
JWT Cookie 携带 userId
      │
      ▼
POST /api/sessions
      │
      ▼
验证 JWT → 提取 userId
      │
      ▼
findActiveSession(userId, projectId) - 查找未过期的 session
      │
      ├─ 找到 → 复用现有 session
      │
      └─ 未找到 → createEditSession(userId, projectId)
            │
            ├─ 生成唯一 sessionId
            ├─ 创建目录：{sessionsDir}/{userId}/{projectId}/{sessionId}/
            ├─ 复制 workspace 到 session 目录
            ├─ 写入 .session.json（expiresAt = now + 2h, userId 字段）
            └─ 注入 .opencode 代理配置
```

### 4.2 清理流程（当前状态）

```
用户点击"取消"
      │
      ▼
DELETE /api/sessions/:id
      │
      ├─ 成功 → 删除 session 目录 ✓
      │
      └─ 失败 → session 残留 ✗（错误被忽略，无权限验证）

用户点击"保存"
      │
      ▼
mergeSession() → 合并到项目 → 删除 session 目录 ✓

session 过期（2 小时后）
      │
      └─ 什么都不会发生 ✗（清理函数从未调用）
```

### 4.3 清理流程（改造后）

```
用户点击"取消"
      │
      ▼
DELETE /api/sessions/:id
      │
      ├─ 验证 JWT → 确认 session 属于当前用户
      ├─ 成功 → 删除 session 目录 ✓
      │
      └─ 失败 → 显示错误提示 ✗

用户点击"保存"
      │
      ▼
mergeSession() → 合并到项目 → 删除 session 目录 ✓

session 过期（2 小时后）
      │
      └─ 后台定时任务自动清理 ✓

后台定时清理（instrumentation.ts）
      │
      └─ 每 30 分钟扫描所有用户的 session → 清理过期文件 ✓

用户手动清理（可选）
      │
      └─ POST /api/sessions/cleanup → 清理当前用户的过期 session ✓
```

---

## 五、修复方案

### 方案 1：修复 Cleanup API 路由（必须）⭐⭐⭐

**修改文件**：`packages/web/src/app/api/sessions/cleanup/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { cleanupExpiredSessions } from '@/lib/session-manager';
import { createApiSuccess, createApiError } from '@/lib/fs-utils';
import { getAuthCookie, verifyToken } from '@/lib/auth/jwt';

export async function POST(request: NextRequest) {
  try {
    // 从 Cookie 读取 userId
    const token = getAuthCookie();
    if (!token) {
      return NextResponse.json(
        createApiError('UNAUTHORIZED', '未登录'),
        { status: 401 }
      );
    }

    const payload = await verifyToken(token);
    if (!payload) {
      return NextResponse.json(
        createApiError('UNAUTHORIZED', '登录已过期'),
        { status: 401 }
      );
    }

    // 仅清理当前用户的过期 session
    const cleaned = cleanupExpiredSessions(payload.userId);
    return NextResponse.json(createApiSuccess({
      cleaned,
      count: cleaned.length,
    }));
  } catch (error) {
    console.error('[Session Cleanup] Error:', error);
    return NextResponse.json(
      createApiError('INTERNAL_ERROR', '清理失败'),
      { status: 500 }
    );
  }
}
```

**改造要点**：
- 添加 JWT 验证
- 从 `cleanupExpiredSessions()` 改为 `cleanupExpiredSessions(userId)`
- 返回清理结果

### 方案 2：添加服务器端定时清理（推荐）⭐⭐⭐

**创建文件**：`packages/web/src/instrumentation.ts`

```typescript
let cleanupInterval: NodeJS.Timeout | null = null;

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { cleanupAllExpiredSessions } = await import('@/lib/session-manager');
    
    // 立即执行一次
    const cleaned = cleanupAllExpiredSessions();
    if (cleaned.length > 0) {
      console.log(`[Session Cleanup] Initial cleanup: ${cleaned.length} sessions removed`);
    }
    
    // 每 30 分钟清理一次（全局清理，不按用户）
    cleanupInterval = setInterval(() => {
      const cleaned = cleanupAllExpiredSessions();
      if (cleaned.length > 0) {
        console.log(`[Session Cleanup] Cleaned ${cleaned.length} expired sessions`);
      }
    }, 30 * 60 * 1000);
  }
}
```

**注意**：需要在 `next.config.js` 中启用：

```javascript
module.exports = {
  experimental: {
    instrumentationHook: true,
  },
}
```

**用户系统改造要点**：
- 后台任务使用 `cleanupAllExpiredSessions()` 全局清理函数
- 遍历 `data/sessions/` 下所有用户目录
- 记录日志便于排查问题

### 方案 3：在 `findActiveSession` 中主动清理过期 session（推荐）⭐⭐

**修改文件**：`packages/web/src/lib/session-manager.ts`

```typescript
export function findActiveSession(userId: string, projectId: string): string | null {
  const projectSessionDir = getProjectSessionDir(userId, projectId);

  if (!fs.existsSync(projectSessionDir)) return null;

  const entries = fs.readdirSync(projectSessionDir);

  for (const entry of entries) {
    const metaPath = path.join(projectSessionDir, entry, '.session.json');

    if (!fs.existsSync(metaPath)) continue;

    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));

      // 防御性检查：如果 session 元数据中的 userId 与路径不匹配，记录警告
      // 正常情况下不应触发，因为路径已经是 {sessionsDir}/{userId}/{projectId}/
      if (meta.userId && meta.userId !== userId) {
        console.warn(
          `[Session] Session ${entry} metadata userId (${meta.userId}) ` +
          `doesn't match path userId (${userId}). Possible data corruption.`
        );
        // 跳过但不删除，让管理员手动处理
        continue;
      }

      // 发现过期 session，主动删除
      if (Date.now() > meta.expiresAt) {
        fs.rmSync(path.join(projectSessionDir, entry), {
          recursive: true,
          force: true
        });
        console.log(`[Session] Cleaned up expired session: ${entry}`);
        continue;
      }

      // 找到未过期的 session
      if (meta.demoId === projectId) {
        return meta.sessionId;
      }
    } catch (error) {
      console.error(`[Session] Failed to read meta for ${entry}:`, error);
    }
  }

  return null;
}
```

**改造要点**：
- 函数签名添加 `userId` 参数
- 添加防御性检查：检测数据损坏情况
- 发现过期 session 主动删除

### 方案 4：改进取消操作的错误处理（建议）⭐

**修改文件**：`packages/web/src/app/demo/[id]/edit/page.tsx`

```typescript
const handleCancel = async () => {
  try {
    if (sessionId) {
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        console.error("[Cancel] Failed to delete session:", sessionId, data);
        toast({
          title: "清理失败",
          description: data.error?.message || "Session 清理失败，可能需要手动清理",
          variant: "destructive",
        });
      }
    }
  } catch (error) {
    console.error("[Cancel] Error deleting session:", error);
    toast({
      title: "清理失败",
      description: error instanceof Error ? error.message : "未知错误",
      variant: "destructive",
    });
  } finally {
    router.push("/");
  }
};
```

**改造要点**：
- 添加错误提示
- 显示后端返回的错误消息
- 无论成功失败都返回首页

### 方案 5：添加手动清理按钮（可选）

在首页或用户菜单添加"清理过期 Session"按钮，让用户可以手动触发清理。

```tsx
// components/auth/user-menu.tsx
const handleCleanupSessions = async () => {
  try {
    const res = await fetch("/api/sessions/cleanup", {
      method: "POST",
    });
    const data = await res.json();
    if (data.success) {
      toast({
        title: "清理完成",
        description: `已清理 ${data.data.count} 个过期 session`,
      });
    }
  } catch (error) {
    toast({
      title: "清理失败",
      description: error instanceof Error ? error.message : "未知错误",
      variant: "destructive",
    });
  }
};
```

---

## 六、Session 管理改造要点

### 6.1 `session-manager.ts` 改造清单

| 函数 | 改造内容 |
|------|---------|
| `findActiveSession()` | 添加 `userId` 参数，路径改为 `{sessionsDir}/{userId}/{projectId}/` |
| `createEditSession()` | 添加 `userId` 参数，创建用户目录，`.session.json` 添加 `userId` 字段 |
| `getProjectSessionDir()` | 改为 `getProjectSessionDir(userId, projectId)` |
| `cleanupExpiredSessions()` | 改为 `cleanupExpiredSessions(userId)` 仅清理指定用户的 session |
| `cleanupAllExpiredSessions()` | **新增**：遍历所有用户目录，全局清理 |
| `getSessionsDir()` | 保持不变，返回 `data/sessions/` |

### 6.2 API 路由改造清单

| 路由 | 改造内容 |
|------|---------|
| `POST /api/sessions` | 从 JWT Cookie 读取 userId，调用 `findActiveSession(userId, projectId)` |
| `DELETE /api/sessions/:id` | 验证 JWT，检查 session 属于当前用户，防止误删 |
| `GET /api/sessions` | 可选：返回当前用户的所有 session |
| `POST /api/sessions/cleanup` | 验证 JWT，调用 `cleanupExpiredSessions(userId)` |

### 6.3 权限控制

```typescript
// 辅助函数：从请求中提取并验证 userId
export async function extractUserIdFromRequest(): Promise<{ 
  success: boolean; 
  userId?: string; 
  error?: Response 
}> {
  const token = getAuthCookie();
  if (!token) {
    return {
      success: false,
      error: NextResponse.json(
        createApiError('UNAUTHORIZED', '未登录'),
        { status: 401 }
      ),
    };
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return {
      success: false,
      error: NextResponse.json(
        createApiError('UNAUTHORIZED', '登录已过期'),
        { status: 401 }
      ),
    };
  }

  return { success: true, userId: payload.userId };
}
```

**使用示例**：

```typescript
export async function POST(request: NextRequest) {
  const authResult = await extractUserIdFromRequest();
  if (!authResult.success) {
    return authResult.error!;
  }

  const userId = authResult.userId!;
  const { demoId } = await request.json();

  // ... 使用 userId 操作 session
}
```

---

## 七、问题优先级

| 问题 | 严重程度 | 影响范围 | 修复难度 | 优先级 |
|------|---------|---------|---------|--------|
| `cleanupExpiredSessions()` 从未被调用 | **高** | 所有过期 session 永久残留 | 中（需适配 userId） | P0 |
| Cleanup API 路由是空壳 | **高** | 无法通过 API 清理 | 中（需添加认证） | P0 |
| 缺少用户级别的权限控制 | **高** | 跨用户访问风险 | 中 | P0 |
| 没有自动清理调度 | **高** | 需要手动干预 | 中 | P1 |
| `findActiveSession` 不主动清理 | 中 | 过期 session 反复被检查 | 低 | P1 |
| 取消操作错误被忽略 | 中 | 用户无法感知清理失败 | 低 | P2 |

---

## 八、总结

**问题定性**：这是一个**设计缺陷**，不是 bug。系统设计了清理函数但没有调用它，导致 session 文件只创建不清理。

**根本原因**：
1. 清理机制未被启用（空壳 API、未调用的函数）
2. 缺少自动清理调度机制
3. 错误处理不完善
4. **用户系统引入后的新问题**：需要添加 userId 维度的权限控制和隔离

**建议修复顺序**：
1. **立即修复**：改造 `session-manager.ts` 添加 userId 参数（30 分钟）
2. **立即修复**：修复 Cleanup API 路由，添加 JWT 验证（20 分钟）
3. **短期优化**：在 `findActiveSession` 中主动清理过期 session（20 分钟）
4. **中期优化**：添加 `instrumentation.ts` 定时清理（30 分钟）
5. **长期优化**：改进错误处理和用户提示（20 分钟）

**预期效果**：
- 过期 session 会被自动清理，不再堆积
- 多用户环境下 session 严格隔离，防止跨用户访问
- 用户可以通过 API 手动触发清理
- 后台定时全局清理，无需手动干预
- 错误可追踪，便于排查问题

---

## 十、数据迁移方案

### 10.1 迁移背景

从旧目录结构迁移到新目录结构：

```
# 旧结构
data/sessions/{projectId}/{sessionId}/

# 新结构（用户系统版）
data/sessions/{userId}/{projectId}/{sessionId}/
```

### 10.2 迁移策略

**方案 A：自动迁移脚本（推荐）**

创建 `scripts/migrate-sessions.ts`：

```typescript
import fs from 'fs';
import path from 'path';

const SESSIONS_DIR = path.join(process.cwd(), 'data', 'sessions');

/**
 * 迁移函数：将旧结构迁移到新结构
 * 需要指定默认 userId（适用于单用户迁移）
 */
export function migrateSessions(defaultUserId: string) {
  if (!fs.existsSync(SESSIONS_DIR)) {
    console.log('[Migration] No sessions directory found');
    return;
  }

  const entries = fs.readdirSync(SESSIONS_DIR);
  let migratedCount = 0;

  for (const entry of entries) {
    const oldPath = path.join(SESSIONS_DIR, entry);
    
    // 跳过已经是用户目录的文件夹
    if (fs.existsSync(path.join(oldPath, '.session.json'))) {
      continue; // 这是旧结构的 session，需要移动
    }
    
    // 检查是否是项目目录（包含 session 文件夹）
    if (!fs.statSync(oldPath).isDirectory()) continue;
    
    const projectId = entry;
    const newPath = path.join(SESSIONS_DIR, defaultUserId, projectId);
    
    // 创建新的用户目录
    fs.mkdirSync(path.dirname(newPath), { recursive: true });
    
    // 移动整个项目目录
    fs.renameSync(oldPath, newPath);
    migratedCount++;
    
    console.log(`[Migration] Moved ${projectId} → ${defaultUserId}/${projectId}`);
  }

  console.log(`[Migration] Complete: ${migratedCount} projects migrated`);
}

// 运行迁移
const DEFAULT_USER_ID = process.env.MIGRATION_DEFAULT_USER_ID;
if (!DEFAULT_USER_ID) {
  console.error('[Migration] Error: MIGRATION_DEFAULT_USER_ID not set');
  process.exit(1);
}

console.log('[Migration] Starting migration...');
migrateSessions(DEFAULT_USER_ID);
```

**运行迁移**：

```bash
cd packages/web
MIGRATION_DEFAULT_USER_ID="your-user-id" npx ts-node scripts/migrate-sessions.ts
```

### 10.3 迁移步骤

1. **备份数据**：
   ```bash
   cp -r packages/web/data/sessions packages/web/data/sessions.backup
   ```

2. **获取默认 userId**：
   - 登录系统后，从 JWT token 或数据库中获取你的 userId

3. **运行迁移脚本**：
   ```bash
   cd packages/web
   MIGRATION_DEFAULT_USER_ID="550e8400-e29b-41d4-a716-446655440000" \
   npx ts-node scripts/migrate-sessions.ts
   ```

4. **验证迁移结果**：
   ```bash
   ls -la packages/web/data/sessions/
   # 应看到 {userId}/ 目录
   ```

5. **清理备份**（确认迁移成功后）：
   ```bash
   rm -rf packages/web/data/sessions.backup
   ```

### 10.4 注意事项

- **单用户场景**：所有旧 session 迁移到同一个 userId 下
- **多用户场景**：需要手动分配 session 到不同用户，或编写更复杂的迁移逻辑
- **向后兼容**：`cleanupAllExpiredSessions()` 应同时支持新旧结构，直到迁移完成
- **回滚方案**：保留备份数据，如需回滚可恢复旧结构

---

## 十一、相关文件清单

| 文件 | 作用 | 需要修改 | 用户系统改造 |
|------|------|---------|-------------|
| `packages/web/src/lib/session-manager.ts` | Session 管理和清理函数 | 是（添加 userId 参数） | **是**：所有函数添加 userId，新增 `cleanupAllExpiredSessions()` |
| `packages/web/src/app/api/sessions/cleanup/route.ts` | 清理 API | **是（必须修复）** | **是**：添加 JWT 验证 |
| `packages/web/src/app/api/sessions/route.ts` | Session CRUD API | 是 | **是**：从 Cookie 读取 userId |
| `packages/web/src/app/api/sessions/[id]/route.ts` | Session 删除 API | 是 | **是**：验证 session 属于当前用户 |
| `packages/web/src/app/demo/[id]/edit/page.tsx` | 编辑页面（取消操作） | 是（改进错误处理） | 否（前端无需改动） |
| `packages/web/src/instrumentation.ts` | 定时任务（新建） | **是（推荐添加）** | **是**：使用全局清理函数 |
| `packages/web/src/lib/auth/jwt.ts` | JWT 管理 | 否（用户系统已实现） | 提供 `getAuthCookie()`, `verifyToken()` |
| `cleanup-sessions.ps1` | 手动清理脚本 | 否（保留作为备用） | 可选：添加 userId 参数支持 |

---

**报告生成时间**：2026-04-11  
**分析人**：Qwen Code AI Agent  
**文档版本**：v2.0（用户系统版）
