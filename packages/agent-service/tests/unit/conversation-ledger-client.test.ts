import { describe, expect, it, vi } from "vitest";
import { ConversationLedgerClient } from "../../src/services/conversation-ledger-client";

describe("ConversationLedgerClient", () => {
  it("sends stable run identifiers to the internal authority", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ success: true, data: { runId: "r-1" } }), { status: 200 }));
    const client = new ConversationLedgerClient({ baseUrl: "http://author", token: "secret", fetchImpl });
    await client.startRun({ conversationId: "c-1", runId: "r-1", messageId: "m-1", assistantMessageId: "a-1", ownerUserId: "u-1", projectId: "p-1", agentSessionId: "s-1" });
    expect(fetchImpl).toHaveBeenCalledWith("http://author/api/internal/conversations/c-1/runs/r-1/start", expect.objectContaining({ method: "POST" }));
    expect(fetchImpl.mock.calls[0]![1]!.headers).toMatchObject({ "x-internal-token": "secret" });
    expect(JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string)).toMatchObject({ conversationId: "c-1", runId: "r-1", messageId: "m-1", assistantMessageId: "a-1" });
  });

  it("fails closed when internal credentials are absent", async () => {
    const fetchImpl = vi.fn();
    const client = new ConversationLedgerClient({ fetchImpl });
    await expect(client.commitTerminal({ conversationId: "c", runId: "r", messageId: "m", assistantMessageId: "a", ownerUserId: "u", projectId: "p", status: "completed" }))
      .rejects.toThrow("Conversation ledger is not configured");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends bounded context summary and structured trace with terminal commit", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      success: true,
      data: { conversationId: "c", runId: "r", status: "completed" },
    }), { status: 200 }));
    const client = new ConversationLedgerClient({ baseUrl: "http://author", token: "secret", fetchImpl });

    await client.commitTerminal({
      conversationId: "c",
      runId: "r",
      messageId: "m",
      assistantMessageId: "a",
      ownerUserId: "u",
      projectId: "p",
      status: "completed",
      traceEvents: [{
        occurredAt: 1,
        source: "system",
        eventType: "run_completed",
        title: "Agent 运行完成",
        status: "completed",
      }],
      contextSummary: {
        schemaVersion: 1,
        reason: "preflight",
        summaryText: "summary",
        tailMessages: [{ role: "assistant", content: "tail" }],
        sourceRevision: 3,
        coveredThroughSequence: 8,
      },
    });

    expect(JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string)).toMatchObject({
      contextSummary: {
        schemaVersion: 1,
        reason: "preflight",
        sourceRevision: 3,
        coveredThroughSequence: 8,
      },
      traceEvents: [expect.objectContaining({ eventType: "run_completed" })],
    });
  });
});
