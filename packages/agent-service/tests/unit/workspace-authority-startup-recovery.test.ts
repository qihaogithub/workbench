import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  getWorkspaceAuthorityStartupRecoveryStatus,
  recoverWorkspaceAuthoritiesOnStartup,
} from "../../src/workspace/workspace-authority-startup-recovery";
import { WORKSPACE_AUTHORITY_SYSTEM_SESSION_ID } from "../../src/workspace/workspace-authority-diagnostics";
import { WorkspaceMutationAuthority } from "../../src/workspace/workspace-mutation-authority";

const roots: string[] = [];
const hash = (content: string) => crypto.createHash("sha256").update(content).digest("hex");

function createLiveWorkspace(projectId = "project-1", workspaceId = "workspace-1") {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-authority-startup-"));
  roots.push(dataDir);
  const workspacePath = path.join(dataDir, "workspaces", "projects", projectId, workspaceId);
  fs.mkdirSync(path.join(workspacePath, "demos", "home"), { recursive: true });
  fs.writeFileSync(path.join(workspacePath, ".workspace.json"), JSON.stringify({ scope: "live", projectId, workspaceId }));
  fs.writeFileSync(path.join(workspacePath, "demos", "home", "index.tsx"), "before");
  const authority = new WorkspaceMutationAuthority({
    dataDir,
    resolveWorkspacePath: (id) => id === workspaceId ? workspacePath : null,
  });
  return { dataDir, projectId, workspaceId, workspacePath, authority };
}

afterEach(() => {
  while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("Workspace Authority startup recovery", () => {
  it("监听服务前主动回滚无 receipt 的 prepared mutation 并写诊断", async () => {
    const fixture = createLiveWorkspace();
    const previousState = await fixture.authority.bootstrap(fixture.projectId, fixture.workspaceId);
    const preparedDir = path.join(fixture.dataDir, "workspace-authority", fixture.workspaceId, "prepared");
    fs.mkdirSync(preparedDir, { recursive: true });
    fs.writeFileSync(path.join(fixture.workspacePath, "demos/home/index.tsx"), "partially-applied");
    fs.writeFileSync(path.join(preparedDir, "interrupted.json"), JSON.stringify({
      request: {
        mutationId: "interrupted",
        projectId: fixture.projectId,
        workspaceId: fixture.workspaceId,
        baseRevision: previousState.revision,
        actor: "ai",
        reason: "test",
        operations: [],
      },
      payloadHash: "payload",
      previousState,
      before: { "demos/home/index.tsx": { exists: true, content: "before", hash: hash("before") } },
    }));

    const status = await recoverWorkspaceAuthoritiesOnStartup(fixture.dataDir);

    expect(status).toMatchObject({
      state: "ready",
      scannedWorkspaceCount: 1,
      registeredWorkspaceCount: 1,
      pendingTransactionCount: 1,
      recoveredTransactionCount: 1,
      rolledBackCount: 1,
    });
    expect(fs.readFileSync(path.join(fixture.workspacePath, "demos/home/index.tsx"), "utf-8")).toBe("before");
    const diagnostics = fs.readFileSync(path.join(fixture.dataDir, "editor-diagnostics", "agent-service.jsonl"), "utf-8");
    expect(diagnostics).toContain('"eventType":"workspace.mutation_recovered"');
    expect(diagnostics).toContain('"outcome":"rolled_back"');
    const recoveredEvent = JSON.parse(diagnostics.trim().split("\n").at(-1)!) as {
      projectId: string;
      workspaceId: string;
      sessionId: string;
      operationId: string;
      traceId: string;
      payload: Record<string, unknown>;
    };
    expect(recoveredEvent).toMatchObject({
      projectId: fixture.projectId,
      workspaceId: fixture.workspaceId,
      sessionId: WORKSPACE_AUTHORITY_SYSTEM_SESSION_ID,
      operationId: "interrupted",
      traceId: "interrupted",
    });
    expect(recoveredEvent.payload).toEqual(expect.objectContaining({
      mutationId: "interrupted",
      baseRevision: previousState.revision,
      revision: previousState.revision,
      actor: "ai",
      resourcePaths: [],
      traceId: "interrupted",
      durationMs: expect.any(Number),
    }));
  });

  it("receipt 与 state 已提交时只清理 prepared，不回滚业务内容", async () => {
    const fixture = createLiveWorkspace();
    const previousState = await fixture.authority.bootstrap(fixture.projectId, fixture.workspaceId);
    const request = {
      mutationId: "committed",
      projectId: fixture.projectId,
      workspaceId: fixture.workspaceId,
      baseRevision: previousState.revision,
      actor: "ai" as const,
      reason: "test",
      operations: [{ type: "put_text" as const, path: "demos/home/index.tsx", content: "after", expectedHash: hash("before") }],
    };
    await fixture.authority.mutate(request);
    const preparedDir = path.join(fixture.dataDir, "workspace-authority", fixture.workspaceId, "prepared");
    fs.mkdirSync(preparedDir, { recursive: true });
    fs.writeFileSync(path.join(preparedDir, "committed.json"), JSON.stringify({
      request,
      payloadHash: hash(JSON.stringify(request)),
      previousState,
      before: { "demos/home/index.tsx": { exists: true, content: "before", hash: hash("before") } },
    }));

    const status = await recoverWorkspaceAuthoritiesOnStartup(fixture.dataDir);

    expect(status.committedCleanupCount).toBe(1);
    expect(fs.readFileSync(path.join(fixture.workspacePath, "demos/home/index.tsx"), "utf-8")).toBe("after");
    expect(fs.existsSync(path.join(preparedDir, "committed.json"))).toBe(false);
  });

  it("stale lease 使启动恢复失败并保持 failed 状态", async () => {
    const fixture = createLiveWorkspace();
    await fixture.authority.bootstrap(fixture.projectId, fixture.workspaceId);
    const leasePath = path.join(fixture.dataDir, "workspace-authority", "leases", `${fixture.workspaceId}.lock`);
    fs.mkdirSync(path.dirname(leasePath), { recursive: true });
    fs.writeFileSync(leasePath, "stale");

    await expect(recoverWorkspaceAuthoritiesOnStartup(fixture.dataDir)).rejects.toMatchObject({
      code: "WORKSPACE_WRITE_LEASE_UNAVAILABLE",
    });
    expect(getWorkspaceAuthorityStartupRecoveryStatus().state).toBe("failed");
  });

  it("孤立 Authority state 没有 live Workspace 时阻止启动", async () => {
    const fixture = createLiveWorkspace();
    await fixture.authority.bootstrap(fixture.projectId, fixture.workspaceId);
    fs.rmSync(fixture.workspacePath, { recursive: true, force: true });

    await expect(recoverWorkspaceAuthoritiesOnStartup(fixture.dataDir)).rejects.toThrow(`WORKSPACE_NOT_FOUND:${fixture.workspaceId}`);
    expect(getWorkspaceAuthorityStartupRecoveryStatus()).toMatchObject({
      state: "failed",
      registeredWorkspaceCount: 1,
    });
  });
});
