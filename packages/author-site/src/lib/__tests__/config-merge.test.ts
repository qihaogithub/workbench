import { mergeSchemaDefaults } from "../config-merge";

describe("mergeSchemaDefaults", () => {
  const basicSchema = JSON.stringify({
    type: "object",
    properties: {
      title: { type: "string", default: "Hello" },
      count: { type: "number", default: 5 },
      visible: { type: "boolean", default: true },
    },
  });

  it("should use schema defaults when existing config is empty", () => {
    const result = mergeSchemaDefaults({}, basicSchema);
    expect(result.title).toBe("Hello");
    expect(result.count).toBe(5);
    expect(result.visible).toBe(true);
  });

  it("should preserve existing values that match schema type", () => {
    const existing = { title: "Custom Title", count: 10, visible: false };
    const result = mergeSchemaDefaults(existing, basicSchema);
    expect(result.title).toBe("Custom Title");
    expect(result.count).toBe(10);
    expect(result.visible).toBe(false);
  });

  it("should use defaults for new fields not in existing config", () => {
    const existing = { title: "My Title" };
    const result = mergeSchemaDefaults(existing, basicSchema);
    expect(result.title).toBe("My Title");
    expect(result.count).toBe(5);
    expect(result.visible).toBe(true);
  });

  it("should remove fields not present in new schema", () => {
    const existing = { title: "Hello", oldField: "should be removed" };
    const result = mergeSchemaDefaults(existing, basicSchema);
    expect(result.oldField).toBeUndefined();
    expect(result.title).toBe("Hello");
  });

  it("should use new default when field type changes", () => {
    // Schema changes count from number to string
    const newSchema = JSON.stringify({
      type: "object",
      properties: {
        title: { type: "string", default: "Hello" },
        count: { type: "string", default: "five" },
      },
    });
    const existing = { title: "Hello", count: 42 }; // number, but schema expects string
    const result = mergeSchemaDefaults(existing, newSchema);
    expect(result.count).toBe("five"); // use new default, not old number value
  });

  it("should handle __order from $demo.orderable", () => {
    const schemaWithOrder = JSON.stringify({
      type: "object",
      $demo: { orderable: ["visible", "title", "count"] },
      properties: {
        title: { type: "string", default: "Hello" },
        count: { type: "number", default: 5 },
        visible: { type: "boolean", default: true },
      },
    });
    const result = mergeSchemaDefaults({}, schemaWithOrder);
    expect(result.__order).toEqual(["visible", "title", "count"]);
  });

  it("should generate __order from property keys when no orderable", () => {
    const result = mergeSchemaDefaults({}, basicSchema);
    expect(result.__order).toEqual(["title", "count", "visible"]);
  });

  it("should handle invalid JSON schema gracefully", () => {
    const existing = { foo: "bar" };
    const result = mergeSchemaDefaults(existing, "not valid json");
    expect(result).toEqual({ foo: "bar" });
  });

  it("should handle schema with no properties", () => {
    const emptySchema = JSON.stringify({ type: "object" });
    const result = mergeSchemaDefaults({ old: "value" }, emptySchema);
    expect(result).toEqual({});
  });

  it("should skip null/undefined existing values and use defaults", () => {
    const existing = { title: null, count: undefined };
    const result = mergeSchemaDefaults(
      existing as Record<string, unknown>,
      basicSchema,
    );
    expect(result.title).toBe("Hello");
    expect(result.count).toBe(5);
  });

  it("should handle array type fields", () => {
    const schema = JSON.stringify({
      type: "object",
      properties: {
        tags: { type: "array", default: ["a", "b"] },
      },
    });
    const existing = { tags: ["custom"] };
    const result = mergeSchemaDefaults(existing, schema);
    expect(result.tags).toEqual(["custom"]); // preserve existing array

    const existingWrongType = { tags: "not an array" };
    const result2 = mergeSchemaDefaults(existingWrongType, schema);
    expect(result2.tags).toEqual(["a", "b"]); // use default for wrong type
  });
});
