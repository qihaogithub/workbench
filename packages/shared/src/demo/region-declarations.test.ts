import { describe, expect, it } from "vitest";

import { extractDeclaredRegionIds } from "./region-declarations";

describe("extractDeclaredRegionIds", () => {
  it("统一提取 React 与原型页的静态区域声明", () => {
    expect(extractDeclaredRegionIds([
      '<section data-region-id="member-panel" />',
      "<Panel regionId={'fallback-panel'} />",
      "<aside data-region-id='member-panel'></aside>",
    ])).toEqual(["fallback-panel", "member-panel"]);
  });

  it("忽略动态表达式，避免发布校验误判区域存在", () => {
    expect(extractDeclaredRegionIds([
      "<Panel regionId={currentRegion} />",
      '<div data-region-id="valid"></div>',
    ])).toEqual(["valid"]);
  });
});
