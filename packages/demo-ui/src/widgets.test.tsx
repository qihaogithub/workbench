import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FileUploadWidget } from "./widgets";

describe("FileUploadWidget", () => {
  it("detects MP3 fields from accept, shows an audio upload affordance, and renders an audio status card", async () => {
    const onChange = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { url: "/api/sessions/session-1/workspace/assets/audio/abc/bgm.mp3" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { container, rerender } = render(
      <FileUploadWidget
        onChange={onChange}
        sessionId="session-1"
        options={{ accept: "audio/mpeg,.mp3" }}
      />,
    );

    const input = container.querySelector('input[type="file"]')!;
    expect(input).toHaveAttribute("accept", "audio/mpeg,.mp3");
    expect(screen.getByText("上传音频")).toBeInTheDocument();
    const uploadTile = screen.getByText("上传音频").closest(".group");
    expect(uploadTile).toHaveClass("bg-black/10");

    const file = new File([new Uint8Array([0x49, 0x44, 0x33])], "bgm.mp3", { type: "audio/mpeg" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("/api/sessions/session-1/workspace/assets/audio/abc/bgm.mp3"));

    rerender(
      <FileUploadWidget
        value="/api/sessions/session-1/workspace/assets/audio/abc/bgm.mp3"
        onChange={onChange}
        sessionId="session-1"
        options={{ accept: "audio/mpeg,.mp3" }}
      />,
    );
    expect(screen.getByText("bgm.mp3")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "替换音频" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除音频" })).toBeInTheDocument();
  });

  it("blocks an MP3 larger than 1MiB before sending it", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(
      <FileUploadWidget
        onChange={vi.fn()}
        sessionId="session-1"
        options={{ accept: "audio/mpeg,.mp3" }}
      />,
    );

    const file = new File([new Uint8Array(1024 * 1024 + 1)], "large.mp3", { type: "audio/mpeg" });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });

    expect(await screen.findByText("文件大小超过 1MB 限制")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the same subtle black fill for an empty image upload tile", () => {
    const { container } = render(<FileUploadWidget onChange={vi.fn()} />);

    const uploadTile = screen.getByText("Upload").closest(".group");
    expect(uploadTile).toHaveClass("bg-black/10");
    expect(container.querySelector('input[type="file"]')).toBeInTheDocument();
  });

  it("hides deletion for a default image and restores that default after replacement", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <FileUploadWidget value="/default.png" defaultValue="/default.png" onChange={onChange} />,
    );

    expect(screen.queryByRole("button", { name: "删除图片" })).not.toBeInTheDocument();
    rerender(<FileUploadWidget value="/replacement.png" defaultValue="/default.png" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "删除图片" }));
    expect(onChange).toHaveBeenLastCalledWith("/default.png");
  });

  it.each([
    ["an empty object", {}],
    ["an empty URL", { url: "" }],
  ])("treats %s as an unconfigured video instead of a Spine bundle", (_description, value) => {
    const { container } = render(
      <FileUploadWidget
        value={value}
        onChange={vi.fn()}
        options={{ mediaType: "video", accept: "video/mp4,video/webm" }}
      />,
    );

    expect(screen.queryByText("Spine 素材包")).not.toBeInTheDocument();
    expect(container.querySelector('input[type="file"]')).toHaveAttribute(
      "accept",
      "video/mp4,video/webm",
    );
  });

  it("keeps rendering a Spine bundle when a non-video field receives one", () => {
    render(
      <FileUploadWidget
        value={{ skeleton: "skeleton.skel", atlas: "skeleton.atlas", texture: "skeleton.png" }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Spine 素材包")).toBeInTheDocument();
  });

  it("renders a managed Spine asset reference as one atomic upload", () => {
    const assetId = `spine_${"a".repeat(64)}` as const;
    const { container } = render(
      <FileUploadWidget
        value={{ kind: "spine", version: 1, assetId }}
        onChange={vi.fn()}
        options={{ assetKind: "spine", accept: ".zip" }}
      />,
    );

    expect(screen.getByText("Spine 素材包")).toBeInTheDocument();
    expect(container.querySelector('input[type="file"]')).not.toHaveAttribute("accept");
  });

  it("reports a successful Spine upload as already committed", async () => {
    const onChange = vi.fn();
    const ref = { kind: "spine", version: 1, assetId: `spine_${"a".repeat(64)}` } as const;
    const receipt = {
      committed: true,
      mutationId: "mutation-1",
      projectId: "project-1",
      workspaceId: "workspace-1",
      baseRevision: 0,
      revision: 2,
      rootHash: "hash",
      actor: "author-site",
      resources: [],
      committedAt: 1,
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { ref, summary: {}, receipt, configCommitted: true } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(
      <FileUploadWidget
        onChange={onChange}
        sessionId="session-1"
        options={{ assetKind: "spine", configScope: "page", pageId: "page-1", configKey: "spineAsset" }}
      />,
    );
    const file = new File([new Uint8Array([0x50, 0x4b, 3, 4])], "star_second.zip.flutter", { type: "application/zip" });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(ref, {
      persistence: "committed",
      receipt,
    }));
    const body = fetchMock.mock.calls[0][1]?.body as FormData;
    expect(body.get("configScope")).toBe("page");
    expect(body.get("pageId")).toBe("page-1");
    expect(body.get("configKey")).toBe("spineAsset");
  });

  it("stores the URL returned by the session upload endpoint", async () => {
    const onChange = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true, data: { url: "/api/video.mp4" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const { container } = render(
      <FileUploadWidget
        value={{}}
        onChange={onChange}
        sessionId="session-1"
        options={{ mediaType: "video", accept: "video/mp4,video/webm" }}
      />,
    );

    const file = new File([new Uint8Array([1, 2, 3])], "intro.mp4", { type: "video/mp4" });
    fireEvent.change(container.querySelector('input[type="file"][accept="video/mp4,video/webm"]')!, { target: { files: [file] } });

    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ url: "/api/video.mp4" }));
  });

  it("does not write an incomplete success response into the config", async () => {
    const onChange = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true, data: {} }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const { container } = render(
      <FileUploadWidget
        value={{}}
        onChange={onChange}
        sessionId="session-1"
        options={{ mediaType: "video", accept: "video/mp4,video/webm" }}
      />,
    );

    const file = new File([new Uint8Array([1, 2, 3])], "intro.mp4", { type: "video/mp4" });
    fireEvent.change(container.querySelector('input[type="file"][accept="video/mp4,video/webm"]')!, { target: { files: [file] } });

    expect(await screen.findByText("服务器未返回有效的上传地址，请重试")).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("reports an invalid response when a successful request returns non-JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>gateway</html>", { status: 200 })));

    const { container } = render(
      <FileUploadWidget
        value={{}}
        onChange={vi.fn()}
        sessionId="session-1"
        options={{ mediaType: "video", accept: "video/mp4,video/webm" }}
      />,
    );

    const file = new File([new Uint8Array([1, 2, 3])], "intro.mp4", { type: "video/mp4" });
    fireEvent.change(container.querySelector('input[type="file"][accept="video/mp4,video/webm"]')!, { target: { files: [file] } });

    expect(await screen.findByText("服务器返回了无效的上传响应，请重试")).toBeInTheDocument();
  });

  it("shows the server error for a structured upload failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: false, error: { code: "INVALID_FILE_TYPE", message: "视频容器无效" } }), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const { container } = render(
      <FileUploadWidget
        value={{}}
        onChange={vi.fn()}
        sessionId="session-1"
        options={{ mediaType: "video", accept: "video/mp4,video/webm" }}
      />,
    );

    const file = new File([new Uint8Array([1, 2, 3])], "intro.mp4", { type: "video/mp4" });
    fireEvent.change(container.querySelector('input[type="file"][accept="video/mp4,video/webm"]')!, { target: { files: [file] } });

    expect(await screen.findByText("视频容器无效")).toBeInTheDocument();
  });

  it.each([
    [401, "登录状态已失效，请刷新页面后重试"],
    [404, "编辑会话已失效，请重新打开页面"],
    [413, "视频超过服务器允许的大小限制"],
    [500, "上传失败（HTTP 500）"],
  ])("maps a non-JSON HTTP %s error to a helpful message", async (status, message) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("gateway error", { status })));

    const { container } = render(
      <FileUploadWidget
        value={{}}
        onChange={vi.fn()}
        sessionId="session-1"
        options={{ mediaType: "video", accept: "video/mp4,video/webm" }}
      />,
    );

    const file = new File([new Uint8Array([1, 2, 3])], "intro.mp4", { type: "video/mp4" });
    fireEvent.change(container.querySelector('input[type="file"][accept="video/mp4,video/webm"]')!, { target: { files: [file] } });

    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it("shows a network error when the upload request cannot be sent", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const { container } = render(
      <FileUploadWidget
        value={{}}
        onChange={vi.fn()}
        sessionId="session-1"
        options={{ mediaType: "video", accept: "video/mp4,video/webm" }}
      />,
    );

    const file = new File([new Uint8Array([1, 2, 3])], "intro.mp4", { type: "video/mp4" });
    fireEvent.change(container.querySelector('input[type="file"][accept="video/mp4,video/webm"]')!, { target: { files: [file] } });

    expect(await screen.findByText("网络连接失败，请检查网络后重试")).toBeInTheDocument();
  });

  it("renders a poster card without inline video and opens the preview dialog on click", () => {
    const { container } = render(
      <FileUploadWidget
        label="开场引入视频"
        value={{ url: "/api/video.mp4", poster: "/api/poster.jpg" }}
        onChange={vi.fn()}
        options={{ mediaType: "video", accept: "video/mp4,video/webm" }}
      />,
    );

    expect(container.querySelector('video')).not.toBeInTheDocument();
    expect(container.querySelector('img[src="/api/poster.jpg"]')).toBeInTheDocument();
    expect(screen.queryByText("MP4")).not.toBeInTheDocument();
    expect(screen.queryByText("已上传")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "开场引入视频预览" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog.querySelector("video")).toHaveAttribute("src", "/api/video.mp4");
    expect(dialog.querySelector("video")).toHaveAttribute("poster", "/api/poster.jpg");
  });

  it("uses the default placeholder when no poster is configured", () => {
    render(
      <FileUploadWidget
        value={{ url: "/api/video.mp4" }}
        onChange={vi.fn()}
        options={{ mediaType: "video", accept: "video/mp4,video/webm" }}
      />,
    );

    expect(screen.getByText("暂无封面")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "视频预览" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("restores an object default value immediately when the video is removed", () => {
    const onChange = vi.fn();
    const defaultValue = { url: "/api/default.mp4", poster: "/api/default.jpg" };
    const confirmSpy = vi.spyOn(window, "confirm").mockImplementation(() => true);

    render(
      <FileUploadWidget
        value={{ url: "/api/video.mp4", poster: "/api/poster.jpg" }}
        defaultValue={defaultValue}
        onChange={onChange}
        options={{ mediaType: "video", accept: "video/mp4,video/webm" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "删除" }));

    expect(onChange).toHaveBeenCalledWith(defaultValue);
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("clears the video immediately when no default value exists", () => {
    const onChange = vi.fn();

    render(
      <FileUploadWidget
        value={{ url: "/api/video.mp4" }}
        onChange={onChange}
        options={{ mediaType: "video", accept: "video/mp4,video/webm" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "删除" }));

    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});
