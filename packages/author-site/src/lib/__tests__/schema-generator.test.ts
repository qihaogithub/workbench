import { generateSchemaFromCode, mergeWithExistingSchema } from "../schema-generator";

describe("schema generator color contracts", () => {
  it("preserves nullable TypeScript unions as JSON Schema type arrays", () => {
    const schema = generateSchemaFromCode(`interface DemoProps {
  surface: string | null;
  opacity?: number | null;
}`);

    expect(schema?.properties.surface.type).toEqual(["string", "null"]);
    expect(schema?.properties.opacity.type).toEqual(["number", "null"]);
  });

  it("keeps explicit color format and presets when merging with generated fields", () => {
    const generated = generateSchemaFromCode(`interface DemoProps {
  surface: string | null;
}`)!;
    const merged = mergeWithExistingSchema(generated, {
      properties: {
        surface: {
          type: ["string", "null"],
          format: "color-opacity",
          default: null,
          "ui:options": {
            colorPresets: [{ label: "品牌蓝", value: "#2563EB" }],
          },
        },
      },
    });

    expect(merged.properties.surface).toMatchObject({
      type: ["string", "null"],
      format: "color-opacity",
      default: null,
      "ui:options": {
        colorPresets: [{ label: "品牌蓝", value: "#2563EB" }],
      },
    });
  });
});
