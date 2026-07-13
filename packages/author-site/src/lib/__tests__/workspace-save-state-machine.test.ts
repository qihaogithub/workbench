import {
  transition,
  getSaveStatusLabel,
  computeSaveStateFromContext,
  SAVE_STATES,
  type SaveState,
  type SaveEvent,
  type SaveStateContext,
} from "../workspace-save-state-machine";

function makeContext(overrides: Partial<SaveStateContext> = {}): SaveStateContext {
  return {
    hasDirtyResources: false,
    isMutationInFlight: false,
    isConnected: true,
    hasConflict: false,
    isCanonicalStale: false,
    lastSaveError: null,
    ...overrides,
  };
}

describe("workspace-save-state-machine", () => {
  describe("transition", () => {
    it("editing → SAVE_STARTED → saving", () => {
      expect(transition("editing", "SAVE_STARTED")).toBe("saving");
    });

    it("saving → SAVE_COMMITTED → autosaved", () => {
      expect(transition("saving", "SAVE_COMMITTED")).toBe("autosaved");
    });

    it("saving → SAVE_FAILED → editing", () => {
      expect(transition("saving", "SAVE_FAILED")).toBe("editing");
    });

    it("autosaved → START_EDIT → editing", () => {
      expect(transition("autosaved", "START_EDIT")).toBe("editing");
    });

    it("autosaved → CANONICAL_STALE → canonical-stale", () => {
      expect(transition("autosaved", "CANONICAL_STALE")).toBe("canonical-stale");
    });

    it("canonical-stale → CANONICAL_SYNCED → autosaved", () => {
      expect(transition("canonical-stale", "CANONICAL_SYNCED")).toBe("autosaved");
    });

    it("任意状态 → DISCONNECT → offline", () => {
      const nonOfflineStates: SaveState[] = ["editing", "saving", "autosaved", "canonical-stale"];
      for (const state of nonOfflineStates) {
        expect(transition(state, "DISCONNECT")).toBe("offline");
      }
    });

    it("offline → RECONNECT → editing", () => {
      expect(transition("offline", "RECONNECT")).toBe("editing");
    });

    it("任意状态 → CONFLICT_DETECTED → conflict", () => {
      const states: SaveState[] = ["editing", "saving", "autosaved", "canonical-stale"];
      for (const state of states) {
        expect(transition(state, "CONFLICT_DETECTED")).toBe("conflict");
      }
    });

    it("conflict → CONFLICT_RESOLVED → editing", () => {
      expect(transition("conflict", "CONFLICT_RESOLVED")).toBe("editing");
    });

    it("非法转移应保持当前状态（幂等）", () => {
      // editing 状态收到 SAVE_COMMITTED（无意义）
      expect(transition("editing", "SAVE_COMMITTED")).toBe("editing");
      // autosaved 收到 SAVE_COMMITTED
      expect(transition("autosaved", "SAVE_COMMITTED")).toBe("autosaved");
      // offline 收到 SAVE_STARTED
      expect(transition("offline", "SAVE_STARTED")).toBe("offline");
      // conflict 收到 START_EDIT
      expect(transition("conflict", "START_EDIT")).toBe("conflict");
    });

    it("START_EDIT 在 editing 状态幂等保持", () => {
      expect(transition("editing", "START_EDIT")).toBe("editing");
    });

    it("START_EDIT 在 saving 状态保持 saving", () => {
      expect(transition("saving", "START_EDIT")).toBe("saving");
    });

    it("offline 状态下 START_EDIT 保持 offline", () => {
      expect(transition("offline", "START_EDIT")).toBe("offline");
    });
  });

  describe("getSaveStatusLabel", () => {
    it("应返回所有状态的中文标签", () => {
      expect(getSaveStatusLabel("editing")).toBe("编辑中");
      expect(getSaveStatusLabel("saving")).toBe("保存中…");
      expect(getSaveStatusLabel("autosaved")).toBe("已自动保存");
      expect(getSaveStatusLabel("offline")).toBe("离线（本地草稿已保留）");
      expect(getSaveStatusLabel("conflict")).toBe("存在冲突，需要处理");
      expect(getSaveStatusLabel("canonical-stale")).toBe("已保存，项目同步异常");
    });
  });

  describe("computeSaveStateFromContext", () => {
    it("无 dirty 且已连接应返回 autosaved", () => {
      expect(computeSaveStateFromContext(makeContext())).toBe("autosaved");
    });

    it("有 dirty 应返回 editing", () => {
      expect(computeSaveStateFromContext(makeContext({ hasDirtyResources: true }))).toBe("editing");
    });

    it("mutation in-flight 应返回 saving", () => {
      expect(computeSaveStateFromContext(makeContext({ isMutationInFlight: true }))).toBe("saving");
    });

    it("断开连接应返回 offline", () => {
      expect(computeSaveStateFromContext(makeContext({ isConnected: false }))).toBe("offline");
    });

    it("冲突优先级最高", () => {
      expect(computeSaveStateFromContext(makeContext({
        hasConflict: true,
        isConnected: false,
        isMutationInFlight: true,
      }))).toBe("conflict");
    });

    it("offline 优先级高于 saving", () => {
      expect(computeSaveStateFromContext(makeContext({
        isConnected: false,
        isMutationInFlight: true,
      }))).toBe("offline");
    });

    it("canonical stale 在 saving 之后", () => {
      expect(computeSaveStateFromContext(makeContext({
        isCanonicalStale: true,
      }))).toBe("canonical-stale");
    });

    it("已保存但 canonical 异常应返回 canonical-stale（不影响 autosaved）", () => {
      // 这正是 WMA-264 的核心要求：autosave 成功 = autosaved，canonical 异常独立
      const result = computeSaveStateFromContext(makeContext({
        hasDirtyResources: false,
        isMutationInFlight: false,
        isConnected: true,
        isCanonicalStale: true,
      }));
      expect(result).toBe("canonical-stale");
      expect(getSaveStatusLabel(result)).toBe("已保存，项目同步异常");
    });
  });

  describe("SAVE_STATES", () => {
    it("应包含所有 6 个状态", () => {
      expect(SAVE_STATES).toHaveLength(6);
      expect(SAVE_STATES).toContain("editing");
      expect(SAVE_STATES).toContain("saving");
      expect(SAVE_STATES).toContain("autosaved");
      expect(SAVE_STATES).toContain("offline");
      expect(SAVE_STATES).toContain("conflict");
      expect(SAVE_STATES).toContain("canonical-stale");
    });
  });
});
