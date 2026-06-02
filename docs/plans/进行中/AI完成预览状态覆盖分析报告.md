# AI 完成时预览状态覆盖：根因分析报告

> 更新时间：2026-06-02
> 分析范围：AI 流式链路完成阶段（`use-chat-stream.onFinish`）、前端的 Demo 快照应用（`applyDemoSnapshot`）、预览与配置面板更新逻辑
> 当前阶段：根因分析完成，待修复

---

## 1. 问题背景

在项目编辑页使用 AI 完成编辑后，用户观察到的异常行为：

- **偶尔预览区更新的内容与最终保存的内容不一致；保存后重新打开页面，内容和之前预览的不一样。**
- 推测：预览区展示的是某个中间版本，而保存触发的动作存了另一个版本。
- 无固定复现步骤，与 AI 回复的复杂度和完成瞬间的用户操作有关。

---

## 2. 扫描发现的关键问题

### 2.1 `snapshotVersion` 在单次 AI 完成时被连加多次

**涉及文件：**
- `packages/author-site/src/app/demo/[id]/edit/page.tsx:188-243` — `applyDemoSnapshot` 统一快照入口
- `packages/author-site/src/app/demo/[id]/edit/page.tsx:931-934` — `onSnapshotReady` 回调
- `packages/author-site/src/components/ai-elements/chat/hooks/use-chat-stream.ts:289-381` — `onFinish` 回调

**触发路径：**

一次 AI 完成，`onFinish` 中按顺序执行以下步骤，每一步都可能触发 `onCodeUpdate` / `onSchemaUpdate`：

```
① 清除待处理的实时文件批处理（processRealtimeFiles）
  → onCodeUpdate / onSchemaUpdate
  → applyDemoSnapshot → snapshotVersion +1

② extractCodeAndSchemaUpdates(finalFiles)
  → 再次 onCodeUpdate / onSchemaUpdate
  → applyDemoSnapshot → snapshotVersion +1 (第三次)

③ 如果 code/schema 没更新，走 HTTP fallback fetchSessionFiles
  → 又 onCodeUpdate / onSchemaUpdate
  → applyDemoSnapshot → snapshotVersion +1

④ onSnapshotReady() (edit/page.tsx 的 onSnapshotReady prop)
  → setSnapshotVersion(v => v + 1) (第四次)
```

**影响：**
- 单次 AI 完成 `snapshotVersion` 增加 2~4 次。
- `ConfigForm` 的 key 为 `${activeDemoId}-${snapshotVersion}`（`edit/page.tsx:1615`），每次 `snapshotVersion` 变化都会强制销毁重建 ConfigForm，**用户正在修改的配置值丢失**。
- `PreviewPanel` 的编译 effect（`PreviewPanel.tsx:263-348`）依赖 `snapshotVersion`，多余触发 1~3 次编译请求到 `/api/compile`，可能引发局部闪烁。

### 2.2 实时推的文件与 final 文件重复处理

**涉及文件：**
- `packages/author-site/src/components/ai-elements/chat/hooks/use-chat-stream.ts:320-375`

**触发路径：**

```typescript
// Step 1: 实时推的文件（中间态）
processRealtimeFiles();   // ← onCodeUpdate / onSchemaUpdate (中间版本)

// Step 2: final 文件（后端 draining 后的完整快照）
extractCodeAndSchemaUpdates(finalFiles);  // ← 再次 onCodeUpdate (最终版本)
```

当 `result.files` 存在且非空时：
- `processRealtimeFiles()` 处理实时文件（中间版本 A）
- `extractCodeAndSchemaUpdates()` 处理 final 文件（最终版本 B）
- 如果在两次 setState 之间用户点了保存 → 保存的是中间版本 A
- 预览区最终展示 B → **保存的值 ≠ 预览的值**

当 `result.files` 为空时（兜底复用 `realtimeFilesRef`）：
- `realtimeFilesRef` 未在 `processRealtimeFiles()` 后清空
- Step 1 和 Step 2 处理相同文件 → `onCodeUpdate` 被重复调用两次
- `setCode` 对应 functional updater 虽能避免重复写入，但 `snapshotVersion` 被额外 +1

### 2.3 `mergeConfigWithUserValues` 遍历范围缺失

**涉及文件：**
- `packages/author-site/src/lib/runtime-props.ts:116-152`

```typescript
// 只遍历新 schema 中带 default 的字段
for (const [key, newValue] of Object.entries(newDefaults)) {
  // ...
}
```

**问题：**
- **遗漏保留用户添加的字段**：如果字段在新 schema 中没有 `default`（AI 删了 default，或字段是用户自由输入），用户的填值被丢弃。
- **schema 删除字段时不会联动清空**：AI 删了某个配置字段，但用户之前填的值**不会被从 configData 中移除**，可能导致旧的配置仍在运行时生效。
- **`__order` 元数据硬编码**：`__order` 写死保留，没有按 schema 字段列表自动过滤。

**影响：**
- AI 改 schema 后，用户在配置面板中填的某些值可能丢失或残留，导致预览区表现与预期不符。

### 2.4 `applyDemoSnapshot` 闭包未包含 `activeDemoId`

**涉及文件：**
- `packages/author-site/src/app/demo/[id]/edit/page.tsx:188,199`

```typescript
const applyDemoSnapshot = useCallback(
  (params) => {
    if (newCode !== undefined) {
      setCode(...);
      if (sessionId && activeDemoId) {  // ← 闭包中的 activeDemoId
        invalidateCompileCache(sessionId, activeDemoId);
      }
    }
    // ...
  },
  [code, schema, sessionId],  // ← 缺少 activeDemoId
);
```

**问题：**
- `applyDemoSnapshot` 关闭了创建时的 `activeDemoId`。
- 如果用户在第 N 次 render 时切到页面 B，`activeDemoId` 变为 `"B"`，但 `applyDemoSnapshot` 尚未重建（deps 不含 `activeDemoId`），**invalidateCompileCache 清理的是页面 A 的缓存**。

### 2.5 `onFinish` 内部流水线存在多处异步断点

**涉及文件：**
- `packages/author-site/src/components/ai-elements/chat/hooks/use-chat-stream.ts:289-381`

```typescript
onFinish: async (result) => {
  setMessages(...);       // ① setState 排队
  setCurrentMessage(...); // ②
  setStreamContent(...);  // ③
  setIsStreaming(false);  // ④

  await persistMessages(sessionId, updatedMessages);      // ← 异步断点
  await updateSessionTitle(sessionId, userMessage, ...);   // ← 异步断点

  processRealtimeFiles();  // ← ⑤ setState 排队
  extractCodeAndSchemaUpdates(...); // ← ⑥ setState 排队

  const filesData = await fetchSessionFiles(...);          // ← 异步断点
  onCodeUpdate?.(code);  // ← ⑦ setState 排队

  onSnapshotReady?.();   // ← ⑧ setState 排队
},
```

- 跨 2 个 `await`，共 8 处 setState。
- 每个 `await` 后 React 18 自动批处理边界不明确，用户在 await 期间点击保存可能读取到旧的 state 闭包。
- 如果 `persistMessages` 或 `updateSessionTitle` 的 HTTP 请求较慢（网络波动），用户在此期间点保存，`code` 和 `schema` 仍是尚未更新到最终版本的 React state。

---

## 3. 根因总结

| 根因 | 影响 | 优先度 |
|---|---|---|
| **A.** `onFinish` 实时文件与 final 文件双重处理，导致 `onCodeUpdate`/`onSchemaUpdate` 重复触发及中间状态被保存 | 保存的内容与预览不一致 | P0 |
| **B.** `onSnapshotReady` 额外 +1，加上 `applyDemoSnapshot` 自带的 +1，以及重复调 `onCodeUpdate`/`onSchemaUpdate` 触发的额外 +1，总共连加 2~4 次 | ConfigForm 重建、用户配置丢失、预览闪烁 | P0 |
| **C.** `mergeConfigWithUserValues` 新 schema 遍历范围缺失，不保留非 default 的用户填值 | AI 改 schema 后用户配置丢失 | P1 |
| **D.** `applyDemoSnapshot` deps 缺失 `activeDemoId` | 切页面时 AI 推文件用了旧 demoId 清理缓存 | P2 |

---

## 4. 建议修复方向

### P0：合并 `onFinish` 中的文件处理逻辑并消除冗余触发

- `processRealtimeFiles()` 与 `extractCodeAndSchemaUpdates()` 之间引入"已处理标记"，避免同一文件被处理两次。
- 取消 `applyDemoSnapshot` 内部自动 +1 `snapshotVersion`，改为**由调用方统一 +1**（即只在 `onSnapshotReady` 中 +1）。
- `onFinish` 中完成所有 setState 后，只在最后调用一次 `onSnapshotReady`。

### P1：`mergeConfigWithUserValues` 补齐遍历范围

- 在遍历 `newDefaults` 之后，额外将 `currentConfig` 中存在但 `newDefaults` 中没有的值也保留到结果中。
- 注意：如果 schema 显式删除了某字段（oldSchema 中有但 newSchema 中没有），这类字段应**不保留**。

### P2：`applyDemoSnapshot` deps 补上 `activeDemoId`

- 在 `applyDemoSnapshot` 的 `useCallback` 的 deps 中加入 `activeDemoId`，或改用 `activeDemoIdRef`。

---

## 5. 涉及文件索引

| 文件路径 | 作用 |
|---|---|
| `packages/author-site/src/app/demo/[id]/edit/page.tsx` | 编辑页主组件，`applyDemoSnapshot` 定义、`onSnapshotReady` 回调 |
| `packages/author-site/src/components/ai-elements/chat/hooks/use-chat-stream.ts` | SS E 流式链路，`onFinish` 文件处理流水线 |
| `packages/author-site/src/components/ai-elements/chat/utils/chat-file-utils.ts` | `processFileChanges` / `extractCodeAndSchemaUpdates` |
| `packages/author-site/src/components/ai-elements/chat/services/message-service.ts` | `fetchSessionFiles` HTTP fallback |
| `packages/author-site/src/lib/runtime-props.ts` | `mergeConfigWithUserValues` 配置合并逻辑 |
| `packages/shared/src/demo/PreviewPanel.tsx` | 预览编译 effect，依赖 `snapshotVersion` |
