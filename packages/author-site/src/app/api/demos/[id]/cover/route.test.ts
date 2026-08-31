import { DELETE, POST } from "./route";

const getActor = jest.fn();
const getProject = jest.fn();

jest.mock("@/lib/auth/current-user", () => ({
  getCurrentProjectActor: () => getActor(),
}));
jest.mock("@/lib/project-admin-service", () => ({
  getProjectAdminService: () => ({ getProject, setProjectCover: jest.fn() }),
  projectAdminResponse: (result: { ok: boolean; error?: { code?: string } }) =>
    new Response(JSON.stringify({ success: result.ok, error: result.error }), {
      status: result.error?.code === "FORBIDDEN" ? 403 : 404,
    }),
}));

describe("/api/demos/:id/cover", () => {
  beforeEach(() => {
    getActor.mockReset();
    getProject.mockReset();
  });

  it("requires authentication before mutating cover files", async () => {
    getActor.mockResolvedValue(null);
    const post = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: "p1" }),
    });
    const remove = await DELETE(new Request("http://localhost", { method: "DELETE" }), {
      params: Promise.resolve({ id: "p1" }),
    });
    expect(post.status).toBe(401);
    expect(remove.status).toBe(401);
    expect(getProject).not.toHaveBeenCalled();
  });

  it("checks project access before accepting an upload", async () => {
    const actor = { id: "creator", name: "Creator", role: "creator" };
    getActor.mockResolvedValue(actor);
    getProject.mockReturnValue({ ok: false, error: { code: "FORBIDDEN" } });
    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: "p1" }),
    });
    expect(response.status).toBe(403);
    expect(getProject).toHaveBeenCalledWith("p1", actor);
  });
});
