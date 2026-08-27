import type { NextRequest } from "next/server";

const getAuthCookie = jest.fn();
const verifyToken = jest.fn();
const fetchUserModelCatalog = jest.fn();

jest.mock("@/lib/auth/jwt", () => ({ getAuthCookie, verifyToken }));
jest.mock("@/lib/user-model-config", () => ({ fetchUserModelCatalog }));

function request(body: unknown): NextRequest {
  return { json: async () => body } as NextRequest;
}

describe("POST /api/user/model-config/models", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAuthCookie.mockResolvedValue("token");
    verifyToken.mockResolvedValue({ userId: "user-1" });
  });

  it("returns the temporary provider catalog for the authenticated user", async () => {
    fetchUserModelCatalog.mockResolvedValue(["model-a", "model-b"]);
    const { POST } = await import("./route");

    const response = await POST(request({ baseURL: "https://api.example.com/v1", apiKey: "sk-test" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: { models: ["model-a", "model-b"] } });
    expect(fetchUserModelCatalog).toHaveBeenCalledWith("user-1", {
      baseURL: "https://api.example.com/v1",
      apiKey: "sk-test",
    });
  });

  it("rejects unauthenticated catalog requests", async () => {
    getAuthCookie.mockResolvedValue(null);
    const { POST } = await import("./route");

    const response = await POST(request({ baseURL: "https://api.example.com/v1" }));

    expect(response.status).toBe(401);
    expect(fetchUserModelCatalog).not.toHaveBeenCalled();
  });
});
