import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createGenerateImageTool, resetImageGenSessionCount } from "../../src/backends/pi-tools/generate-image-tool";
import { resetImageGenConfig } from "../../src/services/image-gen-config";
import type { AgentConfig } from "../../src/core/types";

const storeMocks = vi.hoisted(() => ({
  uploadToGlobalImageStore: vi.fn(),
}));
const referenceMocks = vi.hoisted(() => ({
  requestProjectReference: vi.fn(),
}));

vi.mock("../../src/backends/pi-tools/global-image-store", () => storeMocks);
vi.mock("../../src/backends/pi-tools/image-store-register", () => ({
  registerGlobalImageToProject: vi.fn(),
}));
vi.mock("../../src/backends/pi-tools/markdown-reference-tool", () => ({
  requestProjectReference: referenceMocks.requestProjectReference,
}));
vi.mock("../../src/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { uploadToGlobalImageStore } from "../../src/backends/pi-tools/global-image-store";

const baseConfig: AgentConfig = { sessionId: "test-session" };

function createTool(config: AgentConfig = baseConfig) {
  return createGenerateImageTool(config);
}

function mockUpload(overrides: Record<string, unknown> = {}) {
  vi.mocked(uploadToGlobalImageStore).mockReturnValue({
    success: true,
    imageId: "img_generated123",
    url: "/api/images/img_generated123",
    sha256: "abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234",
    filename: "hero.png",
    sizeBytes: 4,
    mimeType: "image/png",
    width: 1024,
    height: 1024,
    deduplicated: false,
    ...overrides,
  });
}

async function fakeFetchResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("createGenerateImageTool", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    resetImageGenSessionCount("test-session");
    resetImageGenConfig();
    process.env.IMAGE_GEN_ENABLED = "true";
    process.env.IMAGE_GEN_API_KEY = "sk-test";
    process.env.IMAGE_GEN_BASE_URL = "https://api.test/v1";
    process.env.IMAGE_GEN_MODEL = "gpt-image-1";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("图像生成未启用时报错", async () => {
    process.env.IMAGE_GEN_ENABLED = "false";
    const tool = createTool();
    const result = await tool.execute("id", {
      prompt: "a cat",
      filename: "cat.png",
    } as any);
    expect(result.isError).toBe(true);
    expect(result.details.error).toBe("image_gen_disabled");
  });

  it("缺少 API Key 时报错", async () => {
    delete process.env.IMAGE_GEN_API_KEY;
    const tool = createTool();
    const result = await tool.execute("id", {
      prompt: "a cat",
      filename: "cat.png",
    } as any);
    expect(result.isError).toBe(true);
    expect(result.details.error).toBe("missing_api_key");
  });

  it("非法文件名应被拒绝", async () => {
    const tool = createTool();
    const result = await tool.execute("id", {
      prompt: "a cat",
      filename: "../../evil.png",
    } as any);
    expect(result.isError).toBe(true);
    expect(result.details.error).toBe("invalid_filename");
  });

  it("不支持的文件格式应被拒绝", async () => {
    const tool = createTool();
    const result = await tool.execute("id", {
      prompt: "a cat",
      filename: "doc.pdf",
    } as any);
    expect(result.isError).toBe(true);
    expect(result.details.error).toBe("invalid_format");
  });

  it("prompt 为空或超长应被拒绝", async () => {
    process.env.IMAGE_GEN_MAX_PROMPT_LEN = "10";
    const tool = createTool();
    const empty = await tool.execute("id", {
      prompt: "  ",
      filename: "a.png",
    } as any);
    expect(empty.details.error).toBe("empty_prompt");
    const tooLong = await tool.execute("id", {
      prompt: "a".repeat(50),
      filename: "a.png",
    } as any);
    expect(tooLong.details.error).toBe("prompt_too_long");
  });

  it("超过会话配额应被拒绝", async () => {
    process.env.IMAGE_GEN_MAX_PER_SESSION = "2";
    mockUpload();
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      fakeFetchResponse(200, {
        data: [{ b64_json: Buffer.from("fakePng").toString("base64") }],
      }),
    );
    const tool = createTool();
    await tool.execute("id", { prompt: "cat", filename: "a.png" } as any);
    await tool.execute("id", { prompt: "cat", filename: "b.png" } as any);
    const result = await tool.execute("id", {
      prompt: "cat",
      filename: "c.png",
    } as any);
    expect(result.isError).toBe(true);
    expect(result.details.error).toBe("quota_exceeded");
  });

  it("成功生成并上传到图床", async () => {
    mockUpload();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      await fakeFetchResponse(200, {
        data: [{ b64_json: Buffer.from("fakePng").toString("base64") }],
      }),
    );

    const tool = createTool();
    const result = await tool.execute("id", {
      prompt: "a modern hero background",
      filename: "hero.png",
      size: "1536x1024",
    } as any);

    expect(result.isError).toBeUndefined();
    expect(result.details.success).toBe(true);
    expect(result.details.results[0].imageId).toBe("img_generated123");
    expect(uploadToGlobalImageStore).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith("https://api.test/v1/images/generations", expect.objectContaining({ method: "POST" }));
    fetchMock.mockRestore();
  });

  it("按顺序受控读取图片参考，并只在 details 中保留引用元数据", async () => {
    mockUpload();
    referenceMocks.requestProjectReference
      .mockResolvedValueOnce({
        uri: "wb://project/p1/page/a",
        assetId: "asset-a",
        mimeType: "image/png",
        dataBase64: "eA==",
      })
      .mockResolvedValueOnce({
        uri: "wb://project/p1/page/b",
        assetId: "asset-b",
        mimeType: "image/jpeg",
        dataBase64: "eA==",
      });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      await fakeFetchResponse(200, {
        data: [{ b64_json: Buffer.from("fakePng").toString("base64") }],
      }),
    );

    const result = await createTool().execute("id", {
      prompt: "use the references",
      filename: "out.png",
      references: [
        { uri: "wb://project/p1/page/a", assetId: "asset-a" },
        { uri: "wb://project/p1/page/b", assetId: "asset-b" },
      ],
    } as any);

    expect(referenceMocks.requestProjectReference).toHaveBeenNthCalledWith(
      1,
      baseConfig,
      { uri: "wb://project/p1/page/a", mode: "image", assetId: "asset-a" },
      undefined,
    );
    expect(referenceMocks.requestProjectReference).toHaveBeenNthCalledWith(
      2,
      baseConfig,
      { uri: "wb://project/p1/page/b", mode: "image", assetId: "asset-b" },
      undefined,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.test/v1/images/edits",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.details.references).toEqual([
      { uri: "wb://project/p1/page/a", assetId: "asset-a" },
      { uri: "wb://project/p1/page/b", assetId: "asset-b" },
    ]);
    expect(JSON.stringify(result.details)).not.toContain("dataBase64");
    fetchMock.mockRestore();
  });

  it("参考读取失败时不调用 provider", async () => {
    referenceMocks.requestProjectReference.mockRejectedValue(
      new Error("REFERENCE_UNAVAILABLE"),
    );
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const result = await createTool().execute("id", {
      prompt: "use the reference",
      filename: "out.png",
      references: [{ uri: "wb://project/p1/page/a", assetId: "asset-a" }],
    } as any);

    expect(result.isError).toBe(true);
    expect(result.details.error).toBe("reference_read_failed");
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it("不支持参考图的档案明确拒绝且不读取、不降级", async () => {
    process.env.IMAGE_GEN_MODEL = "dall-e-3";
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const result = await createTool().execute("id", {
      prompt: "use the reference",
      filename: "out.png",
      references: [{ uri: "wb://project/p1/page/a", assetId: "asset-a" }],
    } as any);

    expect(result.isError).toBe(true);
    expect(result.details.error).toBe("references_not_supported");
    expect(referenceMocks.requestProjectReference).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it("直接 execute 传入超过 4 个参考时拒绝且不读取", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const references = Array.from({ length: 5 }, (_, index) => ({
      uri: `wb://project/p1/page/${index}`,
      assetId: `asset-${index}`,
    }));
    const result = await createTool().execute("id", {
      prompt: "too many references",
      filename: "out.png",
      references,
    } as any);

    expect(result.isError).toBe(true);
    expect(result.details.error).toBe("too_many_references");
    expect(referenceMocks.requestProjectReference).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it("API 返回错误时重试后返回失败", async () => {
    mockUpload();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    const tool = createTool();
    const result = await tool.execute("id", {
      prompt: "a cat",
      filename: "cat.png",
    } as any);

    expect(result.isError).toBe(true);
    expect(result.details.error).toBe("generation_failed");
  });
});
