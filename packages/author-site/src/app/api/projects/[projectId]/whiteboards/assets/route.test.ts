import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { NextRequest } from "next/server";

const normalizeWhiteboardImage = jest.fn();
const claimWhiteboardDraftImage = jest.fn(() => true);
const collectExpiredWhiteboardImages = jest.fn();
const getImage = jest.fn();
const getImageInfo = jest.fn();
const getProjectImages = jest.fn(() => [] as Array<Record<string, unknown>>);
const sessionAssetPath = jest.fn();
let mockWorkspacePath = "";

jest.mock("@/lib/auth/jwt", () => ({
  getAuthCookie: jest.fn(async () => "token"),
  verifyToken: jest.fn(async () => ({ userId: "user-1" })),
}));

jest.mock("@/lib/fs-utils", () => ({
  createApiError: jest.fn((code: string, message?: string, details?: unknown) => ({ success: false, error: { code, message: message || code, details } })),
  createApiSuccess: jest.fn((data: unknown) => ({ success: true, data })),
  findWorkspacePath: jest.fn(() => mockWorkspacePath),
  getSessionMeta: jest.fn(() => ({ sessionId: "session-1", demoId: "project-1", userId: "user-1", workspaceId: "workspace-1", expiresAt: Date.now() + 60_000 })),
  isSessionExpired: jest.fn(() => false),
  projectExists: jest.fn(() => true),
  sessionExists: jest.fn(() => true),
}));

jest.mock("@/lib/image-store", () => ({
  claimWhiteboardDraftImage,
  collectExpiredWhiteboardImages,
  getImage,
  getImageInfo,
}));

jest.mock("@/lib/project-images", () => ({ getProjectImages }));
jest.mock("@/lib/session-assets", () => ({ getSessionAssetPath: sessionAssetPath }));
jest.mock("@/lib/whiteboard-image-assets", () => ({
  decodeWhiteboardDataUrl: jest.fn(),
  downloadWhiteboardImage: jest.fn(),
  normalizeWhiteboardImage,
  resolveWorkspaceImageFile: jest.fn(),
  WhiteboardImageAssetError: class WhiteboardImageAssetError extends Error {
    code = "IMAGE_PREPARE_FAILED";
  },
}));

function jsonRequest(body: unknown): NextRequest {
  return { json: async () => body } as NextRequest;
}

describe("whiteboard asset localization route", () => {
  let assetPath: string;

  beforeEach(() => {
    jest.clearAllMocks();
    mockWorkspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "whiteboard-workspace-"));
    assetPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "whiteboard-session-asset-")), "popup.gif");
    fs.writeFileSync(assetPath, Buffer.from("session-image"));
    sessionAssetPath.mockReturnValue(assetPath);
    getImageInfo.mockReturnValue({ mimeType: "image/jpeg" });
    getImage.mockReturnValue({ buffer: Buffer.from("project-image"), mimeType: "image/jpeg" });
    normalizeWhiteboardImage.mockResolvedValue({
      success: true,
      imageId: "img_static_png",
      assetRef: "img_static_png",
      url: "/api/images/img_static_png",
      sha256: "a".repeat(64),
      filename: "whiteboard-image.png",
      sizeBytes: 10,
      width: 120,
      height: 80,
      mimeType: "image/png",
      deduplicated: false,
      staticFrame: true,
      sourceMimeType: "image/gif",
      sourceWasAnimated: true,
    });
  });

  afterEach(() => {
    fs.rmSync(path.dirname(assetPath), { recursive: true, force: true });
    fs.rmSync(mockWorkspacePath, { recursive: true, force: true });
  });

  it("reads legacy session assets and sends their bytes through the PNG normalizer", async () => {
    const { POST } = await import("./route");
    const response = await POST(jsonRequest({
      sessionId: "session-1",
      draftId: "wb_draft",
      nodeId: "hero",
      source: { src: "/api/sessions/session-1/assets/popup.gif" },
    }), { params: Promise.resolve({ projectId: "project-1" }) });

    expect(response.status).toBe(200);
    expect(normalizeWhiteboardImage).toHaveBeenCalledWith(expect.objectContaining({
      buffer: Buffer.from("session-image"),
      filename: "whiteboard-hero.png",
      createdBy: "user-1",
    }));
    expect(claimWhiteboardDraftImage).toHaveBeenCalledWith("img_static_png", "wb_draft");
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { assetRef: "img_static_png", mimeType: "image/png", staticFrame: true, sourceWasAnimated: true },
    });
  });

  it("resolves project image route URLs through the same normalizer", async () => {
    getProjectImages.mockReturnValue([{
      id: "img_project",
      filename: "hero.webp",
      url: "/api/images/img_project",
      size: 12,
      format: "webp",
      createdAt: 1,
      createdBy: "user",
    }]);
    const { POST } = await import("./route");
    const response = await POST(jsonRequest({
      sessionId: "session-1",
      draftId: "wb_draft",
      nodeId: "hero",
      source: { src: "/api/projects/project-1/images/hero.webp" },
    }), { params: Promise.resolve({ projectId: "project-1" }) });

    expect(response.status).toBe(200);
    expect(normalizeWhiteboardImage).toHaveBeenCalledWith(expect.objectContaining({
      buffer: Buffer.from("project-image"),
      sourceUrl: "/api/projects/project-1/images/hero.webp",
      createdBy: "user-1",
    }));
  });
});
