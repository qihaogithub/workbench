import { describe, expect, it } from "vitest";

import {
  getHeadingStyleLabel,
  HEADING_STYLE_OPTIONS,
} from "./heading-style-toolbar";

describe("heading style options", () => {
  it("keeps the shared heading labels stable for both toolbars", () => {
    expect(HEADING_STYLE_OPTIONS.map((option) => option.label)).toEqual([
      "正文",
      "H1",
      "H2",
      "H3",
      "H4",
      "H5",
      "H6",
    ]);
    expect(getHeadingStyleLabel(null)).toBe("正文");
    expect(getHeadingStyleLabel(3)).toBe("H3");
    expect(getHeadingStyleLabel(99)).toBe("正文");
  });
});
