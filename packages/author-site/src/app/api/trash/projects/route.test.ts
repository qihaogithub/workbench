import { GET } from "./route";

const getActor = jest.fn();
const listTrashedProjects = jest.fn();

jest.mock("@/lib/auth/current-user", () => ({
  getCurrentProjectActor: () => getActor(),
}));
jest.mock("@/lib/project-admin-service", () => ({
  getProjectAdminService: () => ({ listTrashedProjects }),
  projectAdminResponse: (result: { ok: boolean; data?: unknown }) =>
    new Response(JSON.stringify({ success: result.ok, data: result.data }), {
      status: result.ok ? 200 : 403,
    }),
}));

describe("GET /api/trash/projects", () => {
  it("requires login and delegates filtering to project-core", async () => {
    getActor.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);

    const actor = { id: "editor", name: "编辑者", role: "creator" };
    getActor.mockResolvedValue(actor);
    listTrashedProjects.mockReturnValue({ ok: true, data: [{ id: "p1" }] });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(listTrashedProjects).toHaveBeenCalledWith(actor);
  });
});
