import { describe, expect, it } from "vitest";
import {
  applySchemaDefinitionCommand,
  readConfigDefinitionFields,
} from "@workbench/shared/demo/config-schema-definition";

const SCHEMA = JSON.stringify({
  type: "object",
  properties: { heroImage: { type: "string", format: "image", default: "old" } },
});

const ENUM_SCHEMA = JSON.stringify({
  type: "object",
  properties: {
    layout: {
      type: "string",
      title: "布局",
      enum: ["list", "grid"],
      "ui:widget": "segmented",
    },
  },
});

describe("configuration definition mutations", () => {
  it("does not add enum presentation metadata to non-enum fields", () => {
    expect(readConfigDefinitionFields(SCHEMA).find((item) => item.key === "heroImage")?.enumWidget).toBeUndefined();
  });

  it("round-trips enum presentation widgets and can return to the default select", () => {
    const added = applySchemaDefinitionCommand(SCHEMA, {
      type: "field.add",
      field: { key: "layout", title: "布局", kind: "enum", enum: ["list", "grid"], enumWidget: "segmented", default: "list" },
    });
    expect(JSON.parse(added.schema).properties.layout["ui:widget"]).toBe("segmented");

    const field = readConfigDefinitionFields(ENUM_SCHEMA).find((item) => item.key === "layout");
    expect(field?.enumWidget).toBe("segmented");

    const radio = applySchemaDefinitionCommand(ENUM_SCHEMA, {
      type: "field.update",
      key: "layout",
      patch: { enumWidget: "radio" },
    });
    expect(JSON.parse(radio.schema).properties.layout["ui:widget"]).toBe("radio");

    const select = applySchemaDefinitionCommand(radio.schema, {
      type: "field.update",
      key: "layout",
      patch: { enumWidget: "select" },
    });
    expect(JSON.parse(select.schema).properties.layout["ui:widget"]).toBeUndefined();
    expect(readConfigDefinitionFields(select.schema).find((item) => item.key === "layout")?.enumWidget).toBe("select");
  });

  it("adds image constraints using one rule per dimension", () => {
    const result = applySchemaDefinitionCommand(SCHEMA, {
      type: "field.update",
      key: "heroImage",
      patch: { widthRule: { operator: "≥", value: 320 }, heightRule: { operator: "=", value: 1280 }, maxSize: 2048 },
    });
    const parsed = JSON.parse(result.schema);
    expect(parsed.properties.heroImage["ui:options"]).toEqual({ widthRule: { operator: "≥", value: 320 }, heightRule: { operator: "=", value: 1280 }, maxSize: 2048 });
    expect(result.diff.updated).toEqual(["heroImage"]);
  });

  it("creates a video field with an object value and hidden preview options", () => {
    const result = applySchemaDefinitionCommand(SCHEMA, {
      type: "field.add",
      field: { key: "heroVideo", title: "主视频", kind: "video", default: { url: "", poster: "" } },
    });
    const video = JSON.parse(result.schema).properties.heroVideo;
    expect(video.format).toBe("video");
    expect(video.type).toBe("object");
    expect(video.required).toEqual(["url"]);
    expect(video["ui:options"]).toEqual({ accept: "video/mp4,video/webm", videoPreviewStyle: "controls" });
    expect(readConfigDefinitionFields(result.schema).find((field) => field.key === "heroVideo")?.kind).toBe("video");
  });

  it("updates required fields and produces a value cleanup plan for deletion", () => {
    const added = applySchemaDefinitionCommand(SCHEMA, {
      type: "field.add",
      field: { key: "headline", title: "标题", kind: "text", default: "Hello", required: true, group: "基础信息" },
    });
    expect(readConfigDefinitionFields(added.schema).find((field) => field.key === "headline")?.group).toBe("基础信息");
    expect(JSON.parse(added.schema).required).toEqual(["headline"]);
    const deleted = applySchemaDefinitionCommand(added.schema, { type: "field.delete", key: "headline" });
    expect(deleted.valuePlan.removeKeys).toEqual(["headline"]);
    expect(JSON.parse(deleted.schema).required).toBeUndefined();
  });

  it("renames a group and only ungroups fields after an explicit delete disposition", () => {
    const grouped = applySchemaDefinitionCommand(SCHEMA, {
      type: "field.add", field: { key: "headline", title: "标题", kind: "text", default: "", group: "基础信息" },
    });
    const renamed = applySchemaDefinitionCommand(grouped.schema, { type: "group.rename", from: "基础信息", to: "文案" });
    expect(readConfigDefinitionFields(renamed.schema).find((field) => field.key === "headline")?.group).toBe("文案");
    const ungrouped = applySchemaDefinitionCommand(renamed.schema, { type: "group.delete", group: "文案", disposition: "ungroup" });
    expect(readConfigDefinitionFields(ungrouped.schema).find((field) => field.key === "headline")?.group).toBeUndefined();
  });

  it("keeps sortable object-array items when only its display name changes", () => {
    const sortableSchema = JSON.stringify({
      type: "object",
      properties: {
        modules: {
          type: "array",
          title: "模块列表",
          items: {
            type: "object",
            oneOf: [
              { title: "文本项", properties: { content: { type: "string" } } },
              { title: "图片项", properties: { image: { type: "string", format: "image" } } },
            ],
          },
          "ui:options": { sortable: true, group: "内容" },
        },
      },
    });
    const original = JSON.parse(sortableSchema).properties.modules;
    const draft = readConfigDefinitionFields(sortableSchema).find((field) => field.key === "modules")!;

    const result = applySchemaDefinitionCommand(sortableSchema, {
      type: "field.update",
      key: "modules",
      // The editor submits its complete draft, which currently represents an
      // arbitrary array as `images`. Renaming must not turn it into one.
      patch: { ...draft, title: "页面模块" },
    });

    const modules = JSON.parse(result.schema).properties.modules;
    expect(modules).toEqual({ ...original, title: "页面模块" });
    expect(result.diff.typeChanged).toEqual([]);
  });
});
