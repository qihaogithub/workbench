import { describe, it, expect } from "vitest";
import { compileConfigTs, decompileSchema } from "./config-compiler";

function compile(configTs: string): Record<string, unknown> {
  return JSON.parse(compileConfigTs(configTs));
}

function compileAndDecompile(configTs: string): string {
  const compiled = compileConfigTs(configTs);
  return decompileSchema(compiled);
}

describe("compileConfigTs — 多选（enum + multiple）", () => {
  it("编译多选枚举为 array + multiselect widget", () => {
    const schema = compile(`
      export default {
        "标签": {
          tags: { type: "enum", title: "标签", enum: ["a", "b", "c"], enumNames: ["A", "B", "C"], multiple: true, default: ["a"] }
        }
      }
    `);

    const tags = (schema.properties as Record<string, unknown>).tags as Record<string, unknown>;
    expect(tags.type).toBe("array");
    expect(tags["ui:widget"]).toBe("multiselect");
    expect(tags.default).toEqual(["a"]);

    const items = tags.items as Record<string, unknown>;
    expect(items.type).toBe("string");
    expect(items.enum).toEqual(["a", "b", "c"]);
    expect(items.enumNames).toEqual(["A", "B", "C"]);
  });

  it("编译多选枚举不含 enum 到顶层", () => {
    const schema = compile(`
      export default {
        "标签": {
          tags: { type: "enum", title: "标签", enum: ["x", "y"], multiple: true }
        }
      }
    `);

    const tags = (schema.properties as Record<string, unknown>).tags as Record<string, unknown>;
    expect(tags.enum).toBeUndefined();
  });

  it("编译多选枚举不含 enumNames 到顶层", () => {
    const schema = compile(`
      export default {
        "标签": {
          tags: { type: "enum", title: "标签", enum: ["x", "y"], multiple: true }
        }
      }
    `);

    const tags = (schema.properties as Record<string, unknown>).tags as Record<string, unknown>;
    expect(tags.enumNames).toBeUndefined();
  });

  it("编译多选无 default 时 default 为 undefined", () => {
    const schema = compile(`
      export default {
        "标签": {
          tags: { type: "enum", title: "标签", enum: ["x"], multiple: true }
        }
      }
    `);

    const tags = (schema.properties as Record<string, unknown>).tags as Record<string, unknown>;
    expect(tags.default).toBeUndefined();
  });
});

describe("compileConfigTs — 级联选择（type: cascade）", () => {
  it("编译级联选择为 array + cascade widget", () => {
    const schema = compile(`
      export default {
        "地区": {
          region: {
            type: "cascade",
            title: "地区",
            options: [
              { value: "zhejiang", label: "浙江", children: [{ value: "hangzhou", label: "杭州" }] },
              { value: "jiangsu", label: "江苏", children: [{ value: "nanjing", label: "南京" }] }
            ]
          }
        }
      }
    `);

    const region = (schema.properties as Record<string, unknown>).region as Record<string, unknown>;
    expect(region.type).toBe("array");
    expect(region["ui:widget"]).toBe("cascade");

    const uiOptions = region["ui:options"] as Record<string, unknown>;
    const cascadeOptions = uiOptions.cascadeOptions as unknown[];
    expect(cascadeOptions).toHaveLength(2);
    expect((cascadeOptions[0] as Record<string, unknown>).value).toBe("zhejiang");
  });

  it("编译级联选择带 default", () => {
    const schema = compile(`
      export default {
        "地区": {
          region: {
            type: "cascade",
            title: "地区",
            default: ["zhejiang", "hangzhou"],
            options: [
              { value: "zhejiang", label: "浙江", children: [{ value: "hangzhou", label: "杭州" }] }
            ]
          }
        }
      }
    `);

    const region = (schema.properties as Record<string, unknown>).region as Record<string, unknown>;
    expect(region.default).toEqual(["zhejiang", "hangzhou"]);
  });
});

describe("compileConfigTs — 普通 enum 不受影响", () => {
  it("普通 enum 仍编译为 string", () => {
    const schema = compile(`
      export default {
        "模式": {
          mode: { type: "enum", title: "模式", enum: ["a", "b"], enumNames: ["A", "B"], default: "a" }
        }
      }
    `);

    const mode = (schema.properties as Record<string, unknown>).mode as Record<string, unknown>;
    expect(mode.type).toBe("string");
    expect(mode["ui:widget"]).toBeUndefined();
    expect(mode.enum).toEqual(["a", "b"]);
    expect(mode.enumNames).toEqual(["A", "B"]);
    expect(mode.default).toBe("a");
  });
});

describe("decompileSchema — 多选", () => {
  it("反编译 multiselect schema", () => {
    const schema = JSON.stringify({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        tags: {
          type: "array",
          title: "标签",
          "ui:widget": "multiselect",
          default: ["a"],
          items: {
            type: "string",
            enum: ["a", "b", "c"],
            enumNames: ["A", "B", "C"],
          },
          "ui:options": { group: "标签" },
        },
      },
    });

    const configTs = decompileSchema(schema);
    expect(configTs).toContain('"type": "enum"');
    expect(configTs).toContain('"multiple": true');
    expect(configTs).toContain('"enum":');
    expect(configTs).toContain('"a"');
    expect(configTs).toContain('"b"');
    expect(configTs).toContain('"c"');
    expect(configTs).toContain('"enumNames":');
    expect(configTs).toContain('"A"');
    expect(configTs).toContain('"B"');
    expect(configTs).toContain('"C"');
  });

  it("反编译 multiselect schema 不含无意义的 widget", () => {
    const schema = JSON.stringify({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        tags: {
          type: "array",
          title: "标签",
          "ui:widget": "multiselect",
          items: {
            type: "string",
            enum: ["a"],
          },
          "ui:options": { group: "标签" },
        },
      },
    });

    const configTs = decompileSchema(schema);
    expect(configTs).not.toContain('widget: "multiselect"');
  });
});

describe("decompileSchema — 级联", () => {
  it("反编译 cascade schema", () => {
    const schema = JSON.stringify({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        region: {
          type: "array",
          title: "地区",
          "ui:widget": "cascade",
          default: ["zhejiang", "hangzhou"],
          "ui:options": {
            group: "地区",
            cascadeOptions: [
              { value: "zhejiang", label: "浙江", children: [{ value: "hangzhou", label: "杭州" }] },
            ],
          },
        },
      },
    });

    const configTs = decompileSchema(schema);
    expect(configTs).toContain('"type": "cascade"');
    expect(configTs).toContain("zhejiang");
    expect(configTs).toContain("hangzhou");
    expect(configTs).toContain('"options": [');
    expect(configTs).toContain("浙江");
    expect(configTs).toContain("杭州");
    expect(configTs).not.toContain('widget: "cascade"');
  });

  it("反编译 cascade schema 不含无意义的 widget", () => {
    const schema = JSON.stringify({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        region: {
          type: "array",
          title: "地区",
          "ui:widget": "cascade",
          "ui:options": {
            group: "地区",
            cascadeOptions: [
              { value: "a", label: "A" },
            ],
          },
        },
      },
    });

    const configTs = decompileSchema(schema);
    expect(configTs).not.toContain('widget: "cascade"');
  });
});

describe("往返测试", () => {
  it("多选 compile → decompile 往返", () => {
    const configTs = `
export default {
  "标签": {
    tags: { type: "enum", title: "标签", enum: ["a", "b"], enumNames: ["A", "B"], multiple: true, default: ["a"] },
  },
};
`.trim();

    const roundtripped = compileAndDecompile(configTs);
    expect(roundtripped).toContain('"type": "enum"');
    expect(roundtripped).toContain('"multiple": true');
    expect(roundtripped).toContain('"enum":');
    expect(roundtripped).toContain('"a"');
    expect(roundtripped).toContain('"b"');
    expect(roundtripped).toContain('"enumNames":');
    expect(roundtripped).toContain('"A"');
    expect(roundtripped).toContain('"B"');
    expect(roundtripped).toContain("[");
  });

  it("级联 compile → decompile 往返", () => {
    const configTs = `
export default {
  "地区": {
    region: {
      type: "cascade",
      title: "地区",
      default: ["zhejiang", "hangzhou"],
      options: [
        { value: "zhejiang", label: "浙江", children: [{ value: "hangzhou", label: "杭州" }] },
      ],
    },
  },
};
`.trim();

    const roundtripped = compileAndDecompile(configTs);
    expect(roundtripped).toContain('"type": "cascade"');
    expect(roundtripped).toContain("zhejiang");
    expect(roundtripped).toContain("hangzhou");
    expect(roundtripped).toContain('"options": [');
  });
});
