import { WorkspaceAutosaveScheduler } from "../workspace-autosave-scheduler";
import type {
  DirtyResource,
  MutationResult,
} from "../workspace-autosave-scheduler";

function makeResource(overrides: Partial<DirtyResource> = {}): DirtyResource {
  return {
    path: overrides.path ?? "src/index.ts",
    content: overrides.content ?? "console.log('hello')",
    hash: overrides.hash ?? "abc123",
    kind: overrides.kind ?? "text",
  };
}

describe("WorkspaceAutosaveScheduler", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("应在 debounce 到期后调用 commitFn", async () => {
    const commitFn = jest.fn<Promise<MutationResult>, [DirtyResource[]]>(
      async () => ({ revision: 1, rootHash: "h1" }),
    );
    const onCommitted = jest.fn();
    const onError = jest.fn();

    const scheduler = new WorkspaceAutosaveScheduler({
      debounceMs: 800,
      maxWaitMs: 3000,
      commitFn,
      onCommitted,
      onError,
    });

    scheduler.markDirty(makeResource());
    expect(commitFn).not.toHaveBeenCalled();

    jest.advanceTimersByTime(799);
    await Promise.resolve();
    expect(commitFn).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    await Promise.resolve();
    // commitFn 被调用
    expect(commitFn).toHaveBeenCalledTimes(1);
    expect(commitFn).toHaveBeenCalledWith([makeResource()]);

    scheduler.dispose();
  });

  it("应在 debounce 期间持续重置计时器", async () => {
    const commitFn = jest.fn<Promise<MutationResult>, [DirtyResource[]]>(
      async () => ({ revision: 1, rootHash: "h1" }),
    );
    const onCommitted = jest.fn();

    const scheduler = new WorkspaceAutosaveScheduler({
      debounceMs: 800,
      maxWaitMs: 5000,
      commitFn,
      onCommitted,
      onError: jest.fn(),
    });

    scheduler.markDirty(makeResource({ path: "a.ts" }));
    jest.advanceTimersByTime(500);
    scheduler.markDirty(makeResource({ path: "b.ts" }));
    jest.advanceTimersByTime(500);
    // 总计 1000ms 但 debounce 被重置，第二次 markDirty 后才 500ms
    await Promise.resolve();
    expect(commitFn).not.toHaveBeenCalled();

    jest.advanceTimersByTime(300);
    await Promise.resolve();
    expect(commitFn).toHaveBeenCalledTimes(1);

    scheduler.dispose();
  });

  it("应在 max-wait 到期时强制提交（即使 debounce 未到期）", async () => {
    const commitFn = jest.fn<Promise<MutationResult>, [DirtyResource[]]>(
      async () => ({ revision: 1, rootHash: "h1" }),
    );

    const scheduler = new WorkspaceAutosaveScheduler({
      debounceMs: 800,
      maxWaitMs: 3000,
      commitFn,
      onCommitted: jest.fn(),
      onError: jest.fn(),
    });

    // 持续每 600ms markDirty，debounce 永远不到期
    scheduler.markDirty(makeResource({ path: "a.ts" }));
    jest.advanceTimersByTime(600);
    scheduler.markDirty(makeResource({ path: "b.ts" }));
    jest.advanceTimersByTime(600);
    scheduler.markDirty(makeResource({ path: "c.ts" }));
    jest.advanceTimersByTime(600);
    scheduler.markDirty(makeResource({ path: "d.ts" }));
    jest.advanceTimersByTime(600);
    // 总计 2400ms，debounce 被不断重置
    await Promise.resolve();
    expect(commitFn).not.toHaveBeenCalled();

    jest.advanceTimersByTime(600);
    await Promise.resolve();
    // 总计 3000ms，max-wait 到期
    expect(commitFn).toHaveBeenCalledTimes(1);

    scheduler.dispose();
  });

  it("应合并同一路径的多次 markDirty", async () => {
    const commitFn = jest.fn<Promise<MutationResult>, [DirtyResource[]]>(
      async () => ({ revision: 1, rootHash: "h1" }),
    );

    const scheduler = new WorkspaceAutosaveScheduler({
      commitFn,
      onCommitted: jest.fn(),
      onError: jest.fn(),
    });

    scheduler.markDirty(makeResource({ path: "a.ts", content: "v1" }));
    scheduler.markDirty(makeResource({ path: "a.ts", content: "v2" }));
    scheduler.markDirty(makeResource({ path: "a.ts", content: "v3" }));

    jest.advanceTimersByTime(800);
    await Promise.resolve();

    expect(commitFn).toHaveBeenCalledTimes(1);
    const resources = commitFn.mock.calls[0][0];
    expect(resources).toHaveLength(1);
    expect(resources[0].content).toBe("v3");

    scheduler.dispose();
  });

  it("应保证单 in-flight barrier（并发期间新 dirty 进入下一批）", async () => {
    let resolveCommit: ((value: MutationResult) => void) | null = null;
    const commitFn = jest.fn<Promise<MutationResult>, [DirtyResource[]]>(
      () =>
        new Promise<MutationResult>((resolve) => {
          resolveCommit = resolve;
        }),
    );
    const onCommitted = jest.fn();

    const scheduler = new WorkspaceAutosaveScheduler({
      commitFn,
      onCommitted,
      onError: jest.fn(),
    });

    scheduler.markDirty(makeResource({ path: "a.ts" }));
    jest.advanceTimersByTime(800);
    await Promise.resolve();

    // commitFn 已调用但 Promise 未 resolve，in-flight
    expect(commitFn).toHaveBeenCalledTimes(1);
    expect(scheduler.isInFlight()).toBe(true);

    // in-flight 期间 markDirty 进入 pendingNextBatch
    scheduler.markDirty(makeResource({ path: "b.ts" }));

    // resolve 第一批
    resolveCommit!({ revision: 1, rootHash: "h1" });
    await Promise.resolve();
    await Promise.resolve();

    // 第一批完成，pendingNextBatch 转入 dirtyMap 并调度新 debounce
    expect(onCommitted).toHaveBeenCalledWith({ revision: 1, rootHash: "h1" });
    expect(scheduler.isInFlight()).toBe(false);

    // 新批 debounce 到期
    jest.advanceTimersByTime(800);
    await Promise.resolve();

    expect(commitFn).toHaveBeenCalledTimes(2);
    expect(commitFn.mock.calls[1][0]).toEqual([makeResource({ path: "b.ts" })]);

    scheduler.dispose();
  });

  it("应在 flush 时立即提交所有 dirty 资源", async () => {
    const commitFn = jest.fn<Promise<MutationResult>, [DirtyResource[]]>(
      async () => ({ revision: 5, rootHash: "h5" }),
    );
    const onCommitted = jest.fn();

    const scheduler = new WorkspaceAutosaveScheduler({
      commitFn,
      onCommitted,
      onError: jest.fn(),
    });

    scheduler.markDirty(makeResource({ path: "a.ts" }));
    scheduler.markDirty(makeResource({ path: "b.ts" }));

    await scheduler.flush();

    expect(commitFn).toHaveBeenCalledTimes(1);
    const resources = commitFn.mock.calls[0][0];
    expect(resources).toHaveLength(2);
    expect(onCommitted).toHaveBeenCalledWith({ revision: 5, rootHash: "h5" });

    scheduler.dispose();
  });

  it("flush 无 dirty 时不应调用 commitFn", async () => {
    const commitFn = jest.fn<Promise<MutationResult>, [DirtyResource[]]>(
      async () => ({ revision: 1, rootHash: "h1" }),
    );

    const scheduler = new WorkspaceAutosaveScheduler({
      commitFn,
      onCommitted: jest.fn(),
      onError: jest.fn(),
    });

    await scheduler.flush();
    expect(commitFn).not.toHaveBeenCalled();

    scheduler.dispose();
  });

  it("应执行 revision 单调 ack（不回退 appliedRevision，但仍通知完成）", async () => {
    let callCount = 0;
    const commitFn = jest.fn<Promise<MutationResult>, [DirtyResource[]]>(
      async () => {
        callCount++;
        // 第二次返回更旧的 revision
        return callCount === 1
          ? { revision: 10, rootHash: "h10" }
          : { revision: 5, rootHash: "h5" };
      },
    );
    const onCommitted = jest.fn();

    const scheduler = new WorkspaceAutosaveScheduler({
      commitFn,
      onCommitted,
      onError: jest.fn(),
    });

    scheduler.markDirty(makeResource({ path: "a.ts" }));
    await scheduler.flush();
    expect(onCommitted).toHaveBeenCalledWith({ revision: 10, rootHash: "h10" });
    expect(scheduler.getAppliedRevision()).toBe(10);

    scheduler.markDirty(makeResource({ path: "b.ts" }));
    await scheduler.flush();
    // 更旧回执仍通知完成（清除 saving 状态），但 appliedRevision 不回退
    expect(onCommitted).toHaveBeenCalledTimes(2);
    expect(onCommitted).toHaveBeenLastCalledWith({
      revision: 5,
      rootHash: "h5",
    });
    expect(scheduler.getAppliedRevision()).toBe(10);

    scheduler.dispose();
  });

  it("commitFn 失败时应调用 onError", async () => {
    const commitFn = jest.fn<Promise<MutationResult>, [DirtyResource[]]>(
      async () => {
        throw new Error("网络错误");
      },
    );
    const onError = jest.fn();

    const scheduler = new WorkspaceAutosaveScheduler({
      commitFn,
      onCommitted: jest.fn(),
      onError,
    });

    scheduler.markDirty(makeResource());
    await scheduler.flush();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toBe("网络错误");

    scheduler.dispose();
  });

  it("dispose 后 markDirty 和 flush 无效", async () => {
    const commitFn = jest.fn<Promise<MutationResult>, [DirtyResource[]]>(
      async () => ({ revision: 1, rootHash: "h1" }),
    );

    const scheduler = new WorkspaceAutosaveScheduler({
      commitFn,
      onCommitted: jest.fn(),
      onError: jest.fn(),
    });

    scheduler.dispose();
    scheduler.markDirty(makeResource());

    jest.advanceTimersByTime(5000);
    await Promise.resolve();
    expect(commitFn).not.toHaveBeenCalled();

    await scheduler.flush();
    expect(commitFn).not.toHaveBeenCalled();
  });

  it("setAppliedRevision 应只接受更大的值", () => {
    const scheduler = new WorkspaceAutosaveScheduler({
      commitFn: jest.fn(),
      onCommitted: jest.fn(),
      onError: jest.fn(),
    });

    scheduler.setAppliedRevision(10);
    expect(scheduler.getAppliedRevision()).toBe(10);

    scheduler.setAppliedRevision(5);
    expect(scheduler.getAppliedRevision()).toBe(10);

    scheduler.setAppliedRevision(20);
    expect(scheduler.getAppliedRevision()).toBe(20);

    scheduler.dispose();
  });

  it("hasDirty 应正确反映 dirty 状态", () => {
    const scheduler = new WorkspaceAutosaveScheduler({
      commitFn: jest.fn(),
      onCommitted: jest.fn(),
      onError: jest.fn(),
    });

    expect(scheduler.hasDirty()).toBe(false);
    scheduler.markDirty(makeResource());
    expect(scheduler.hasDirty()).toBe(true);

    scheduler.dispose();
  });

  it("commitFn 抛异常后 isInFlight 应恢复为 false，且后续 markDirty + flush 仍能正常提交", async () => {
    let callCount = 0;
    const commitFn = jest.fn(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error("模拟提交失败");
      }
      return { revision: callCount, rootHash: "" };
    });
    const onError = jest.fn();
    const onCommitted = jest.fn();

    const scheduler = new WorkspaceAutosaveScheduler({
      commitFn,
      onCommitted,
      onError,
    });

    // 第一次提交：应失败
    scheduler.markDirty(makeResource());
    await scheduler.flush();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(scheduler.isInFlight()).toBe(false);

    // 第二次提交：应成功（验证 post-error 恢复）
    scheduler.markDirty(makeResource());
    await scheduler.flush();

    expect(commitFn).toHaveBeenCalledTimes(2);
    expect(onCommitted).toHaveBeenCalledTimes(1);
    expect(scheduler.isInFlight()).toBe(false);

    scheduler.dispose();
  });
});
