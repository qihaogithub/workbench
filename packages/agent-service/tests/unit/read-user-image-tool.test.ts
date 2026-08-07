import { describe, it, expect, vi } from "vitest";
import { createReadUserImageTool } from "../../src/backends/pi-tools/read-user-image-tool";

const imageStoreMocks = vi.hoisted(() => ({
  readGlobalImageById: vi.fn(),
}));

vi.mock("../../src/backends/pi-tools/global-image-store", () => imageStoreMocks);

vi.mock("../../src/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { readGlobalImageById } from "../../src/backends/pi-tools/global-image-store";

function createTool() {
  return createReadUserImageTool();
}

describe("createReadUserImageTool", () => {
  it("成功读取图片时返回 image content", async () => {
    vi.mocked(readGlobalImageById).mockReturnValue({
      success: true,
      data: "aGVsbG8=",
      mimeType: "image/png",
      filename: "test.png",
      sizeBytes: 1024,
    });

    const tool = createTool();
    const result = await tool.execute("call_1", { imageId: "img_abc123" });

    expect(result.isError).toBeUndefined();
    expect(result.content).toEqual([
      { type: "image", data: "aGVsbG8=", mimeType: "image/png" },
    ]);
    expect(result.details).toMatchObject({
      imageId: "img_abc123",
      filename: "test.png",
      sizeBytes: 1024,
    });
    expect(readGlobalImageById).toHaveBeenCalledWith("img_abc123");
  });

  it("带 /api/images/ 前缀的 imageId 也能正常读取", async () => {
    vi.mocked(readGlobalImageById).mockReturnValue({
      success: true,
      data: "aGVsbG8=",
      mimeType: "image/jpeg",
      filename: "photo.jpg",
      sizeBytes: 2048,
    });

    const tool = createTool();
    const result = await tool.execute("call_2", {
      imageId: "/api/images/img_xyz789",
    });

    expect(result.content).toEqual([
      { type: "image", data: "aGVsbG8=", mimeType: "image/jpeg" },
    ]);
    expect(readGlobalImageById).toHaveBeenCalledWith("/api/images/img_xyz789");
  });

  it("图片不存在时返回 isError", async () => {
    vi.mocked(readGlobalImageById).mockReturnValue({
      success: false,
      error: "Image not found: img_notexist",
    });

    const tool = createTool();
    const result = await tool.execute("call_3", { imageId: "img_notexist" });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      { type: "text", text: "无法读取图片: Image not found: img_notexist" },
    ]);
  });

  it("blob 文件缺失时返回 isError", async () => {
    vi.mocked(readGlobalImageById).mockReturnValue({
      success: false,
      error: "Blob file missing: blob.dat",
    });

    const tool = createTool();
    const result = await tool.execute("call_4", { imageId: "img_missing_blob" });

    expect(result.isError).toBe(true);
    expect(result.content?.[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("Blob file missing"),
    });
  });
});
