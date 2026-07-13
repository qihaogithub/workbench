/**
 * Workspace Save State Machine
 *
 * 显式状态机，用于编辑器保存状态展示。
 * 将 autosave 状态（editing/saving/autosaved）与 canonical 同步状态
 * （canonical-stale）解耦，autosaved 只要求 live Authority commit 成功，
 * canonical 异常时独立展示 "已保存，项目同步异常"。
 */

export type SaveState =
  | "editing" // 用户正在编辑，无待保存变更
  | "saving" // autosave mutation 正在飞行中
  | "autosaved" // 最近一次 autosave 已提交成功
  | "offline" // Authority 不可达，本地草稿已保留
  | "conflict" // 资源 hash 冲突，需要用户操作
  | "canonical-stale"; // 已保存但 canonical 同步异常

export type SaveEvent =
  | "START_EDIT"
  | "SAVE_STARTED"
  | "SAVE_COMMITTED"
  | "SAVE_FAILED"
  | "DISCONNECT"
  | "RECONNECT"
  | "CONFLICT_DETECTED"
  | "CONFLICT_RESOLVED"
  | "CANONICAL_STALE"
  | "CANONICAL_SYNCED";

export interface SaveStateContext {
  hasDirtyResources: boolean;
  isMutationInFlight: boolean;
  isConnected: boolean;
  hasConflict: boolean;
  isCanonicalStale: boolean;
  lastSaveError: Error | null;
}

const SAVE_STATE_LABELS: Record<SaveState, string> = {
  editing: "编辑中",
  saving: "保存中…",
  autosaved: "已自动保存",
  offline: "离线（本地草稿已保留）",
  conflict: "存在冲突，需要处理",
  "canonical-stale": "已保存，项目同步异常",
};

/** 返回状态的中文可读标签 */
export function getSaveStatusLabel(state: SaveState): string {
  return SAVE_STATE_LABELS[state];
}

/** 所有合法状态 */
export const SAVE_STATES: readonly SaveState[] = [
  "editing",
  "saving",
  "autosaved",
  "offline",
  "conflict",
  "canonical-stale",
] as const;

/**
 * 状态转移表。
 * 对于每个 (state, event) 组合，返回下一个状态；
 * 未定义的转移返回 null，表示不允许（保持当前状态）。
 *
 * 设计说明：
 * - "已自动保存" 仅表示 Authority commit 成功，不依赖 canonical。
 * - canonical 异常由 "canonical-stale" 独立承载。
 * - 离线时所有 autosave 事件无效，直到 RECONNECT。
 * - conflict 优先级最高，需要显式 CONFLICT_RESOLVED 才能退出。
 */
type TransitionTable = Record<SaveState, Partial<Record<SaveEvent, SaveState>>>;

const TRANSITIONS: TransitionTable = {
  editing: {
    SAVE_STARTED: "saving",
    DISCONNECT: "offline",
    CONFLICT_DETECTED: "conflict",
    // START_EDIT 在 editing 状态幂等保持
    START_EDIT: "editing",
  },
  saving: {
    SAVE_COMMITTED: "autosaved",
    SAVE_FAILED: "editing",
    DISCONNECT: "offline",
    CONFLICT_DETECTED: "conflict",
    // 保存中继续编辑，保持 saving（不中断）
    START_EDIT: "saving",
  },
  autosaved: {
    START_EDIT: "editing",
    SAVE_STARTED: "saving",
    DISCONNECT: "offline",
    CONFLICT_DETECTED: "conflict",
    CANONICAL_STALE: "canonical-stale",
  },
  offline: {
    RECONNECT: "editing",
    // 离线期间的 SAVE_COMMITTED 忽略（状态不变）
    // 离线期间继续编辑保持 offline
    START_EDIT: "offline",
  },
  conflict: {
    CONFLICT_RESOLVED: "editing",
    DISCONNECT: "offline",
  },
  "canonical-stale": {
    START_EDIT: "editing",
    SAVE_STARTED: "saving",
    CANONICAL_SYNCED: "autosaved",
    DISCONNECT: "offline",
    CONFLICT_DETECTED: "conflict",
  },
};

/**
 * 计算状态转移。如果转移非法（表中未定义），返回当前状态（幂等）。
 * context 参数用于未来扩展条件转移，当前版本仅使用 event + state。
 */
export function transition(
  currentState: SaveState,
  event: SaveEvent,
  _context?: Partial<SaveStateContext>,
): SaveState {
  const next = TRANSITIONS[currentState]?.[event];
  return next ?? currentState;
}

/**
 * 便捷：从上下文直接计算展示状态（无需维护状态机实例）。
 * 适用于不需要事件历史的场景，每次根据当前事实重新判定。
 *
 * 优先级：conflict > offline > saving > canonical-stale > autosaved > editing
 */
export function computeSaveStateFromContext(
  context: SaveStateContext,
): SaveState {
  if (context.hasConflict) return "conflict";
  if (!context.isConnected) return "offline";
  if (context.isMutationInFlight) return "saving";
  if (context.isCanonicalStale) return "canonical-stale";
  if (context.hasDirtyResources) return "editing";
  return "autosaved";
}
