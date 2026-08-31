import { DELETE, POST } from "./route";

const getActor = jest.fn();
const listTrashedProjects = jest.fn();
const restoreTrashedProject = jest.fn();
const purgeTrashedProject = jest.fn();
const reconcileTemplateKnowledge = jest.fn();

jest.mock("@/lib/auth/current-user", () => ({
  getCurrentProjectActor: () => getActor(),
}));
jest.mock("@/lib/project-admin-service", () => ({
  getProjectAdminService: () => ({
    listTrashedProjects,
    restoreTrashedProject,
    purgeTrashedProject,
  }),
  projectAdminResponse: (result: { ok: boolean; data?: unknown }) =>
    new Response(JSON.stringify({ success: result.ok, data: result.data }), {
      status: result.ok ? 200 : 403,
    }),
}));
jest.mock("@/lib/knowledge-service", () => ({ reconcileTemplateKnowledge }));

describe("/api/trash/projects/:id", () => {
  const actor = { id: "editor", name: "编辑者", role: "creator" };

  beforeEach(() => {
    jest.clearAllMocks();
    getActor.mockResolvedValue(actor);
  });

  it("requires authentication for restore and purge", async () => {
    getActor.mockResolvedValue(null);
    const params = { params: Promise.resolve({ id: "p1" }) };
    expect((await POST(new Request("http://localhost", { method: "POST" }), params)).status).toBe(401);
    expect((await DELETE(new Request("http://localhost", { method: "DELETE" }), params)).status).toBe(401);
  });

  it("restores an authorized template and reconciles its knowledge index", async () => {
    listTrashedProjects.mockReturnValue({ ok: true, data: [{ id: "p1", projectType: "template" }] });
    restoreTrashedProject.mockReturnValue({ ok: true, data: { restored: true, projectId: "p1" } });
    const response = await POST(
      new Request("http://localhost", { method: "POST" }),
      { params: Promise.resolve({ id: "p1" }) },
    );
    expect(response.status).toBe(200);
    expect(restoreTrashedProject).toHaveBeenCalledWith("p1", actor);
    expect(reconcileTemplateKnowledge).toHaveBeenCalledTimes(1);
  });

  it("delegates early permanent deletion to the permission-checked service", async () => {
    purgeTrashedProject.mockReturnValue({ ok: true, data: { purged: true, projectId: "p1" } });
    const response = await DELETE(
      new Request("http://localhost", { method: "DELETE" }),
      { params: Promise.resolve({ id: "p1" }) },
    );
    expect(response.status).toBe(200);
    expect(purgeTrashedProject).toHaveBeenCalledWith("p1", actor);
  });
});
