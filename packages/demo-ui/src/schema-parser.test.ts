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
          $demo: { sortable: true },
          items: {
            oneOf: [{
              title: "关卡模块",
              properties: {
                type: { const: "level" },
                levels: {
                  type: "array",
                  title: "关卡图",
                  $demo: { sortable: false },
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

    expect(modules?.sortable).toBe(true);
    expect(levels?.sortable).toBe(false);
    expect(levels?.oneOf?.variants[0]?.title).toBe("关卡卡片");
    expect(levels?.oneOf?.variants[0]?.maxItems).toBe(3);
    expect(position).toEqual(expect.objectContaining({
      type: "position",
      positionable: { key: "levelCard", size: { width: 375, height: 656 } },
    }));
  });

  it("reads object-array sorting only from the explicit $demo capability", () => {
    const groups = parseSchemaToFields(JSON.stringify({
      type: "object",
      properties: {
        tree: {
          type: "array",
          title: "层级列表",
          $demo: { sortable: false },
          items: { type: "object", properties: { label: { type: "string" } } },
        },
        ignoredUiOption: {
          type: "array",
          title: "忽略旧 UI 选项",
          "ui:options": { sortable: true },
          items: { type: "object", properties: { label: { type: "string" } } },
        },
        demoWins: {
          type: "array",
          title: "新声明优先",
          $demo: { sortable: false },
          "ui:options": { sortable: true },
          items: { type: "object", properties: { label: { type: "string" } } },
        },
        ordered: {
          type: "array",
          title: "可排序列表",
          $demo: { sortable: true },
          items: { type: "object", properties: { label: { type: "string" } } },
        },
        unconfigured: {
          type: "array",
          title: "未声明列表",
          items: { type: "object", properties: { label: { type: "string" } } },
        },
        invalidDeclaration: {
          type: "array",
          title: "非法声明列表",
          $demo: { sortable: "true" },
          items: { type: "object", properties: { label: { type: "string" } } },
        },
      },
    }));

    const fields = groups.flatMap((group) => group.fields);
    expect(fields.find((field) => field.key === "tree")?.sortable).toBe(false);
    expect(fields.find((field) => field.key === "ignoredUiOption")?.sortable).toBe(false);
    expect(fields.find((field) => field.key === "demoWins")?.sortable).toBe(false);
    expect(fields.find((field) => field.key === "ordered")?.sortable).toBe(true);
    expect(fields.find((field) => field.key === "unconfigured")?.sortable).toBe(false);
    expect(fields.find((field) => field.key === "invalidDeclaration")?.sortable).toBe(false);
  });
});
