import {
  PreviewProjectionTracker,
  createPreviewProjectionTracker,
  defaultSurfaceInvalidationStrategy,
  ALL_SURFACES,
  type PreviewSurface,
} from "../preview-projection-tracker";

describe("PreviewProjectionTracker", () => {
  let tracker: PreviewProjectionTracker;

  beforeEach(() => {
    tracker = createPreviewProjectionTracker();
  });

  describe("初始化", () => {
    it("所有 surface 初始状态应为 revision=0 且未失效", () => {
      for (const surface of ALL_SURFACES) {
        const state = tracker.getSurfaceState(surface);
        expect(state.appliedRevision).toBe(0);
        expect(state.invalidated).toBe(false);
      }
    });

    it("getAllSurfaceStates 应返回所有 3 个 surface", () => {
      const states = tracker.getAllSurfaceStates();
      expect(Object.keys(states)).toHaveLength(3);
      expect(states["active-preview"]).toBeDefined();
      expect(states["canvas-preview"]).toBeDefined();
      expect(states["screenshot"]).toBeDefined();
    });
  });

  describe("onCommitted", () => {
    it("资源变更时应使 active-preview 失效", () => {
      const affected = tracker.onCommitted({
        revision: 1,
        resources: [{ path: "src/index.ts", action: "modified" }],
      });
      expect(affected).toContain("active-preview");
      const state = tracker.getSurfaceState("active-preview");
      expect(state.invalidated).toBe(true);
      expect(state.appliedRevision).toBe(1);
    });

    it("canvas 相关资源变更时应使 canvas-preview 失效", () => {
      const affected = tracker.onCommitted({
        revision: 2,
        resources: [{ path: "src/canvas.sketch", action: "modified" }],
      });
      expect(affected).toContain("active-preview");
      expect(affected).toContain("canvas-preview");
    });

    it("普通资源变更不应使 screenshot 失效", () => {
      tracker.onCommitted({
        revision: 3,
        resources: [{ path: "src/index.ts", action: "modified" }],
      });
      const screenshotState = tracker.getSurfaceState("screenshot");
      expect(screenshotState.invalidated).toBe(false);
    });

    it("revision 应单调递增", () => {
      tracker.onCommitted({
        revision: 5,
        resources: [{ path: "a.ts", action: "modified" }],
      });
      tracker.onCommitted({
        revision: 3, // 旧 revision
        resources: [{ path: "b.ts", action: "modified" }],
      });
      // appliedRevision 应保持 5
      const state = tracker.getSurfaceState("active-preview");
      expect(state.appliedRevision).toBe(5);
    });
  });

  describe("ackPreview", () => {
    it("确认预览后应清除 invalidated 标志", () => {
      tracker.onCommitted({
        revision: 1,
        resources: [{ path: "a.ts", action: "modified" }],
      });
      expect(tracker.getSurfaceState("active-preview").invalidated).toBe(true);

      const ack = tracker.ackPreview(1, "active-preview");
      expect(ack).not.toBeNull();
      expect(ack!.revision).toBe(1);
      expect(ack!.surface).toBe("active-preview");
      expect(ack!.status).toBe("applied");
      expect(tracker.getSurfaceState("active-preview").invalidated).toBe(false);
    });

    it("旧 revision 的 ack 应被忽略", () => {
      tracker.onCommitted({
        revision: 5,
        resources: [{ path: "a.ts", action: "modified" }],
      });
      const ack = tracker.ackPreview(3, "active-preview");
      expect(ack).toBeNull();
    });

    it("更新到更高 revision 的 ack 应成功", () => {
      tracker.onCommitted({
        revision: 3,
        resources: [{ path: "a.ts", action: "modified" }],
      });
      const ack = tracker.ackPreview(5, "active-preview");
      expect(ack).not.toBeNull();
      expect(tracker.getSurfaceState("active-preview").appliedRevision).toBe(5);
    });
  });

  describe("failPreview", () => {
    it("预览失败后应保持 invalidated 为 true", () => {
      tracker.onCommitted({
        revision: 1,
        resources: [{ path: "a.ts", action: "modified" }],
      });
      const result = tracker.failPreview("active-preview");
      expect(result.status).toBe("failed");
      expect(result.surface).toBe("active-preview");
      expect(tracker.getSurfaceState("active-preview").invalidated).toBe(true);
    });
  });

  describe("resetFromSnapshot", () => {
    it("重连后所有 surface 应设为指定 revision 并失效", () => {
      tracker.ackPreview(5, "active-preview");
      tracker.ackPreview(5, "canvas-preview");

      tracker.resetFromSnapshot(10);

      for (const surface of ALL_SURFACES) {
        const state = tracker.getSurfaceState(surface);
        expect(state.appliedRevision).toBe(10);
        expect(state.invalidated).toBe(true);
      }
    });
  });

  describe("hasInvalidatedSurfaces / getInvalidatedSurfaces", () => {
    it("初始时应无失效 surface", () => {
      expect(tracker.hasInvalidatedSurfaces()).toBe(false);
      expect(tracker.getInvalidatedSurfaces()).toHaveLength(0);
    });

    it("onCommitted 后应有失效 surface", () => {
      tracker.onCommitted({
        revision: 1,
        resources: [{ path: "a.ts", action: "modified" }],
      });
      expect(tracker.hasInvalidatedSurfaces()).toBe(true);
      const invalidated = tracker.getInvalidatedSurfaces();
      expect(invalidated).toContain("active-preview");
    });

    it("全部 ack 后应无失效 surface", () => {
      tracker.onCommitted({
        revision: 1,
        resources: [{ path: "a.ts", action: "modified" }],
      });
      tracker.ackPreview(1, "active-preview");
      expect(tracker.hasInvalidatedSurfaces()).toBe(false);
    });
  });

  describe("自定义 invalidation strategy", () => {
    it("应使用自定义策略决定失效 surface", () => {
      const customStrategy = (_paths: string[]): PreviewSurface[] => [
        "screenshot",
      ];
      const customTracker = createPreviewProjectionTracker(customStrategy);
      const affected = customTracker.onCommitted({
        revision: 1,
        resources: [{ path: "anything.ts", action: "modified" }],
      });
      expect(affected).toEqual(["screenshot"]);
      expect(customTracker.getSurfaceState("active-preview").invalidated).toBe(false);
      expect(customTracker.getSurfaceState("screenshot").invalidated).toBe(true);
    });
  });

  describe("defaultSurfaceInvalidationStrategy", () => {
    it("空变更列表应返回空数组", () => {
      expect(defaultSurfaceInvalidationStrategy([])).toHaveLength(0);
    });

    it("普通文件变更应使 active-preview 失效", () => {
      const surfaces = defaultSurfaceInvalidationStrategy(["src/index.ts"]);
      expect(surfaces).toContain("active-preview");
      expect(surfaces).not.toContain("canvas-preview");
    });

    it("sketch 文件变更应同时使 active-preview 和 canvas-preview 失效", () => {
      const surfaces = defaultSurfaceInvalidationStrategy(["src/design.sketch"]);
      expect(surfaces).toContain("active-preview");
      expect(surfaces).toContain("canvas-preview");
    });

    it("包含 canvas 路径的文件变更应使 canvas-preview 失效", () => {
      const surfaces = defaultSurfaceInvalidationStrategy(["canvas/layout.json"]);
      expect(surfaces).toContain("canvas-preview");
    });
  });
});
