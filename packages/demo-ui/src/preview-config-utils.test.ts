import { describe, expect, it } from "vitest";

import {
  rewritePrototypeAssetUrls,
} from "@workbench/shared";
import {
  resolveConfigImageSrc,
  resolvePreviewConfigAssetUrls,
} from "./preview-config-utils";

describe("preview config workspace image paths", () => {
  it("将工作区级白板 PNG 解析为当前会话的资源地址", () => {
    expect(resolveConfigImageSrc("assets/whiteboards/output.png", "session-1"))
      .toBe("/api/sessions/session-1/workspace/assets/whiteboards/output.png");
  });

  it("将 iframe 配置中的工作区级图片解析为绝对会话资源地址", () => {
    expect(resolvePreviewConfigAssetUrls(
      { hero: "assets/whiteboards/output.png" },
      { sessionId: "session-1", demoId: "page-1", origin: "http://localhost:4200" },
    )).toEqual({
      hero: "http://localhost:4200/api/sessions/session-1/workspace/assets/whiteboards/output.png",
    });
  });

  it("替换 prototype 绑定图片时也解析 workspace-relative 白板 PNG", () => {
    expect(rewritePrototypeAssetUrls(
      '<img data-bind-src="hero" src="assets/whiteboards/output.png">',
      { sessionId: "session-1", origin: "http://localhost:4200" },
    )).toBe('<img data-bind-src="hero" src="http://localhost:4200/api/sessions/session-1/workspace/assets/whiteboards/output.png">');
  });

  it("不把越界工作区路径转换为可加载资源", () => {
    expect(resolveConfigImageSrc("assets/../secret.png", "session-1"))
      .toBe("assets/../secret.png");
  });
});
