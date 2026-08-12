import { getExitSaveState } from "../exit-save-state";

const savedWorkspace = {
  hasUnsavedCanvasChanges: false,
  hasPendingWorkspaceFlush: false,
  hasUnsavedChanges: true,
  workspaceFlushError: null,
  hasOfflineOrErrorCollab: false,
  syncInFlight: false,
  syncDebounceScheduled: false,
};

describe("getExitSaveState", () => {
  it("does not show the saving exit flow after an already-synced edit", () => {
    expect(getExitSaveState(savedWorkspace)).toEqual({
      hasPendingExitWork: false,
      hasGenuineExitBlock: false,
    });
  });

  it("waits when a real workspace or canvas persistence operation remains", () => {
    expect(
      getExitSaveState({ ...savedWorkspace, hasPendingWorkspaceFlush: true }),
    ).toMatchObject({ hasPendingExitWork: true });
    expect(
      getExitSaveState({ ...savedWorkspace, hasUnsavedCanvasChanges: true }),
    ).toMatchObject({ hasPendingExitWork: true });
  });

  it("only treats collaboration failure as blocking while a workspace change is pending", () => {
    expect(
      getExitSaveState({ ...savedWorkspace, hasOfflineOrErrorCollab: true }),
    ).toMatchObject({ hasGenuineExitBlock: false });
    expect(
      getExitSaveState({
        ...savedWorkspace,
        hasPendingWorkspaceFlush: true,
        hasOfflineOrErrorCollab: true,
      }),
    ).toMatchObject({ hasGenuineExitBlock: true });
  });
});
