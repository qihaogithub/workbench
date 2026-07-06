# 后端 SSE Drain 机制 - 技术文档

> 版本：v1.0
> 创建日期：2026-05-27
> 更新说明：新增 drain 机制设计文档

---

## 一、背景与问题

### 1.1 问题描述

在 AI 编辑完成后，workbench Server 通过 SSE 推送事件流。存在一个关键的时序竞争问题：

```
session.idle（AI 响应完成）
    │
    ▼ 触发 closeSSE()
    │
session.diff（文件变更）
    │
    ✗ 连接已关闭，事件丢失
```

**根本原因**：`session.idle` 事件触发后立即关闭 SSE 连接，但后续可能还有 `session.diff` 事件需要发送。这导致 finish 快照中的文件内容不完整。

### 1.2 影响范围

- 预览区不实时更新（缺少最新代码）
- 配置面板不实时更新（缺少最新 schema）
- 用户需要手动刷新才能看到 AI 编辑结果

---

## 二、Drain 机制设计

### 2.1 核心思路

在 `session.idle` 收到后，不立即关闭 SSE 连接，而是启动一个短暂的 **drain 窗口期**（默认 2 秒），等待可能的 `session.diff` 事件到达。

```
session.idle
    │
    ├─ idleReceived = true
    ├─ 取消 stream timeout
    │
    ▼
diffReceived === true?
    ├─ YES → 立即 resolveStream()
    └─ NO  → 启动 drain timer（2s）
              │
              ▼
         等待 session.diff
              │
              ├─ 收到 → clearTimeout → resolveStream()
              └─ 超时 → resolveStream()（空 diff）
```

### 2.2 状态字段

```typescript
class workbenchHttpBackend {
  private idleReceived = false; // session.idle 是否已收到
  private diffReceived = false; // session.diff 是否已收到
  private drainTimer: NodeJS.Timeout | null = null; // drain 定时器

  private static readonly DRAIN_TIMEOUT_MS = 2000; // drain 窗口期 2 秒
}
```

### 2.3 事件处理流程

#### session.idle 处理

```typescript
case "session.idle": {
  this.idleReceived = true;

  // 取消 stream timeout（防止在 drain 期间误触发）
  if (this.streamDone.timeout) {
    clearTimeout(this.streamDone.timeout);
  }

  // emit stream done 事件（通知上层 AI 响应完成）
  this.emit("stream_done", { done: true });

  if (this.diffReceived) {
    // diff 已收到，立即 resolve
    this.resolveStream();
  } else {
    // diff 未收到，启动 drain timer
    this.drainTimer = setTimeout(() => {
      this.drainTimer = null;
      this.resolveStream();
    }, workbenchHttpBackend.DRAIN_TIMEOUT_MS);
  }
  break;
}
```

#### session.diff 处理

```typescript
case "session.diff": {
  this.diffReceived = true;

  // 处理 diff，填充 this.files
  const diffs = event.properties?.diff || [];
  for (const diff of diffs) {
    if (diff.content !== undefined) {
      this.files.set(diff.path, diff.content);
    }
  }

  // 如果 idle 已收到，处理完 diff 后立即 resolve
  if (this.idleReceived) {
    if (this.drainTimer) {
      clearTimeout(this.drainTimer);
      this.drainTimer = null;
    }
    this.resolveStream();
  }
  break;
}
```

#### resolveStream() 统一关闭

```typescript
private resolveStream(): void {
  this.closeSSE();
  if (!this.streamDone.resolved) {
    this.streamDone.resolve();
    this.streamDone.resolved = true;
  }
  this.ready = false;
}
```

### 2.4 清理机制

在以下场景需要清理 drain timer：

```typescript
// connectSSE() - 建立新连接时重置状态
private connectSSE(): Promise<void> {
  this.idleReceived = false;
  this.diffReceived = false;
  if (this.drainTimer) {
    clearTimeout(this.drainTimer);
    this.drainTimer = null;
  }
  // ...
}

// destroy() / cancelPrompt() - 销毁时清理
destroy(): void {
  if (this.drainTimer) {
    clearTimeout(this.drainTimer);
    this.drainTimer = null;
  }
  // ...
}
```

---

## 三、测试覆盖

### 3.1 时序测试

| 测试场景                           | 预期结果                         |
| :--------------------------------- | :------------------------------- |
| `session.diff` 早于 `session.idle` | `getFiles()` 立即返回文件        |
| `session.idle` 早于 `session.diff` | drain 后 `getFiles()` 仍返回文件 |
| drain 超时未收到 diff              | resolve 空文件                   |
| stream timeout 配置（500ms）       | drain 期间不触发 stream timeout  |

### 3.2 关键测试用例

```typescript
test("should wait for diff during drain and still return files", async () => {
  const backend = createBackend();
  await initForStream(backend);

  mockStream(backend);
  const sendPromise = backend.sendMessage("test");

  // idle 先到达
  emitSessionIdle(backend);

  // diff 后到达（在 drain 窗口期内）
  emitSessionDiff(backend, [{ path: "index.tsx", content: "code" }]);

  const result = await sendPromise;
  expect(result.files.get("index.tsx")).toBe("code");
});

test("should resolve with empty files when drain times out", async () => {
  vi.useFakeTimers();
  const backend = createBackend();
  await initForStream(backend);

  mockStream(backend);
  const sendPromise = backend.sendMessage("test");

  emitSessionIdle(backend);

  // 快进超过 drain 窗口期
  vi.advanceTimersByTime(2000);

  const result = await sendPromise;
  expect(result.files.size).toBe(0);

  vi.useRealTimers();
});
```

---

## 四、效果与收益

### 4.1 解决的问题

| 问题                  | 解决方式                        |
| :-------------------- | :------------------------------ |
| `session.diff` 丢失   | drain 窗口期等待 diff 到达      |
| finish 快照不完整     | `getFiles()` 返回完整文件       |
| stream timeout 误触发 | idle 收到时取消 stream timeout  |
| 状态泄漏              | 连接建立/销毁时清理 drain timer |

### 4.2 性能影响

- **正常场景**（diff 早于 idle）：无额外延迟，立即 resolve
- **drain 场景**（idle 早于 diff）：最多等待 2 秒
- **超时场景**（drain 超时）：2 秒后 resolve 空文件

### 4.3 向后兼容

- 对旧版 workbench Server（不发送 `session.diff`）兼容：drain 超时后正常 resolve
- 对非流式请求无影响：drain 机制仅在 SSE 连接中生效

---

## 五、相关文件

| 文件                                                      | 说明              |
| :-------------------------------------------------------- | :---------------- |
| `packages/agent-service/src/backends/workbench-http.ts`    | drain 机制实现    |
| `packages/agent-service/tests/unit/workbench-http.test.ts` | 时序测试覆盖      |
| `packages/agent-service/src/core/backend-agent.ts`        | SSE-DIAG 日志清理 |

---

## 六、相关文档

- [AIChat 分层架构](../创作端/05-AI对话/技术/02_AIChat分层架构.md)
- [配置系统架构设计](../创作端/04-配置与预览/技术/01_架构设计.md)
- [实时预览机制](../创作端/04-配置与预览/技术/02_实时预览机制.md)
