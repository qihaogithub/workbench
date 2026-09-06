import { describe, expect, it } from "vitest";
import { validateConfigSchemaContract } from "../../src/backends/pi-tools/schema-contract-validation";

const presentation = {
  version: 1,
  mode: "responsive-page",
  viewport: { width: 390, height: 844 },
  heightBehavior: "content",
  preset: "mobile",
  source: "user",
};

const validSpine = {
  type: "object",
  format: "spine",
  properties: {
    kind: { const: "spine" },
    version: { const: 1 },
    assetId: { type: "string", pattern: "^spine_[a-f0-9]{64}$" },
  },
  required: ["kind", "version", "assetId"],
  additionalProperties: false,
  "ui:options": { accept: ".zip" },
};

function schema(properties: Record<string, unknown>) {
  return { $demo: { presentation }, type: "object", properties };
}

describe("validateConfigSchemaContract", () => {
  it("accepts the atomic SpineAssetRef schema", () => {
    expect(validateConfigSchemaContract(schema({ spineAsset: validSpine }))).toEqual([]);
  });

  it("rejects a generic file ZIP pseudo-contract", () => {
    const issues = validateConfigSchemaContract(schema({
      spineSrc: { type: "string", format: "file", "ui:options": { accept: ".zip" } },
    }));
    expect(issues.map((issue) => issue.code)).toContain("SPINE_ZIP_PSEUDO_CONTRACT");
  });

  it("rejects split skeleton/atlas/texture upload fields", () => {
    const issues = validateConfigSchemaContract(schema({
      spine: {
        type: "object",
        properties: {
          skeleton: { type: "string", format: "file" },
          atlas: { type: "string", format: "file" },
          texture: { type: "string", format: "image" },
        },
      },
    }));
    expect(issues.map((issue) => issue.code)).toContain("SPINE_SPLIT_UPLOAD_FIELDS");
  });

  it("rejects an unregistered semantic format", () => {
    const issues = validateConfigSchemaContract(schema({ asset: { type: "string", format: "spine-bundle" } }));
    expect(issues.map((issue) => issue.code)).toContain("UNKNOWN_CONFIG_FORMAT");
  });

  it("accepts visibleWhen references inside oneOf array items", () => {
    const issues = validateConfigSchemaContract(schema({
      modules: {
        type: "array",
        items: {
          oneOf: [{
            properties: {
              type: { const: "excellentWorks" },
              showAd: { type: "boolean", default: true },
              adImage: {
                type: "string",
                format: "image",
                visibleWhen: { field: "showAd", equals: true },
              },
            },
          }],
        },
      },
    }));

    expect(issues).toEqual([]);
  });

  it("rejects malformed and missing nested visibleWhen references", () => {
    const issues = validateConfigSchemaContract(schema({
      modules: {
        type: "array",
        items: {
          variants: {
            excellentWorks: {
              properties: {
                adImage: {
                  type: "string",
                  visibleWhen: { field: "showAd", eq: true },
                },
              },
            },
          },
        },
      },
    }));

    expect(issues.map((issue) => issue.code)).toContain("VISIBLE_WHEN_INVALID");
  });

  it("rejects conflicting visibleWhen aliases", () => {
    const issues = validateConfigSchemaContract(schema({
      mode: { type: "string" },
      enabled: { type: "boolean" },
      detail: {
        type: "string",
        visibleWhen: { field: "mode", equals: "detail" },
        "ui:options": {
          visibleWhen: { field: "enabled", equals: true },
        },
      },
    }));

    expect(issues.map((issue) => issue.code)).toContain("VISIBLE_WHEN_CONFLICT");
  });

  it("rejects visibleWhen references outside the current object scope", () => {
    const issues = validateConfigSchemaContract(schema({
      showAd: { type: "boolean" },
      modules: {
        type: "array",
        items: {
          oneOf: [{
            properties: {
              type: { const: "excellentWorks" },
              adImage: {
                type: "string",
                visibleWhen: { field: "showAd", equals: true },
              },
            },
          }],
        },
      },
    }));

    expect(issues.map((issue) => issue.code)).toContain("VISIBLE_WHEN_FIELD_NOT_FOUND");
  });
});
