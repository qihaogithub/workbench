import {
  validateNoSchemaConflict,
  validateNoSchemaConflictFromStrings,
  parseSchemaString,
  type JsonSchema,
} from "../schema-validator";

describe("Schema 冲突校验", () => {
  describe("parseSchemaString", () => {
    it("应解析合法的 JSON Schema", () => {
      const json = JSON.stringify({ type: "object", properties: { a: {} } });
      const parsed = parseSchemaString(json);
      expect(parsed).toEqual({ type: "object", properties: { a: {} } });
    });

    it("非法 JSON 返回 null", () => {
      expect(parseSchemaString("{invalid")).toBeNull();
    });

    it("undefined / 空串返回 null", () => {
      expect(parseSchemaString(undefined)).toBeNull();
      expect(parseSchemaString("")).toBeNull();
    });

    it("数组形态视为非 Schema 返回 null", () => {
      expect(parseSchemaString("[1,2,3]")).toBeNull();
    });
  });

  describe("validateNoSchemaConflict", () => {
    it("项目级 Schema 为 null 时直接通过", () => {
      const result = validateNoSchemaConflict(null, {
        page1: { properties: { foo: {} } },
      });
      expect(result.ok).toBe(true);
    });

    it("项目级 Schema 没有 properties 时直接通过", () => {
      const result = validateNoSchemaConflict(
        {} as JsonSchema,
        { page1: { properties: { foo: {} } } },
      );
      expect(result.ok).toBe(true);
    });

    it("项目级与页面级字段互不重名时通过", () => {
      const result = validateNoSchemaConflict(
        { properties: { theme: {}, brand: {} } },
        {
          pageA: { properties: { title: {}, count: {} } },
          pageB: { properties: { description: {} } },
        },
      );
      expect(result.ok).toBe(true);
    });

    it("出现重名字段时返回冲突详情", () => {
      const result = validateNoSchemaConflict(
        { properties: { theme: {}, brand: {} } },
        {
          pageA: { properties: { theme: {}, title: {} } },
          pageB: { properties: { brand: {} } },
        },
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      // 字段按字母序排序：brand < theme
      expect(result.conflicts).toEqual([
        { field: "brand", pages: ["pageB"] },
        { field: "theme", pages: ["pageA"] },
      ]);
    });

    it("同一字段在多个页面冲突时合并 pages 列表", () => {
      const result = validateNoSchemaConflict(
        { properties: { brand: {} } },
        {
          pageA: { properties: { brand: {} } },
          pageB: { properties: { brand: {} } },
        },
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].field).toBe("brand");
      expect(result.conflicts[0].pages.sort()).toEqual(["pageA", "pageB"]);
    });
  });

  describe("validateNoSchemaConflictFromStrings", () => {
    it("解析失败的页面 Schema 不参与冲突校验", () => {
      const result = validateNoSchemaConflictFromStrings(
        JSON.stringify({ properties: { brand: {} } }),
        {
          good: JSON.stringify({ properties: { title: {} } }),
          broken: "{not-json",
        },
      );
      expect(result.ok).toBe(true);
    });

    it("能从字符串入口正确发现冲突", () => {
      const result = validateNoSchemaConflictFromStrings(
        JSON.stringify({ properties: { brand: {} } }),
        { pageA: JSON.stringify({ properties: { brand: {} } }) },
      );
      expect(result.ok).toBe(false);
    });
  });
});
