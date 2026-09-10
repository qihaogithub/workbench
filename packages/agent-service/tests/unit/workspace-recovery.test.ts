import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createWorkspaceResourceRegistry } from "@workbench/project-core/workspace-resource-registry";
import { afterEach, describe, expect, it } from "vitest";

import { WorkspaceRecoveryCoordinator } from "../../src/workspace/workspace-recovery";

const temporaryDirectories: string[] = [];

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function readJson(file: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(file, "utf-8")) as Record<string, unknown>;
}

function setupFixture() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-recovery-"));
  temporaryDirectories.push(dataDir);
  const projectId = "project-1";
  const failedWorkspaceId = "live-broken";
  const sourcePath = path.join(dataDir, "snapshots", projectId, "v1");
  const canonicalPath = path.join(dataDir, "projects", projectId, "workspace");
  const failedPath = path.join(dataDir, "workspaces", "projects", projectId, failedWorkspaceId);
  const sourceFiles = {
    "workspace-tree.json": JSON.stringify({ pages: [{ id: "page-1", name: "Page" }], folders: [] }, null, 2),
    "demos/page-1/index.tsx": "export default function Page(){return <div>trusted</div>}",
    "demos/page-1/config.schema.json": JSON.stringify({ type: "object", properties: {} }, null, 2),
  };
  for (const [relative, content] of Object.entries(sourceFiles)) {
    for (const root of [sourcePath, canonicalPath]) {
      fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
      fs.writeFileSync(path.join(root, relative), content, "utf-8");
    }
  }
  fs.cpSync(canonicalPath, failedPath, { recursive: true });
  fs.writeFileSync(path.join(failedPath, "demos/page-1/index.tsx"), "export default function Page(){return <div>drift</div>}");
  writeJson(path.join(failedPath, ".workspace.json"), {
    workspaceId: failedWorkspaceId,
    projectId,
    demoId: projectId,
    scope: "live",
    status: "active",
    baseVersion: "v1",
  });
  const registry = createWorkspaceResourceRegistry();
  const root = registry.createRootManifest(sourceFiles).rootHash;
  writeJson(path.join(dataDir, "projects", projectId, "project.json"), {
    id: projectId,
    workspacePath: canonicalPath,
    activeWorkspaceId: failedWorkspaceId,
    demoPages: [{ id: "page-1", name: "Old" }],
    demoFolders: [],
    versions: [{
      versionId: "v1",
      savedAt: Date.now(),
      savedBy: "tester",
      sessionId: "session-old",
      snapshotPath: sourcePath,
      fileCount: 3,
      workspaceId: failedWorkspaceId,
      workspaceRevision: 1,
      workspaceRootHash: root,
    }],
  });
  writeJson(path.join(dataDir, "sessions", "user-1", projectId, "session-1", ".session.json"), {
    sessionId: "session-1",
    demoId: projectId,
    userId: "user-1",
    role: "admin",
    workspaceId: failedWorkspaceId,
    status: "editing",
    expiresAt: Date.now() + 60_000,
  });
  fs.mkdirSync(path.join(dataDir, "workspace-authority", failedWorkspaceId, "staging"), { recursive: true });
  fs.writeFileSync(path.join(dataDir, "workspace-authority", failedWorkspaceId, "staging", "old.bin"), "old");
  return { dataDir, projectId, failedWorkspaceId, sourceRootHash: root };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("WorkspaceRecoveryCoordinator", () => {
  it("returns a read-only dry-run with a managed-resource diff", async () => {
    const fixture = setupFixture();
    const coordinator = new WorkspaceRecoveryCoordinator(fixture.dataDir);
    const result = await coordinator.rebuild({
      projectId: fixture.projectId,
      failedWorkspaceId: fixture.failedWorkspaceId,
      sourceVersionId: "v1",
      idempotencyKey: "dry-run",
      apply: false,
      actor: { userId: "user-1", username: "Admin" },
    });

    expect(result.applied).toBe(false);
    expect(result.sourceRootHash).toBe(fixture.sourceRootHash);
    expect(result.diffSummary.changed).toEqual(["demos/page-1/index.tsx"]);
    expect(fs.existsSync(path.join(fixture.dataDir, "workspace-recovery", result.recoveryId))).toBe(false);
  });

  it("rebuilds a fresh healthy live workspace and archives the failed session", async () => {
    const fixture = setupFixture();
    const coordinator = new WorkspaceRecoveryCoordinator(fixture.dataDir);
    const result = await coordinator.rebuild({
      projectId: fixture.projectId,
      failedWorkspaceId: fixture.failedWorkspaceId,
      sourceVersionId: "v1",
      idempotencyKey: "apply-once",
      apply: true,
      actor: { userId: "user-1", username: "Admin" },
    });

    expect(result.applied).toBe(true);
    expect(result.newWorkspaceId).not.toBe(fixture.failedWorkspaceId);
    expect(result.authority).toMatchObject({ revision: 1, ready: true, missingBackupCount: 0, stagingCount: 0 });
    expect(result.finalHealth).toMatchObject({
      ready: true,
      condition: "healthy",
      recommendedAction: "none",
      externalDrift: false,
      missingBackupHashCount: 0,
    });
    const project = JSON.parse(fs.readFileSync(path.join(fixture.dataDir, "projects", fixture.projectId, "project.json"), "utf-8"));
    expect(project.activeWorkspaceId).toBe(result.newWorkspaceId);
    expect(project.canonicalSyncedRootHash).toBe(fixture.sourceRootHash);
    expect(project.versions.at(-1)).toMatchObject({ type: "restore_snapshot", workspaceId: result.newWorkspaceId });
    const newMeta = JSON.parse(fs.readFileSync(path.join(fixture.dataDir, "workspaces", "projects", fixture.projectId, result.newWorkspaceId!, ".workspace.json"), "utf-8"));
    expect(newMeta.baseVersion).toBe(project.versions.at(-1).versionId);
    const oldMeta = JSON.parse(fs.readFileSync(path.join(fixture.dataDir, "workspaces", "projects", fixture.projectId, fixture.failedWorkspaceId, ".workspace.json"), "utf-8"));
    expect(oldMeta.status).toBe("archived");
    const session = JSON.parse(fs.readFileSync(path.join(fixture.dataDir, "sessions", "user-1", fixture.projectId, "session-1", ".session.json"), "utf-8"));
    expect(session.status).toBe("archived");
    expect(fs.existsSync(path.join(result.recoveryBundlePath!, "before", "authority", "staging", "old.bin"))).toBe(true);
  });

  it("fails closed when the version proof does not match the snapshot", async () => {
    const fixture = setupFixture();
    const projectFile = path.join(fixture.dataDir, "projects", fixture.projectId, "project.json");
    const project = JSON.parse(fs.readFileSync(projectFile, "utf-8"));
    project.versions[0].workspaceRootHash = "untrusted";
    writeJson(projectFile, project);
    const coordinator = new WorkspaceRecoveryCoordinator(fixture.dataDir);
    await expect(coordinator.rebuild({
      projectId: fixture.projectId,
      failedWorkspaceId: fixture.failedWorkspaceId,
      sourceVersionId: "v1",
      idempotencyKey: "reject",
      apply: true,
      actor: { userId: "user-1", username: "Admin" },
    })).rejects.toMatchObject({ code: "VERSION_SNAPSHOT_UNTRUSTED" });
    expect(JSON.parse(fs.readFileSync(projectFile, "utf-8")).activeWorkspaceId).toBe(fixture.failedWorkspaceId);
  });

  for (const phase of [
    "after_capture",
    "after_bootstrap",
    "before_metadata_cas",
  ] as const) {
    it(`rolls back without half-activating when ${phase} fails`, async () => {
      const fixture = setupFixture();
      const projectFile = path.join(
        fixture.dataDir,
        "projects",
        fixture.projectId,
        "project.json",
      );
      const canonicalFile = path.join(
        fixture.dataDir,
        "projects",
        fixture.projectId,
        "workspace",
        "demos/page-1/index.tsx",
      );
      fs.writeFileSync(canonicalFile, "canonical-before-recovery", "utf-8");
      const coordinator = new WorkspaceRecoveryCoordinator(
        fixture.dataDir,
        (current) => {
          if (current === phase) throw new Error(`injected:${phase}`);
        },
      );

      await expect(
        coordinator.rebuild({
          projectId: fixture.projectId,
          failedWorkspaceId: fixture.failedWorkspaceId,
          sourceVersionId: "v1",
          idempotencyKey: `fail-${phase}`,
          apply: true,
          actor: { userId: "user-1", username: "Admin" },
        }),
      ).rejects.toThrow(`injected:${phase}`);

      expect(readJson(projectFile).activeWorkspaceId).toBe(
        fixture.failedWorkspaceId,
      );
      expect(fs.readFileSync(canonicalFile, "utf-8")).toBe(
        "canonical-before-recovery",
      );
      const liveEntries = fs.readdirSync(
        path.join(
          fixture.dataDir,
          "workspaces",
          "projects",
          fixture.projectId,
        ),
      );
      expect(liveEntries).toEqual([fixture.failedWorkspaceId]);
    });
  }

  it("returns the same completed result for an idempotent apply replay", async () => {
    const fixture = setupFixture();
    const coordinator = new WorkspaceRecoveryCoordinator(fixture.dataDir);
    const request = {
      projectId: fixture.projectId,
      failedWorkspaceId: fixture.failedWorkspaceId,
      sourceVersionId: "v1",
      idempotencyKey: "idempotent-apply",
      apply: true,
      actor: { userId: "user-1", username: "Admin" },
    };

    const first = await coordinator.rebuild(request);
    const second = await coordinator.rebuild(request);
    expect(second).toEqual(first);
  });
});
