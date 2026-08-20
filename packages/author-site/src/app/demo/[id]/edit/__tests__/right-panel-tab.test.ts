import { resolveCanvasRightPanelTab } from "../right-panel-tab";

describe("resolveCanvasRightPanelTab", () => {
  it("switches the single-page edit tab to config when entering canvas", () => {
    expect(resolveCanvasRightPanelTab("edit", true)).toBe("config");
  });

  it("preserves valid canvas tabs", () => {
    expect(resolveCanvasRightPanelTab("config", true)).toBe("config");
    expect(resolveCanvasRightPanelTab("comments", true)).toBe("comments");
  });

  it("falls back to comments when config is unavailable", () => {
    expect(resolveCanvasRightPanelTab("edit", false)).toBe("comments");
    expect(resolveCanvasRightPanelTab("config", false)).toBe("comments");
  });
});
