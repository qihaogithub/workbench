import { describe, expect, it } from "vitest";

import { getSchemaFieldCountByBindings } from "./config-categories";

const schema = JSON.stringify({
  type: "object",
  properties: {
    bound: { type: "string" },
    unbound: { type: "string" },
  },
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
