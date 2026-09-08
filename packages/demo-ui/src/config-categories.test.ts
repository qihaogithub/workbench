import { describe, expect, it } from "vitest";

import {
  configFieldMatchesTypeFilter,
  getSchemaFieldCountByBindings,
  getSchemaFieldCountByType,
  getConfigFieldType,
  filterConfigValuesByType,
  stripConfigSchemaByType,
} from "./config-categories";

const schema = JSON.stringify({
  type: "object",
  properties: {
    bound: { type: "string" },
    unbound: { type: "string" },
  },
});

describe("配置字段语义", () => {
  it("默认资源字段并识别业务字段标记", () => {
    expect(getConfigFieldType({ type: "string" })).toBe("resource");
    expect(getConfigFieldType({ "ui:options": { configType: "business" } })).toBe("business");
    expect(getConfigFieldType({ "$demo": { configType: "business" } })).toBe("business");
  });

  it("按字段语义筛选时将未标注字段视为资源配置", () => {
    expect(configFieldMatchesTypeFilter({ uiOptions: {} }, "resource")).toBe(true);
    expect(configFieldMatchesTypeFilter({ uiOptions: {} }, "business")).toBe(false);
    expect(configFieldMatchesTypeFilter(
      { uiOptions: { configType: "business" } },
      "business",
    )).toBe(true);
  });

  it("查看端移除业务字段并同步清理 required", () => {
    const result = stripConfigSchemaByType(
      JSON.stringify({
        type: "object",
        properties: {
          logo: { type: "string" },
          enabled: { type: "boolean", "ui:options": { configType: "business" } },
        },
        required: ["logo", "enabled"],
      }),
      "business",
    );
    expect(JSON.parse(result ?? "{}")).toEqual({
      type: "object",
      properties: { logo: { type: "string" } },
      required: ["logo"],
    });
  });

  it("查看端会过滤会话覆盖中的业务字段", () => {
    expect(filterConfigValuesByType(
      JSON.stringify({
        type: "object",
        properties: {
          logo: { type: "string" },
          enabled: { type: "boolean", "ui:options": { configType: "business" } },
        },
      }),
      { logo: "x", enabled: true, extension: 1 },
      "business",
    )).toEqual({ logo: "x", extension: 1 });
  });

  it("会递归过滤对象和数组中的业务字段", () => {
    expect(filterConfigValuesByType(
      JSON.stringify({
        type: "object",
        properties: {
          options: {
            type: "object",
            properties: {
              label: { type: "string" },
              internal: { type: "boolean", "ui:options": { configType: "business" } },
            },
          },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                enabled: { type: "boolean", "ui:options": { configType: "business" } },
              },
            },
          },
        },
      }),
      {
        options: { label: "可见", internal: true },
        items: [{ name: "A", enabled: true }],
      },
      "business",
    )).toEqual({
      options: { label: "可见" },
      items: [{ name: "A" }],
    });
  });
});

describe("getSchemaFieldCountByBindings", () => {
  it("统计全部项目字段和页面绑定字段", () => {
    expect(getSchemaFieldCountByBindings(schema, undefined)).toBe(2);
    expect(getSchemaFieldCountByBindings(schema, ["bound"])).toBe(1);
  });

  it("显式空绑定表示页面不消费项目字段", () => {
    expect(getSchemaFieldCountByBindings(schema, [])).toBe(0);
  });

  it("Schema 未加载时返回 0，由调用方负责区分未知状态", () => {
    expect(getSchemaFieldCountByBindings(undefined, [])).toBe(0);
  });

  it("可按语义及分类统计绑定字段", () => {
    const typedSchema = JSON.stringify({
      type: "object",
      properties: {
        resource: { type: "string", "ui:options": { category: "设计" } },
        business: {
          type: "boolean",
          "ui:options": { category: "设计", configType: "business" },
        },
        otherBusiness: {
          type: "boolean",
          "ui:options": { category: "动效", configType: "business" },
        },
      },
    });

    expect(getSchemaFieldCountByType(typedSchema, "resource")).toBe(1);
    expect(getSchemaFieldCountByType(typedSchema, "business")).toBe(2);
    expect(getSchemaFieldCountByType(typedSchema, "business", "设计")).toBe(1);
    expect(getSchemaFieldCountByBindings(
      typedSchema,
      ["resource", "business"],
      "设计",
      "business",
    )).toBe(1);
  });
});
