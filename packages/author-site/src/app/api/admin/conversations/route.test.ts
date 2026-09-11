/** @jest-environment node */

export {};

jest.mock("@/lib/admin-auth", () => ({ verifyAdminRequest: jest.fn() }));
jest.mock("@/lib/conversation", () => ({
  ...jest.requireActual("@/lib/conversation/domain"),
  getConversationService: jest.fn(),
}));

import { GET } from "./route";
import { verifyAdminRequest } from "@/lib/admin-auth";
import { getConversationService } from "@/lib/conversation";

const mockedVerifyAdminRequest = jest.mocked(verifyAdminRequest);
const mockedGetConversationService = jest.mocked(getConversationService);
const listForAdmin = jest.fn();

describe("admin conversations route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedVerifyAdminRequest.mockResolvedValue(true);
    mockedGetConversationService.mockReturnValue({ listForAdmin } as never);
    listForAdmin.mockReturnValue({
      items: [],
      nextCursor: { updatedAt: 2_000, id: "conversation-2" },
    });
  });

  it("rejects missing admin authorization and disables caching", async () => {
    mockedVerifyAdminRequest.mockResolvedValue(false);
    const response = await GET(new Request("http://localhost/api/admin/conversations"));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(listForAdmin).not.toHaveBeenCalled();
  });

  it("parses exact filters, half-open time range and cursor", async () => {
    const cursor = Buffer.from(JSON.stringify({ updatedAt: 3_000, id: "conversation-3" })).toString("base64url");
    const response = await GET(new Request(
      `http://localhost/api/admin/conversations?projectId=project-1&userId=user-1&from=2026-01-01T00%3A00%3A00.000Z&to=2026-02-01T00%3A00%3A00.000Z&limit=20&cursor=${cursor}`,
    ));
    expect(response.status).toBe(200);
    expect(listForAdmin).toHaveBeenCalledWith({
      projectId: "project-1",
      userId: "user-1",
      from: Date.parse("2026-01-01T00:00:00.000Z"),
      to: Date.parse("2026-02-01T00:00:00.000Z"),
      limit: 20,
      cursor: { updatedAt: 3_000, id: "conversation-3" },
    });
    const payload = await response.json();
    expect(payload.data.nextCursor).toEqual(expect.any(String));
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects an invalid or reversed time range", async () => {
    const response = await GET(new Request(
      "http://localhost/api/admin/conversations?from=2026-02-01T00:00:00Z&to=2026-01-01T00:00:00Z",
    ));
    expect(response.status).toBe(400);
    expect(listForAdmin).not.toHaveBeenCalled();
  });
});
