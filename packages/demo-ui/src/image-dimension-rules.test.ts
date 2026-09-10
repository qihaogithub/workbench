import { describe, expect, it } from "vitest";
import {
  formatImageDimensionRule,
  formatImageDimensionRuleCompact,
  matchesImageDimension,
  normalizeImageDimensionRule,
  validateImageDimensionRule,
  validateImageDimensions,
} from "@workbench/shared/demo/config-schema-definition";

describe("image dimension rules", () => {
  const openInterval = {
    min: { value: 670, inclusive: false },
    max: { value: 890, inclusive: false },
  };

  it("matches strict interval boundaries", () => {
    expect(matchesImageDimension(670, openInterval)).toBe(false);
    expect(matchesImageDimension(671, openInterval)).toBe(true);
    expect(matchesImageDimension(889, openInterval)).toBe(true);
    expect(matchesImageDimension(890, openInterval)).toBe(false);
  });

  it("matches mixed inclusive and exclusive interval boundaries", () => {
    const mixed = {
      min: { value: 670, inclusive: true },
      max: { value: 890, inclusive: false },
    };
    expect(matchesImageDimension(670, mixed)).toBe(true);
    expect(matchesImageDimension(671, mixed)).toBe(true);
    expect(matchesImageDimension(889, mixed)).toBe(true);
    expect(matchesImageDimension(890, mixed)).toBe(false);
  });

  it("normalizes all legacy operators", () => {
    expect(normalizeImageDimensionRule({ operator: "=", value: 10 })).toEqual({
      min: { value: 10, inclusive: true },
      max: { value: 10, inclusive: true },
    });
    expect(normalizeImageDimensionRule({ operator: "≤", value: 20 })).toEqual({
      max: { value: 20, inclusive: true },
    });
    expect(normalizeImageDimensionRule({ operator: ">", value: 30 })).toEqual({
      min: { value: 30, inclusive: false },
    });
    expect(normalizeImageDimensionRule({ operator: "<", value: 40 })).toEqual({
      max: { value: 40, inclusive: false },
    });
  });

  it("rejects reversed and empty intervals", () => {
    expect(validateImageDimensionRule({
      min: { value: 900, inclusive: true },
      max: { value: 670, inclusive: true },
    })).toContain("下限不能大于上限");
    expect(validateImageDimensionRule({})).toContain("至少需要一个边界");
    expect(validateImageDimensionRule({
      min: { value: 670, inclusive: false },
      max: { value: 670, inclusive: true },
    })).toContain("上下限相等时必须包含边界");
    expect(validateImageDimensionRule({ min: { value: 670 } as never })).toContain("包含边界标记无效");
  });

  it("formats interval and validation messages consistently", () => {
    expect(formatImageDimensionRule(openInterval, "H")).toBe("H > 670px 且 H < 890px");
    expect(formatImageDimensionRuleCompact(openInterval, "H")).toBe("670px<H<890px");
    expect(validateImageDimensions({ width: 1000, height: 890 }, { heightRule: openInterval })).toEqual({
      valid: false,
      message: "图片尺寸不符合要求：高度> 670px 且 < 890px（实际 1000x890px）",
    });
  });
});
