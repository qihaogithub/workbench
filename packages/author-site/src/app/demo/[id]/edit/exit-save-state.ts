export interface ExitSaveStateInput {
  hasUnsavedCanvasChanges: boolean;
  hasPendingWorkspaceFlush: boolean;
  hasUnsavedChanges: boolean;
  workspaceFlushError: string | null;
  hasOfflineOrErrorCollab: boolean;
  syncInFlight: boolean;
  syncDebounceScheduled: boolean;
}

/**
 * `hasUnsavedChanges` records that this editing session changed project content.
 * It intentionally remains true for version/history UX, so it must not by itself
 * make an exit wait for a persistence operation that has already completed.
 */
export function getExitSaveState({
  hasUnsavedCanvasChanges,
  hasPendingWorkspaceFlush,
  hasUnsavedChanges: _hasUnsavedChanges,
  workspaceFlushError,
  hasOfflineOrErrorCollab,
  syncInFlight,
  syncDebounceScheduled,
}: ExitSaveStateInput) {
  const hasPendingExitWork =
    hasUnsavedCanvasChanges ||
    hasPendingWorkspaceFlush ||
    syncInFlight ||
    syncDebounceScheduled;

  const hasGenuineExitBlock =
    workspaceFlushError !== null ||
    (hasPendingWorkspaceFlush && hasOfflineOrErrorCollab);

  return { hasPendingExitWork, hasGenuineExitBlock };
}
