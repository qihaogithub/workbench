import { describe, expect, it } from "vitest";
import { StatelessModelInvoker } from "../../src/services/stateless-model-invoker";

function createInvoker(response: unknown, capture: { options?: unknown } = {}) {
  return new StatelessModelInvoker({
    modelManagerFactory: () => ({
      resolveProviderAndModel: () => ({ provider: "test-provider", modelId: "test-model" }),
      getModel: () => ({ id: "test-model" }),
      getApiKeyAndHeaders: async () => ({ apiKey: "test-key", headers: { "x-test": "1" } }),
    } as never),
    complete: async (_model, context, options) => {
      expect(context).toEqual(expect.objectContaining({ tools: [], messages: expect.any(Array) }));
      capture.options = options;
      return response;
    },
  });
}

const input = {
  canonicalUri: "wb://project/project-1",
  resourceType: "project",
  native: { name: "Project", aliases: [], description: "A project" },
  evidence: [{ sourceKind: "project-metadata", selector: "project-metadata", content: "evidence" }],
};

describe("StatelessModelInvoker", () => {
  it("accepts only the fixed summary object and disables tools/retries", async () => {
    const capture: { options?: unknown } = {};
    const result = await createInvoker(JSON.stringify({ summary: "A concise summary" }), capture).complete(input);

    expect(result.summary).toBe("A concise summary");
    expect(result.provider).toBe("test-provider");
    expect(result.profileHash).toMatch(/^[a-f0-9]{64}$/);
    expect(capture.options).toEqual(expect.objectContaining({ maxRetries: 0, maxTokens: 512 }));
  });

  it("rejects markdown fences and extra output keys", async () => {
    await expect(createInvoker("```json\n{\"summary\":\"bad\"}\n```").complete(input)).rejects.toThrow("INVENTORY_INVALID_OUTPUT");
    await expect(createInvoker(JSON.stringify({ summary: "ok", extra: true })).complete(input)).rejects.toThrow("INVENTORY_INVALID_OUTPUT");
  });
});
