/** @jest-environment node */
import { NextRequest } from "next/server";

const admin = { getProject: jest.fn() };
const mockFindUserById = jest.fn();
const mockGetSessionMeta = jest.fn();
const mockResolveWorkspace = jest.fn();
const mockReadContent = jest.fn();
const mockReadImage = jest.fn();

jest.mock("@/lib/conversation/internal-auth", () => ({
  requireConversationInternalToken: jest.fn(() => null),
}));
jest.mock("@/lib/user", () => ({
  findUserById: (...args: unknown[]) => mockFindUserById(...args),
}));
jest.mock("@/lib/auth/current-user", () => ({
  toProjectAdminActor: (value: typeof user) => ({
    id: value.id,
    name: value.username,
    role: "creator",
    source: "author-site",
  }),
}));
jest.mock("@/lib/fs-utils", () => ({
  createApiError: (code: string, message?: string) => ({
    success: false,
    error: { code, ...(message ? { message } : {}) },
  }),
  createApiSuccess: (data: unknown) => ({ success: true, data }),
  getSessionMeta: (...args: unknown[]) => mockGetSessionMeta(...args),
  isSessionExpired: jest.fn(() => false),
}));
jest.mock("@/lib/project-admin-service", () => ({
  getProjectAdminService: () => admin,
  projectAdminResponse: (result: { error?: unknown }) =>
    new Response(JSON.stringify({ success: false, error: result.error }), {
      status: 403,
      headers: { "content-type": "application/json" },
    }),
}));
jest.mock("@/lib/markdown-references", () => ({
  resolveMarkdownReferenceWorkspace: (...args: unknown[]) =>
    mockResolveWorkspace(...args),
}));
jest.mock("@/lib/markdown-reference-content", () => ({
  readMarkdownReferenceContent: (...args: unknown[]) =>
    mockReadContent(...args),
  readMarkdownReferenceImage: (...args: unknown[]) => mockReadImage(...args),
}));

import { POST } from "./route";
import { requireConversationInternalToken } from "@/lib/conversation/internal-auth";
import { isSessionExpired } from "@/lib/fs-utils";

const user = { id: "owner", username: "Owner", role: "editor" };
const session = {
  sessionId: "session",
  demoId: "source",
  userId: "owner",
  expiresAt: Date.now() + 60_000,
  workspaceId: "workspace",
};

function request(
  body: unknown,
  headers: Record<string, string> = { "x-internal-token": "ok" },
) {
  return new NextRequest(
    "http://localhost/api/internal/markdown-references/read",
    { method: "POST", headers, body: JSON.stringify(body) },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFindUserById.mockReturnValue(user);
  mockGetSessionMeta.mockReturnValue(session);
  admin.getProject.mockReturnValue({ ok: true, data: {} });
  mockResolveWorkspace.mockReturnValue({
    projectId: "source",
    workspaceId: "workspace",
    workspacePath: "/private/workspace",
  });
  mockReadContent.mockReturnValue({
    uri: "wb://project/source",
    content: "overview",
  });
  mockReadImage.mockResolvedValue({
    uri: "wb://page/source/page-1",
    assetId: "img_1",
    mimeType: "image/png",
    dataBase64: "AA==",
  });
});

it("requires the existing internal token and bounded JSON body", async () => {
  jest
    .mocked(requireConversationInternalToken)
    .mockReturnValueOnce(
      new Response(JSON.stringify({ success: false }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }) as never,
    );
  expect((await POST(request({}))).status).toBe(401);
  expect((await POST(request({ ownerUserId: "owner" }))).status).toBe(400);
});

it.each([
  { uri: "wb://project/source", mode: "content" },
  { uri: "wb://page/source/page-1", mode: "content" },
  { uri: "wb://document/source/doc-1", mode: "content" },
  { uri: "wb://config/source/page-1/title", mode: "content" },
] as const)(
  "authorizes and reads the four target kinds: $uri",
  async (body) => {
    const result = await POST(
      request({
        ownerUserId: "owner",
        sourceProjectId: "source",
        sessionId: "session",
        ...body,
      }),
    );
    expect(result.status).toBe(200);
    expect(admin.getProject).toHaveBeenCalledTimes(2);
    expect(mockResolveWorkspace).toHaveBeenCalled();
    expect(result.headers.get("cache-control")).toBe("no-store");
  },
);

it("does not pass the source session while reading a cross-project target", async () => {
  await POST(
    request({
      ownerUserId: "owner",
      sourceProjectId: "source",
      sessionId: "session",
      uri: "wb://page/target/page-1",
    }),
  );
  const sourceRequest = mockResolveWorkspace.mock.calls[0][0] as NextRequest;
  expect(sourceRequest.nextUrl.searchParams.get("sessionId")).toBeNull();
  expect(admin.getProject).toHaveBeenNthCalledWith(
    1,
    "source",
    expect.anything(),
  );
  expect(admin.getProject).toHaveBeenNthCalledWith(
    2,
    "target",
    expect.anything(),
  );
});

const validBody = { ownerUserId: "owner", sourceProjectId: "source", sessionId: "session", uri: "wb://project/source" };

it("rejects revoked target access before reading any content", async () => {
  admin.getProject.mockReturnValueOnce({ ok: true }).mockReturnValueOnce({ ok: false });
  expect((await POST(request(validBody))).status).toBe(403);
  expect(mockReadContent).not.toHaveBeenCalled();
  expect(mockResolveWorkspace).not.toHaveBeenCalled();
});

it.each([
  null,
  { ...session, userId: "someone-else" },
  { ...session, demoId: "other" },
])("rejects unbound sessions", async invalid => {
  mockGetSessionMeta.mockReturnValue(invalid);
  expect((await POST(request(validBody))).status).toBe(404);
  expect(mockReadContent).not.toHaveBeenCalled();
});

it("rejects expired sessions", async () => {
  jest.mocked(isSessionExpired).mockReturnValueOnce(true);
  expect((await POST(request(validBody))).status).toBe(410);
  expect(mockReadContent).not.toHaveBeenCalled();
});

it("sanitizes database failures and rejects oversized bodies even without content-length", async () => {
  expect((await POST(request({ ...validBody, extra: "x".repeat(65536) }))).status).toBe(400);
  mockFindUserById.mockImplementationOnce(() => { throw new Error("/private/secret.db"); });
  const result = await POST(request(validBody));
  expect(result.status).toBe(503);
  expect(await result.text()).not.toContain("/private/");
  expect(result.headers.get("cache-control")).toBe("no-store");
});
