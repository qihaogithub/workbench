jest.mock("@/lib/comment-auth", () => ({ resolveCommentAuthor: jest.fn() }));
jest.mock("@/lib/image-store", () => ({ uploadImage: jest.fn() }));
jest.mock("@/lib/fs-utils", () => ({
  createApiError: jest.fn((code: string, message?: string, details?: unknown) => ({
    success: false,
    error: { code, message: message || code, details },
  })),
  createApiSuccess: jest.fn((data: unknown) => ({ success: true, data })),
}));

import { resolveCommentAuthor } from "@/lib/comment-auth";
import { uploadImage } from "@/lib/image-store";
import { POST } from "./route";

function requestWithForm(entries: Record<string, unknown>) {
  return {
    formData: async () => ({
      get: (key: string) => entries[key] ?? null,
    }),
  } as never;
}

function imageFile(name: string, contents: string, type: string): File {
  const file = new File([contents], name, { type });
  // jsdom's File omits the WHATWG arrayBuffer helper used by the route.
  Object.defineProperty(file, "arrayBuffer", {
    value: async () => new TextEncoder().encode(contents).buffer,
  });
  return file;
}

describe("comment image upload route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(resolveCommentAuthor).mockResolvedValue({
      author: { id: "user-1", name: "测试用户", isAnonymous: false },
      userId: "user-1",
      role: "editor",
    });
    jest.mocked(uploadImage).mockResolvedValue({
      success: true,
      imageId: "img_comment",
      url: "/api/images/img_comment",
      filename: "note.png",
      sha256: "a".repeat(64),
      sizeBytes: 12,
      width: 2,
      height: 2,
      mimeType: "image/png",
      deduplicated: false,
    });
  });

  it("uploads an authenticated comment image and records the project owner", async () => {
    const file = imageFile("note.png", "png-bytes", "image/png");
    const response = await POST(
      requestWithForm({ file }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(200);
    expect(uploadImage).toHaveBeenCalledWith(expect.objectContaining({
      filename: "note.png",
      projectId: "project-1",
      createdBy: "user-1",
      sourceType: "user_upload",
      buffer: expect.any(Buffer),
    }));
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { url: "/api/images/img_comment", kind: "image" },
    });
  });

  it("accepts anonymous identity fields and forwards the anonymous id", async () => {
    jest.mocked(resolveCommentAuthor).mockResolvedValueOnce({
      author: { id: "anon-1", name: "访客", isAnonymous: true },
    });
    const file = imageFile("note.jpg", "jpeg-bytes", "image/jpeg");
    const response = await POST(
      requestWithForm({ file, anonymousId: "anon-1", displayName: "访客" }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(200);
    expect(resolveCommentAuthor).toHaveBeenCalledWith(expect.anything(), {
      anonymousId: "anon-1",
      displayName: "访客",
    });
    expect(uploadImage).toHaveBeenCalledWith(expect.objectContaining({ createdBy: "anon-1" }));
  });

  it("rejects a missing anonymous identity before touching the image store", async () => {
    jest.mocked(resolveCommentAuthor).mockResolvedValueOnce(null);
    const file = imageFile("note.png", "png-bytes", "image/png");
    const response = await POST(
      requestWithForm({ file }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(400);
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it("requires a display name when the resolved author is anonymous", async () => {
    jest.mocked(resolveCommentAuthor).mockResolvedValueOnce({
      author: { id: "anon-1", name: "匿名用户", isAnonymous: true },
    });
    const file = imageFile("note.png", "png-bytes", "image/png");
    const response = await POST(
      requestWithForm({ file, anonymousId: "anon-1" }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(400);
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it("maps image-store size and format failures to upload validation statuses", async () => {
    jest.mocked(uploadImage).mockResolvedValueOnce({
      success: false,
      error: { code: "ASSET_TOO_LARGE", message: "too large" },
    });
    const file = imageFile("note.png", "png-bytes", "image/png");
    const tooLarge = await POST(
      requestWithForm({ file }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );
    expect(tooLarge.status).toBe(413);

    jest.mocked(uploadImage).mockResolvedValueOnce({
      success: false,
      error: { code: "UNSUPPORTED_FORMAT", message: "bad format" },
    });
    const unsupported = await POST(
      requestWithForm({ file }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );
    expect(unsupported.status).toBe(415);
  });
});
