import type { NextRequest } from "next/server";

class TestResponse {
  status: number;
  ok: boolean;
  private readonly body: string;
  constructor(body: string, init?: ResponseInit) { this.status = init?.status ?? 200; this.ok = this.status >= 200 && this.status < 300; this.body = body; }
  async json(): Promise<unknown> { return JSON.parse(this.body); }
  static json(body: unknown, init?: ResponseInit): TestResponse { return new TestResponse(JSON.stringify(body), init); }
}

function request(body: unknown): NextRequest {
  return { json: async () => body, nextUrl: new URL("http://localhost/api/projects/project-1/document-proposals/proposal-1/approve") } as NextRequest;
}

describe("document proposal approve route", () => {
  const originalResponse = global.Response;
  const approveDocumentProposal = jest.fn();
  const setDocumentProposalTaskStatus = jest.fn();
  const get = jest.fn();

  beforeEach(() => {
    jest.resetModules(); jest.clearAllMocks(); global.Response = TestResponse as unknown as typeof Response;
    get.mockReturnValue({ proposalId: "proposal-1", projectId: "project-1", workspaceId: "workspace-1", proposalVersion: 1 });
    approveDocumentProposal.mockResolvedValue({ proposalId: "proposal-1", status: "applied" });
    jest.doMock("next/server", () => ({ NextResponse: { json: TestResponse.json }, NextRequest: class {} }));
    jest.doMock("@workbench/project-core", () => ({ DocumentProposalStore: jest.fn(() => ({ get })), DocumentProposalStoreError: class DocumentProposalStoreError extends Error {} }));
    jest.doMock("@/lib/comment-auth", () => ({ resolveUser: jest.fn(async () => ({ userId: "user-1" })) }));
    jest.doMock("@/lib/document-proposal-approval", () => ({ approveDocumentProposal }));
    jest.doMock("@/lib/comment-store", () => ({ setDocumentProposalTaskStatus }));
    jest.doMock("@/lib/fs-utils", () => ({
      getDataDir: jest.fn(() => "/tmp/data"), projectExists: jest.fn(() => true), sessionExists: jest.fn(() => true),
      getSessionMeta: jest.fn(() => ({ userId: "user-1", demoId: "project-1", workspaceId: "workspace-1", expiresAt: Date.now() + 60_000 })),
      isSessionExpired: jest.fn(() => false),
    }));
  });
  afterEach(() => { global.Response = originalResponse; jest.resetModules(); });

  it("only forwards session, version and idempotency key to the approval service", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({ sessionId: "session-1", proposalVersion: 1, idempotencyKey: "key-1", operations: [{ type: "put_text", content: "attacker" }] }), { params: Promise.resolve({ projectId: "project-1", proposalId: "proposal-1" }) });
    expect(response.status).toBe(200);
    expect(approveDocumentProposal).toHaveBeenCalledWith({ proposalId: "proposal-1", proposalVersion: 1, idempotencyKey: "key-1", actorId: "user-1", sessionId: "session-1" });
    expect(setDocumentProposalTaskStatus).toHaveBeenCalledWith("project-1", "proposal-1", "done");
  });

  it("rejects a session owned by another user before invoking approval", async () => {
    const fsUtils = require("@/lib/fs-utils") as { getSessionMeta: jest.Mock };
    fsUtils.getSessionMeta.mockReturnValue({ userId: "other-user", demoId: "project-1", workspaceId: "workspace-1", expiresAt: Date.now() + 60_000 });
    const { POST } = await import("./route");
    const response = await POST(request({ sessionId: "session-1", proposalVersion: 1, idempotencyKey: "key-1" }), { params: Promise.resolve({ projectId: "project-1", proposalId: "proposal-1" }) });
    expect(response.status).toBe(403);
    expect(approveDocumentProposal).not.toHaveBeenCalled();
  });
});
