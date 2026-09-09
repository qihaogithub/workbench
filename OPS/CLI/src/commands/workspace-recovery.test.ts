import assert from "node:assert/strict";
import test from "node:test";

import { workspaceRecoveryRebuild } from "./workspace-recovery.js";

test("workspace recovery defaults to the requested dry-run payload", async () => {
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  let requestedUrl = "";
  let requestedBody: Record<string, unknown> = {};
  const output: string[] = [];
  globalThis.fetch = (async (input, init) => {
    requestedUrl = String(input);
    requestedBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({
      success: true,
      data: {
        applied: false,
        recoveryId: "recovery-1",
        projectId: "project-1",
        sourceVersionId: "v41",
        failedWorkspaceId: "live-old",
        sourceRootHash: "root-41",
        sourceResourceCount: 3,
        diffSummary: { currentResourceCount: 4, sourceResourceCount: 3, added: [], removed: ["old"], changed: ["page"] },
        archivedSessionCount: 0,
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  console.log = (...args: unknown[]) => output.push(args.map(String).join(" "));
  try {
    await workspaceRecoveryRebuild("http://agent.test", {
      projectId: "project-1",
      failedWorkspaceId: "live-old",
      sourceVersionId: "v41",
      sessionId: "session-admin",
      idempotencyKey: "rebuild-1",
      apply: false,
    }, true);
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
  }
  assert.equal(requestedUrl, "http://agent.test/api/workspace-recovery/projects/project-1/workspaces/live-old/rebuild");
  assert.deepEqual(requestedBody, {
    sessionId: "session-admin",
    sourceVersionId: "v41",
    idempotencyKey: "rebuild-1",
    apply: false,
  });
  assert.match(output.join("\n"), /"applied": false/);
});
