import { DELETE, GET } from "./route";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { getSessionMeta, getSessionAssetPath, sessionExists, deleteSessionAsset } from "@/lib/fs-utils";

jest.mock("@/lib/auth/jwt", () => ({ getAuthCookie: jest.fn(), verifyToken: jest.fn() }));
jest.mock("@/lib/fs-utils", () => ({
  sessionExists: jest.fn(), getSessionMeta: jest.fn(), getSessionAssetPath: jest.fn(),
  deleteSessionAsset: jest.fn(), createApiSuccess: jest.fn((data: unknown) => ({ success: true, data })),
  createApiError: jest.fn((code: string, message?: string) => ({ success: false, error: { code, message: message ?? code } })),
}));

const params = { params: Promise.resolve({ sessionId: "session-1", filename: "asset.png" }) };

describe("legacy session asset route ownership", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getAuthCookie).mockResolvedValue("token");
    jest.mocked(verifyToken).mockResolvedValue({ userId: "user-1" } as never);
    jest.mocked(sessionExists).mockReturnValue(true);
    jest.mocked(getSessionMeta).mockReturnValue({ userId: "user-2" } as never);
  });

  it.each(["GET", "DELETE"])("%s rejects missing or mismatched owner before asset access", async (method) => {
    const response = method === "GET" ? await GET({} as Request, params) : await DELETE({} as Request, params);
    expect(response.status).toBe(403);
    expect(getSessionAssetPath).not.toHaveBeenCalled();
    expect(deleteSessionAsset).not.toHaveBeenCalled();
  });
});
