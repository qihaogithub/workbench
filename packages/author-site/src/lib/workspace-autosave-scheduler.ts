/**
 * WorkspaceAutosaveScheduler
 *
 * 单一写者 Autosave 调度器：
 * - 800ms debounce（最后一次 markDirty 后等待）
 * - 3000ms max-wait（持续编辑时从首次 dirty 起计最长等待）
 * - 单 in-flight barrier：同时最多一个 mutation 在执行
 * - dirty 资源合并：同一路径只保留最新内容
 * - revision 单调 ack：只接受 revision >= 已应用 revision 的回执
 */

export interface DirtyResource {
  path: string;
  content: string;
  hash: string;
  kind: string;
}

export interface MutationResult {
  revision: number;
  rootHash: string;
}

export interface AutosaveSchedulerOptions {
  /** 最后一次 markDirty 后的静默等待时间，默认 800ms */
  debounceMs?: number;
  /** 从首次 dirty 起的最长等待时间，默认 3000ms */
  maxWaitMs?: number;
  /** 提交函数，由调用方提供（通常是 Authority mutate 封装） */
  commitFn: (resources: DirtyResource[]) => Promise<MutationResult>;
  /** 提交成功回执回调 */
  onCommitted: (receipt: { revision: number; rootHash: string }) => void;
  /** 提交失败回调 */
  onError: (error: Error) => void;
}

type SchedulerTimer = ReturnType<typeof setTimeout>;

export class WorkspaceAutosaveScheduler {
  private readonly debounceMs: number;
  private readonly maxWaitMs: number;
  private readonly commitFn: AutosaveSchedulerOptions["commitFn"];
  private readonly onCommitted: AutosaveSchedulerOptions["onCommitted"];
  private readonly onError: AutosaveSchedulerOptions["onError"];

  /** 当前批次累积的 dirty 资源，按 path 去重保留最新 */
  private readonly dirtyMap = new Map<string, DirtyResource>();
  /** debounce 计时器 */
  private debounceTimer: SchedulerTimer | null = null;
  /** max-wait 计时器 */
  private maxWaitTimer: SchedulerTimer | null = null;
  /** 当前批次的 max-wait 起点时间戳 */
  private batchStartedAt: number | null = null;
  /** 是否正在提交（in-flight barrier） */
  private inFlight = false;
  /** in-flight 期间新进的 dirty 资源，等 in-flight 结束后进入下一批 */
  private readonly pendingNextBatch = new Map<string, DirtyResource>();
  /** 已应用的最高 revision（单调 ack） */
  private appliedRevision = 0;
  /** 是否已 dispose */
  private disposed = false;

  constructor(options: AutosaveSchedulerOptions) {
    this.debounceMs = options.debounceMs ?? 800;
    this.maxWaitMs = options.maxWaitMs ?? 3000;
    this.commitFn = options.commitFn;
    this.onCommitted = options.onCommitted;
    this.onError = options.onError;
  }

  /**
   * 标记资源为脏，同一路径多次调用只保留最新。
   * 触发 debounce/max-wait 计时。
   */
  markDirty(resource: DirtyResource): void {
    if (this.disposed) return;

    if (this.inFlight) {
      // in-flight 期间累积到下一批
      this.pendingNextBatch.set(resource.path, resource);
      return;
    }

    this.dirtyMap.set(resource.path, resource);

    // 首次 dirty 启动 max-wait 计时
    if (this.batchStartedAt === null) {
      this.batchStartedAt = Date.now();
      this.scheduleMaxWait();
    }

    this.scheduleDebounce();
  }

  /**
   * 立即 flush 所有 dirty 资源（页面退出、关键动作前使用）。
   * 如果有 in-flight 则等待其完成后再 flush 新累积的。
   * 返回 Promise 以允许调用方 await。
   */
  async flush(): Promise<void> {
    if (this.disposed) return;

    this.clearTimers();

    if (this.inFlight) {
      // 等待当前 in-flight 完成（会触发 pendingNextBatch 转入）
      await this.inFlightPromise;
    }

    if (this.dirtyMap.size === 0 && this.pendingNextBatch.size === 0) {
      return;
    }

    // 把 pendingNextBatch 合入 dirtyMap
    for (const [path, resource] of this.pendingNextBatch) {
      this.dirtyMap.set(path, resource);
    }
    this.pendingNextBatch.clear();

    await this.commitNow();
  }

  /** 当前是否有待提交的 dirty 资源 */
  hasDirty(): boolean {
    return this.dirtyMap.size > 0 || this.pendingNextBatch.size > 0;
  }

  /** 当前 in-flight 状态 */
  isInFlight(): boolean {
    return this.inFlight;
  }

  /** 已应用的最高 revision */
  getAppliedRevision(): number {
    return this.appliedRevision;
  }

  /**
   * 设置已应用的 revision（初始化时从 Authority 快照同步）。
   */
  setAppliedRevision(revision: number): void {
    this.appliedRevision = Math.max(this.appliedRevision, revision);
  }

  /**
   * 清理所有计时器和待处理操作，之后 markDirty/flush 无效。
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearTimers();
    this.dirtyMap.clear();
    this.pendingNextBatch.clear();
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private inFlightPromise: Promise<void> | null = null;

  private scheduleDebounce(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.commitIfDirty();
    }, this.debounceMs);
  }

  private scheduleMaxWait(): void {
    if (this.maxWaitTimer !== null) {
      clearTimeout(this.maxWaitTimer);
    }
    this.maxWaitTimer = setTimeout(() => {
      this.maxWaitTimer = null;
      // max-wait 到期，立刻提交（清除 debounce）
      if (this.debounceTimer !== null) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }
      void this.commitIfDirty();
    }, this.maxWaitMs);
  }

  private clearTimers(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.maxWaitTimer !== null) {
      clearTimeout(this.maxWaitTimer);
      this.maxWaitTimer = null;
    }
  }

  private async commitIfDirty(): Promise<void> {
    if (this.disposed || this.inFlight || this.dirtyMap.size === 0) return;
    await this.commitNow();
  }

  private async commitNow(): Promise<void> {
    if (this.dirtyMap.size === 0) return;

    const batch = Array.from(this.dirtyMap.values());
    this.dirtyMap.clear();
    this.batchStartedAt = null;
    this.inFlight = true;

    const resolveQueue: Array<() => void> = [];
    this.inFlightPromise = new Promise<void>((resolve) => {
      resolveQueue.push(resolve);
    });

    try {
      const result = await this.commitFn(batch);

      // revision 单调 ack：只接受 >= 已应用 revision 的回执
      if (result.revision >= this.appliedRevision) {
        this.appliedRevision = result.revision;
        this.onCommitted({
          revision: result.revision,
          rootHash: result.rootHash,
        });
      }
      // 如果 revision 更旧，静默丢弃回执（不调用 onError）
    } catch (error) {
      this.onError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.inFlight = false;

      // 将 in-flight 期间新进的 dirty 转入下一批
      if (this.pendingNextBatch.size > 0) {
        for (const [path, resource] of this.pendingNextBatch) {
          this.dirtyMap.set(path, resource);
        }
        this.pendingNextBatch.clear();

        // 继续调度下一批
        if (this.batchStartedAt === null) {
          this.batchStartedAt = Date.now();
          this.scheduleMaxWait();
        }
        this.scheduleDebounce();
      }

      resolveQueue.forEach((resolve) => resolve());
      this.inFlightPromise = null;
    }
  }
}
