import { afterEach, describe, expect, it, vi } from "vitest";
import { localizeRemoteImageForSession } from "./remote-image-localizer";

describe("localizeRemoteImageForSession", () => {
  afterEach(() => vi.restoreAllMocks());

  it("按会话调用外链图片本地化接口并返回编辑预览地址", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { editPreviewUrl: "/api/images/local.png" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(
      localizeRemoteImageForSession("session/1", "https://cdn.example.com/a.png"),
    ).resolves.toBe("/api/images/local.png");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sessions/session%2F1/assets/localize",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: {
            kind: "selected-image",
            src: "https://cdn.example.com/a.png",
            currentSrc: "https://cdn.example.com/a.png",
          },
        }),
      }),
    );
  });

  it("接口失败或缺少 editPreviewUrl 时抛出统一错误", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: { message: "图片域名被拒绝" } }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(
      localizeRemoteImageForSession("session-1", "https://cdn.example.com/a.png"),
    ).rejects.toThrow("图片域名被拒绝");

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(
      localizeRemoteImageForSession("session-1", "https://cdn.example.com/a.png"),
    ).rejects.toThrow("外链图片保存失败");
  });
});
