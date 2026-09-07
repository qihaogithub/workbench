/** @jest-environment node */

import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import {
  ConversationDomainError,
  CONVERSATION_RETENTION_MS,
} from "./domain";
import { SqliteConversationRepository } from "./sqlite-repository";

describe("SqliteConversationRepository", () => {
  let directory: string;
  let repository: SqliteConversationRepository;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "conversation-ledger-"));
    repository = new SqliteConversationRepository(path.join(directory, "conversation.db"));
  });

  afterEach(() => {
    repository.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  function ensure(now = 1_000) {
    return repository.ensureConversation({
      id: "conversation-1",
      ownerUserId: "user-1",
      projectId: "project-1",
      workspaceId: "workspace-1",
      now,
    });
  }

  it("uses durable pragmas and passes quick_check", () => {
    ensure();
    expect(repository.quickCheck()).toBe(true);
  });

  it("fails closed when the ledger file is not a valid SQLite database", () => {
    const databasePath = path.join(directory, "conversation.db");
    repository.close();
    fs.writeFileSync(databasePath, "corrupt conversation ledger evidence");

    expect(() => new SqliteConversationRepository(databasePath)).toThrow(
      expect.objectContaining({ code: "CONVERSATION_STORE_UNAVAILABLE" }),
    );

    repository = new SqliteConversationRepository(path.join(directory, "replacement.db"));
  });

  it("migrates a version 2 ledger to the run artifact schema", () => {
    const databasePath = path.join(directory, "conversation.db");
    repository.close();
    const legacy = new Database(databasePath);
    legacy.exec(`
      DROP TABLE run_artifacts;
      PRAGMA user_version = 2;
    `);
    legacy.close();

    repository = new SqliteConversationRepository(databasePath);
    const migrated = new Database(databasePath, { readonly: true });
    expect(migrated.pragma("user_version", { simple: true })).toBe(3);
    expect(
      migrated.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='run_artifacts'",
      ).get(),
    ).toEqual({ name: "run_artifacts" });
    migrated.close();
  });

  it("returns the same ACK for the same clientMessageId and never duplicates a message", () => {
    ensure();
    const command = {
      conversationId: "conversation-1",
      ownerUserId: "user-1",
      clientMessageId: "client-1",
      content: "hello",
      now: 2_000,
    };
    const first = repository.appendUserMessage(command);
    const replay = repository.appendUserMessage({ ...command, now: 9_000 });

    expect(replay).toEqual(first);
    expect(repository.getProjection("user-1", "conversation-1").messages).toHaveLength(1);
  });

  it("commits attachment links with the message and keeps idempotent replay singular", () => {
    ensure();
    const command = {
      conversationId: "conversation-1",
      ownerUserId: "user-1",
      clientMessageId: "client-with-attachment",
      content: "read this",
      attachments: [{
        storageRef: "attachment-1",
        sha256: "a".repeat(64),
        mimeType: "text/plain",
        sizeBytes: 12,
      }],
      now: 2_000,
    };
    const accepted = repository.appendUserMessage(command);
    repository.appendUserMessage({ ...command, now: 3_000 });

    const ledger = new Database(path.join(directory, "conversation.db"), { readonly: true });
    expect(ledger.prepare(`
      SELECT conversation_id, message_id, owner_user_id, storage_ref, sha256, mime_type, size_bytes
      FROM attachments
    `).all()).toEqual([{
      conversation_id: "conversation-1",
      message_id: accepted.messageId,
      owner_user_id: "user-1",
      storage_ref: "attachment-1",
      sha256: "a".repeat(64),
      mime_type: "text/plain",
      size_bytes: 12,
    }]);
    ledger.close();
  });

  it("round-trips safe attachment display metadata without persisting image data URLs", () => {
    ensure();
    repository.appendUserMessage({
      conversationId: "conversation-1",
      ownerUserId: "user-1",
      clientMessageId: "client-image-attachment",
      content: "inspect this image",
      displayParts: [{
        type: "file",
        name: "reference.png",
        url: "data:image/png;base64,private-image-bytes",
        size: 128,
        attachmentId: "attachment-image-1",
        mimeType: "image/png",
        textExtracted: false,
      }],
      attachments: [{
        storageRef: "attachment-image-1",
        sha256: "b".repeat(64),
        mimeType: "image/png",
        sizeBytes: 128,
      }],
      now: 2_000,
    });

    repository.close();
    repository = new SqliteConversationRepository(path.join(directory, "conversation.db"));
    const projection = repository.getProjection("user-1", "conversation-1");

    expect(projection.messages[0].displayParts).toEqual([{
      type: "file",
      name: "reference.png",
      url: "[omitted-data-url]",
      size: 128,
      attachmentId: "attachment-image-1",
      mimeType: "image/png",
      textExtracted: false,
    }]);
    expect(JSON.stringify(projection)).not.toContain("private-image-bytes");
    expect(JSON.stringify(projection)).not.toContain("data:image");
  });

  it("rolls back message and run when attachment validation fails", () => {
    ensure();
    expect(() => repository.appendUserMessage({
      conversationId: "conversation-1",
      ownerUserId: "user-1",
      clientMessageId: "client-invalid-attachment",
      content: "read this",
      attachments: [{ storageRef: "attachment-1", sizeBytes: -1 }],
    })).toThrow(expect.objectContaining({ code: "CONVERSATION_INVALID" }));
    expect(repository.getProjection("user-1", "conversation-1")).toMatchObject({
      messages: [],
      runs: [],
    });
  });

  it("allocates server sequence and commits an idempotent terminal result", () => {
    ensure();
    const first = repository.appendUserMessage({
      conversationId: "conversation-1",
      ownerUserId: "user-1",
      clientMessageId: "client-1",
      content: "hello",
      now: 2_000,
    });
    const started = repository.startRun({
      conversationId: "conversation-1",
      runId: first.runId,
      messageId: first.messageId,
      assistantMessageId: first.assistantMessageId,
      ownerUserId: "user-1",
      projectId: "project-1",
      agentSessionId: "conversation-1",
      now: 3_000,
    });
    expect(started.historyBeforeRun).toEqual([]);
    expect(started.currentUserMessage.id).toBe(first.messageId);

    const terminalCommand = {
      conversationId: "conversation-1",
      runId: first.runId,
      messageId: first.messageId,
      assistantMessageId: first.assistantMessageId,
      ownerUserId: "user-1",
      projectId: "project-1",
      status: "completed" as const,
      content: "world",
      displayParts: [{ type: "tool", result: "secret", summary: "done" }],
      now: 4_000,
    };
    const completed = repository.commitRunTerminal(terminalCommand);
    const replay = repository.commitRunTerminal({ ...terminalCommand, now: 8_000 });

    expect(replay).toEqual(completed);
    const projection = repository.getProjection("user-1", "conversation-1");
    expect(projection.messages.map((message) => message.sequence)).toEqual([1, 2]);
    expect(projection.messages[1].displayParts).toEqual([{ type: "tool", summary: "done" }]);
    expect(projection.runs[0].status).toBe("completed");
  });

  it("reports content-free reliability counters and terminal completeness", () => {
    ensure();
    const completed = repository.appendUserMessage({
      conversationId: "conversation-1",
      ownerUserId: "user-1",
      clientMessageId: "client-completed",
      content: "private completed prompt",
      now: 2_000,
    });
    repository.startRun({
      conversationId: "conversation-1",
      runId: completed.runId,
      messageId: completed.messageId,
      assistantMessageId: completed.assistantMessageId,
      ownerUserId: "user-1",
      projectId: "project-1",
      agentSessionId: "conversation-1",
      now: 3_000,
    });
    repository.commitRunTerminal({
      conversationId: "conversation-1",
      runId: completed.runId,
      messageId: completed.messageId,
      assistantMessageId: completed.assistantMessageId,
      ownerUserId: "user-1",
      projectId: "project-1",
      status: "completed",
      content: "private answer",
      now: 4_000,
    });
    repository.appendUserMessage({
      conversationId: "conversation-1",
      ownerUserId: "user-1",
      clientMessageId: "client-stale",
      content: "private queued prompt",
      now: 5_000,
    });

    const snapshot = repository.getReliabilitySnapshot(20_000, 10_000);
    expect(snapshot).toMatchObject({
      generatedAt: 20_000,
      totals: {
        conversations: 1,
        messages: 3,
        acceptedUserMessages: 2,
        runs: 2,
        terminalRuns: 1,
        nonterminalRuns: 1,
        staleNonterminalRuns: 1,
      },
      terminalCompletenessRate: 0.5,
      runStatus: { queued: 1, running: 0, completed: 1 },
    });
    expect(JSON.stringify(snapshot)).not.toContain("private");
  });

  it("persists a versioned context summary and restores only the uncovered ledger tail", () => {
    ensure();
    const first = repository.appendUserMessage({
      conversationId: "conversation-1",
      ownerUserId: "user-1",
      clientMessageId: "client-1",
      content: "first user",
      now: 2_000,
    });
    repository.startRun({
      conversationId: "conversation-1",
      runId: first.runId,
      messageId: first.messageId,
      assistantMessageId: first.assistantMessageId,
      ownerUserId: "user-1",
      projectId: "project-1",
      agentSessionId: "conversation-1",
      now: 3_000,
    });
    repository.commitRunTerminal({
      conversationId: "conversation-1",
      runId: first.runId,
      messageId: first.messageId,
      assistantMessageId: first.assistantMessageId,
      ownerUserId: "user-1",
      projectId: "project-1",
      status: "completed",
      content: "first assistant",
      contextSummary: {
        schemaVersion: 1,
        reason: "preflight",
        sourceRevision: 1,
        coveredThroughSequence: 1,
        summaryText: "summary of earlier context",
        tailMessages: [{ role: "user", content: "first user" }],
      },
      now: 4_000,
    });

    repository.close();
    repository = new SqliteConversationRepository(path.join(directory, "conversation.db"));
    const second = repository.appendUserMessage({
      conversationId: "conversation-1",
      ownerUserId: "user-1",
      clientMessageId: "client-2",
      content: "second user",
      now: 5_000,
    });
    const restored = repository.startRun({
      conversationId: "conversation-1",
      runId: second.runId,
      messageId: second.messageId,
      assistantMessageId: second.assistantMessageId,
      ownerUserId: "user-1",
      projectId: "project-1",
      agentSessionId: "conversation-1",
      now: 6_000,
    });

    expect(restored.contextSummary).toEqual(expect.objectContaining({
      schemaVersion: 1,
      summaryVersion: 1,
      sourceRevision: 1,
      coveredThroughSequence: 1,
      summaryText: "summary of earlier context",
      tailMessages: [{ role: "user", content: "first user" }],
      summaryHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    }));
    expect(restored.historyBeforeRun.map((message) => [message.role, message.content])).toEqual([
      ["assistant", "first assistant"],
    ]);
  });

  it("externalizes a large sanitized display payload into an owner-scoped run artifact", () => {
    ensure();
    const ack = repository.appendUserMessage({
      conversationId: "conversation-1",
      ownerUserId: "user-1",
      clientMessageId: "client-1",
      content: "hello",
      now: 2_000,
    });
    const largeDisplayParts = Array.from({ length: 10 }, (_, index) => ({
      type: "tool",
      title: `tool-${index}`,
      summary: "x".repeat(8_000),
      result: "raw tool result must never be stored",
      parameters: { token: "secret" },
    }));
    repository.commitRunTerminal({
      conversationId: "conversation-1",
      runId: ack.runId,
      messageId: ack.messageId,
      assistantMessageId: ack.assistantMessageId,
      ownerUserId: "user-1",
      projectId: "project-1",
      status: "completed",
      content: "done",
      displayParts: largeDisplayParts,
      now: 4_000,
    });

    const projection = repository.getProjection("user-1", "conversation-1");
    const reference = projection.messages[1].displayParts[0] as {
      artifactRef: string;
      status: string;
    };
    expect(reference).toEqual(expect.objectContaining({
      artifactRef: expect.stringMatching(/^artifact-[a-f0-9]{40}$/),
      status: "available",
    }));
    const artifact = repository.getRunArtifact(
      "user-1",
      "conversation-1",
      reference.artifactRef,
      4_001,
    );
    expect(artifact.sizeBytes).toBeGreaterThan(64 * 1024);
    const serialized = JSON.stringify(artifact.payload);
    expect(serialized).not.toContain("raw tool result");
    expect(serialized).not.toContain("secret");
    expect(() => repository.getRunArtifact(
      "user-2",
      "conversation-1",
      reference.artifactRef,
      4_001,
    )).toThrow(expect.objectContaining({ code: "CONVERSATION_FORBIDDEN" }));

    repository.deleteConversation("user-1", "conversation-1");
    expect(() => repository.getRunArtifact(
      "user-1",
      "conversation-1",
      reference.artifactRef,
      4_001,
    )).toThrow(expect.objectContaining({ code: "CONVERSATION_NOT_FOUND" }));
  });

  it("rejects cross-owner access and conflicting terminal rewrites", () => {
    ensure();
    expect(() => repository.getProjection("user-2", "conversation-1")).toThrow(
      expect.objectContaining({ code: "CONVERSATION_FORBIDDEN" }),
    );
    const ack = repository.appendUserMessage({
      conversationId: "conversation-1",
      ownerUserId: "user-1",
      clientMessageId: "client-1",
      content: "hello",
    });
    repository.commitRunTerminal({
      conversationId: "conversation-1",
      runId: ack.runId,
      messageId: ack.messageId,
      assistantMessageId: ack.assistantMessageId,
      ownerUserId: "user-1",
      projectId: "project-1",
      status: "failed",
      errorCode: "MODEL_ERROR",
    });
    expect(() =>
      repository.commitRunTerminal({
        conversationId: "conversation-1",
        runId: ack.runId,
        messageId: ack.messageId,
        assistantMessageId: ack.assistantMessageId,
        ownerUserId: "user-1",
        projectId: "project-1",
        status: "cancelled",
      }),
    ).toThrow(expect.objectContaining({ code: "CONVERSATION_CONFLICT" }));

    expect(() => repository.appendUserMessage({
      conversationId: "conversation-1",
      ownerUserId: "user-2",
      clientMessageId: "foreign-client",
      content: "forbidden",
    })).toThrow(expect.objectContaining({ code: "CONVERSATION_FORBIDDEN" }));
    expect(() => repository.retryRun({
      ownerUserId: "user-2",
      conversationId: "conversation-1",
      userMessageId: ack.messageId,
    })).toThrow(expect.objectContaining({ code: "CONVERSATION_FORBIDDEN" }));
    expect(() => repository.requestRunCancellation({
      ownerUserId: "user-2",
      conversationId: "conversation-1",
      runId: ack.runId,
    })).toThrow(expect.objectContaining({ code: "CONVERSATION_FORBIDDEN" }));
    expect(() => repository.supersede({
      ownerUserId: "user-2",
      conversationId: "conversation-1",
      afterMessageId: ack.messageId,
      expectedRevision: 0,
    })).toThrow(expect.objectContaining({ code: "CONVERSATION_FORBIDDEN" }));
    expect(() => repository.updateTitle({
      ownerUserId: "user-2",
      conversationId: "conversation-1",
      title: "forbidden",
    })).toThrow(expect.objectContaining({ code: "CONVERSATION_FORBIDDEN" }));
    expect(() => repository.deleteConversation("user-2", "conversation-1")).toThrow(
      expect.objectContaining({ code: "CONVERSATION_FORBIDDEN" }),
    );
  });

  it("keeps the user message on cancellation without creating an assistant placeholder", () => {
    ensure();
    const ack = repository.appendUserMessage({
      conversationId: "conversation-1",
      ownerUserId: "user-1",
      clientMessageId: "client-1",
      content: "hello",
    });
    repository.commitRunTerminal({
      conversationId: "conversation-1",
      runId: ack.runId,
      messageId: ack.messageId,
      assistantMessageId: ack.assistantMessageId,
      ownerUserId: "user-1",
      projectId: "project-1",
      status: "cancelled",
    });
    const projection = repository.getProjection("user-1", "conversation-1");
    expect(projection.messages).toHaveLength(1);
    expect(projection.messages[0].role).toBe("user");
    expect(projection.runs[0].status).toBe("cancelled");
  });

  it("immediately cancels a queued run that was never handed to an Agent", () => {
    ensure();
    const ack = repository.appendUserMessage({
      conversationId: "conversation-1",
      ownerUserId: "user-1",
      clientMessageId: "client-recovered",
      content: "recovered pending command",
      now: 2_000,
    });

    const cancelled = repository.requestRunCancellation({
      ownerUserId: "user-1",
      conversationId: "conversation-1",
      runId: ack.runId,
      now: 3_000,
    });

    expect(cancelled).toMatchObject({
      runId: ack.runId,
      status: "cancelled",
      cancelRequested: true,
      conversationRevision: 2,
    });
    const projection = repository.getProjection("user-1", "conversation-1");
    expect(projection.messages).toHaveLength(1);
    expect(projection.runs[0]).toMatchObject({
      id: ack.runId,
      status: "cancelled",
      finishedAt: 3_000,
    });
  });

  it("reconciles a durable cancellation request as cancelled after restart", () => {
    ensure();
    const ack = repository.appendUserMessage({
      conversationId: "conversation-1",
      ownerUserId: "user-1",
      clientMessageId: "client-1",
      content: "hello",
      now: 2_000,
    });
    repository.startRun({
      conversationId: "conversation-1",
      runId: ack.runId,
      messageId: ack.messageId,
      assistantMessageId: ack.assistantMessageId,
      ownerUserId: "user-1",
      projectId: "project-1",
      agentSessionId: "conversation-1",
      now: 3_000,
    });
    repository.requestRunCancellation({
      ownerUserId: "user-1",
      conversationId: "conversation-1",
      runId: ack.runId,
      now: 4_000,
    });
    expect(repository.reconcileInterrupted(5_000, 6_000)).toBe(1);
    const projection = repository.getProjection("user-1", "conversation-1");
    expect(projection.runs[0].status).toBe("cancelled");
    expect(projection.messages).toHaveLength(1);
  });

  it("rejects an Agent Session that is not bound to the conversation", () => {
    ensure();
    const ack = repository.appendUserMessage({
      conversationId: "conversation-1",
      ownerUserId: "user-1",
      clientMessageId: "client-1",
      content: "hello",
    });
    expect(() => repository.startRun({
      conversationId: "conversation-1",
      runId: ack.runId,
      messageId: ack.messageId,
      assistantMessageId: ack.assistantMessageId,
      ownerUserId: "user-1",
      projectId: "project-1",
      agentSessionId: "agent-other",
    })).toThrow(expect.objectContaining({ code: "CONVERSATION_CONFLICT" }));
  });

  it("requires revision for supersede and supports retry without duplicating the user message", () => {
    ensure();
    const first = repository.appendUserMessage({
      conversationId: "conversation-1",
      ownerUserId: "user-1",
      clientMessageId: "client-1",
      content: "first",
    });
    repository.commitRunTerminal({
      conversationId: "conversation-1",
      runId: first.runId,
      messageId: first.messageId,
      assistantMessageId: first.assistantMessageId,
      ownerUserId: "user-1",
      projectId: "project-1",
      status: "completed",
      content: "reply",
    });
    const before = repository.getProjection("user-1", "conversation-1");
    const retried = repository.retryRun({
      ownerUserId: "user-1",
      conversationId: "conversation-1",
      userMessageId: first.messageId,
    });
    expect(retried.messageId).toBe(first.messageId);
    expect(repository.getProjection("user-1", "conversation-1").messages).toHaveLength(2);

    expect(() =>
      repository.supersede({
        ownerUserId: "user-1",
        conversationId: "conversation-1",
        afterMessageId: first.messageId,
        expectedRevision: before.conversation.revision,
      }),
    ).toThrow(expect.objectContaining({ code: "CONVERSATION_CONFLICT" }));
  });

  it("interrupts an earlier nonterminal run before retrying the same user message", () => {
    ensure();
    const first = repository.appendUserMessage({
      conversationId: "conversation-1",
      ownerUserId: "user-1",
      clientMessageId: "client-stalled",
      content: "stalled prompt",
      now: 2_000,
    });

    const retried = repository.retryRun({
      ownerUserId: "user-1",
      conversationId: "conversation-1",
      userMessageId: first.messageId,
      now: 3_000,
    });

    const projection = repository.getProjection("user-1", "conversation-1");
    expect(projection.runs).toEqual([
      expect.objectContaining({
        id: first.runId,
        status: "interrupted",
        errorCode: "RETRIED",
      }),
      expect.objectContaining({ id: retried.runId, status: "queued" }),
    ]);
    expect(projection.messages).toHaveLength(1);
  });

  it("hard-deletes expired conversation rows", () => {
    ensure(1_000);
    expect(repository.deleteExpired(1_000 + CONVERSATION_RETENTION_MS - 1)).toEqual([]);
    expect(repository.deleteExpired(1_000 + CONVERSATION_RETENTION_MS)).toEqual([
      {
        conversationId: "conversation-1",
        ownerUserId: "user-1",
        projectId: "project-1",
      },
    ]);
    expect(() => repository.getProjection("user-1", "conversation-1")).toThrow(
      ConversationDomainError,
    );
  });

  it("hard-deletes content while retaining only a durable deletion tombstone", () => {
    ensure();
    repository.appendUserMessage({
      conversationId: "conversation-1",
      ownerUserId: "user-1",
      clientMessageId: "client-1",
      content: "private prompt",
    });

    repository.deleteConversation("user-1", "conversation-1");
    expect(() => repository.getProjection("user-1", "conversation-1")).toThrow(
      expect.objectContaining({ code: "CONVERSATION_NOT_FOUND" }),
    );
    expect(repository.listPendingOutbox()).toEqual([
      expect.objectContaining({
        aggregateId: "conversation-1",
        eventType: "conversation.deleted",
        payload: { reason: "user_request" },
      }),
    ]);
    expect(JSON.stringify(repository.listPendingOutbox())).not.toContain("private prompt");

    repository.close();
    repository = new SqliteConversationRepository(path.join(directory, "conversation.db"));
    expect(repository.listPendingOutbox()).toEqual([
      expect.objectContaining({ eventType: "conversation.deleted" }),
    ]);
  });

  it("creates an online backup that can be reopened and checked", async () => {
    ensure();
    const accepted = repository.appendUserMessage({
      conversationId: "conversation-1",
      ownerUserId: "user-1",
      clientMessageId: "client-backup",
      content: "restore me",
      now: 2_000,
    });
    repository.commitRunTerminal({
      conversationId: "conversation-1",
      runId: accepted.runId,
      messageId: accepted.messageId,
      assistantMessageId: accepted.assistantMessageId,
      ownerUserId: "user-1",
      projectId: "project-1",
      status: "completed",
      content: "restored answer",
      now: 3_000,
    });
    const destination = path.join(directory, "backup", "conversation.db");
    await repository.backup(destination);
    const restored = new SqliteConversationRepository(destination);
    expect(restored.quickCheck()).toBe(true);
    const projection = restored.getProjection("user-1", "conversation-1");
    expect(projection.conversation.id).toBe("conversation-1");
    expect(projection.messages.map((message) => message.content)).toEqual([
      "restore me",
      "restored answer",
    ]);
    expect(projection.runs).toEqual([
      expect.objectContaining({ id: accepted.runId, status: "completed" }),
    ]);
    restored.close();
  });
});
