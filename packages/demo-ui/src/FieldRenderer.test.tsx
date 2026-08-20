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
      widthRule: { operator: "=", value: 100 },
      heightRule: { operator: "≥", value: 200 },
    })).toBe("W = 100px · H ≥ 200px");
    expect(formatImageDimensions()).toBe("—");
  });
});
