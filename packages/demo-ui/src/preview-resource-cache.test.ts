import { describe, expect, it } from "vitest";

import {
  extractPreviewImageUrls,
  normalizePreviewImageUrl,
} from "./preview-resource-cache";

describe("preview resource cache workspace image paths", () => {
  it("预热白板 PNG 时使用会话工作区资源地址", () => {
    expect(normalizePreviewImageUrl("assets/whiteboards/output.png", {
      sessionId: "session-1",
      demoId: "page-1",
      origin: "http://localhost:4200",
    })).toBe("http://localhost:4200/api/sessions/session-1/workspace/assets/whiteboards/output.png");
  });

  it("从配置中提取白板 PNG 资源", () => {
    expect(extractPreviewImageUrls({
      pageId: "page-1",
      configData: { hero: "assets/whiteboards/output.png" },
      sessionId: "session-1",
      demoId: "page-1",
      origin: "http://localhost:4200",
    })).toEqual(["http://localhost:4200/api/sessions/session-1/workspace/assets/whiteboards/output.png"]);
  });
});
