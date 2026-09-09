import { describe, expect, it, vi } from "vitest";
import { createGenerateReferenceImageTool } from "../../src/backends/pi-tools/generate-reference-image-tool";
import type { AgentConfig } from "../../src/core/types";

vi.mock("../../src/backends/pi-tools/global-image-store", () => ({
  uploadToGlobalImageStore: vi.fn(),
}));
vi.mock("../../src/backends/pi-tools/image-store-register", () => ({
  registerGlobalImageToProject: vi.fn(),
}));
vi.mock("../../src/backends/pi-tools/markdown-reference-tool", () => ({
  requestProjectReference: vi.fn(),
}));

describe("createGenerateReferenceImageTool", () => {
  it("要求至少一张图片参考", async () => {
    const tool = createGenerateReferenceImageTool({
      sessionId: "reference-test",
    } as AgentConfig);
    const result = await tool.execute("id", {
      prompt: "variation",
      filename: "variation.png",
      references: [],
    } as never);

    expect(result.isError).toBe(true);
    expect(result.details).toEqual({ error: "references_required" });
  });

  it("无作者授权时拒绝读取参考图", async () => {
    const tool = createGenerateReferenceImageTool({
      sessionId: "reference-test",
      projectId: "p1",
    } as AgentConfig);
    const result = await tool.execute("id", {
      prompt: "variation",
      filename: "variation.png",
      references: [{ uri: "wb://project/p1/page/a", assetId: "asset-a" }],
    } as never);

    expect(result.isError).toBe(true);
    expect(result.details).toEqual({ error: "reference_unauthorized" });
  });
});
