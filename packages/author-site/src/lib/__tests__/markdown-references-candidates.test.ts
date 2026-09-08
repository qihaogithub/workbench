/** @jest-environment node */
import { NextRequest } from "next/server";
jest.mock("@/lib/auth/jwt", () => ({ getAuthCookie: async () => "token", verifyToken: async () => ({ userId: "user" }) }));
jest.mock("@/lib/fs-utils", () => ({ projectExists: () => true, createApiError: (code: string, message: string) => ({ success: false, error: { code, message } }), createApiSuccess: (data: unknown) => ({ success: true, data }) }));
jest.mock("@/lib/markdown-references", () => ({ resolveMarkdownReferenceWorkspace: () => ({ projectId: "p", workspaceId: "w" }), openPersistentMarkdownReferenceIndex: jest.fn(), toCandidateList: jest.fn() }));
import { openPersistentMarkdownReferenceIndex, toCandidateList } from "../markdown-references";
import { GET } from "../../app/api/projects/[projectId]/markdown-references/candidates/route";

it("fails unavailable directories without a successful empty candidate list", async () => {
  jest.mocked(openPersistentMarkdownReferenceIndex).mockImplementation(() => { throw new Error("EACCES: private path"); });
  const response = await GET(new NextRequest("http://localhost/api/projects/p/markdown-references/candidates"), { params: Promise.resolve({ projectId: "p" }) });
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ success: false, error: { code: "FILE_READ_ERROR", message: "引用目录暂时不可用" } });
});

it("returns all empty-query candidates even with a requested limit", async () => {
  jest.mocked(openPersistentMarkdownReferenceIndex).mockReturnValue({ index: { snapshot: () => null, close: jest.fn() }, status: "stale" } as unknown as ReturnType<typeof openPersistentMarkdownReferenceIndex>);
  jest.mocked(toCandidateList).mockReturnValue(Array.from({ length: 130 }, (_, index) => ({ target: { kind: "page", projectId: "p", pageId: String(index) }, label: String(index), displayPath: String(index), aliases: [], score: 0 })));
  const response = await GET(new NextRequest("http://localhost/api/projects/p/markdown-references/candidates?q=&limit=1"), { params: Promise.resolve({ projectId: "p" }) });
  expect(response.status).toBe(200);
  expect((await response.json()).data.candidates).toHaveLength(130);
});
