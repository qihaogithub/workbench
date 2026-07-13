import fs from "fs";
import os from "os";
import path from "path";

function makeTempDataDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "owb-workspace-manager-"));
}

function configureDataDir(dataDir: string): void {
  process.env.DATA_DIR = dataDir;
  process.env.PROJECTS_DIR = path.join(dataDir, "projects");
  process.env.SESSIONS_DIR = path.join(dataDir, "sessions");
  process.env.WORKSPACES_DIR = path.join(dataDir, "workspaces");
  process.env.SNAPSHOTS_DIR = path.join(dataDir, "snapshots");
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function writeProject(
  dataDir: string,
  projectId: string,
  fields: Record<string, unknown> = {},
): void {
  const projectPath = path.join(dataDir, "projects", projectId);
  fs.mkdirSync(path.join(projectPath, "workspace"), { recursive: true });
  fs.writeFileSync(
    path.join(projectPath, "project.json"),
    JSON.stringify(
      {
        id: projectId,
        name: projectId,
        workspacePath: path.join(projectPath, "workspace"),
        demoPages: [],
        demoFolders: [],
        versions: [
          {
            versionId: "v2",
            savedAt: 1,
            savedBy: "test",
            sessionId: "session-1",
            snapshotPath: path.join(dataDir, "snapshots", projectId, "v2"),
            fileCount: 0,
          },
        ],
        createdAt: 1,
        updatedAt: 1,
        ...fields,
      },
      null,
      2,
    ),
    "utf-8",
  );
}

function writeWorkspace(
  dataDir: string,
  projectId: string,
  workspaceId: string,
  baseVersion: string,
): void {
  const workspacePath = path.join(
    dataDir,
    "workspaces",
    "projects",
    projectId,
    workspaceId,
  );
  fs.mkdirSync(workspacePath, { recursive: true });
  fs.writeFileSync(
    path.join(workspacePath, ".workspace.json"),
    JSON.stringify(
      {
        workspaceId,
        projectId,
        demoId: projectId,
        scope: "live",
        status: "active",
        baseVersion,
        createdAt: 1,
        updatedAt: 1,
      },
      null,
      2,
    ),
    "utf-8",
  );
}

async function importModules(dataDir: string) {
  jest.resetModules();
  configureDataDir(dataDir);
  const workspaceManager = await import("../workspace-manager");
  const diagnosticsStore = await import("../editor-diagnostics/store");
  return { workspaceManager, diagnosticsStore };
}

describe("workspace manager diagnostics", () => {
  const originalEnv = { ...process.env };
  let dataDir: string;

  beforeEach(() => {
    dataDir = makeTempDataDir();
  });

  afterEach(() => {
    cleanup(dataDir);
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  it("缺少 active workspace 时记录 missing_active_workspace", async () => {
    const projectId = "project-missing-active";
    writeProject(dataDir, projectId);
    const { workspaceManager, diagnosticsStore } = await importModules(dataDir);

    const result = workspaceManager.syncActiveWorkspaceToCanonical(projectId);

    expect(result).toMatchObject({
      success: false,
      code: "WORKSPACE_STALE",
    });
    const queried = await diagnosticsStore.queryEditorDiagnosticEvents({
      projectId,
      eventType: "workspace.canonical_materialization_failed",
    });
    expect(queried.events).toEqual([
      expect.objectContaining({
        eventGroup: "workspace",
        eventType: "workspace.canonical_materialization_failed",
        payload: expect.objectContaining({
          reason: "missing_active_workspace",
          errorCode: "WORKSPACE_STALE",
          phase: "canonical-materialization",
          latestVersionId: "v2",
        }),
      }),
    ]);
  });

  it("active 指针不匹配时记录 active_workspace_mismatch", async () => {
    const projectId = "project-active-mismatch";
    writeProject(dataDir, projectId, {
      activeWorkspaceId: "live-current",
      canonicalSyncedWorkspaceId: "live-current",
    });
    const { workspaceManager, diagnosticsStore } = await importModules(dataDir);

    const result = workspaceManager.syncActiveWorkspaceToCanonical(projectId, "live-requested");

    expect(result).toMatchObject({
      success: false,
      code: "WORKSPACE_STALE",
    });
    const queried = await diagnosticsStore.queryEditorDiagnosticEvents({
      projectId,
      eventType: "workspace.canonical_materialization_failed",
    });
    expect(queried.events[0]).toEqual(
      expect.objectContaining({
        workspaceId: "live-requested",
        payload: expect.objectContaining({
          reason: "active_workspace_mismatch",
          requestedWorkspaceId: "live-requested",
          activeWorkspaceId: "live-current",
          canonicalSyncedWorkspaceId: "live-current",
          errorCode: "WORKSPACE_STALE",
        }),
      }),
    );
  });

  it("baseVersion 落后时记录 base_version_stale", async () => {
    const projectId = "project-base-stale";
    const workspaceId = "live-stale";
    writeProject(dataDir, projectId, {
      activeWorkspaceId: workspaceId,
      canonicalSyncedWorkspaceId: workspaceId,
    });
    writeWorkspace(dataDir, projectId, workspaceId, "v1");
    const { workspaceManager, diagnosticsStore } = await importModules(dataDir);

    const result = workspaceManager.syncActiveWorkspaceToCanonical(projectId, workspaceId);

    expect(result).toMatchObject({
      success: false,
      code: "WORKSPACE_STALE",
    });
    const queried = await diagnosticsStore.queryEditorDiagnosticEvents({
      projectId,
      eventType: "workspace.canonical_materialization_failed",
    });
    expect(queried.events[0]).toEqual(
      expect.objectContaining({
        workspaceId,
        payload: expect.objectContaining({
          reason: "base_version_stale",
          requestedWorkspaceId: workspaceId,
          activeWorkspaceId: workspaceId,
          baseVersion: "v1",
          latestVersionId: "v2",
          errorCode: "WORKSPACE_STALE",
        }),
      }),
    );
  });

  it("active workspace 过期后创建新 live workspace 时清理旧 canonical sync 指针", async () => {
    const projectId = "project-new-live-clears-stale-canonical";
    const staleWorkspaceId = "live-stale";
    writeProject(dataDir, projectId, {
      activeWorkspaceId: staleWorkspaceId,
      activeWorkspaceUpdatedAt: 10,
      canonicalSyncedWorkspaceId: staleWorkspaceId,
      canonicalSyncedRevision: 7,
      canonicalSyncedRootHash: "stale-root-hash",
      canonicalSyncedAt: 20,
    });
    writeWorkspace(dataDir, projectId, staleWorkspaceId, "v1");
    const { workspaceManager, diagnosticsStore } = await importModules(dataDir);

    const result = workspaceManager.getOrCreateProjectActiveWorkspace(projectId);
    const project = JSON.parse(
      fs.readFileSync(
        path.join(dataDir, "projects", projectId, "project.json"),
        "utf-8",
      ),
    );

    expect(result.workspaceId).not.toBe(staleWorkspaceId);
    expect(project.activeWorkspaceId).toBe(result.workspaceId);
    expect(project.canonicalSyncedWorkspaceId).toBeUndefined();
    expect(project.canonicalSyncedRevision).toBeUndefined();
    expect(project.canonicalSyncedRootHash).toBeUndefined();
    expect(project.canonicalSyncedAt).toBeUndefined();
  });

  it("canonical 同步成功时记录 Authority revision 和 root hash", async () => {
    const projectId = "project-canonical-sync-revision";
    const workspaceId = "live-sync-revision";
    writeProject(dataDir, projectId, {
      activeWorkspaceId: workspaceId,
      activeWorkspaceUpdatedAt: 1,
    });
    writeWorkspace(dataDir, projectId, workspaceId, "v2");
    fs.writeFileSync(
      path.join(
        dataDir,
        "workspaces",
        "projects",
        projectId,
        workspaceId,
        "prototype.html",
      ),
      "<div>new</div>",
      "utf-8",
    );
    const { workspaceManager, diagnosticsStore } = await importModules(dataDir);

    const result = workspaceManager.syncActiveWorkspaceToCanonical(projectId, workspaceId, {
      revision: 12,
      rootHash: "root-hash-12",
    });
    const project = JSON.parse(
      fs.readFileSync(
        path.join(dataDir, "projects", projectId, "project.json"),
        "utf-8",
      ),
    );

    expect(result).toMatchObject({
      success: true,
      workspacePath: path.join(dataDir, "projects", projectId, "workspace"),
    });
    expect(project.canonicalSyncedWorkspaceId).toBe(workspaceId);
    expect(project.canonicalSyncedRevision).toBe(12);
    expect(project.canonicalSyncedRootHash).toBe("root-hash-12");
    expect(project.canonicalSyncedAt).toEqual(expect.any(Number));
    const diagnostics = await diagnosticsStore.queryEditorDiagnosticEvents({
      projectId,
    });
    expect(diagnostics.events.map((event) => event.eventType)).toEqual([
      "workspace.canonical_materialization_started",
      "workspace.canonical_materialization_succeeded",
    ]);
    for (const event of diagnostics.events) {
      expect(event.operationId).toBe(`canonical:${projectId}:${workspaceId}:12`);
      expect(event.traceId).toBe(event.operationId);
      expect(event.payload).toEqual(expect.objectContaining({
        phase: "canonical-materialization",
        revision: 12,
        rootHash: "root-hash-12",
        durationMs: expect.any(Number),
      }));
    }
  });

  it("post-materialize 失败时按匹配 revision/rootHash 清理 stale canonical proof", async () => {
    const projectId = "project-clear-stale-canonical-proof";
    const workspaceId = "live-clear-proof";
    writeProject(dataDir, projectId, {
      activeWorkspaceId: workspaceId,
      activeWorkspaceUpdatedAt: 1,
      canonicalSyncedWorkspaceId: workspaceId,
      canonicalSyncedRevision: 12,
      canonicalSyncedRootHash: "root-hash-12",
      canonicalSyncedAt: 20,
    });
    const { workspaceManager } = await importModules(dataDir);

    const cleared = workspaceManager.clearCanonicalSyncProofIfMatches(
      projectId,
      workspaceId,
      { revision: 12, rootHash: "root-hash-12" },
    );
    const project = JSON.parse(
      fs.readFileSync(
        path.join(dataDir, "projects", projectId, "project.json"),
        "utf-8",
      ),
    );

    expect(cleared).toBe(true);
    expect(project.activeWorkspaceId).toBe(workspaceId);
    expect(project.activeWorkspaceUpdatedAt).toBe(1);
    expect(project.canonicalSyncedWorkspaceId).toBeUndefined();
    expect(project.canonicalSyncedRevision).toBeUndefined();
    expect(project.canonicalSyncedRootHash).toBeUndefined();
    expect(project.canonicalSyncedAt).toBeUndefined();
    expect(project.updatedAt).toEqual(expect.any(Number));
  });

  it("post-materialize 失败时不清理已被并发更新的 canonical proof", async () => {
    const projectId = "project-keep-newer-canonical-proof";
    const workspaceId = "live-keep-proof";
    writeProject(dataDir, projectId, {
      activeWorkspaceId: workspaceId,
      activeWorkspaceUpdatedAt: 1,
      canonicalSyncedWorkspaceId: workspaceId,
      canonicalSyncedRevision: 13,
      canonicalSyncedRootHash: "root-hash-13",
      canonicalSyncedAt: 30,
    });
    const { workspaceManager } = await importModules(dataDir);

    const cleared = workspaceManager.clearCanonicalSyncProofIfMatches(
      projectId,
      workspaceId,
      { revision: 12, rootHash: "root-hash-12" },
    );
    const project = JSON.parse(
      fs.readFileSync(
        path.join(dataDir, "projects", projectId, "project.json"),
        "utf-8",
      ),
    );

    expect(cleared).toBe(false);
    expect(project.canonicalSyncedWorkspaceId).toBe(workspaceId);
    expect(project.canonicalSyncedRevision).toBe(13);
    expect(project.canonicalSyncedRootHash).toBe("root-hash-13");
    expect(project.canonicalSyncedAt).toBe(30);
  });
});
