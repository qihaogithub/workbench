/** @jest-environment node */

export {};

jest.mock("@/lib/admin-auth", () => ({ verifyAdminRequest: jest.fn() }));
jest.mock("@/lib/conversation", () => ({ getConversationService: jest.fn() }));
jest.mock("@/lib/editor-diagnostics/store", () => ({ queryEditorDiagnosticEvents: jest.fn() }));
jest.mock("@/lib/fs-utils", () => ({
  createApiSuccess: (data: unknown) => ({ success: true, data }),
  createApiError: (code: string, message: string) => ({ success: false, error: { code, message } }),
}));

import { GET } from "./route";
import { verifyAdminRequest } from "@/lib/admin-auth";
import { getConversationService } from "@/lib/conversation";
import { queryEditorDiagnosticEvents } from "@/lib/editor-diagnostics/store";

const mockedVerifyAdminRequest = jest.mocked(verifyAdminRequest);
const mockedGetConversationService = jest.mocked(getConversationService);
const mockedGetReliabilitySnapshot = jest.fn();
const mockedQueryEditorDiagnosticEvents = jest.mocked(queryEditorDiagnosticEvents);

const diagnostics = {
  sqliteUsed: true,
  jsonlFallbackUsed: false,
  dbUnavailable: false,
  eventGapDetected: false,
  warnings: [],
};

describe("conversation reliability admin route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedVerifyAdminRequest.mockResolvedValue(true);
    mockedGetConversationService.mockReturnValue({
      getReliabilitySnapshot: mockedGetReliabilitySnapshot,
    } as never);
    mockedGetReliabilitySnapshot.mockReturnValue({
      generatedAt: 1,
      terminalCompletenessRate: 1,
      totals: { runs: 1, terminalRuns: 1, staleNonterminalRuns: 0 },
      runStatus: { completed: 1 },
      outbox: { pending: 0, retried: 0 },
    });
    mockedQueryEditorDiagnosticEvents.mockImplementation(async ({ eventType }) => ({
      events: eventType?.endsWith("succeeded")
        ? [{ payload: { durationMs: eventType.includes("persist") ? 12 : 25 } } as never]
        : [],
      diagnostics,
    }));
  });

  it("rejects requests without admin authorization", async () => {
    mockedVerifyAdminRequest.mockResolvedValue(false);
    const response = await GET(new Request("http://localhost/api/admin/conversation-reliability"));
    expect(response.status).toBe(401);
    expect(mockedGetReliabilitySnapshot).not.toHaveBeenCalled();
  });

  it("returns aggregate reliability metrics without conversation content", async () => {
    const response = await GET(new Request("http://localhost/api/admin/conversation-reliability"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.persistence).toEqual(expect.objectContaining({
      successCount: 1,
      failureCount: 0,
      successRate: 1,
      latencyMs: { p50: 12, p95: 12, p99: 12 },
    }));
    expect(body.data.contextRestore.successRate).toBe(1);
    expect(body.data.diagnostics.eventGapDetected).toBe(false);
    expect(JSON.stringify(body)).not.toContain("content");
  });
});
