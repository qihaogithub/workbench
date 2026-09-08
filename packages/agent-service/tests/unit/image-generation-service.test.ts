import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  generateImage,
  getImageGenCapabilities,
  resetImageGenSessionCount,
} from "../../src/services/image-generation-service";
import type { ImageGenRuntimeConfig } from "../../src/services/image-gen-config";

const cfg = (
  overrides: Partial<ImageGenRuntimeConfig> = {},
): ImageGenRuntimeConfig => ({
  enabled: true,
  apiKey: "key",
  baseUrl: "https://provider.test/v1",
  model: "gpt-image-1",
  apiProfile: "auto",
  timeoutMs: 1000,
  maxPerSession: 4,
  maxRetries: 1,
  concurrency: 1,
  maxPromptLen: 1000,
  ...overrides,
});
const response = (items: unknown[]) =>
  new Response(JSON.stringify({ data: items }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

describe("image-generation-service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetImageGenSessionCount("s");
  });
  it("exposes exact profile capabilities and conservative unknown fallback", () => {
    expect(getImageGenCapabilities(cfg()).sizeIds).toEqual([
      "auto",
      "1024x1024",
      "1024x1536",
      "1536x1024",
    ]);
    expect(
      getImageGenCapabilities(cfg({ model: "dall-e-3", apiProfile: "auto" }))
        .qualityIds,
    ).toEqual(["standard", "hd"]);
    expect(
      getImageGenCapabilities(cfg({ model: "other", apiProfile: "auto" })),
    ).toMatchObject({
      apiProfile: "generation-only",
      supportsReferences: false,
      maxCount: 1,
      sizeIds: ["1024x1024"],
    });
  });
  it("uses generations JSON and omits GPT response_format", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        response([{ b64_json: Buffer.from("x").toString("base64") }]),
      );
    await generateImage({ prompt: "cat", size: "1024x1024" }, cfg());
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://provider.test/v1/images/generations",
    );
    expect(JSON.parse(String(init.body))).not.toHaveProperty("response_format");
  });
  it("uses multipart edits, validates references, retries exact count and quota", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response([{ b64_json: "eA==" }]))
      .mockResolvedValueOnce(
        response([{ b64_json: "eA==" }, { b64_json: "eA==" }]),
      );
    await expect(
      generateImage(
        {
          sessionId: "s",
          prompt: "cat",
          count: 2,
          references: [{ mimeType: "image/png", dataBase64: "eA==" }],
        },
        cfg(),
      ),
    ).resolves.toMatchObject({ images: expect.any(Array) });
    expect(fetchMock.mock.calls[0][0]).toContain("/images/edits");
    expect((fetchMock.mock.calls[0][1] as RequestInit).body).toBeInstanceOf(
      FormData,
    );
    await expect(
      generateImage(
        { sessionId: "s", prompt: "cat", count: 3 },
        cfg({ maxPerSession: 4 }),
      ),
    ).rejects.toThrow("quota_exceeded");
    await expect(
      generateImage(
        {
          prompt: "cat",
          references: [{ mimeType: "text/plain", dataBase64: "eA==" }],
        },
        cfg(),
      ),
    ).rejects.toThrow("invalid_reference_type");
  });
  it("honours abort signal", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      generateImage({ prompt: "cat", signal: controller.signal }, cfg()),
    ).rejects.toThrow("cancelled");
  });
});
