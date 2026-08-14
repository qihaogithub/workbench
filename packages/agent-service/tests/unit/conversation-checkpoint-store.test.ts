import { describe, expect, it } from "vitest";
import {
  ConversationCheckpointStore,
  stripInjectedConversationHistory,
} from "../../src/session/conversation-checkpoint-store";

describe("ConversationCheckpointStore", () => {
  it("records ordered turns and versions them monotonically", () => {
    const store = new ConversationCheckpointStore();
    const first = store.recordTurn(
      "session-1",
      { id: "u-1", role: "user", content: "first" },
      { id: "a-1", role: "assistant", content: "answer" },
    );
    const second = store.recordTurn(
      "session-1",
      { id: "u-2", role: "user", content: "second" },
      { id: "a-2", role: "assistant", content: "answer two" },
    );

    expect(first.version).toBe(1);
    expect(second.version).toBe(2);
    expect(second.messages.map((message) => message.id)).toEqual([
      "u-1", "a-1", "u-2", "a-2",
    ]);
  });

  it("rejects stale checkpoint versions and truncates at a known anchor", () => {
    const store = new ConversationCheckpointStore();
    store.recordTurn("session-1", { id: "u-1", role: "user", content: "one" }, { id: "a-1", role: "assistant", content: "two" });
    const stale = store.resolveResync("session-1", {
      expectedVersion: 0,
      truncateAfterMessageId: "u-1",
    });
    const valid = store.resolveResync("session-1", {
      expectedVersion: 1,
      truncateAfterMessageId: "u-1",
    });

    expect(stale).toEqual({ ok: false, code: "CHECKPOINT_VERSION_CONFLICT" });
    expect(valid).toMatchObject({
      ok: true,
      checkpoint: { version: 2, messages: [{ id: "u-1" }] },
    });
  });

  it("seeds only valid fallback history and removes injected legacy history", () => {
    const store = new ConversationCheckpointStore();
    expect(
      store.resolveResync("session-1", {
        fallbackMessages: [{ role: "tool", content: "not allowed" }],
      }),
    ).toEqual({ ok: false, code: "CHECKPOINT_FALLBACK_INVALID" });
    expect(
      stripInjectedConversationHistory("[系统自动注入：历史]\n[历史结束]\n真实提问"),
    ).toBe("真实提问");
  });
});
