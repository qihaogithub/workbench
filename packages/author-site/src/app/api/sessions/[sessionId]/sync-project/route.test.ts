import { POST } from "./route";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { getEditSession } from "@/lib/session-manager";
import { syncSessionFromProject } from "@/lib/workspace-manager";

jest.mock("@/lib/auth/jwt", () => ({ getAuthCookie: jest.fn(), verifyToken: jest.fn() }));
jest.mock("@/lib/session-manager", () => ({ getEditSession: jest.fn() }));
jest.mock("@/lib/workspace-manager", () => ({ syncSessionFromProject: jest.fn() }));
jest.mock("@/lib/fs-utils", () => ({
  createApiSuccess: jest.fn((data: unknown) => ({ success: true, data })),
  createApiError: jest.fn((code: string, message?: string) => ({ success: false, error: { code, message: message ?? code } })),
}));

describe("legacy session sync ownership", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getAuthCookie).mockResolvedValue("token");
    jest.mocked(verifyToken).mockResolvedValue({ userId: "user-1" } as never);
    jest.mocked(getEditSession).mockReturnValue({ userId: "user-2", workspaceId: "workspace-1", demoId: "project-1" } as never);
  });

  it("rejects a mismatched owner before syncing", async () => {
    const response = await POST({} as Request, { params: Promise.resolve({ sessionId: "session-1" }) });
    expect(response.status).toBe(403);
    expect(syncSessionFromProject).not.toHaveBeenCalled();
  });

  it("fails closed when owner is missing", async () => {
    jest.mocked(getEditSession).mockReturnValue({ workspaceId: "workspace-1", demoId: "project-1" } as never);
    const response = await POST({} as Request, { params: Promise.resolve({ sessionId: "session-1" }) });
    expect(response.status).toBe(403);
  });
});
