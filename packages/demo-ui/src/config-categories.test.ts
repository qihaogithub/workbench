import { describe, expect, it } from "vitest";

import {
  getSchemaFieldCountByBindings,
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
});
