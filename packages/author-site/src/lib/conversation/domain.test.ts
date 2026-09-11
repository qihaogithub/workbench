import {
  MAX_RUN_TRACE_BYTES,
  MAX_RUN_TRACE_EVENTS,
  normalizeConversationTraceEvents,
} from "./domain";

describe("normalizeConversationTraceEvents", () => {
  it("keeps only whitelisted metadata and relative file actions", () => {
    const trace = normalizeConversationTraceEvents([{
      occurredAt: 1,
      source: "tool",
      eventType: "tool_finished",
      title: "Read workspace",
      parameters: { token: "secret" },
      result: "private file body",
      metrics: { toolKind: "read", prompt: "private prompt", token: "secret" },
      files: [
        { path: "src/page.tsx", action: "modified", content: "private source" },
        { path: "/tmp/private", action: "created" },
      ],
    }]);

    expect(trace).toEqual([expect.objectContaining({
      metrics: { toolKind: "read" },
      files: [{ path: "src/page.tsx", action: "modified" }],
    })]);
    expect(JSON.stringify(trace)).not.toMatch(/secret|private|prompt|parameters|result|content/);
  });

  it("caps event count and serialized size with a truncation marker", () => {
    const trace = normalizeConversationTraceEvents(Array.from({ length: 700 }, (_, index) => ({
      occurredAt: index + 1,
      source: "model",
      eventType: "status_changed",
      title: `status ${index}`,
      summary: "x".repeat(500),
    })));

    expect(trace.length).toBeLessThanOrEqual(MAX_RUN_TRACE_EVENTS);
    expect(Buffer.byteLength(JSON.stringify(trace), "utf8")).toBeLessThanOrEqual(MAX_RUN_TRACE_BYTES);
    expect(trace).toContainEqual(expect.objectContaining({
      eventType: "trace_truncated",
      metrics: expect.objectContaining({ droppedEvents: expect.any(Number) }),
    }));
  });
});
