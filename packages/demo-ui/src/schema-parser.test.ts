import { describe, expect, it } from "vitest";
import { parseSchemaToFields } from "./schema-parser";

describe("parseSchemaToFields grouping", () => {
  it("only creates a group section when ui:options.group is explicit", () => {
    const groups = parseSchemaToFields(JSON.stringify({
      type: "object",
      properties: {
        heroImage: { type: "string", format: "image", title: "主视觉图片" },
        accentColor: { type: "string", format: "color", title: "强调色", "ui:options": { group: "品牌" } },
      },
    }));

    expect(groups.map((group) => group.title)).toEqual(["", "品牌"]);
    expect(groups[0]?.fields.map((field) => field.key)).toEqual(["heroImage"]);
  });
});
