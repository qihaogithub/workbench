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
  return { fsUtils, sessionManager };
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

describe("对话历史 Session 数量限制", () => {
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

  it("5 个以内不删除任何 Session", async () => {
    const { enforceSessionLimit } = await importSessionManager(dataDir);

    for (let i = 1; i <= 5; i++) {
      writeSession(dataDir, "user-1", "project-1", `session-${i}`, i);
    }

    expect(enforceSessionLimit("user-1", "project-1", 5)).toBe(0);

    const projectDir = path.join(dataDir, "sessions", "user-1", "project-1");
    expect(fs.readdirSync(projectDir).sort()).toEqual([
      "session-1",
      "session-2",
      "session-3",
      "session-4",
      "session-5",
    ]);
  });

  it("超过上限时按 createdAt 删除最旧的 Session", async () => {
    const { enforceSessionLimit } = await importSessionManager(dataDir);

    for (let i = 1; i <= 6; i++) {
      writeSession(dataDir, "user-1", "project-1", `session-${i}`, i);
    }

    expect(enforceSessionLimit("user-1", "project-1", 5)).toBe(1);

    const projectDir = path.join(dataDir, "sessions", "user-1", "project-1");
    expect(fs.readdirSync(projectDir).sort()).toEqual([
      "session-2",
      "session-3",
      "session-4",
      "session-5",
      "session-6",
    ]);
  });

  it("只清理当前用户当前项目下的有效 Session", async () => {
    const { enforceSessionLimit } = await importSessionManager(dataDir);

    for (let i = 1; i <= 6; i++) {
      writeSession(dataDir, "user-1", "project-1", `session-${i}`, i);
    }
    writeSession(dataDir, "user-1", "project-2", "session-other-project", 0);
    writeSession(dataDir, "user-2", "project-1", "session-other-user", 0);

    const brokenDir = path.join(
      dataDir,
      "sessions",
      "user-1",
      "project-1",
      "session-broken",
    );
    fs.mkdirSync(brokenDir, { recursive: true });
    fs.writeFileSync(path.join(brokenDir, ".session.json"), "{broken", "utf-8");

    expect(enforceSessionLimit("user-1", "project-1", 5)).toBe(1);

    expect(
      fs.existsSync(
        path.join(dataDir, "sessions", "user-1", "project-2", "session-other-project"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(dataDir, "sessions", "user-2", "project-1", "session-other-user"),
      ),
    ).toBe(true);
    expect(fs.existsSync(brokenDir)).toBe(true);
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
});
