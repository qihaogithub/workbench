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

  it("keeps semantic spine fields atomic while expanding ordinary objects", () => {
    const groups = parseSchemaToFields(JSON.stringify({
      type: "object",
      properties: {
        spineAsset: {
          type: "object",
          format: "spine",
          title: "Spine 素材",
          properties: { kind: { const: "spine" }, version: { const: 1 }, assetId: { type: "string" } },
        },
        settings: {
          type: "object",
          title: "普通设置",
          properties: { enabled: { type: "boolean" } },
        },
      },
    }));

    const fields = groups.flatMap((group) => group.fields);
    expect(fields.map((field) => field.key)).toEqual(["spineAsset", "enabled"]);
    expect(fields.find((field) => field.key === "spineAsset")?.format).toBe("spine");
    expect(fields.find((field) => field.key === "enabled")?.uiOptions?.group).toBe("普通设置");
  });
});
