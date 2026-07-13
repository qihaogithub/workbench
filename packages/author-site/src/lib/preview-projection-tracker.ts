/**
 * Preview Projection Tracker (WMA-342/343/344)
 *
 * 追踪每个预览表面（active-preview, canvas-preview, screenshot）当前
 * 已应用的 revision，并在 committed event 到达时失效受影响的预览表面。
 *
 * 设计原则：
 * - 纯状态追踪，不发起网络请求（由外部注入 ack 回调）
 * - 支持重连/gap 时从 snapshot 重置
 * - 每个 surface 独立追踪 appliedRevision
 */

import type {
  WorkspaceProjectionAck,
  WorkspaceRevision,
} from "@workbench/shared/contracts";

/** 预览表面类型 */
export type PreviewSurface =
  | "active-preview"
  | "canvas-preview"
  | "screenshot";

/** 所有预览表面 */
export const ALL_SURFACES: readonly PreviewSurface[] = [
  "active-preview",
  "canvas-preview",
  "screenshot",
] as const;

/** 单个表面的追踪状态 */
export interface SurfaceState {
  /** 该表面已应用的最新 revision */
  appliedRevision: number;
  /** 该表面是否有待应用的变更（invalidate 后变为 true） */
  invalidated: boolean;
}

/** 变更的资源信息（从 committed event 中提取） */
export interface CommittedResourceChange {
  path: string;
  action: "created" | "modified" | "deleted" | "moved";
}

/** committed event 的精简表示 */
export interface CommittedEventInfo {
  revision: number;
  resources: CommittedResourceChange[];
}

/** ack 回调函数类型 */
export type AckCallback = (ack: Omit<WorkspaceProjectionAck, "acknowledgedAt">) => void;

/** 路径到 surface 的映射策略 */
export type SurfaceInvalidationStrategy = (
  changedPaths: string[],
) => PreviewSurface[];

/**
 * 默认的 surface 失效策略：
 * - 任何资源变更都使 active-preview 失效
 * - canvas 相关资源变更使 canvas-preview 失效
 * - screenshot 仅在显式请求时失效（不自动失效）
 */
export function defaultSurfaceInvalidationStrategy(
  changedPaths: string[],
): PreviewSurface[] {
  const surfaces = new Set<PreviewSurface>();
  // 任何变更都影响 active-preview
  if (changedPaths.length > 0) {
    surfaces.add("active-preview");
  }
  // canvas 相关
  for (const p of changedPaths) {
    if (
      p.includes("canvas") ||
      p.includes("sketch") ||
      p.endsWith(".sketch")
    ) {
      surfaces.add("canvas-preview");
      break;
    }
  }
  return Array.from(surfaces);
}

/**
 * Preview Projection Tracker
 *
 * 维护每个 surface 的 appliedRevision 和 invalidated 状态。
 */
export class PreviewProjectionTracker {
  private readonly states: Map<PreviewSurface, SurfaceState>;
  private readonly invalidationStrategy: SurfaceInvalidationStrategy;

  constructor(
    invalidationStrategy: SurfaceInvalidationStrategy = defaultSurfaceInvalidationStrategy,
  ) {
    this.invalidationStrategy = invalidationStrategy;
    this.states = new Map();
    for (const surface of ALL_SURFACES) {
      this.states.set(surface, { appliedRevision: 0, invalidated: false });
    }
  }

  /** 获取指定表面的当前状态 */
  getSurfaceState(surface: PreviewSurface): SurfaceState {
    return { ...this.states.get(surface)! };
  }

  /** 获取所有表面状态 */
  getAllSurfaceStates(): Record<PreviewSurface, SurfaceState> {
    const result: Record<string, SurfaceState> = {};
    for (const [surface, state] of this.states) {
      result[surface] = { ...state };
    }
    return result as Record<PreviewSurface, SurfaceState>;
  }

  /**
   * 当 committed event 到达时调用。
   * 更新 baseline revision，并根据 invalidation strategy 标记受影响 surface 为 invalidated。
   *
   * @returns 被失效的 surface 列表
   */
  onCommitted(event: CommittedEventInfo): PreviewSurface[] {
    const changedPaths = event.resources.map((r) => r.path);
    const affectedSurfaces = this.invalidationStrategy(changedPaths);

    for (const surface of ALL_SURFACES) {
      const state = this.states.get(surface)!;
      // 更新 baseline（即使不失效也要跟进 revision）
      if (event.revision > state.appliedRevision) {
        state.appliedRevision = event.revision;
      }
      // 标记受影响的 surface
      if (affectedSurfaces.includes(surface)) {
        state.invalidated = true;
      }
    }

    return affectedSurfaces;
  }

  /**
   * 当某个预览表面完成渲染（load/compile/render complete）时调用。
   * 标记该 surface 为已应用指定 revision，并清除 invalidated 标志。
   *
   * @param revision 该表面已成功渲染到的 revision
   * @param surface 完成渲染的表面
   * @returns 应该发送的 ack 信息（如果 revision 有效）
   */
  ackPreview(
    revision: number,
    surface: PreviewSurface,
  ): { revision: number; surface: PreviewSurface; status: "applied" } | null {
    const state = this.states.get(surface);
    if (!state) return null;

    // 只接受 >= 当前 appliedRevision 的 ack
    if (revision < state.appliedRevision) return null;

    state.appliedRevision = revision;
    state.invalidated = false;

    return { revision, surface, status: "applied" };
  }

  /**
   * 当预览表面渲染失败时调用。
   * 保持 invalidated 为 true，不更新 appliedRevision。
   */
  failPreview(surface: PreviewSurface): { surface: PreviewSurface; status: "failed" } {
    const state = this.states.get(surface)!;
    // 不清除 invalidated，让外部重试
    state.invalidated = true;
    return { surface, status: "failed" };
  }

  /**
   * 重连或 gap 后从 snapshot 重置所有 surface。
   * 将所有 surface 的 appliedRevision 设为当前 revision，并标记为 invalidated。
   */
  resetFromSnapshot(currentRevision: number): void {
    for (const [, state] of this.states) {
      state.appliedRevision = currentRevision;
      state.invalidated = true;
    }
  }

  /**
   * 检查是否有任何 surface 需要更新（invalidated 为 true）。
   */
  hasInvalidatedSurfaces(): boolean {
    for (const [, state] of this.states) {
      if (state.invalidated) return true;
    }
    return false;
  }

  /**
   * 获取所有需要更新的 surface 列表。
   */
  getInvalidatedSurfaces(): PreviewSurface[] {
    const result: PreviewSurface[] = [];
    for (const [surface, state] of this.states) {
      if (state.invalidated) result.push(surface);
    }
    return result;
  }
}

/**
 * 创建 PreviewProjectionTracker 实例。
 */
export function createPreviewProjectionTracker(
  invalidationStrategy?: SurfaceInvalidationStrategy,
): PreviewProjectionTracker {
  return new PreviewProjectionTracker(invalidationStrategy);
}
