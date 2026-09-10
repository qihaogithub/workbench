import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createAgentRunLog } from "../../src/session/run-log-store";

const roots: string[] = [];

afterEach(async () => {
  while (roots.length > 0) {
    await fs.rm(roots.pop()!, { recursive: true, force: true });
  }
});

describe("AgentRunLog preview observation redaction", () => {
  it("does not persist raw error text for failed observations", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "preview-run-log-"));
    roots.push(root);
    const previous = process.env.AGENT_RUN_LOG_DIR;
    process.env.AGENT_RUN_LOG_DIR = root;

    try {
      const log = createAgentRunLog({
        sessionId: "session-1",
        messageId: "message-1",
        contentLength: 10,
      });
      log.recordAgentEvent({
        type: "tool_call",
        sessionId: "session-1",
        toolCallId: "tool-1",
        status: "in_progress",
        title: "observePreview",
        kind: "read",
        parameters: { assertions: [{ type: "runtime-ready" }] },
      });
      log.recordAgentEvent({
        type: "tool_call_update",
        sessionId: "session-1",
        toolCallId: "tool-1",
        status: "failed",
        durationMs: 42.8,
        error: {
          message: "page-authored secret text must not be persisted",
        },
      });
      await log.drain();

      const serialized = await fs.readFile(log.filePath, "utf8");
      expect(serialized).toContain("Preview observation unavailable");
      expect(serialized).toContain('"eventType":"tool_call_update"');
      expect(serialized).toContain("observation-tool-error");
      expect(serialized).not.toContain("page-authored secret text");
      expect(serialized).not.toContain('"error":{"message"');
    } finally {
      if (previous === undefined) delete process.env.AGENT_RUN_LOG_DIR;
      else process.env.AGENT_RUN_LOG_DIR = previous;
    }
  });
});
