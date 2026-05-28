import {
  mergeConfigToProps,
  mergeConfigWithUserValues,
  SchemaConflictError,
} from "../runtime-props";

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

describe("mergeConfigWithUserValues", () => {
  it("应删除 schema 中不存在的字段", () => {
    const currentConfig = { title: "Hello", oldField: "removed" };
    const newSchema = JSON.stringify({
      properties: { title: { default: "New Title" } },
    });

    const result = mergeConfigWithUserValues(currentConfig, newSchema);
    expect(result).toEqual({ title: "New Title" });
    expect("oldField" in result).toBe(false);
  });

  it("应保留用户修改过的字段值", () => {
    const currentConfig = { title: "User Title" };
    const oldSchema = JSON.stringify({
      properties: { title: { default: "Old Default" } },
    });
    const newSchema = JSON.stringify({
      properties: { title: { default: "Default Title" } },
    });

    const result = mergeConfigWithUserValues(currentConfig, newSchema, oldSchema);
    expect(result).toEqual({ title: "User Title" });
  });

  it("应使用新默认值当用户未修改时", () => {
    const currentConfig = { title: "Default Title" };
    const newSchema = JSON.stringify({
      properties: { title: { default: "New Default" } },
    });

    const result = mergeConfigWithUserValues(currentConfig, newSchema);
    expect(result).toEqual({ title: "New Default" });
  });

  it("应处理类型变化的字段", () => {
    const currentConfig = { count: "5" }; // 字符串
    const newSchema = JSON.stringify({
      properties: { count: { default: 10 } }, // 数字
    });

    const result = mergeConfigWithUserValues(currentConfig, newSchema);
    expect(result).toEqual({ count: 10 });
  });

  it("应保留 __order 元数据", () => {
    const currentConfig = { __order: ["title", "description"] };
    const newSchema = JSON.stringify({
      properties: { title: { default: "Title" } },
    });

    const result = mergeConfigWithUserValues(currentConfig, newSchema);
    expect(result.__order).toEqual(["title", "description"]);
  });

  it("应处理空配置", () => {
    const currentConfig = {};
    const newSchema = JSON.stringify({
      properties: { title: { default: "Title" } },
    });

    const result = mergeConfigWithUserValues(currentConfig, newSchema);
    expect(result).toEqual({ title: "Title" });
  });

  it("应处理空 schema", () => {
    const currentConfig = { title: "Title" };
    const newSchema = JSON.stringify({ properties: {} });

    const result = mergeConfigWithUserValues(currentConfig, newSchema);
    expect(result).toEqual({});
  });

  it("应使用旧 schema 检测用户修改", () => {
    const currentConfig = { title: "Modified Title" };
    const oldSchema = JSON.stringify({
      properties: { title: { default: "Old Default" } },
    });
    const newSchema = JSON.stringify({
      properties: { title: { default: "New Default" } },
    });

    // 用户修改过（与旧默认值不同）
    const result = mergeConfigWithUserValues(currentConfig, newSchema, oldSchema);
    expect(result).toEqual({ title: "Modified Title" });
  });

  it("未修改时应使用新默认值", () => {
    const currentConfig = { title: "Old Default" };
    const oldSchema = JSON.stringify({
      properties: { title: { default: "Old Default" } },
    });
    const newSchema = JSON.stringify({
      properties: { title: { default: "New Default" } },
    });

    // 用户未修改（与旧默认值相同）
    const result = mergeConfigWithUserValues(currentConfig, newSchema, oldSchema);
    expect(result).toEqual({ title: "New Default" });
  });
});
