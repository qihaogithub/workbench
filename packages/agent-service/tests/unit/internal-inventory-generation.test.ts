import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { encodeMarkdownReferenceUri } from "@workbench/shared";
import { registerInternalInventoryGenerationRoutes } from "../../src/routes/internal-inventory-generation";

describe("internal inventory generation route", () => {
  const token = "inventory-test-token";

  afterEach(() => {
    delete process.env.INTERNAL_API_TOKEN;
  });

  function requestPayload() {
    return {
      projectId: "project-1",
      workspaceId: "workspace-1",
      taskKey: "project-1:1:wb://project/project-1:fingerprint:inventory-summary-v2",
      generationId: 1,
      attemptId: "attempt-1",
      leaseToken: "lease-1",
      canonicalUri: encodeMarkdownReferenceUri({ kind: "project", projectId: "project-1" }),
      sourceFingerprint: "fingerprint",
      generatorVersion: "inventory-summary-v2",
      resourceType: "project",
      native: { name: "Project", aliases: [], description: "A project" },
      evidenceRefs: [{
        sourceUri: encodeMarkdownReferenceUri({ kind: "project", projectId: "project-1" }),
        sourceKind: "project-metadata",
        contentHash: "root-hash",
        selector: "project-metadata",
      }],
    };
  }

  it("requires internal authentication", async () => {
    process.env.INTERNAL_API_TOKEN = token;
    const app = Fastify();
    await registerInternalInventoryGenerationRoutes(app, {
      token,
      evidenceReader: { read: async () => "evidence" },
      invoker: { complete: async () => ({ summary: "summary", provider: "test", model: "model", profileHash: "hash" }) },
    });

    const response = await app.inject({ method: "POST", url: "/internal/inventory/generate", payload: requestPayload() });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("reads bounded evidence and invokes the stateless generator", async () => {
    const evidenceReader = { read: async () => "evidence" };
    const complete = async (input: { evidence: Array<{ content: string }> }) => {
      expect(input.evidence).toEqual([{ sourceKind: "project-metadata", selector: "project-metadata", content: "evidence" }]);
      return { summary: "A generated summary", provider: "test", model: "model", profileHash: "hash" };
    };
    const app = Fastify();
    await registerInternalInventoryGenerationRoutes(app, {
      token,
      evidenceReader,
      invoker: { complete },
    });

    const response = await app.inject({
      method: "POST",
      url: "/internal/inventory/generate",
      headers: { authorization: `Bearer ${token}` },
      payload: requestPayload(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.summary).toBe("A generated summary");
    await app.close();
  });

  it("rejects malformed canonical references before reading evidence", async () => {
    const app = Fastify();
    let readCount = 0;
    await registerInternalInventoryGenerationRoutes(app, {
      token,
      evidenceReader: { read: async () => { readCount++; return "evidence"; } },
      invoker: { complete: async () => ({ summary: "summary", provider: "test", model: "model", profileHash: "hash" }) },
    });
    const payload = requestPayload();
    payload.canonicalUri = "wb://project/other-project";

    const response = await app.inject({
      method: "POST",
      url: "/internal/inventory/generate",
      headers: { "x-internal-token": token },
      payload,
    });

    expect(response.statusCode).toBe(400);
    expect(readCount).toBe(0);
    await app.close();
  });
});
