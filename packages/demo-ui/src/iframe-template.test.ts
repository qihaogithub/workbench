import { describe, expect, it } from "vitest";

import { visualEditScript } from "./iframe-template";

describe("visualEditScript", () => {
  it("在选择模式注入专用鼠标，并排除编辑浮层", () => {
    expect(visualEditScript).toContain("visual-selection-cursor");
    expect(visualEditScript).toContain("data-visual-selection-mode");
    expect(visualEditScript).toContain(":not([data-visual-overlay])");
    expect(visualEditScript).toContain("%233b82f6");
  });

  it("批注模式不覆盖其专用鼠标", () => {
    expect(visualEditScript).toContain(
      "syncSelectionCursor(state.enabled && !state.annotationMode)",
    );
  });
});
