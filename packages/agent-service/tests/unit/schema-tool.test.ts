import { describe, expect, it } from "vitest";

import { createSchemaValidateTool } from "../../src/backends/pi-tools/schema-tool";
import type { AgentConfig } from "../../src/core/types";

function createTool() {
  return createSchemaValidateTool({ sessionId: "schema-test" } as AgentConfig);
}

describe("schemaValidate UI verification boundary", () => {
  it("accepts both visibleWhen declaration forms without claiming live UI verification", async () => {
    const tool = createTool();
    const result = await tool.execute("schema-1", {
      schema: JSON.stringify({
        type: "object",
        properties: {
          showAd: { type: "boolean", default: true },
          directImage: {
            type: "string",
            visibleWhen: { field: "showAd", equals: true },
          },
          aliasImage: {
            type: "string",
            "ui:options": {
              visibleWhen: { field: "showAd", equals: true },
            },
          },
        },
      }),
    });

    expect(result.isError).toBeFalsy();
    expect(result.details).toMatchObject({
      valid: true,
      validationScope: "schema_contract",
      uiBehaviorVerified: false,
    });
    expect(result.content[0].text).toContain("schema contract only");
    expect(result.content[0].text).toContain("UI was not verified");
  });

  it("rejects eq while retaining the same explicit verification scope", async () => {
    const tool = createTool();
    const result = await tool.execute("schema-2", {
      schema: JSON.stringify({
        type: "object",
        properties: {
          showAd: { type: "boolean" },
          adImage: {
            type: "string",
            visibleWhen: { field: "showAd", eq: true },
          },
        },
      }),
    });

    expect(result.isError).toBe(true);
    expect(result.details).toMatchObject({
      valid: false,
      validationScope: "schema_contract",
      uiBehaviorVerified: false,
    });
    expect(result.content[0].text).toContain("VISIBLE_WHEN_INVALID");
  });
});
