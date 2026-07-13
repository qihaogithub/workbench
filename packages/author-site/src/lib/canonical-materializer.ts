import { syncActiveWorkspaceToCanonical } from "./workspace-manager";

export interface CanonicalRevisionMetadata {
  revision: number;
  rootHash: string;
}

export interface CanonicalMaterializeOptions {
  projectId: string;
  workspaceId?: string | null;
  metadata?: CanonicalRevisionMetadata;
}

export interface CanonicalMaterializeResult {
  success: boolean;
  workspacePath?: string;
  code?: string;
  error?: string;
}

interface PendingRequest {
  targetRevision: number;
  projectId: string;
  workspaceId?: string | null;
  metadata?: CanonicalRevisionMetadata;
  resolve: (result: CanonicalMaterializeResult) => void;
  reject: (error: Error) => void;
}

/**
 * Background coalesce materializer.
 *
 * Maintains a queue of pending materialization requests (target revision).
 * Coalesce: if multiple requests come in, only materialize to the latest revision.
 * Single in-flight: only one materialization running at a time.
 * Backpressure: new requests while materializing go to next batch.
 *
 * The internal implementation still uses the synchronous
 * `syncActiveWorkspaceToCanonical` from workspace-manager.
 */
class CoalesceMaterializer {
  private pending: PendingRequest[] = [];
  private inFlight = false;
  private currentRevision = 0;

  queueRequest(
    options: CanonicalMaterializeOptions,
    targetRevision: number,
  ): Promise<CanonicalMaterializeResult> {
    return new Promise<CanonicalMaterializeResult>((resolve, reject) => {
      this.pending.push({
        targetRevision,
        projectId: options.projectId,
        workspaceId: options.workspaceId,
        metadata: options.metadata,
        resolve,
        reject,
      });
      void this.drain();
    });
  }

  private async drain(): Promise<void> {
    if (this.inFlight) return;
    this.inFlight = true;
    // Yield to let all synchronous push() calls in the same tick complete
    await Promise.resolve();

    try {
      while (this.pending.length > 0) {
        // Coalesce: take all pending, materialize to the latest revision
        const batch = this.pending.splice(0);
        const latest = batch.reduce((max, request) =>
          request.targetRevision > max.targetRevision ? request : max,
        );

        // Run the synchronous materialization with the latest request's metadata
        const result = latest.metadata
          ? syncActiveWorkspaceToCanonical(
              latest.projectId,
              latest.workspaceId,
              latest.metadata,
            )
          : syncActiveWorkspaceToCanonical(
              latest.projectId,
              latest.workspaceId,
            );

        if (result.success) {
          this.currentRevision = latest.targetRevision;
          const materializeResult: CanonicalMaterializeResult = {
            success: true,
            workspacePath: result.workspacePath,
          };
          for (const request of batch) {
            if (request.targetRevision <= this.currentRevision) {
              request.resolve(materializeResult);
            } else {
              // Re-queue for next batch (backpressure)
              this.pending.push(request);
            }
          }
        } else {
          const errorResult: CanonicalMaterializeResult = {
            success: false,
            code: result.code,
            error: result.error || "canonical materialization failed",
          };
          for (const request of batch) {
            request.resolve(errorResult);
          }
        }
      }
    } finally {
      this.inFlight = false;
    }
  }

  getCurrentRevision(): number {
    return this.currentRevision;
  }
}

const globalMaterializer = new CoalesceMaterializer();

/**
 * 单一 canonical 物化边界。
 *
 * 业务入口不直接调用 workspace-manager 的底层同步实现；关键动作先通过
 * ensureCanonicalRevision 取得目标 revision/rootHash，再从这里推进项目基准工作区。
 *
 * 此函数保留为同步 API，直接调用底层 syncActiveWorkspaceToCanonical。
 * 新的 async coalesce 行为通过 ensureCanonicalRevisionMaterializer 暴露。
 */
export function materializeCanonicalWorkspace(
  options: CanonicalMaterializeOptions,
): CanonicalMaterializeResult {
  const result = options.metadata
    ? syncActiveWorkspaceToCanonical(
        options.projectId,
        options.workspaceId,
        options.metadata,
      )
    : syncActiveWorkspaceToCanonical(options.projectId, options.workspaceId);

  return {
    success: result.success,
    workspacePath: result.workspacePath,
    code: result.code,
    error: result.error,
  };
}

/**
 * Async coalesce materializer public API.
 *
 * Queues a materialization request for the target revision.
 * Waits for materialization to reach at least targetRevision.
 * Returns with current materialization result (success, workspacePath, code, error).
 *
 * Multiple concurrent calls are coalesced: only the latest revision is materialized.
 * New requests during an in-flight materialization are deferred to the next batch (backpressure).
 */
export async function ensureCanonicalRevisionMaterializer(
  options: CanonicalMaterializeOptions,
  targetRevision?: number,
): Promise<CanonicalMaterializeResult> {
  const effectiveRevision = targetRevision ?? 0;
  return globalMaterializer.queueRequest(options, effectiveRevision);
}

/**
 * 获取全局 coalesce materializer 实例（用于测试和诊断）。
 */
export function getGlobalMaterializer(): CoalesceMaterializer {
  return globalMaterializer;
}
