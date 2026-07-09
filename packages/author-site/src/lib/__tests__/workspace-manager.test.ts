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
      eventType: "workspace.sync_failed",
    });
    expect(queried.events).toEqual([
      expect.objectContaining({
        eventGroup: "workspace",
        eventType: "workspace.sync_failed",
        payload: expect.objectContaining({
          reason: "missing_active_workspace",
          errorCode: "WORKSPACE_STALE",
          phase: "persist-workspace",
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
      eventType: "workspace.sync_failed",
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
      eventType: "workspace.sync_failed",
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
});
