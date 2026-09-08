/** @jest-environment node */

import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import { ConversationAnalyticsStore, projectConversationOutbox } from "./analytics-outbox";
import { SqliteConversationRepository } from "./sqlite-repository";

describe("conversation analytics outbox", () => {
  let directory: string;
  let repository: SqliteConversationRepository;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "conversation-analytics-"));
    repository = new SqliteConversationRepository(path.join(directory, "conversation.db"));
  });

  afterEach(() => {
    repository.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("is disabled by default and requires no analytics database writes", () => {
    repository.ensureConversation({
      id: "conversation-1",
      ownerUserId: "user-1",
      projectId: "project-1",
    });
    const store = new ConversationAnalyticsStore(path.join(directory, "analytics.db"));
    expect(projectConversationOutbox({ repository, analyticsStore: store, enabled: false }))
      .toEqual({ processed: 0, skipped: true });
    store.close();
  });

  it("projects only allowlisted metrics, hashes identifiers, and is idempotent", () => {
    repository.ensureConversation({
      id: "conversation-1",
      ownerUserId: "user-1",
      projectId: "project-secret",
    });
    const ack = repository.appendUserMessage({
      conversationId: "conversation-1",
      ownerUserId: "user-1",
      clientMessageId: "client-1",
      content: "prompt secret",
      displayParts: [{ prompt: "secret", token: "credential" }],
    });
    repository.commitRunTerminal({
      conversationId: "conversation-1",
      runId: ack.runId,
      messageId: ack.messageId,
      assistantMessageId: ack.assistantMessageId,
      ownerUserId: "user-1",
      projectId: "project-secret",
      status: "failed",
      errorCode: "MODEL_ERROR",
      summary: { reply: "answer secret" },
    });
    repository.deleteConversation("user-1", "conversation-1");

    const analyticsPath = path.join(directory, "analytics.db");
    const store = new ConversationAnalyticsStore(analyticsPath);
    const first = projectConversationOutbox({
      repository,
      analyticsStore: store,
      enabled: true,
      salt: "test-only-salt",
    });
    expect(first.processed).toBeGreaterThan(0);
    expect(projectConversationOutbox({
      repository,
      analyticsStore: store,
      enabled: true,
      salt: "test-only-salt",
    }).processed).toBe(0);
    store.close();

    const db = new Database(analyticsPath, { readonly: true });
    const rows = db.prepare("SELECT * FROM conversation_events ORDER BY occurred_at, rowid").all() as Array<{
      conversation_key: string;
      event_type: string;
      metrics_json: string;
    }>;
    const serialized = JSON.stringify(rows);
    expect(serialized).not.toContain("conversation-1");
    expect(serialized).not.toContain("user-1");
    expect(serialized).not.toContain("project-secret");
    expect(serialized).not.toContain("prompt secret");
    expect(serialized).not.toContain("answer secret");
    expect(rows.some((row) => row.event_type === "conversation.deleted")).toBe(true);
    db.close();
  });
});
