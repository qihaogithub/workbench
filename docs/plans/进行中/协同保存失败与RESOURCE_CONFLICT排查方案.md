# 协同保存失败与 WORKSPACE_RESOURCE_CONFLICT 排查方案

## 背景

用户报告创作端编辑器保存失败，浏览器控制台出现三类错误：

1. `[auto-checkpoint] failed: Error: 创建自动保存记录失败`（useVersionControl.ts:486）
2. `[canvas] 保存画布布局失败`（useCanvasWorkspace.ts:136）
3. `ClientWorkspaceFlushError: 协同草稿部分落盘失败: unknown: Workspace resource conflict`（client-workspace-flush.ts:49）
4. `[Exit] Failed to flush before exit: WorkspaceSyncStepError`（page.tsx:5076）

## 目标

定位 `WORKSPACE_RESOURCE_CONFLICT` 的真正冲突源头，修复所有导致保存失败的竞态条件。

## 范围

- author-site：`commitWorkspaceMutation`、canvas-layout route、useVersionControl、useCanvasWorkspace
- agent-service：`WorkspaceMutationAuthority`、`CollabRoomManager`、`workspace-file-persistence`

## 根因分析

### 错误链路

```
前端 hooks → API routes → workspace flush → authority mutation → assertExpected() → WORKSPACE_RESOURCE_CONFLICT
```

`WORKSPACE_RESOURCE_CONFLICT` 在 `workspace-mutation-authority.ts` 的 `assertExpected()` 中抛出：当 mutation 的 `expectedHash` 与文件当前 hash 不匹配时触发。

### 运行时证据（agent-service.jsonl）

**数据来源**：`data/editor-diagnostics/agent-service.jsonl`，工作区 `live-1783585261306-sza0dkpm7`，会话 `session-1784083950887-vaq0bf467`。

诊断日志中发现 15 条 `workspace.mutation_conflicted` 记录，呈现两种冲突模式：

#### 模式 A：`.canvas-layout.json` 双写竞态（7 条冲突）

collab room autosave 高频提交 `.canvas-layout.json`，author-site canvas-layout POST handler 的 TOCTOU 窗口被 collab 抢先提交。

**时序证据（成功提交 + 冲突交替出现）：**

| 时间 (UTC) | 行号 | 事件类型 | actor | baseRevision | revision | 说明 |
|---|---|---|---|---|---|---|
| 03:00:01.272 | L1600 | `mutation_committed` | collab | 1 | **21** | collab autosave 成功 |
| 03:00:08.123 | L1603 | `mutation_committed` | author-site | 0 | **22** | author-site 成功（首次写入） |
| 03:00:09.007 | L1605 | `mutation_conflicted` | author-site | **0** | 22 | ❌ author-site 再次提交，baseRevision=0 已过期 |
| 03:00:09.821 | L1607 | `mutation_conflicted` | author-site | **0** | 22 | ❌ 同上，820ms 内连续两次冲突 |
| 03:13:25.729 | L1639 | `mutation_committed` | collab | 22 | **29** | collab autosave 成功 |
| 03:13:30.027 | L1642 | `mutation_committed` | collab | 29 | **30** | collab autosave 成功 |
| 03:13:31.409 | L1646 | `mutation_committed` | collab | 30 | **31** | collab autosave 成功（高频，1.4s 间隔） |
| 03:13:31.559 | L1647 | `mutation_conflicted` | author-site | **0** | 31 | ❌ author-site 在 collab 提交后 150ms 提交，baseRevision=0 已过期 |
| 03:13:32.160 | L1651 | `mutation_committed` | collab | 31 | **32** | collab autosave 成功 |
| 03:13:32.258 | L1652 | `mutation_conflicted` | author-site | **0** | 32 | ❌ author-site 在 collab 提交后 98ms 提交 |
| 03:13:32.972 | L1655 | `mutation_committed` | author-site | 0 | **33** | author-site 终于成功（baseRevision=0 碰巧匹配） |
| 03:13:33.509 | L1657 | `mutation_conflicted` | author-site | **0** | 33 | ❌ 成功 537ms 后再次冲突 |
| 03:14:35.738 | L1661 | `mutation_committed` | collab | 33 | **34** | collab autosave 成功 |
| 03:14:35.836 | L1662 | `mutation_conflicted` | author-site | **0** | 34 | ❌ collab 提交后 98ms |
| 03:14:37.068 | L1672 | `mutation_committed` | collab | 34 | **37** | collab autosave 成功 |
| 03:14:37.154 | L1673 | `mutation_conflicted` | author-site | **0** | 37 | ❌ collab 提交后 86ms |

**关键观察：**
- 所有 author-site 冲突的 `baseRevision=0`，说明 canvas-layout POST handler 每次都在文件不存在时计算 `previousContent=null`，生成的 `expectedHash` 是空文件 hash，与 authority 当前状态永远不匹配。
- collab autosave 以 ~1s 间隔高频提交，author-site POST handler 的 TOCTOU 窗口（读取文件 → 提交 mutation）被 collab 抢先的概率很高。
- author-site 偶尔能以 `baseRevision=0` 成功提交（如 L1603、L1655），说明有时 author-site 的 mutation 恰好排在 collab 两次提交之间。

#### 模式 B：collab room baseline 过期后无法自愈（8 条冲突）

`demos/page_x7ut/index.tsx` 上 AI writeFile 成功后，collab room 持续以过期 baseline 提交并冲突 15+ 分钟。

**触发事件：**

| 时间 (UTC) | 行号 | 事件类型 | actor | baseRevision | revision | resourcePaths |
|---|---|---|---|---|---|---|
| 03:13:22.707 | L1634 | `mutation_committed` | author-site | 0 | **28** | `demos/page_x7ut/` (4 files) |

AI 通过 author-site 写入 `page_x7ut` 的 4 个文件，revision 推进到 28。此时 collab room 的 baselineRevision=28。

**后续冲突时间线（baseRevision 始终停留在 28）：**

| 时间 (UTC) | 行号 | actor | baseRevision | 当前 authority revision | 冲突持续时间 |
|---|---|---|---|---|---|
| 03:13:24.998 | L1636 | collab | 28 | 28 | 0s（首次冲突） |
| 03:19:44.632 | L1675 | collab | 28 | 37 | 6min 20s |
| 03:20:30.770 | L1683 | collab | 28 | 39 | 7min 8s |
| 03:20:42.693 | L1686 | — | — | **40**（author-site 成功提交 page_x7ut） | — |
| 03:20:52.043 | L1695 | — | — | **43**（author-site canvas-layout 成功） | — |
| 03:20:53.122 | L1697 | collab | 28 | 43 | 7min 30s |
| 03:20:58.234 | L1699 | collab | 28 | 43 | 7min 35s |
| 03:25:56.461 | L1701 | collab | 28 | 43 | 12min 33s |
| 03:26:56.459 | L1703 | collab | 28 | 43 | 13min 33s |
| 03:27:04.403 | L1705 | collab | 28 | 43 | 13min 41s |

**关键观察：**
- 首次冲突（L1636）发生在 AI writeFile 成功后仅 2.3s，baseRevision=28 与 authority revision=28 相同，说明 collab room 的 expectedHash 已经与磁盘不一致。
- 从 03:13:24 到 03:27:04（13min 40s），`baseRevision` 始终停留在 28，而 authority 已推进到 43。证明 `onMutationCommitted` 回调（`collab-room-manager.ts:96-148`）未能成功更新 room 的 `baselineHash` 和 `baselineRevision`。
- 中间 03:20:42（L1686）author-site 又成功提交了 `page_x7ut` 的 4 个文件（revision=40），但 collab room 仍然以 baseRevision=28 提交——进一步证明 listener 回调被静默吞掉后 baseline 永远不更新。
- 冲突间隔约 60s（03:19→03:20→03:25→03:26→03:27），与 `CONFLICT_BACKOFF_BASE_MS = 60_000`（`collab-room-manager.ts:30`）的退避机制吻合。

### 结构性根因：baseline 跟踪不可靠

两种冲突模式的共同根因不是「双写」本身，而是 **collab room 的 baseline 跟踪机制不可靠**——即使发生冲突，如果 baseline 能正确更新，self-heal 机制本应在一两次重试后恢复，而非陷入 13+ 分钟的循环冲突。

Authority receipt（`WorkspaceMutationReceipt`，`shared/contracts.ts:115-131`）已包含 `resources[].afterHash`（per-resource hash）和 `revision`（全局），但 listener 回调和 self-heal 路径在三个关键位置没有利用 receipt 数据更新 baseline 元数据：

| 缺陷位置 | 文件:行号 | 影响 |
|---|---|---|
| listener `saving` 分支只标记 `pendingExternalReload`，**不更新 baselineHash/baselineRevision** | `collab-room-manager.ts:113-127` | flush 进行中收到外部 mutation 时，baseline 元数据永远停留在旧值 |
| self-heal guard 在新编辑到达时**直接 return，不更新 baseline** | `collab-room-manager.ts:609-616` | `await getAuthorityState()` 期间新编辑到达 → 跳过 baseline 更新 → 永久循环冲突 |
| deferred reload 不传 `revision` 参数 | `collab-room-manager.ts:675` | 即使内容 reload 成功，`baselineRevision` 仍为旧值 |

**代码证据**：

1. listener `saving` 分支（`collab-room-manager.ts:113-127`）：
```typescript
if (room.saving) {
  room.pendingExternalReload = true;  // ← 只标记延迟 reload
  // ← 没有更新 room.baselineHash / room.baselineRevision
  continue;
}
```

2. self-heal fatal guard（`collab-room-manager.ts:609-616`）：
```typescript
const currentText = room.text.toString();
if (currentText !== roomContent) {
  logger.info(..., "New edits arrived during conflict resolution, skipping self-heal");
  return;  // ← baseline 永远不更新
}
```

3. deferred reload（`collab-room-manager.ts:670-675`）：
```typescript
const latestState = this.persistence.readResourceState(...);
this.reloadRoomFromFileState(room, latestState);
// ← 缺少第三个参数 revision，baselineRevision 不更新
```

### 触发条件

#### 触发 A：canvas-layout 双写 TOCTOU 竞态（对应模式 A）

**位置**：`packages/author-site/src/app/api/sessions/[sessionId]/canvas-layout/route.ts` 第 605-617 行

canvas-layout POST handler 在第 605-608 行读取文件内容（`previousContent`），在第 609-617 行调用 `commitWorkspaceMutation`。在读取和提交之间，collab room 的 autosave 可能已经提交了新的 `.canvas-layout.json` 变更，导致 expectedHash 过期。这是触发条件，如果 baseline 跟踪可靠，冲突可通过 self-heal 恢复。

#### 触发 B：外部 mutation 后 listener 更新失败（对应模式 B）

**位置**：`packages/agent-service/src/workspace/workspace-mutation-authority.ts` 第 574-577 行

Authority listener 的 `try { ... } catch {}` 静默吞掉异常。加上上述三个 baseline 更新缺陷，导致 listener 回调即使执行了也无法正确更新 baseline——形成 15+ 分钟的循环冲突。

## 修复方案（架构根治）

> **设计原则**：止血方案（重试循环、加日志、传参数）只处理冲突发生后的恢复，无法消除结构性原因。根治方案从 **bulletproof baseline tracking** 入手，确保 baseline 元数据在任何情况下都正确，使 self-heal 机制能真正自愈。

### 第一层：Bulletproof Baseline Tracking（P0，根治两种模式）

**文件**：`packages/agent-service/src/collab/collab-room-manager.ts`

**核心洞察**：Authority receipt（`WorkspaceMutationReceipt`，`shared/contracts.ts:115-131`）已包含 `resources[].afterHash`（per-resource hash，由 `workspace-mutation-authority.ts:779` 的 `hashWorkspaceContent(operation.content)` 计算）和 `revision`（全局），但 listener 回调仍在做多余的磁盘读取，且三个关键位置没有用 receipt 数据更新 baseline 元数据。

#### 改动 1：Listener 回调用 receipt 直接更新 baseline（L96-148）

当前 listener 回调在所有分支前做 `readResourceState` 磁盘读取（L105-109）来获取 hash，但 receipt 已有 `afterHash`。更严重的是 `saving` 分支（L113-127）只标记 `pendingExternalReload` 而不更新 baselineHash/baselineRevision。

修复策略：
1. 从 `receipt.resources[i].afterHash` 直接取 hash，不做磁盘读取
2. 所有分支**先更新 baseline 元数据**（`baselineHash` + `baselineRevision`），再尝试内容 reload
3. `saving` 分支：元数据先行更新，内容 reload 仍 deferred（best-effort）
4. `reloadRoomFromFileState` 失败时 catch，baseline 元数据已正确，下次 flush 的 `expectedHash` 不会过期

```typescript
this.persistence.onMutationCommitted(({ receipt }) => {
  for (const resource of receipt.resources) {
    const room = /* find matching room */;
    if (!room) continue;
    const newHash = resource.afterHash ?? "";
    const newRevision = receipt.revision;

    // ★ 元数据先行：无论后续 reload 是否成功，baseline 一定正确
    room.baselineHash = newHash;
    room.baselineRevision = newRevision;

    if (room.saving) {
      room.pendingExternalReload = true;
      logger.warn({ ... }, "Deferred content reload; baseline already updated from receipt");
      continue;  // 元数据已更新，内容 reload 等 flush 完成后执行
    }

    if (room.dirty) {
      if (room.saveTimer) { clearTimeout(room.saveTimer); room.saveTimer = null; }
    }

    // Best-effort 内容 reload：失败不影响 baseline 正确性
    try {
      const current = this.persistence.readResourceState(
        room.workspacePath, room.descriptor.resourcePath, room.descriptor.kind,
      );
      this.reloadRoomFromFileState(room, current, newRevision);
    } catch (reloadError) {
      logger.warn({ roomKey: room.key, error: reloadError },
        "Content reload failed; baseline metadata is correct, next flush will self-heal");
    }
  }
});
```

**根治模式 B 的原理**：即使 `doc.transact()` 失败（Y.Doc 状态损坏），baseline 元数据已从 receipt 更新。下次 `flushRoom` 的 `expectedHash` 是正确的 `newHash`，不会进入无限冲突循环。

#### 改动 2：Self-heal guard 不再跳过 baseline 更新（L609-616）

当前 `await getAuthorityState()` 期间新编辑到达 → `currentText !== roomContent` → 直接 return → baseline 永远不更新。这是模式 B 循环冲突的直接原因。

```typescript
const currentText = room.text.toString();
if (currentText !== roomContent) {
  // ★ 不再跳过 baseline 更新：元数据必须同步
  room.baselineHash = currentState.hash;
  room.baselineRevision = authorityState.revision;
  logger.info({ roomKey: room.key, newBaselineHash: currentState.hash },
    "New edits during conflict: baseline updated, room stays dirty");
  return;  // 跳过内容 reload（保护客户端编辑），但 baseline 已正确
}
```

**根治模式 B 的原理**：原来每次 self-heal 都因 guard 跳过 → baseline 永远停留在旧值 → 每次 flush 都冲突。现在 guard 路径也更新 baseline → 下次 flush 的 `expectedHash` 正确 → 冲突可恢复。

#### 改动 3：Deferred reload 传入 revision（L670-675）

```typescript
// 改为使用已在 listener 中更新的 baselineRevision
this.reloadRoomFromFileState(room, latestState, room.baselineRevision);
```

#### 改动 4：Authority listener try-catch 增加日志

**文件**：`packages/agent-service/src/workspace/workspace-mutation-authority.ts` L574-577

```typescript
try { listener(event); } catch (listenerError) {
  logger.warn(
    { workspaceId: request.workspaceId, revision: receipt.revision, error: listenerError },
    "onMutationCommitted listener failed — collab room baseline may be stale",
  );
}
```

> 在 bulletproof baseline tracking 之后此改动降级为观测用途——listener 内部已有 try-catch 保护 `reloadRoomFromFileState`，外层 catch 只会捕获 listener 本身的致命错误。

### 第二层：Canvas-Layout 双写消除（P0，消除模式 A 的触发条件）

**文件**：`packages/author-site/src/app/api/sessions/[sessionId]/canvas-layout/route.ts`

在 `commitWorkspaceMutation` 之前，调用已有的 collab flush 端点（`/api/collab/.../flush`，`collab-room-manager.ts:223-233`），将 collab room 的 draft 先落盘：

```typescript
if (access.workspacePath && access.workspaceId && access.projectId && isLiveWorkspace(access.workspaceId)) {
  // ★ 先 flush collab room，消除双写竞态
  const agentServiceUrl = getServerAgentServiceUrl();
  await fetch(
    `${agentServiceUrl}/api/collab/projects/${access.projectId}/workspaces/${access.workspaceId}/flush` +
    `?sessionId=${params.sessionId}&resourcePath=.canvas-layout.json&kind=canvas-layout`,
    { method: "POST" },
  ).catch(() => { /* collab room may not exist, ignore */ });

  // 现在读文件得到的是 collab flush 后的 committed 内容
  const layoutPath = getCanvasLayoutPath(access.workspacePath);
  const previousContent = fs.existsSync(layoutPath)
    ? fs.readFileSync(layoutPath, "utf-8")
    : null;
  receipt = await commitWorkspaceMutation(createTextWorkspaceMutation({
    ..., previousContent, ...
  }));
}
```

**可行性**：
- collab flush 端点已存在（`collab.ts:96-115`），支持按资源 flush
- flush 后 room.dirty=false + baselineHash 更新（改动 1 保证）
- POST 读到的是 committed 文件内容，expectedHash 准确
- POST 成功后 listener（改动 1）自动更新 collab room 的 baseline
- 如果 collab room 不存在，fetch 失败被 catch 忽略，降级为原有行为

### 被否决的替代方案

| 方案 | 否决原因 |
|------|----------|
| POST handler 增加重试循环（原止血方案） | 治标不治本：重试可恢复，但 baseline 永久过期问题仍在，13 分钟循环冲突无法通过重试解决 |
| 从 collab 系统中移除 canvas-layout | 过度破坏：直接移除会丢失跨 tab 实时同步能力，且需要前端大量改动 |
| Authority listener 改为 async await | 架构变更大：将 fire-and-forget 改为同步等待会改变 Authority 的事务语义，增加 mutation 延迟 |
| Per-resource 串行队列 | 过度工程：multi-file mutation 需要跨队列原子性，引入分布式锁复杂度 |
| 前端跳过 collab 直推 WebSocket | 需要新增 WebSocket 消息类型和前端改动，改动面过大 |

## 改动量估算

| 文件 | 改动类型 | 行数 |
|------|----------|------|
| `collab-room-manager.ts` | 重写 listener 回调 + self-heal guard + deferred reload | ~30 行 |
| `canvas-layout/route.ts` | POST 前增加 flush 调用 | ~8 行 |
| `workspace-mutation-authority.ts` | listener catch 加日志 | ~5 行 |
| **合计** | **3 个文件** | **~43 行** |

## 实施顺序

> 改动 1~4 全部在 `agent-service` 内，可一起实施和验证。改动 5 在 `author-site`，独立实施。建议按以下顺序逐步推进，每步后运行验证。

| 步骤 | 改动 | 依赖 | 说明 |
|------|------|------|------|
| 1 | 改动 4：Authority listener try-catch 增加日志 | 无 | 最安全的改动，纯观测，可先合入提供诊断能力 |
| 2 | 改动 1：Listener 回调用 receipt 直接更新 baseline | 无 | 核心修复。改动 3 依赖此改动提供的 `baselineRevision` 正确性 |
| 3 | 改动 2：Self-heal guard 不再跳过 baseline 更新 | 无 | 独立代码路径，可与步骤 2 同时实施 |
| 4 | 改动 3：Deferred reload 传入 revision | 改动 1 | 依赖改动 1 确保 listener 路径已更新 `baselineRevision` |
| 5 | 运行 `pnpm check:agent` 验证 | 步骤 1-4 | 类型检查 + lint 通过 |
| 6 | 改动 5：Canvas-layout POST 前先 flush collab room | 改动 1 | 依赖改动 1 保证 flush 后 listener 正确更新 baseline |
| 7 | 运行 `pnpm check:author` 验证 | 步骤 6 | 类型检查 + lint 通过 |
| 8 | 运行时验证 + 诊断日志观察 | 全部 | 手动触发场景 + 检查 `mutation_conflicted` 事件 |

### 改动间交互检查

1. **改动 1 + `flushRoom` L580-583 内容匹配快速路径**：listener 已通过 receipt 更新 `baselineHash`。如果 `flushRoom` 的内容匹配快速路径（`currentState.content === roomContent`）触发，它会将 `baselineHash` 设为 `currentState.hash`——与 receipt 的 `afterHash` 相同（因为 committed 文件内容一致），无冲突。
2. **改动 1 + `flushRoom` L645-658 成功提交路径**：listener 先 eager 更新 baseline，然后 `flushRoom` 提交成功后再次用 `committed.state.hash` 和 `committed.receipt.revision` 覆盖。两次更新方向一致（都指向最新 committed 状态），无冲突。
3. **改动 1 + 改动 3**：deferred reload（L675）读取最新磁盘内容并调用 `reloadRoomFromFileState`。改动 1 保证 listener 路径已更新 `baselineRevision`；改动 3 传入 `room.baselineRevision` 确保 `reloadRoomFromFileState` 不会因 `revision` undefined 而跳过更新。
4. **改动 5 + 改动 1**：canvas-layout POST 前先 flush collab room → flush 成功触发 Authority listener → 改动 1 保证 listener 正确更新 baseline → POST 读到 committed 文件内容 → expectedHash 准确。即使 flush 和 POST 之间仍有残余竞态（collab autosave 在 flush 后再次触发），改动 1 的 baseline 自愈机制可恢复。

## 任务清单

### 改动 1：Listener 回调用 receipt 直接更新 baseline

**文件**：`packages/agent-service/src/collab/collab-room-manager.ts` L96-148

- [ ] 1.1 在 `for` 循环内、`if (!room) continue` 之后，从 `receipt` 提取 `newHash`（`resource.afterHash ?? ""`）和 `newRevision`（`receipt.revision`）
- [ ] 1.2 在 `saving` / `dirty` 分支之前，先执行 `room.baselineHash = newHash; room.baselineRevision = newRevision;`
- [ ] 1.3 `saving` 分支：保留 `pendingExternalReload = true` + `continue`，但 baseline 已在 1.2 更新
- [ ] 1.4 `dirty` 分支：保留 `clearTimeout` + 日志，逻辑不变
- [ ] 1.5 将 `readResourceState` + `reloadRoomFromFileState` 包裹在 try-catch 中（best-effort，失败只打 warn 日志）
- [ ] 1.6 移除 L105-109 的前置 `readResourceState` 磁盘读取，改为在 try 块内按需读取
- [ ] 1.7 确认 `delete` 操作（`resource.afterHash` 为 null）：`room` 查找会 miss（collab room 不跟踪已删除资源），不影响

### 改动 2：Self-heal guard 不再跳过 baseline 更新

**文件**：`packages/agent-service/src/collab/collab-room-manager.ts` L609-616

- [ ] 2.1 在 `if (currentText !== roomContent)` 的 return 之前，添加 `room.baselineHash = currentState.hash; room.baselineRevision = authorityState.revision;`
- [ ] 2.2 更新日志消息，包含 `newBaselineHash` 和 `newBaselineRevision`
- [ ] 2.3 保留 `return`（跳过内容 reload，保护客户端未保存的编辑）
- [ ] 2.4 注意：`currentState`（L573-577 读取）和 `authorityState`（L603-605 读取）已在 guard 之前获取，无需额外读取

### 改动 3：Deferred reload 传入 revision

**文件**：`packages/agent-service/src/collab/collab-room-manager.ts` L675

- [ ] 3.1 将 `this.reloadRoomFromFileState(room, latestState)` 改为 `this.reloadRoomFromFileState(room, latestState, room.baselineRevision)`
- [ ] 3.2 前置条件：改动 1 已确保 `room.baselineRevision` 在 listener 中被正确更新

### 改动 4：Authority listener try-catch 增加日志

**文件**：`packages/agent-service/src/workspace/workspace-mutation-authority.ts` L574-577

- [ ] 4.1 将空 catch 改为 `catch (listenerError)` + `logger.warn(...)`
- [ ] 4.2 日志字段包含 `workspaceId`、`revision`、`error`
- [ ] 4.3 确认 `logger` 已在文件顶部导入（当前使用 `import { logger } from "..."`）

### 改动 5：Canvas-layout POST 前先 flush collab room

**文件**：`packages/author-site/src/app/api/sessions/[sessionId]/canvas-layout/route.ts` L604-617

- [ ] 5.1 在 `isLiveWorkspace` 判断内、`readResourceState` 之前，增加 flush HTTP 调用
- [ ] 5.2 flush URL：`${agentServiceUrl}/api/collab/projects/${projectId}/workspaces/${workspaceId}/flush?sessionId=${sessionId}&resourcePath=.canvas-layout.json&kind=canvas-layout`
- [ ] 5.3 确认 `getServerAgentServiceUrl` 已在文件中导入或需要新增导入
- [ ] 5.4 `.catch(() => {})` 忽略 flush 失败（collab room 可能不存在）
- [ ] 5.5 flush 调用必须在 `readResourceState`（L605-608）**之前**，确保读到的是 flush 后的 committed 内容

### 验证

- [ ] `pnpm check:agent` 通过（类型检查 + lint）
- [ ] `pnpm check:author` 通过（类型检查 + lint）
- [ ] 运行时验证：编辑器中触发 AI 写入 + 画布拖拽 + 手动保存，浏览器控制台无 `WORKSPACE_RESOURCE_CONFLICT`
- [ ] 诊断日志：`data/editor-diagnostics/agent-service.jsonl` 中 `mutation_conflicted` 事件消失
- [ ] 日志验证：listener 日志中出现 `"baseline already updated from receipt"` 或 `"baseline updated, room stays dirty"` 字样

## 验证方式

1. 类型检查：`pnpm check:author` + `pnpm check:agent`
2. 运行时验证：修复后在编辑器中触发 AI 写入 + 画布拖拽 + 手动保存，观察浏览器控制台是否还有 WORKSPACE_RESOURCE_CONFLICT 错误
3. 诊断日志：检查 `data/editor-diagnostics/agent-service.jsonl` 中 `mutation_conflicted` 事件是否消失
4. 日志验证：确认 listener 日志中 baseline 更新来自 receipt 而非磁盘读取

## 风险与待确认事项

1. `resource.afterHash` 为 null（delete 操作）：collab room 不跟踪已删除资源，listener 的 room 查找会 miss，不影响
2. canvas-layout flush HTTP 调用增加延迟：flush 端点在 room 不存在时立即返回 `{flushed: false}`；存在时 flush 约 5-20ms
3. listener 中 eager baseline 更新与 flushRoom 的交互：listener 先更新 baseline 再 reload，flushRoom 的 self-heal 路径检测到 hash 已匹配则跳过 reload
4. `reloadRoomFromFileState` 中 `room.doc.transact()` 失败的具体原因仍需诊断，但改动 1 的 catch 确保 baseline 不受影响

## 相关文件

| 文件 | 职责 |
| --- | --- |
| `packages/agent-service/src/collab/collab-room-manager.ts` | collab room 管理、flush、baseline 更新（改动 1/2/3） |
| `packages/agent-service/src/workspace/workspace-mutation-authority.ts` | authority mutate/serial/assertExpected（改动 4） |
| `packages/author-site/src/app/api/sessions/[sessionId]/canvas-layout/route.ts` | canvas-layout 保存 API（改动 5） |
| `packages/agent-service/src/collab/workspace-file-persistence.ts` | readResourceState/commitResource |
| `packages/agent-service/src/routes/collab.ts` | collab flush 端点（改动 5 复用） |
| `packages/shared/src/contracts.ts` | WorkspaceMutationReceipt 类型定义（afterHash/revision） |
| `packages/author-site/src/lib/workspace-authority-client.ts` | commitWorkspaceMutation 调用链 |
| `data/editor-diagnostics/agent-service.jsonl` | 运行时诊断证据 |

## 进度记录

- 2026-07-15：完成初版根因分析，确认两种冲突模式（canvas-layout 双写竞态 + collab room baseline 过期循环冲突），提出 4 个修复方案。
- 2026-07-15：代码核查修正。确认根因 2 的 try-catch 位于 Authority listener wrapper（`workspace-mutation-authority.ts:576`）而非 `collab-room-manager.ts` 的回调本身；发现 deferred reload 不传 revision 参数的额外 bug；删除修复 1（`commitWorkspaceMutation` 层面重试无效，request 中 expectedHash 是旧值）；将修复 3 拆为 3a（Authority listener 日志）和 3b（deferred reload revision 参数）；确认 `flushRoom` 已有完整的 hash 不匹配自愈逻辑，修复 4 降级为 P2 观测日志。
- 2026-07-15：历史文档比对。`创作端编辑页协同异常问题调研.md`（2026-07-13）的 `agent-service.jsonl` 证据已出现 `baseRevision=0` 被 Authority 拒绝的模式，当时归因为 agent-service 未启动，实际是同种 TOCTOU 问题的早期信号。`创作端编辑与协同问题沉淀.md` 的 P1（EXTERNAL_DRIFT 阻断 AI 操作）是同类 hash 不匹配问题的另一表现形式，已通过 pi-tools auto-retry 修复，但只覆盖了「磁盘文件被外部修改」场景，未覆盖「并发写入导致 expectedHash 过期」场景。
- 2026-07-15：方案升级为架构根治。识别出止血方案（重试循环、加日志、传参数）无法根治的结构性原因——baseline 跟踪不可靠。重新定位为两层根治方案：第一层 bulletproof baseline tracking（用 receipt 的 afterHash/revision 替代磁盘读取，修复 listener saving 分支、self-heal guard、deferred reload 三个缺陷点）；第二层 canvas-layout 双写消除（POST 前先 flush collab room）。总改动 ~43 行，3 个文件，不引入新架构概念。
- 2026-07-15：可实施性审查。逐项对照代码验证所有行号引用和代码片段准确性：listener 回调 L96-148、self-heal guard L609-616、deferred reload L675、Authority try-catch L574-577、canvas-layout POST L605-617 均与代码一致。修正触发 A 行号引用（598→605-617）。修复"相关文件"表格格式损坏。增加实施顺序建议、改动间依赖关系和交互检查。任务清单拆分为可逐项检查的子步骤。
