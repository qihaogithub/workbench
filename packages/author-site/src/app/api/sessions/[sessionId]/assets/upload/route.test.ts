jest.mock("fs", () => ({
  __esModule: true,
  default: {
    mkdirSync: jest.fn(),
    writeFileSync: jest.fn(),
  },
}));

jest.mock("@/lib/auth/jwt", () => ({
  getAuthCookie: jest.fn(),
  verifyToken: jest.fn(),
}));
jest.mock("@/lib/fs-utils", () => ({
  sessionExists: jest.fn(),
  createApiSuccess: jest.fn((data: unknown) => ({ success: true, data })),
  createApiError: jest.fn((code: string, message?: string, details?: unknown) => ({
    success: false,
    error: { code, message: message || code, details },
  })),
  getSessionMeta: jest.fn(),
  getSessionWorkspacePath: jest.fn(),
  listDemoPages: jest.fn(() => [{ id: "motion-formats_k4r2" }]),
}));
jest.mock("@/lib/image-store", () => ({ uploadImage: jest.fn() }));
jest.mock("@/lib/project-images", () => ({ addProjectImage: jest.fn() }));
jest.mock("@/lib/live-workspace-route-context", () => ({ isLiveWorkspacePath: jest.fn(() => true) }));
jest.mock("./spine-assets", () => ({ prepareSpineAsset: jest.fn() }));
jest.mock("@/lib/workspace-authority-client", () => ({
  stageWorkspaceBinary: jest.fn(),
  commitWorkspaceMutation: jest.fn(),
  reconcileWorkspaceAuthority: jest.fn(),
  WorkspaceAuthorityClientError: class WorkspaceAuthorityClientError extends Error {},
}));
import fs from "fs";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import {
  getSessionMeta,
  getSessionWorkspacePath,
  sessionExists,
} from "@/lib/fs-utils";
import { POST } from "./route";
import { isAllowedAssetFile, MAX_AUDIO_SIZE, MAX_VIDEO_SIZE } from "./asset-validation";
import { prepareSpineAsset } from "./spine-assets";
import { commitWorkspaceMutation, stageWorkspaceBinary } from "@/lib/workspace-authority-client";

function requestWithFile(file: unknown): Request {
  return {
    formData: async () => ({ get: () => file }),
  } as unknown as Request;
}

function videoFile(name: string, bytes: Uint8Array, type: string): File {
  const copy = Uint8Array.from(bytes);
  return {
    name,
    type,
    size: copy.byteLength,
    arrayBuffer: async () => copy.slice().buffer,
  } as unknown as File;
}

const params = { params: Promise.resolve({ sessionId: "session-1" }) };

describe("session asset upload validation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getAuthCookie).mockResolvedValue("token");
    jest.mocked(verifyToken).mockResolvedValue({ userId: "user-1" } as never);
    jest.mocked(sessionExists).mockReturnValue(true);
    jest.mocked(getSessionMeta).mockReturnValue({ demoId: "project-1", userId: "user-1" } as never);
    jest.mocked(getSessionWorkspacePath).mockReturnValue("/tmp/workspace-1");
  });

  it("commits Spine files and its page config ref in one Authority mutation", async () => {
    jest.mocked(getSessionMeta).mockReturnValue({ demoId: "project-1", userId: "user-1", workspaceId: "workspace-1" } as never);
    const ref = { kind: "spine", version: 1, assetId: `spine_${"a".repeat(64)}` } as const;
    jest.mocked(prepareSpineAsset).mockResolvedValue({
      ref,
      manifest: { schemaVersion: 1 },
      files: [{ path: "star/star.skel.bytes", content: Buffer.from([1]), sha256: "hash" }],
      summary: { originalName: "star_second.zip.flutter" },
    } as never);
    let stagedIndex = 0;
    jest.mocked(stageWorkspaceBinary).mockImplementation(async ({ content }) => ({
      stagingId: `00000000-0000-0000-0000-00000000000${++stagedIndex}`,
      hash: `hash-${content.length}-${stagedIndex}`,
      size: content.length,
    }));
    const receipt = { committed: true, mutationId: "mutation-1", revision: 2 };
    jest.mocked(commitWorkspaceMutation).mockResolvedValue(receipt as never);
    const file = videoFile("star_second.zip.flutter", new Uint8Array([0x50, 0x4b, 3, 4]), "application/zip");
    const entries = new Map<string, unknown>([
      ["file", file],
      ["assetKind", "spine"],
      ["configScope", "page"],
      ["pageId", "motion-formats_k4r2"],
      ["contextPageId", "motion-formats_k4r2"],
      ["configKey", "spineAsset"],
    ]);
    const request = { formData: async () => ({ get: (key: string) => entries.get(key) ?? null }) } as unknown as Request;

    const response = await POST(request, params);

    expect(response.status).toBe(200);
    expect(commitWorkspaceMutation).toHaveBeenCalledWith(expect.objectContaining({
      reason: "commit_spine_asset",
      operations: expect.arrayContaining([
        expect.objectContaining({ type: "put_binary", path: expect.stringContaining("star/star.skel.bytes") }),
        {
          type: "patch_config_values",
          path: "demos/motion-formats_k4r2/config.values.json",
          patch: { spineAsset: ref },
        },
      ]),
    }));
    expect(await response.json()).toMatchObject({ success: true, data: { ref, receipt, configCommitted: true } });
  });

  it("accepts an MP4 whose browser MIME type is generic when its bytes identify it as MP4", () => {
    const file = {
      name: "hero.mp4",
      type: "application/octet-stream",
    } as File;

    const mp4Header = Buffer.from([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0]);

    expect(isAllowedAssetFile(file, mp4Header)).toBe(true);
  });

  it("rejects a generic-MIME MP4 when its bytes are not an MP4 container", () => {
    const file = {
      name: "hero.mp4",
      type: "application/octet-stream",
    } as File;

    expect(isAllowedAssetFile(file, Buffer.from("not a video"))).toBe(false);
  });

  it("accepts a WebM with an empty MIME when its bytes identify it as WebM", () => {
    const file = { name: "hero.webm", type: "" } as File;
    const webmHeader = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x93, 0x42]);

    expect(isAllowedAssetFile(file, webmHeader)).toBe(true);
  });

  it("accepts an MP4 with a valid metadata box before ftyp", () => {
    const file = { name: "hero.mp4", type: "video/mp4" } as File;
    const freeBox = Buffer.from([0, 0, 0, 12, 0x66, 0x72, 0x65, 0x65, 1, 2, 3, 4]);
    const ftypBox = Buffer.from([0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0, 0x69, 0x73, 0x6f, 0x32]);

    expect(isAllowedAssetFile(file, Buffer.concat([freeBox, ftypBox]))).toBe(true);
  });

  it("rejects an MP4 with an unbounded or malformed box before ftyp", () => {
    const file = { name: "hero.mp4", type: "video/mp4" } as File;
    const malformed = Buffer.from([0xff, 0xff, 0xff, 0xff, 0x66, 0x72, 0x65, 0x65, 0x66, 0x74, 0x79, 0x70]);

    expect(isAllowedAssetFile(file, malformed)).toBe(false);
  });

  it("allows individual videos up to 200MB", () => {
    expect(MAX_VIDEO_SIZE).toBe(200 * 1024 * 1024);
  });

  it("uploads valid MP4 and WebM files into the session workspace", async () => {
    const mp4 = videoFile(
      "intro.mp4",
      new Uint8Array([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0]),
      "video/mp4",
    );
    const webm = videoFile("intro.webm", new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2]), "video/webm");

    const mp4Response = await POST(requestWithFile(mp4), params);
    const webmResponse = await POST(requestWithFile(webm), params);

    expect(mp4Response.status).toBe(200);
    expect(webmResponse.status).toBe(200);
    expect((await mp4Response.json()).data.url).toContain("/assets/videos/");
    expect((await webmResponse.json()).data.url).toContain("/assets/videos/");
    expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
  });

  it("uploads a valid MP3 into the session audio workspace and returns its resource URL", async () => {
    const response = await POST(
      requestWithFile(videoFile("bgm.mp3", new Uint8Array([0x49, 0x44, 0x33, 1, 2]), "audio/mpeg")),
      params,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      data: { url: expect.stringMatching(/\/assets\/audio\/[^/]+\/bgm\.mp3$/), mimeType: "audio/mpeg" },
    });
    expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringMatching(/assets[\\/]audio[\\/]/), { recursive: true });
    expect(fs.writeFileSync).toHaveBeenCalledWith(expect.stringMatching(/assets[\\/]audio[\\/][^/]+[\\/]bgm\.mp3$/), expect.any(Buffer));
  });

  it("rejects an audio MIME with a non-MP3 extension using a clear message", async () => {
    const response = await POST(
      requestWithFile(videoFile("bgm.wav", new Uint8Array([1, 2]), "audio/wav")),
      params,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: "INVALID_FILE_TYPE", message: "音频仅支持 MP3 文件（扩展名需为 .mp3）" },
    });
  });

  it("returns a clear invalid-container error for a spoofed video", async () => {
    const response = await POST(
      requestWithFile(videoFile("intro.mp4", new Uint8Array([1, 2, 3]), "video/mp4")),
      params,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: "INVALID_FILE_TYPE", message: expect.stringContaining("有效的 MP4") },
    });
  });

  it("returns 413 before reading an oversized video", async () => {
    const arrayBuffer = jest.fn();
    const oversized = { name: "large.mp4", type: "video/mp4", size: MAX_VIDEO_SIZE + 1, arrayBuffer };

    const response = await POST(requestWithFile(oversized), params);

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ success: false, error: { code: "FILE_TOO_LARGE" } });
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it("returns 413 before reading an oversized MP3", async () => {
    const arrayBuffer = jest.fn();
    const oversized = { name: "large.mp3", type: "audio/mpeg", size: MAX_AUDIO_SIZE + 1, arrayBuffer };

    const response = await POST(requestWithFile(oversized), params);

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: "FILE_TOO_LARGE", message: "音频文件大小超过 1MB 限制" },
    });
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it("returns 404 when the session workspace is unavailable", async () => {
    jest.mocked(getSessionWorkspacePath).mockReturnValue(null);
    const file = videoFile(
      "intro.mp4",
      new Uint8Array([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0]),
      "video/mp4",
    );

    const response = await POST(requestWithFile(file), params);

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ success: false, error: { code: "SESSION_NOT_FOUND" } });
  });

  it("拒绝 owner 缺失或不匹配的 Session，且不读取上传内容", async () => {
    jest.mocked(getSessionMeta).mockReturnValue({ demoId: "project-1" } as never);
    const formData = jest.fn();
    const request = { formData } as unknown as Request;

    const response = await POST(request, params);

    expect(response.status).toBe(403);
    expect(formData).not.toHaveBeenCalled();
  });

  it("returns 401 when the session authentication has expired", async () => {
    jest.mocked(verifyToken).mockResolvedValue(null);

    const response = await POST(requestWithFile(videoFile("intro.webm", new Uint8Array([1]), "video/webm")), params);

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ success: false, error: { code: "UNAUTHORIZED" } });
  });
});
