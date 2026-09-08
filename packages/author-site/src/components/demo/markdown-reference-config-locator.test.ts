import { enumerateSchemaFields } from "@workbench/shared/demo/config-schema-fields";
import { resolveReferenceConfigDefinition } from "./markdown-reference-config-locator";

describe("配置引用定位 Schema 定义", () => {
  const schema = JSON.stringify({ type: "object", properties: {
    cards: { type: "array", title: "卡片", items: { type: "object", properties: {
      title: { type: "string", title: "卡片标题", default: "默认值" },
    } } },
  } });
  it("后端目录嵌套路径直接定位定义，无需数组数据实例", () => {
    const field = enumerateSchemaFields(schema).find((entry) => entry.key === "cards[].title");
    expect(field).toBeDefined();
    const target = resolveReferenceConfigDefinition(schema, "page", field!.key);
    expect(target.draft?.title).toBe("卡片标题");
    expect(target.draft?.default).toBe("默认值");
  });
  it("定义删除后拒绝打开，不定位邻近字段", () => {
    expect(() => resolveReferenceConfigDefinition(schema, "page", "cards[].missing")).toThrow();
    expect(() => resolveReferenceConfigDefinition(schema, "page", "cards[0].title")).toThrow();
    expect(() => resolveReferenceConfigDefinition(schema, "page", "cards.title")).toThrow();
  });
  it("精确覆盖 oneOf 分支目录键，不将分支定位到父字段", () => {
    const branchSchema = JSON.stringify({ type: "object", properties: {
      rows: { type: "array", title: "Rows", items: { oneOf: [
        { title: "图片分支", properties: { type: { const: "image" }, title: { type: "string", title: "图片标题" } } },
        { title: "文字分支", properties: { type: { const: "text" }, title: { type: "string", title: "文字标题" } } },
        { title: "无判别字段", properties: { other: { type: "string", title: "其他" } } },
      ] } },
    }, oneOf: [{ title: "根分支", properties: { kind: { const: "root" }, name: { type: "string", title: "根名称" } } }] });
    for (const field of enumerateSchemaFields(branchSchema)) {
      const target = resolveReferenceConfigDefinition(branchSchema, "page", field.key);
      expect(target.field).toEqual(field);
      if (field.isBranch) expect(target.draft).toBeUndefined();
    }
    expect(resolveReferenceConfigDefinition(branchSchema, "page", "rows[type=image].title").draft?.title).toBe("图片标题");
    expect(resolveReferenceConfigDefinition(branchSchema, "page", "rows[type=text].title").draft?.title).toBe("文字标题");
    const branch = resolveReferenceConfigDefinition(branchSchema, "page", "rows[type=image]");
    expect(branch.field.title).toBe("图片分支");
    expect(branch.draft).toBeUndefined();
  });
});
