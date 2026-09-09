/** @jest-environment node */
import { NextRequest } from "next/server";
var mockProjectAdminService = { getProject: jest.fn() };
jest.mock("@/lib/auth/current-user", () => ({ getCurrentProjectActor: jest.fn() }));
jest.mock("@/lib/project-admin-service", () => ({
  getProjectAdminService: () => mockProjectAdminService,
  projectAdminResponse: (result: { error?: { code?: string; message?: string } }) =>
    Response.json({ success: false, error: result.error }, { status: 403 }),
}));
jest.mock("@/lib/fs-utils", () => ({
  createApiError: (code: string, message?: string) => ({ success: false, error: { code, ...(message ? { message } : {}) } }),
  createApiSuccess: (data: unknown) => ({ success: true, data }),
}));
jest.mock("@/lib/markdown-references", () => ({ resolveMarkdownReferenceWorkspace: jest.fn(), openPersistentMarkdownReferenceIndex: jest.fn(), toCandidateList: jest.fn() }));
import { resolveMarkdownReferenceWorkspace, openPersistentMarkdownReferenceIndex, toCandidateList } from "../markdown-references";
import { GET } from "../../app/api/projects/[projectId]/markdown-references/candidates/route";
import { getCurrentProjectActor } from "@/lib/auth/current-user";

const actor = { id: "user-1", name: "User", role: "creator", source: "author-site" } as const;

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(openPersistentMarkdownReferenceIndex).mockReset();
  jest.mocked(toCandidateList).mockReset();
  jest.mocked(getCurrentProjectActor).mockResolvedValue(actor);
  mockProjectAdminService.getProject.mockReturnValue({ ok: true, data: {} });
  jest.mocked(resolveMarkdownReferenceWorkspace).mockReturnValue({ projectId: "p", workspaceId: "w", workspacePath: "/workspace/p" });
  jest.mocked(openPersistentMarkdownReferenceIndex).mockReturnValue({ index: { snapshot: () => null, close: jest.fn() }, status: "stale" } as never);
  jest.mocked(toCandidateList).mockReturnValue([]);
});

it("fails unavailable directories without a successful empty candidate list", async () => {
  jest.mocked(openPersistentMarkdownReferenceIndex).mockImplementation(() => { throw new Error("EACCES: private path"); });
  const response = await GET(new NextRequest("http://localhost/api/projects/p/markdown-references/candidates"), { params: Promise.resolve({ projectId: "p" }) });
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ success: false, error: { code: "FILE_READ_ERROR", message: "引用目录暂时不可用" } });
});

it("rejects anonymous and unauthorized projects before directory access", async () => {
  jest.mocked(getCurrentProjectActor).mockResolvedValueOnce(null);
  const anonymous = await GET(new NextRequest("http://localhost/api/projects/p/markdown-references/candidates"), { params: Promise.resolve({ projectId: "p" }) });
  expect(anonymous.status).toBe(401);
  expect(mockProjectAdminService.getProject).not.toHaveBeenCalled();
  expect(openPersistentMarkdownReferenceIndex).not.toHaveBeenCalled();

  mockProjectAdminService.getProject.mockReturnValueOnce({ ok: false, error: { code: "FORBIDDEN", message: "denied" } });
  const denied = await GET(new NextRequest("http://localhost/api/projects/p/markdown-references/candidates"), { params: Promise.resolve({ projectId: "p" }) });
  expect(denied.status).toBe(403);
  expect(resolveMarkdownReferenceWorkspace).not.toHaveBeenCalled();
});

it("passes the authenticated actor to session validation, including foreign sessions", async () => {
  const current = new NextRequest("http://localhost/api/projects/p/markdown-references/candidates?sessionId=current");
  await GET(current, { params: Promise.resolve({ projectId: "p" }) });
  expect(mockProjectAdminService.getProject).toHaveBeenCalledWith("p", actor);
  expect(resolveMarkdownReferenceWorkspace).toHaveBeenCalledWith(current, "p", actor.id);

  jest.mocked(resolveMarkdownReferenceWorkspace).mockReturnValueOnce(null);
  const foreign = new NextRequest("http://localhost/api/projects/p/markdown-references/candidates?sessionId=foreign");
  const response = await GET(foreign, { params: Promise.resolve({ projectId: "p" }) });
  expect(response.status).toBe(404);
});

it("returns all empty-query candidates even with a requested limit", async () => {
  jest.mocked(openPersistentMarkdownReferenceIndex).mockReturnValue({ index: { snapshot: () => null, close: jest.fn() }, status: "stale" } as unknown as ReturnType<typeof openPersistentMarkdownReferenceIndex>);
  jest.mocked(toCandidateList).mockReturnValue(Array.from({ length: 130 }, (_, index) => ({ target: { kind: "page", projectId: "p", pageId: String(index) }, label: String(index), displayPath: String(index), aliases: [], score: 0 })));
  const response = await GET(new NextRequest("http://localhost/api/projects/p/markdown-references/candidates?q=&limit=1"), { params: Promise.resolve({ projectId: "p" }) });
  expect(response.status).toBe(200);
  expect((await response.json()).data.candidates).toHaveLength(130);
});
