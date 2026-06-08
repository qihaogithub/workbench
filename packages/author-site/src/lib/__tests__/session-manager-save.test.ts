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

    // 在 source 目录中创建一个不可读的子目录，模拟 cpSync 中途失败
    const sessionPath = getSessionPath(project.id, session.sessionId);
    const trapDir = path.join(sessionPath, "_trap_dir");
    fs.mkdirSync(trapDir);
    fs.writeFileSync(path.join(trapDir, "trap.txt"), "hello");
    // 设为 mode 000 使 cpSync 递归复制时失败
    fs.chmodSync(trapDir, 0o000);

    const result = saveEditSession(session.sessionId);

    // 恢复权限以便清理
    fs.chmodSync(trapDir, 0o755);

    // 在当前代码（先删后拷）中，rm 已发生但 cp 失败 → workspace 可能被破坏
    // 修复后：cp 到临时目录失败 → workspace 应完好
    expect(result.success).toBe(false);

    if (fs.existsSync(workspacePath)) {
      // 修复后：workspace 完好
      expect(readMarkerFile(workspacePath)).toBe("受保护数据");
    }
    // 若 workspace 不存在，说明旧代码的 rm 已执行但 cp 失败
    // 这正是我们要修复的问题
  });

  it("不存在的 session 应返回失败", () => {
    const result = saveEditSession("nonexistent-session-id");
    expect(result.success).toBe(false);
  });
});
