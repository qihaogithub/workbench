import fs from "fs";
import os from "os";
import path from "path";

function makeTempDataDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "owb-session-manager-"));
}

function cleanup(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function importSessionManager(dataDir: string) {
  jest.resetModules();
  process.env.DATA_DIR = dataDir;
  process.env.PROJECTS_DIR = path.join(dataDir, "projects");
  process.env.SESSIONS_DIR = path.join(dataDir, "sessions");
  process.env.WORKSPACES_DIR = path.join(dataDir, "workspaces");
  process.env.SNAPSHOTS_DIR = path.join(dataDir, "snapshots");

  return import("../session-manager");
}

async function importProjectModules(dataDir: string) {
  jest.resetModules();
  process.env.DATA_DIR = dataDir;
  process.env.PROJECTS_DIR = path.join(dataDir, "projects");
  process.env.SESSIONS_DIR = path.join(dataDir, "sessions");
  process.env.WORKSPACES_DIR = path.join(dataDir, "workspaces");
  process.env.SNAPSHOTS_DIR = path.join(dataDir, "snapshots");

  const fsUtils = await import("../fs-utils");
  const sessionManager = await import("../session-manager");
  const workspaceManager = await import("../workspace-manager");
  return { fsUtils, sessionManager, workspaceManager };
}

function writeSession(
  dataDir: string,
  userId: string,
  projectId: string,
  sessionId: string,
  createdAt: number,
): void {
  const sessionDir = path.join(dataDir, "sessions", userId, projectId, sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(
    path.join(sessionDir, ".session.json"),
    JSON.stringify(
      {
        sessionId,
        userId,
        demoId: projectId,
        workspaceId: null,
        status: "archived",
        createdAt,
        expiresAt: createdAt + 1000,
        lastActivityAt: createdAt,
      },
      null,
      2,
    ),
    "utf-8",
  );
}

function writeActiveSession(
  dataDir: string,
  userId: string,
  projectId: string,
  sessionId: string,
  workspaceId: string,
): void {
  const sessionDir = path.join(dataDir, "sessions", userId, projectId, sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(
    path.join(sessionDir, ".session.json"),
    JSON.stringify(
      {
        sessionId,
        userId,
        demoId: projectId,
        workspaceId,
        status: "editing",
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      },
      null,
      2,
    ),
    "utf-8",
  );
}

describe("编辑 Session 续期", () => {
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

  it("允许过期编辑会话在关键同步前恢复为 editing", async () => {
    const sessionId = "session-expired";
    const sessionDir = path.join(dataDir, "sessions", "user-1", "project-1", sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessionDir, ".session.json"),
      JSON.stringify(
        {
          sessionId,
          userId: "user-1",
          demoId: "project-1",
          workspaceId: "workspace-1",
          status: "expired",
          createdAt: Date.now() - 10_000,
          expiresAt: Date.now() - 1_000,
        },
        null,
        2,
      ),
      "utf-8",
    );

    const { renewEditSession } = await importSessionManager(dataDir);

    expect(renewEditSession(sessionId)).toBe(true);

    const renewed = JSON.parse(
      fs.readFileSync(path.join(sessionDir, ".session.json"), "utf-8"),
    );
    expect(renewed.status).toBe("editing");
    expect(renewed.expiresAt).toBeGreaterThan(Date.now());
  });

  it("不会恢复已归档会话", async () => {
    const sessionId = "session-archived";
    writeSession(dataDir, "user-1", "project-1", sessionId, Date.now() - 10_000);

    const { renewEditSession } = await importSessionManager(dataDir);

    expect(renewEditSession(sessionId)).toBe(false);
  });

  it("创建和续期时分别维护历史活动时间与 2 小时编辑租约", async () => {
    const { fsUtils, sessionManager } = await importProjectModules(dataDir);
    const project = fsUtils.createProject("会话活动时间项目");
    const session = await sessionManager.createEditSession("user-1", project.id);
    const created = sessionManager.getEditSession(session.sessionId);
    expect(created?.lastActivityAt).toEqual(expect.any(Number));
    expect(created?.expiresAt).toBeGreaterThan(created?.lastActivityAt ?? 0);

    const beforeRenew = created?.lastActivityAt ?? 0;
    expect(sessionManager.renewEditSession(session.sessionId)).toBe(true);
    const renewed = sessionManager.getEditSession(session.sessionId);
    expect(renewed?.lastActivityAt).toBeGreaterThanOrEqual(beforeRenew);
    expect(renewed?.expiresAt).toBeGreaterThan(renewed?.lastActivityAt ?? 0);
  });
});

describe("过期 Session 清理", () => {
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

  it("只返回本轮实际删除的历史 Session", async () => {
    const sessionId = "session-expired-editing";
    const sessionDir = path.join(
      dataDir,
      "sessions",
      "user-1",
      "project-1",
      sessionId,
    );
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessionDir, ".session.json"),
      JSON.stringify({
        sessionId,
        userId: "user-1",
        demoId: "project-1",
        workspaceId: null,
        status: "editing",
      createdAt: Date.now() - 10_000,
      expiresAt: Date.now() - 1_000,
      lastActivityAt: Date.now() - 7 * 24 * 60 * 60 * 1000 - 1_000,
      }),
      "utf-8",
    );

    const { cleanupAllExpiredSessions } = await importSessionManager(dataDir);

    expect(cleanupAllExpiredSessions()).toEqual([sessionId]);
    expect(cleanupAllExpiredSessions()).toEqual([]);
  });

  it("按最后活动时间删除历史，但保留近期会话和 live workspace", async () => {
    const { fsUtils, sessionManager } = await importProjectModules(dataDir);
    const project = fsUtils.createProject("历史保留期项目");
    const recent = await sessionManager.createEditSession("user-1", project.id);
    const stale = await sessionManager.createEditSession("user-1", project.id);
    const stalePath = fsUtils.findSessionPath(stale.sessionId);
    if (!stalePath) throw new Error("stale session path missing");
    const staleMetaPath = path.join(stalePath, ".session.json");
    const staleMeta = JSON.parse(fs.readFileSync(staleMetaPath, "utf-8"));
    staleMeta.lastActivityAt =
      Date.now() - sessionManager.SESSION_HISTORY_RETENTION_MS - 1_000;
    fs.writeFileSync(staleMetaPath, JSON.stringify(staleMeta, null, 2), "utf-8");

    expect(sessionManager.cleanupExpiredSessions("user-1", project.id)).toEqual([
      stale.sessionId,
    ]);
    expect(fs.existsSync(stalePath)).toBe(false);
    expect(fsUtils.findSessionPath(recent.sessionId)).toBeTruthy();
    expect(fs.existsSync(recent.workspacePath)).toBe(true);
    expect(sessionManager.cleanupExpiredSessions("user-1", project.id)).toEqual([]);
  });
});

describe("活跃 Session 复用", () => {
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

  it("跳过 workspace 已缺失的活跃 Session", async () => {
    const { findActiveSession } = await importSessionManager(dataDir);
    writeActiveSession(
      dataDir,
      "user-1",
      "project-1",
      "session-orphan",
      "workspace-missing",
    );

    expect(findActiveSession("user-1", "project-1")).toBeNull();

    const meta = JSON.parse(
      fs.readFileSync(
        path.join(
          dataDir,
          "sessions",
          "user-1",
          "project-1",
          "session-orphan",
          ".session.json",
        ),
        "utf-8",
      ),
    );
    expect(meta.status).toBe("orphaned");
  });
});

describe("项目级共享 Workspace", () => {
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

  it("不同用户打开同一项目时绑定同一个 live workspace", async () => {
    const { fsUtils, sessionManager } = await importProjectModules(dataDir);
    const project = fsUtils.createProject("共享工作区项目");

    const userA = await sessionManager.createEditSession("user-a", project.id);
    const userB = await sessionManager.createEditSession("user-b", project.id);

    expect(userA.workspaceId).toBe(userB.workspaceId);
    expect(userA.workspaceScope).toBe("live");
    expect(userA.isSharedWorkspace).toBe(true);
    expect(userB.workspaceScope).toBe("live");

    const meta = fsUtils.getWorkspaceMeta(userA.workspaceId);
    expect(meta?.scope).toBe("live");
    expect(meta?.projectId).toBe(project.id);
  });

  it("归档 Session 不删除项目级 live workspace", async () => {
    const { fsUtils, sessionManager } = await importProjectModules(dataDir);
    const project = fsUtils.createProject("归档保留共享工作区项目");
    const session = await sessionManager.createEditSession("user-a", project.id);
    const workspacePath = fsUtils.findWorkspacePath(session.workspaceId);

    expect(workspacePath).toBeTruthy();
    expect(sessionManager.archiveSession(session.sessionId, "archived")).toBe(true);
    expect(fs.existsSync(workspacePath!)).toBe(true);
  });

  it("项目产生新版本后不复用旧 baseVersion 的 live workspace", async () => {
    const { fsUtils, sessionManager } = await importProjectModules(dataDir);
    const project = fsUtils.createProject("过期共享工作区项目");
    const projectWorkspacePath = path.join(dataDir, "projects", project.id, "workspace");
    const markerPath = path.join(projectWorkspacePath, "_marker.txt");

    fs.writeFileSync(markerPath, "canonical-v1", "utf-8");
    expect(fsUtils.createProjectVersionSnapshot(project.id, "tester").success).toBe(true);

    const firstSession = await sessionManager.createEditSession("user-a", project.id);
    const staleWorkspacePath = fsUtils.findWorkspacePath(firstSession.workspaceId);
    expect(staleWorkspacePath).toBeTruthy();
    fs.writeFileSync(path.join(staleWorkspacePath!, "_marker.txt"), "stale-live", "utf-8");

    fs.writeFileSync(markerPath, "canonical-v2", "utf-8");
    expect(fsUtils.createProjectVersionSnapshot(project.id, "tester").success).toBe(true);

    const secondSession = await sessionManager.createEditSession("user-b", project.id);
    const currentWorkspacePath = fsUtils.findWorkspacePath(secondSession.workspaceId);

    expect(secondSession.workspaceId).not.toBe(firstSession.workspaceId);
    expect(fs.existsSync(staleWorkspacePath!)).toBe(true);
    expect(fs.readFileSync(path.join(currentWorkspacePath!, "_marker.txt"), "utf-8")).toBe("canonical-v2");
  });

  it("过期 live workspace 不能同步覆盖项目基准工作区", async () => {
    const { fsUtils, sessionManager, workspaceManager } = await importProjectModules(dataDir);
    const project = fsUtils.createProject("过期同步项目");
    const projectWorkspacePath = path.join(dataDir, "projects", project.id, "workspace");
    const markerPath = path.join(projectWorkspacePath, "_marker.txt");

    fs.writeFileSync(markerPath, "canonical-v1", "utf-8");
    expect(fsUtils.createProjectVersionSnapshot(project.id, "tester").success).toBe(true);

    const session = await sessionManager.createEditSession("user-a", project.id);
    const staleWorkspacePath = fsUtils.findWorkspacePath(session.workspaceId);
    expect(staleWorkspacePath).toBeTruthy();
    fs.writeFileSync(path.join(staleWorkspacePath!, "_marker.txt"), "stale-live", "utf-8");

    fs.writeFileSync(markerPath, "canonical-v2", "utf-8");
    expect(fsUtils.createProjectVersionSnapshot(project.id, "tester").success).toBe(true);

    const synced = workspaceManager.syncActiveWorkspaceToCanonical(project.id, session.workspaceId);
    expect(synced).toMatchObject({
      success: false,
      code: "WORKSPACE_STALE",
    });
    expect(fs.readFileSync(markerPath, "utf-8")).toBe("canonical-v2");

    const saved = sessionManager.saveEditSession(session.sessionId);
    expect(saved.success).toBe(false);
    expect(saved.error).toContain("当前工作区已过期");
    expect(fs.readFileSync(markerPath, "utf-8")).toBe("canonical-v2");
  });

  it("同一 session 已创建新版本但未更新 baseVersion 时可恢复后继续保存", async () => {
    const { fsUtils, sessionManager, workspaceManager } = await importProjectModules(dataDir);
    const project = fsUtils.createProject("同会话基线恢复项目");
    const projectWorkspacePath = path.join(dataDir, "projects", project.id, "workspace");
    const markerPath = path.join(projectWorkspacePath, "_marker.txt");

    fs.writeFileSync(markerPath, "canonical-v1", "utf-8");
    expect(fsUtils.createProjectVersionSnapshot(project.id, "tester").success).toBe(true);

    const session = await sessionManager.createEditSession("user-a", project.id);
    const liveWorkspacePath = fsUtils.findWorkspacePath(session.workspaceId);
    expect(liveWorkspacePath).toBeTruthy();
    fs.writeFileSync(path.join(liveWorkspacePath!, "_marker.txt"), "live-change", "utf-8");

    expect(
      workspaceManager.syncActiveWorkspaceToCanonical(project.id, session.workspaceId, {
        revision: 2,
        rootHash: "root-hash-2",
      }),
    ).toMatchObject({ success: true });
    const baseBeforeCheckpoint = fsUtils.getWorkspaceMeta(session.workspaceId)?.baseVersion;
    const checkpoint = fsUtils.createProjectVersionSnapshot(project.id, "tester", {
      sessionId: session.sessionId,
      type: "auto_checkpoint",
      note: "模拟旧代码创建的自动保存记录",
    });
    expect(checkpoint.success).toBe(true);
    const checkpointMeta = fsUtils.getWorkspaceMeta(session.workspaceId);
    if (!checkpointMeta) throw new Error("workspace meta missing");
    fsUtils.writeWorkspaceMeta(session.workspaceId, {
      ...checkpointMeta,
      baseVersion: baseBeforeCheckpoint,
      updatedAt: checkpointMeta.updatedAt,
    });
    expect(fsUtils.getWorkspaceMeta(session.workspaceId)?.baseVersion).not.toBe(
      checkpoint.version?.versionId,
    );

    const saved = sessionManager.saveEditSession(session.sessionId);

    expect(saved.success).toBe(true);
    expect(saved.version).toMatch(/^v\d+$/);
    expect(fsUtils.getWorkspaceMeta(session.workspaceId)?.baseVersion).toBe(
      saved.version,
    );
    expect(fs.readFileSync(markerPath, "utf-8")).toBe("live-change");
  });

  it("缺少 canonical revision/rootHash 时创建版本不推进 live workspace baseVersion", async () => {
    const { fsUtils, sessionManager, workspaceManager } = await importProjectModules(dataDir);
    const project = fsUtils.createProject("缺少 canonical revision 的版本项目");
    const projectWorkspacePath = path.join(dataDir, "projects", project.id, "workspace");

    expect(fsUtils.createProjectVersionSnapshot(project.id, "tester").success).toBe(true);
    const session = await sessionManager.createEditSession("user-a", project.id);
    const baseBeforeSync = fsUtils.getWorkspaceMeta(session.workspaceId)?.baseVersion;
    expect(
      workspaceManager.syncActiveWorkspaceToCanonical(project.id, session.workspaceId),
    ).toMatchObject({ success: true });

    const checkpoint = fsUtils.createProjectVersionSnapshot(project.id, "tester", {
      sessionId: session.sessionId,
      type: "auto_checkpoint",
    });

    expect(checkpoint.success).toBe(true);
    expect(fsUtils.getWorkspaceMeta(session.workspaceId)?.baseVersion).toBe(baseBeforeSync);
    expect(fs.existsSync(projectWorkspacePath)).toBe(true);
  });

  it("创建项目级版本时记录消费的 workspace revision 和 rootHash", async () => {
    const { fsUtils } = await importProjectModules(dataDir);
    const project = fsUtils.createProject("版本绑定 workspace revision 项目");

    const result = fsUtils.createProjectVersionSnapshot(project.id, "tester", {
      sessionId: "session-1",
      workspaceId: "live-1",
      workspaceRevision: 9,
      workspaceRootHash: "root-hash-9",
    });

    expect(result.success).toBe(true);
    expect(result.version).toMatchObject({
      workspaceId: "live-1",
      workspaceRevision: 9,
      workspaceRootHash: "root-hash-9",
    });
    const versions = fsUtils.getVersionHistory(project.id);
    expect(versions[0]).toMatchObject({
      workspaceId: "live-1",
      workspaceRevision: 9,
      workspaceRootHash: "root-hash-9",
    });
  });

  it("保存 Session 时写入外层 canonical sync 的 workspace revision 和 rootHash", async () => {
    const { fsUtils, sessionManager, workspaceManager } = await importProjectModules(dataDir);
    const project = fsUtils.createProject("Session 保存绑定 workspace revision 项目");
    const session = await sessionManager.createEditSession("user-a", project.id);
    const liveWorkspacePath = fsUtils.findWorkspacePath(session.workspaceId);
    expect(liveWorkspacePath).toBeTruthy();
    fs.writeFileSync(path.join(liveWorkspacePath!, "_marker.txt"), "live-change", "utf-8");

    expect(
      workspaceManager.syncActiveWorkspaceToCanonical(project.id, session.workspaceId, {
        revision: 14,
        rootHash: "root-hash-14",
      }),
    ).toMatchObject({ success: true });

    const saved = sessionManager.saveEditSession(
      session.sessionId,
      "tester",
      "保存前已完成 canonical sync",
      "named_version",
      {
        syncedWorkspace: {
          workspaceId: session.workspaceId,
          revision: 14,
          rootHash: "root-hash-14",
        },
      },
    );

    expect(saved.success).toBe(true);
    const versions = fsUtils.getVersionHistory(project.id);
    expect(versions.find((version) => version.versionId === saved.version)).toMatchObject({
      workspaceId: session.workspaceId,
      workspaceRevision: 14,
      workspaceRootHash: "root-hash-14",
    });
  });
});
