import { describe, expect, it } from "vitest";

import { LUCIDE_ICONS, lucideHeadingIcon } from "./lucide-icons";

describe("Lucide Markdown editor icons", () => {
  it("renders every editor icon as a Lucide stroke SVG", () => {
    for (const icon of Object.values(LUCIDE_ICONS)) {
      expect(icon).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(icon).toContain('fill="none"');
      expect(icon).toContain('stroke="currentColor"');
      expect(icon).toContain('data-lucide="');
      expect(icon).toContain('aria-hidden="true"');
    }
  });

  it("uses distinct Lucide heading glyphs for H1 through H6", () => {
    const headings = [1, 2, 3, 4, 5, 6].map((level) =>
      lucideHeadingIcon(level),
    );

    expect(new Set(headings).size).toBe(6);
    expect(
      headings.map((icon) => icon.match(/data-lucide="([^"]+)"/)?.[1]),
    ).toEqual([
      "heading-1",
      "heading-2",
      "heading-3",
      "heading-4",
      "heading-5",
      "heading-6",
    ]);
  });

  it("uses recognizable left-aligned text lines for the body style", () => {
    expect(LUCIDE_ICONS.text).toContain('data-lucide="text-align-start"');
  });
});
