import { mergeConfigToProps, SchemaConflictError } from "../runtime-props";

describe("运行时 Props 合并", () => {
  it("项目级缺失时返回页面级 default 值", () => {
    const pageSchema = JSON.stringify({
      properties: {
        title: { type: "string", default: "Hello" },
        count: { type: "number", default: 3 },
      },
    });
    const props = mergeConfigToProps(undefined, pageSchema);
    expect(props).toEqual({ title: "Hello", count: 3 });
  });

  it("项目级与页面级 default 值合并", () => {
    const projectSchema = JSON.stringify({
      properties: {
        theme: { type: "string", default: "dark" },
        brand: { type: "string", default: "Acme" },
      },
    });
    const pageSchema = JSON.stringify({
      properties: {
        title: { type: "string", default: "Hello" },
      },
    });
    const props = mergeConfigToProps(projectSchema, pageSchema);
    expect(props).toEqual({ theme: "dark", brand: "Acme", title: "Hello" });
  });

  it("没有 default 的字段不会出现在结果中", () => {
    const pageSchema = JSON.stringify({
      properties: {
        title: { type: "string", default: "Hello" },
        description: { type: "string" },
      },
    });
    const props = mergeConfigToProps(undefined, pageSchema);
    expect(props).toEqual({ title: "Hello" });
    expect("description" in props).toBe(false);
  });

  it("项目级与页面级字段冲突时抛出 SchemaConflictError", () => {
    const projectSchema = JSON.stringify({
      properties: { brand: { type: "string", default: "Acme" } },
    });
    const pageSchema = JSON.stringify({
      properties: { brand: { type: "string", default: "Other" } },
    });

    expect(() => mergeConfigToProps(projectSchema, pageSchema)).toThrow(
      SchemaConflictError,
    );

    try {
      mergeConfigToProps(projectSchema, pageSchema);
    } catch (err) {
      if (err instanceof SchemaConflictError) {
        expect(err.conflicts).toEqual(["brand"]);
      } else {
        throw err;
      }
    }
  });

  it("Schema JSON 非法时退化为空对象（不抛错）", () => {
    const props = mergeConfigToProps("{not-json", "{also-not-json");
    expect(props).toEqual({});
  });

  it("default 为 false / 0 / 空串等假值时仍会被注入", () => {
    const pageSchema = JSON.stringify({
      properties: {
        flag: { type: "boolean", default: false },
        count: { type: "number", default: 0 },
        text: { type: "string", default: "" },
      },
    });
    const props = mergeConfigToProps(undefined, pageSchema);
    expect(props).toEqual({ flag: false, count: 0, text: "" });
  });
});
