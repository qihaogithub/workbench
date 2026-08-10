import { describe, it, expect, beforeEach, vi } from "vitest";
import { createExtractImageElementTool } from "../../src/backends/pi-tools/extract-image-element-tool";
import type { AgentConfig } from "../../src/core/types";

function createSharpChain() {
  const chain: any = {
    removeAlpha: vi.fn(() => chain),
    ensureAlpha: vi.fn(() => chain),
    raw: vi.fn(() => chain),
    blur: vi.fn(() => chain),
    png: vi.fn(() => chain),
    toBuffer: vi.fn(async () => Buffer.from([1, 2, 3, 4])),
    metadata: vi.fn(async () => ({ width: 2, height: 2 })),
  };
  return chain;
}

vi.mock("sharp", () => ({
  default: vi.fn(() => createSharpChain()),
}));

const storeMocks = vi.hoisted(() => ({
  readGlobalImageById: vi.fn(),
  uploadToGlobalImageStore: vi.fn(),
}));

vi.mock("../../src/backends/pi-tools/global-image-store", () => storeMocks);
vi.mock("../../src/backends/pi-tools/image-store-register", () => ({
  registerGlobalImageToProject: vi.fn(),
}));
vi.mock("../../src/backends/pi-tools/image-segmenter", () => ({
  segmentImageElementByText: vi.fn(),
}));
vi.mock("../../src/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { readGlobalImageById, uploadToGlobalImageStore } from "../../src/backends/pi-tools/global-image-store";
import { segmentImageElementByText } from "../../src/backends/pi-tools/image-segmenter";

const baseConfig: AgentConfig = { sessionId: "test-session" };

function createTool(config: AgentConfig = baseConfig) {
  return createExtractImageElementTool(config);
}

function mockMask(): Buffer {
  // 2x2 mask，对角线前景
  return Buffer.from([255, 0, 255, 0]);
}

function mockSourceImage() {
  vi.mocked(readGlobalImageById).mockReturnValue({
    success: true,
    data: Buffer.from("fakePngSource").toString("base64"),
    mimeType: "image/png",
    filename: "source.png",
    sizeBytes: 100,
  });
}

function mockUpload(overrides: Record<string, unknown> = {}) {
  vi.mocked(uploadToGlobalImageStore).mockReturnValue({
    success: true,
    imageId: "img_cutout123",
    url: "/api/images/img_cutout123",
    sha256: "abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234",
    filename: "extracted.png",
    sizeBytes: 4,
    mimeType: "image/png",
    width: 2,
    height: 2,
    deduplicated: false,
    ...overrides,
  });
}

describe("createExtractImageElementTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("非法文件名应被拒绝", async () => {
    const tool = createTool();
    const result = await tool.execute("id", {
      imageId: "img_x",
      element: "car",
      output: "../evil.png",
    } as any);
    expect(result.isError).toBe(true);
    expect(result.details.error).toBe("invalid_filename");
  });

  it("非 png 输出格式应被拒绝", async () => {
    const tool = createTool();
    const result = await tool.execute("id", {
      imageId: "img_x",
      element: "car",
      output: "out.jpg",
    } as any);
    expect(result.isError).toBe(true);
    expect(result.details.error).toBe("invalid_format");
  });

  it("分割失败时返回错误", async () => {
    vi.mocked(segmentImageElementByText).mockResolvedValue({
      success: false,
      error: "model failed",
    } as any);
    const tool = createTool();
    const result = await tool.execute("id", {
      imageId: "img_x",
      element: "car",
      output: "out.png",
    } as any);
    expect(result.isError).toBe(true);
    expect(result.details.error).toBe("segmentation_failed");
  });

  it("未找到元素时返回错误", async () => {
    vi.mocked(segmentImageElementByText).mockResolvedValue({
      success: true,
      mask: Buffer.from([0, 0, 0, 0]),
      width: 2,
      height: 2,
      empty: true,
    });
    const tool = createTool();
    const result = await tool.execute("id", {
      imageId: "img_x",
      element: "no such thing",
      output: "out.png",
    } as any);
    expect(result.isError).toBe(true);
    expect(result.details.error).toBe("element_not_found");
  });

  it("成功抠图并上传图床", async () => {
    vi.mocked(segmentImageElementByText).mockResolvedValue({
      success: true,
      mask: mockMask(),
      width: 2,
      height: 2,
      empty: false,
    });
    mockSourceImage();
    mockUpload();

    const tool = createTool();
    const result = await tool.execute("id", {
      imageId: "img_x",
      element: "the red car",
      output: "car.png",
    } as any);

    expect(result.isError).toBeUndefined();
    expect(result.details.success).toBe(true);
    expect(result.details.imageId).toBe("img_cutout123");
    expect(result.details.element).toBe("the red car");
    expect(uploadToGlobalImageStore).toHaveBeenCalled();
  });

  it("invert 与 softEdge 参数透传执行", async () => {
    vi.mocked(segmentImageElementByText).mockResolvedValue({
      success: true,
      mask: mockMask(),
      width: 2,
      height: 2,
      empty: false,
    });
    mockSourceImage();
    mockUpload();

    const tool = createTool();
    const result = await tool.execute("id", {
      imageId: "img_x",
      element: "background",
      output: "bg.png",
      invert: true,
      softEdge: 2,
      threshold: 0.4,
    } as any);

    expect(result.isError).toBeUndefined();
    expect(segmentImageElementByText).toHaveBeenCalledWith("img_x", "background", 0.4);
  });
});