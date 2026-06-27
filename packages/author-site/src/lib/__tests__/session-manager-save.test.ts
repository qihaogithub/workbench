import path from "path";
import fs from "fs";
import os from "os";

let tempDir: string;
let createProject: typeof import("../fs-utils").createProject;
let createSession: typeof import("../fs-utils").createSession;
let readProjectMeta: typeof import("../fs-utils").readProjectMeta;
let saveEditSession: typeof import("../session-manager").saveEditSession;

function getProjectWorkspace(projectId: string): string {
  return path.join(tempDir, "projects", projectId, "workspace");
}

function readMarkerFile(workspacePath: string): string {
  return fs.readFileSync(path.join(workspacePath, "_test_marker.txt"), "utf-8");
}

function writeMarkerFile(workspacePath: string, content: string): void {
  fs.writeFileSync(
    path.join(workspacePath, "_test_marker.txt"),
    content,
    "utf-8",
  );
}

function getSessionPath(projectId: string, sessionId: string): string {
  return path.join(tempDir, "sessions", projectId, sessionId);
}

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "save-test-"));
  process.env.DATA_DIR = tempDir;
  jest.resetModules();
  const fsUtils = require("../fs-utils");
  createProject = fsUtils.createProject;
  createSession = fsUtils.createSession;
  readProjectMeta = fsUtils.readProjectMeta;
  saveEditSession = require("../session-manager").saveEditSession;
});

afterAll(() => {
  delete process.env.DATA_DIR;
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("saveEditSession", () => {
  it("正常保存：workspace 内容应更新为 session 内容", () => {
    const project = createProject("测试项目");
    const session = createSession(project.id);

    const workspacePath = getProjectWorkspace(project.id);
    writeMarkerFile(workspacePath, "原始内容");

    const sessionPath = getSessionPath(project.id, session.sessionId);
    fs.writeFileSync(
      path.join(sessionPath, "_test_marker.txt"),
      "会话内容",
      "utf-8",
    );

    const result = saveEditSession(session.sessionId);

    expect(result.success).toBe(true);
    expect(result.version).toMatch(/^v\d+$/);
    expect(fs.existsSync(workspacePath)).toBe(true);
    expect(readMarkerFile(workspacePath)).toBe("会话内容");
  });

  it("保存后应生成新版本记录", () => {
    const project = createProject("版本测试");
    const session = createSession(project.id);

    const result = saveEditSession(session.sessionId);

    expect(result.success).toBe(true);
    const meta = readProjectMeta(project.id);
    expect(meta).not.toBeNull();
    expect(meta!.versions.length).toBe(1);
    expect(meta!.versions[0].versionId).toBe(result.version);
  });

  it("source 目录不存在时保存失败但 workspace 不受破坏", () => {
    const project = createProject("守卫测试");
    const session = createSession(project.id);

    const workspacePath = getProjectWorkspace(project.id);
    writeMarkerFile(workspacePath, "重要数据");

    // 删除 session 目录（sourcePath 变为无效）
    const sessionPath = getSessionPath(project.id, session.sessionId);
    fs.rmSync(sessionPath, { recursive: true, force: true });

    const result = saveEditSession(session.sessionId);

    expect(result.success).toBe(false);
    // workspace 内容应完好无损
    expect(fs.existsSync(workspacePath)).toBe(true);
    expect(readMarkerFile(workspacePath)).toBe("重要数据");
  });

  it("复制失败时 workspace 不应被破坏（原子性保护）", () => {
    const project = createProject("原子性测试");
    const session = createSession(project.id);

    const workspacePath = getProjectWorkspace(project.id);
    writeMarkerFile(workspacePath, "受保护数据");

    const originalCpSync = fs.cpSync.bind(fs);
    const cpSyncSpy = jest.spyOn(fs, "cpSync").mockImplementation(
      ((src: string | URL, dest: string | URL, options?: fs.CopySyncOptions) => {
        if (String(dest).endsWith("workspace.tmp")) {
          throw new Error("mock copy failed");
        }
        return originalCpSync(src, dest, options);
      }) as typeof fs.cpSync,
    );

    const result = saveEditSession(session.sessionId);
    cpSyncSpy.mockRestore();

    expect(result.success).toBe(false);
    expect(fs.existsSync(workspacePath)).toBe(true);
    expect(readMarkerFile(workspacePath)).toBe("受保护数据");
  });

  it("存在残留 .tmp 目录时不应影响正常保存", () => {
    const project = createProject("残留测试");
    const session = createSession(project.id);

    const workspacePath = getProjectWorkspace(project.id);
    writeMarkerFile(workspacePath, "干净数据");

    // 模拟上次保存中断残留的 .tmp 目录
    const tmpPath = workspacePath + ".tmp";
    fs.mkdirSync(tmpPath);
    fs.writeFileSync(
      path.join(tmpPath, "_stale.txt"),
      "残留的旧临时数据",
      "utf-8",
    );

    const sessionPath = getSessionPath(project.id, session.sessionId);
    fs.writeFileSync(
      path.join(sessionPath, "_test_marker.txt"),
      "新数据",
      "utf-8",
    );

    const result = saveEditSession(session.sessionId);

    expect(result.success).toBe(true);
    expect(readMarkerFile(workspacePath)).toBe("新数据");
    // 残留文件不应出现在最终 workspace 中
    expect(fs.existsSync(path.join(workspacePath, "_stale.txt"))).toBe(false);
  });

  it("不存在的 session 应返回失败", () => {
    const result = saveEditSession("nonexistent-session-id");
    expect(result.success).toBe(false);
  });
});
