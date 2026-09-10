import { describe, expect, it } from "vitest";
import { formatImageAccept, formatImageDimensions } from "./FieldRenderer";

describe("design spec image metadata", () => {
  it("shows unlimited when no image format restriction is configured", () => {
    expect(formatImageAccept()).toBe("不限");
    expect(formatImageAccept({ accept: "image/*" })).toBe("不限");
  });

  it("shows configured formats and dimensions", () => {
    expect(formatImageAccept({ accept: "image/png,image/jpeg" })).toBe("png/jpg");
    expect(formatImageDimensions({
      widthRule: { min: { value: 100, inclusive: true }, max: { value: 100, inclusive: true } },
      heightRule: { min: { value: 200, inclusive: true } },
    })).toBe("W=100px · H≥200px");
    expect(formatImageDimensions({
      heightRule: {
        min: { value: 670, inclusive: false },
        max: { value: 890, inclusive: false },
      },
    })).toBe("670px<H<890px");
    expect(formatImageDimensions()).toBe("—");
  });
});
