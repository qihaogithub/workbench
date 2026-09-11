import type { NextRequest } from "next/server";

const list = jest.fn();
const create = jest.fn();
const refreshProjectInventoryAfterDocumentMutation = jest.fn();
const actor = { id: "u1", name: "Author", role: "creator" as const };

jest.mock("@/lib/auth/current-user", () => ({
  getCurrentProjectActor: jest.fn(async () => actor),
}));
jest.mock("@/lib/document-application-service", () => ({
  assertProject: jest.fn(),
  documentErrorResponse: jest.fn((error: unknown) => ({ status: 500, body: { success: false, error: { code: "TEST", message: String(error) } } })),
  resolveDocumentActor: jest.fn(async () => actor),
  resolveDocumentContext: jest.fn(async () => ({})),
  refreshProjectInventoryAfterDocumentMutation,
  createDocumentApplicationService: jest.fn(() => ({ list, create })),
}));

function request(url: string, body?: unknown): NextRequest {
  return { nextUrl: new URL(url), json: async () => body } as unknown as NextRequest;
}

describe("project document collection API", () => {
  beforeEach(() => {
    list.mockReset();
    create.mockReset();
    refreshProjectInventoryAfterDocumentMutation.mockReset();
  });

  it("lists metadata without exposing a workspace path", async () => {
    list.mockResolvedValue({ items: [{ projectId: "p1", documentId: "d1", title: "Rules", description: "Rules", updatedAt: "2026-09-01T00:00:00.000Z", source: "user", sizeBytes: 5, sourceState: "active" }], issues: [] });
    const { GET } = await import("./route");
    const response = await GET(request("http://localhost/api/projects/p1/documents"), { params: Promise.resolve({ projectId: "p1" }) });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.items[0]).not.toHaveProperty("workingDir");
    expect(body.data.items[0]).not.toHaveProperty("fileName");
    expect(body.data.items[0]).not.toHaveProperty("content");
    expect(body.data.issues).toEqual([]);
  });

  it("creates through the application service contract", async () => {
    create.mockResolvedValue({ snapshot: { projectId: "p1", documentId: "d1", title: "Rules", description: "Rules", content: "# Rules", updatedAt: "2026-09-01T00:00:00.000Z", contentHash: "hash", source: "user", sizeBytes: 7 } });
    const { POST } = await import("./route");
    const response = await POST(request("http://localhost/api/projects/p1/documents", { title: "Rules", content: "# Rules" }), { params: Promise.resolve({ projectId: "p1" }) });
    expect(response.status).toBe(201);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ projectId: "p1", title: "Rules", content: "# Rules", actor }));
  });

  it("rejects non-object create payloads with a stable validation error", async () => {
    const { POST } = await import("./route");
    const response = await POST(request("http://localhost/api/projects/p1/documents", null), { params: Promise.resolve({ projectId: "p1" }) });
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body).toMatchObject({ success: false, error: { code: "DOCUMENT_INVALID" } });
    expect(create).not.toHaveBeenCalled();
  });
});
