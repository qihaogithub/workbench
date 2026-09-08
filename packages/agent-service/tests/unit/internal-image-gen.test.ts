import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerInternalImageGenRoutes } from "../../src/routes/internal-image-gen";
import { resetImageGenConfig } from "../../src/services/image-gen-config";

describe("internal image generation routes", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetImageGenConfig();
    process.env.INTERNAL_API_TOKEN = "test-token";
    process.env.IMAGE_GEN_ENABLED = "true";
    process.env.IMAGE_GEN_API_KEY = "key";
    process.env.IMAGE_GEN_MODEL = "gpt-image-1";
  });
  it("requires internal token and returns capabilities", async () => {
    const app = Fastify();
    await registerInternalImageGenRoutes(app);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/internal/image-gen/capabilities",
        })
      ).statusCode,
    ).toBe(401);
    const res = await app.inject({
      method: "GET",
      url: "/internal/image-gen/capabilities",
      headers: { "x-internal-token": "test-token" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.sizeIds).toEqual([
      "auto",
      "1024x1024",
      "1024x1536",
      "1536x1024",
    ]);
  });
  it("generates through the protected endpoint", async () => {
    process.env.IMAGE_GEN_MAX_PER_SESSION = "1";
    resetImageGenConfig();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [{ b64_json: "eA==" }] }), {
        status: 200,
      }),
    );
    const app = Fastify();
    await registerInternalImageGenRoutes(app);
    const res = await app.inject({
      method: "POST",
      url: "/internal/image-gen/generate",
      headers: { "x-internal-token": "test-token" },
      payload: {
        sessionId: "route-session",
        prompt: "cat",
        sizeId: "1024x1024",
        count: 1,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.images[0].dataBase64).toBe("eA==");
    const capabilities = await app.inject({
      method: "GET",
      url: "/internal/image-gen/capabilities?sessionId=route-session",
      headers: { "x-internal-token": "test-token" },
    });
    expect(capabilities.json().data.remainingCount).toBe(0);
    delete process.env.IMAGE_GEN_MAX_PER_SESSION;
  });
});
