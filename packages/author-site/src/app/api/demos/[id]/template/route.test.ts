import { PATCH } from "./route";

const getActor = jest.fn();
const updateProject = jest.fn();

jest.mock("@/lib/auth/current-user", () => ({
  getCurrentProjectActor: () => getActor(),
}));
jest.mock("@/lib/project-admin-service", () => ({
  getProjectAdminService: () => ({ updateProject }),
  projectAdminResponse: (result: { ok: boolean; data?: unknown }) =>
    new Response(JSON.stringify({ success: result.ok, data: result.data }), {
      status: result.ok ? 200 : 400,
    }),
}));
jest.mock("@/lib/knowledge-service", () => ({ reconcileTemplateKnowledge: jest.fn() }));

describe("PATCH /api/demos/:id/template", () => {
  beforeEach(() => {
    getActor.mockReset();
    updateProject.mockReset();
  });

  it("requires a signed-in administrator", async () => {
    getActor.mockResolvedValue(null);
    const unauthenticated = await PATCH(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ isTemplate: true }) }),
      { params: Promise.resolve({ id: "p1" }) },
    );
    expect(unauthenticated.status).toBe(401);

    getActor.mockResolvedValue({ id: "editor", name: "Editor", role: "creator" });
    const forbidden = await PATCH(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ isTemplate: true }) }),
      { params: Promise.resolve({ id: "p1" }) },
    );
    expect(forbidden.status).toBe(403);
    expect(updateProject).not.toHaveBeenCalled();
  });

  it("validates and sends the project template update with the admin actor", async () => {
    const actor = { id: "admin", name: "Admin", role: "admin" };
    getActor.mockResolvedValue(actor);
    updateProject.mockReturnValue({ ok: true, data: { projectType: "template" } });

    const invalid = await PATCH(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ isTemplate: "yes" }) }),
      { params: Promise.resolve({ id: "p1" }) },
    );
    expect(invalid.status).toBe(400);

    await PATCH(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ isTemplate: true }) }),
      { params: Promise.resolve({ id: "p1" }) },
    );
    expect(updateProject).toHaveBeenCalledWith(
      { projectId: "p1", projectType: "template" },
      actor,
    );
  });
});
