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

  it("recursively parses oneOf arrays nested inside oneOf object arrays", () => {
    const groups = parseSchemaToFields(JSON.stringify({
      type: "object",
      properties: {
        modules: {
          type: "array",
          title: "模块",
          items: {
            oneOf: [{
              title: "关卡模块",
              properties: {
                type: { const: "level" },
                levels: {
                  type: "array",
                  title: "关卡图",
                  items: {
                    oneOf: [{
                      title: "关卡卡片",
                      properties: {
                        type: { const: "levelCard" },
                        position: {
                          type: "position",
                          title: "坐标",
                          key: "levelCard",
                          size: { width: 375, height: 656 },
                        },
                      },
                    }],
                  },
                },
              },
            }],
          },
        },
      },
    }), { levelCard: 3 });

    const modules = groups.flatMap((group) => group.fields)
      .find((field) => field.key === "modules");
    const levels = modules?.oneOf?.variants[0]?.fields
      .find((field) => field.key === "levels");
    const position = levels?.oneOf?.variants[0]?.fields
      .find((field) => field.key === "position");

    expect(levels?.oneOf?.variants[0]?.title).toBe("关卡卡片");
    expect(levels?.oneOf?.variants[0]?.maxItems).toBe(3);
    expect(position).toEqual(expect.objectContaining({
      type: "position",
      positionable: { key: "levelCard", size: { width: 375, height: 656 } },
    }));
  });
});
