import type { NextRequest } from "next/server";

const getImageInfo = jest.fn();
const getImage = jest.fn();
const uploadImage = jest.fn();
const claimWhiteboardDraftImage = jest.fn(() => true);
const releaseWhiteboardDraftImage = jest.fn();
const discardUnclaimedImage = jest.fn();
const getAuthCookie = jest.fn(async (): Promise<string | null> => "token");
const verifyToken = jest.fn(async () => ({ userId: "user-1" }));
const getSessionMeta = jest.fn(() => ({
  demoId: "project-1",
  userId: "user-1",
  expiresAt: Date.now() + 60_000,
}));
const upstreamFetch = jest.fn();

jest.mock("@/lib/image-store", () => ({
  getImageInfo,
  getImage,
  uploadImage,
  claimWhiteboardDraftImage,
  releaseWhiteboardDraftImage,
  discardUnclaimedImage,
  collectExpiredWhiteboardImages: jest.fn(),
}));
jest.mock("@/lib/auth/jwt", () => ({ getAuthCookie, verifyToken }));
jest.mock("@/lib/fs-utils", () => ({
  createApiError: (code: string, message?: string) => ({
    success: false,
    error: { code, message: message || code },
  }),
  createApiSuccess: (data: unknown) => ({ success: true, data }),
  projectExists: () => true,
  sessionExists: () => true,
  getSessionMeta,
  isSessionExpired: () => false,
}));
jest.mock("@/lib/runtime-config", () => ({
  getInternalApiToken: () => "internal",
  getServerAgentServiceUrl: () => "http://agent",
}));

function request(
  body: unknown,
  url = "http://localhost/api?sessionId=session-1",
): NextRequest {
  return {
    url,
    signal: new AbortController().signal,
    json: async () => body,
  } as unknown as NextRequest;
}

describe("whiteboard image generation route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    upstreamFetch.mockReset();
    global.fetch = upstreamFetch as unknown as typeof fetch;
    getImageInfo.mockReturnValue({
      mimeType: "image/png",
      whiteboardDrafts: { wb_draft: Date.now() + 60_000 },
    });
    getImage.mockReturnValue({
      buffer: Buffer.from("ref"),
      mimeType: "image/png",
    });
    uploadImage.mockResolvedValue({
      success: true,
      imageId: "img_generated",
      url: "/api/images/img_generated",
      mimeType: "image/png",
    });
  });

  it("maps agent capabilities without exposing provider configuration", async () => {
    upstreamFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          enabled: true,
          model: "gpt-image-1",
          qualityIds: ["auto", "low", "high"],
          sizeIds: ["1024x1024", "1536x1024", "1024x1536"],
          maxCount: 4,
          maxPromptLength: 4000,
          supportsReferences: true,
        },
      }),
    });
    const { GET } = await import("./route");
    const response = await GET(
      request({}, "http://localhost/api?sessionId=session-1"),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        enabled: true,
        modelId: "gpt-image-1",
        qualities: [
          { id: "auto", label: "自动" },
          { id: "low", label: "低" },
          { id: "high", label: "高" },
        ],
        sizes: [
          { id: "1024x1024", width: 1024, height: 1024 },
          { id: "1536x1024", width: 1536, height: 1024 },
          { id: "1024x1536", width: 1024, height: 1536 },
        ],
        maxImages: 4,
        maxReferences: 4,
        supportsReferences: true,
      },
    });
  });

  it("disables generation when the current session quota is exhausted", async () => {
    upstreamFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          enabled: true,
          model: "gpt-image-1",
          qualityIds: ["auto"],
          sizeIds: ["1024x1024"],
          maxCount: 4,
          remainingCount: 0,
          supportsReferences: true,
        },
      }),
    });
    const { GET } = await import("./route");
    const response = await GET(
      request({}, "http://localhost/api?sessionId=session-1"),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        enabled: false,
        unavailableReason: "本会话 AI 绘图配额已用完",
      },
    });
  });

  it("rejects an unauthenticated request", async () => {
    getAuthCookie.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    expect(
      (
        await GET(request({}), {
          params: Promise.resolve({ projectId: "project-1" }),
        })
      ).status,
    ).toBe(401);
  });

  it("rejects references leased to another draft", async () => {
    getImageInfo.mockReturnValue({
      mimeType: "image/png",
      whiteboardDrafts: { other_draft: Date.now() + 60_000 },
    });
    const { POST } = await import("./route");
    upstreamFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          enabled: true,
          qualityIds: ["auto"],
          sizeIds: ["1024x1024"],
          maxCount: 1,
          maxPromptLength: 4000,
          supportsReferences: true,
        },
      }),
    });
    const response = await POST(
      request({
        sessionId: "session-1",
        draftId: "wb_draft",
        prompt: "a cat",
        count: 1,
        qualityId: "auto",
        sizeId: "1024x1024",
        referenceAssetIds: ["img_ref"],
      }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );
    expect(response.status).toBe(403);
    expect(upstreamFetch).toHaveBeenCalledTimes(1);
  });

  it("stores dataBase64 results and claims every generated asset", async () => {
    upstreamFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            enabled: true,
            qualityIds: ["auto"],
            sizeIds: ["1024x1024"],
            maxCount: 1,
            maxPromptLength: 4000,
            supportsReferences: true,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            images: [
              {
                dataBase64: Buffer.from("png").toString("base64"),
                mimeType: "image/png",
              },
            ],
          },
        }),
      });
    const { POST } = await import("./route");
    const response = await POST(
      request({
        sessionId: "session-1",
        draftId: "wb_draft",
        prompt: "a cat",
        count: 1,
        qualityId: "auto",
        sizeId: "1024x1024",
        referenceAssetIds: [],
      }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );
    expect(response.status).toBe(200);
    expect(uploadImage).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: "ai_generated" }),
    );
    expect(claimWhiteboardDraftImage).toHaveBeenCalledWith(
      "img_generated",
      "wb_draft",
    );
  });

  it("rejects custom dimensions that the capability profile does not expose", async () => {
    upstreamFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          enabled: true,
          qualityIds: ["auto"],
          sizeIds: ["1024x1024"],
          maxCount: 1,
          maxPromptLength: 4000,
          supportsReferences: false,
        },
      }),
    });
    const { POST } = await import("./route");
    const response = await POST(
      request({
        sessionId: "session-1",
        draftId: "wb_draft",
        prompt: "a cat",
        count: 1,
        qualityId: "auto",
        sizeId: "1024x1024",
        width: 2048,
        height: 2048,
        referenceAssetIds: [],
      }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );
    expect(response.status).toBe(400);
    expect(upstreamFetch).toHaveBeenCalledTimes(1);
  });

  it("releases earlier generated assets when a later result cannot be stored", async () => {
    upstreamFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            enabled: true,
            qualityIds: ["auto"],
            sizeIds: ["1024x1024"],
            maxCount: 2,
            maxPromptLength: 4000,
            supportsReferences: false,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            images: [
              { dataBase64: "eA==", mimeType: "image/png" },
              { dataBase64: "eA==", mimeType: "image/png" },
            ],
          },
        }),
      });
    uploadImage
      .mockResolvedValueOnce({
        success: true,
        imageId: "img_first",
        url: "/api/images/img_first",
        mimeType: "image/png",
      })
      .mockResolvedValueOnce({
        success: false,
        error: { message: "store failed" },
      });
    const { POST } = await import("./route");
    const response = await POST(
      request({
        sessionId: "session-1",
        draftId: "wb_draft",
        prompt: "two cats",
        count: 2,
        qualityId: "auto",
        sizeId: "1024x1024",
        referenceAssetIds: [],
      }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );
    expect(response.status).toBe(502);
    expect(releaseWhiteboardDraftImage).toHaveBeenCalledWith("img_first", "wb_draft");
  });
});
