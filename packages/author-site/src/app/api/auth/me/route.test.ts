const getAuthCookie = jest.fn();
const verifyToken = jest.fn();
const findUserById = jest.fn();
const findDingtalkIdentityByUserId = jest.fn();

jest.mock("@/lib/auth/jwt", () => ({ getAuthCookie, verifyToken }));
jest.mock("@/lib/user", () => ({ findUserById, findDingtalkIdentityByUserId }));
jest.mock("@/lib/fs-utils", () => ({
  createApiSuccess: jest.fn((data) => ({ success: true, data })),
  createApiError: jest.fn((code, message) => ({
    success: false,
    error: { code, message },
  })),
}));

describe("GET /api/auth/me", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAuthCookie.mockResolvedValue("token");
    verifyToken.mockResolvedValue({ userId: "user-1" });
    findUserById.mockReturnValue({
      id: "user-1",
      username: "dt_internal_user",
      role: "editor",
    });
  });

  it("优先返回钉钉姓名作为展示名", async () => {
    findDingtalkIdentityByUserId.mockReturnValue({ name: "祁昊" });
    const { GET } = await import("./route");

    const response = await GET();
    const body = await response.json();

    expect(body).toEqual({
      success: true,
      data: {
        id: "user-1",
        username: "dt_internal_user",
        displayName: "祁昊",
        role: "editor",
      },
    });
  });

  it("没有钉钉姓名时回退到本地用户名", async () => {
    findDingtalkIdentityByUserId.mockReturnValue({ name: undefined });
    const { GET } = await import("./route");

    const response = await GET();
    const body = await response.json();

    expect(body.data.displayName).toBe("dt_internal_user");
  });
});

export {};
