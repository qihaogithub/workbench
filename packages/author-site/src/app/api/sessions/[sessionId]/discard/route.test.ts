import { POST } from "./route";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { getEditSession } from "@/lib/session-manager";
import { discardEditSession } from "@/lib/session-manager";

jest.mock("@/lib/auth/jwt", () => ({ getAuthCookie: jest.fn(), verifyToken: jest.fn() }));
jest.mock("@/lib/session-manager", () => ({ getEditSession: jest.fn(), discardEditSession: jest.fn() }));
jest.mock("@/lib/fs-utils", () => ({
  createApiSuccess: jest.fn((data: unknown) => ({ success: true, data })),
  createApiError: jest.fn((code: string, message?: string) => ({ success: false, error: { code, message: message ?? code } })),
}));

describe("legacy session discard ownership", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getAuthCookie).mockResolvedValue("token");
    jest.mocked(verifyToken).mockResolvedValue({ userId: "user-1" } as never);
    jest.mocked(getEditSession).mockReturnValue({ userId: "user-2" } as never);
  });

  it("rejects a mismatched owner", async () => {
    const response = await POST({} as Request, { params: Promise.resolve({ sessionId: "session-1" }) });
    expect(response.status).toBe(403);
    expect(discardEditSession).not.toHaveBeenCalled();
  });

  it("fails closed when owner is missing", async () => {
    jest.mocked(getEditSession).mockReturnValue({} as never);
    const response = await POST({} as Request, { params: Promise.resolve({ sessionId: "session-1" }) });
    expect(response.status).toBe(403);
  });
});
