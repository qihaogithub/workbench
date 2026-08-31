jest.mock("@/lib/auth/jwt", () => ({
  getAuthCookie: jest.fn(),
  verifyToken: jest.fn(),
}));
jest.mock("@/lib/fs-utils", () => ({
  sessionExists: jest.fn(),
  createApiSuccess: jest.fn(),
  createApiError: jest.fn(),
  getSessionMeta: jest.fn(),
  getSessionWorkspacePath: jest.fn(),
}));
jest.mock("@/lib/image-store", () => ({ uploadImage: jest.fn() }));
jest.mock("@/lib/project-images", () => ({ addProjectImage: jest.fn() }));
jest.mock("./extract-spine-package", () => ({
  selectSpinePackage: jest.fn(),
  ANIMATION_ASSET_EXTS: new Set(),
}));

import { isAllowedAssetFile, MAX_VIDEO_SIZE } from "./asset-validation";

describe("session asset upload validation", () => {
  it("accepts an MP4 whose browser MIME type is generic when its bytes identify it as MP4", () => {
    const file = {
      name: "hero.mp4",
      type: "application/octet-stream",
    } as File;

    const mp4Header = Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);

    expect(isAllowedAssetFile(file, mp4Header)).toBe(true);
  });

  it("rejects a generic-MIME MP4 when its bytes are not an MP4 container", () => {
    const file = {
      name: "hero.mp4",
      type: "application/octet-stream",
    } as File;

    expect(isAllowedAssetFile(file, Buffer.from("not a video"))).toBe(false);
  });

  it("allows individual videos up to 200MB", () => {
    expect(MAX_VIDEO_SIZE).toBe(200 * 1024 * 1024);
  });
});
