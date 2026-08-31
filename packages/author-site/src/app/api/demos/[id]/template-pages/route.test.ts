import { PATCH } from "./route";

const getActor = jest.fn();
const updatePageTemplates = jest.fn();

jest.mock("@/lib/auth/current-user", () => ({
  getCurrentProjectActor: () => getActor(),
}));
jest.mock("@/lib/project-admin-service", () => ({
  getProjectAdminService: () => ({ updatePageTemplates }),
  projectAdminResponse: (result: { ok: boolean; data?: unknown }) =>
    new Response(JSON.stringify({ success: result.ok, data: result.data }), {
      status: result.ok ? 200 : 400,
    }),
}));

describe("PATCH /api/demos/:id/template-pages", () => {
  beforeEach(() => {
    getActor.mockReset();
    updatePageTemplates.mockReset();
  });

  it("rejects unsigned and non-admin callers", async () => {
    getActor.mockResolvedValue(null);
    const unauthenticated = await PATCH(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ pageIds: ["page-1"], isTemplatePage: true }) }),
      { params: Promise.resolve({ id: "p1" }) },
    );
    expect(unauthenticated.status).toBe(401);

    getActor.mockResolvedValue({ id: "editor", name: "Editor", role: "creator" });
    const forbidden = await PATCH(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ pageIds: ["page-1"], isTemplatePage: true }) }),
      { params: Promise.resolve({ id: "p1" }) },
    );
    expect(forbidden.status).toBe(403);
    expect(updatePageTemplates).not.toHaveBeenCalled();
  });

  it("validates nonempty page ids and performs the atomic update", async () => {
    const actor = { id: "admin", name: "Admin", role: "admin" };
    getActor.mockResolvedValue(actor);
    const invalid = await PATCH(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ pageIds: [], isTemplatePage: true }) }),
      { params: Promise.resolve({ id: "p1" }) },
    );
    expect(invalid.status).toBe(400);

    updatePageTemplates.mockReturnValue({ ok: true, data: { pages: [] } });
    await PATCH(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ pageIds: ["page-1", "page-2"], isTemplatePage: false }) }),
      { params: Promise.resolve({ id: "p1" }) },
    );
    expect(updatePageTemplates).toHaveBeenCalledWith(
      { projectId: "p1", pageIds: ["page-1", "page-2"], isTemplatePage: false },
      actor,
    );
  });
});
