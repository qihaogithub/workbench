import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createBashTool } from "../../src/backends/pi-tools/bash-tool";
import type { AgentConfig } from "../../core/types";

vi.mock("child_process", () => ({
  spawn: vi.fn(),
}));

let tempDir: string;
let workspacePath: string;

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf-8");
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bash-live-workspace-"));
  workspacePath = path.join(tempDir, "data", "workspaces", "projects", "proj-1", "ws-1");
  fs.mkdirSync(workspacePath, { recursive: true });
  writeJson(path.join(workspacePath, ".workspace.json"), {
    workspaceId: "ws-1",
    projectId: "proj-1",
    scope: "live",
    status: "active",
  });
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

/**
 * Create a mock ChildProcess that emits stdout data and close event asynchronously.
 */
function createMockChildProcess(stdout: string, exitCode: number = 0): {
  child: EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; killed: boolean; kill: ReturnType<typeof vi.fn> };
} {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    killed: boolean;
    kill: ReturnType<typeof vi.fn>;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.killed = false;
  child.kill = vi.fn(() => {
    child.killed = true;
  });

  setImmediate(() => {
    if (stdout) {
      child.stdout.emit("data", Buffer.from(stdout));
    }
    child.emit("close", exitCode, null);
  });

  return { child };
}

describe("createBashTool live Workspace guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("拒绝 live Workspace 下通过 echo 重定向写入", async () => {
    const { spawn } = await import("child_process");
    const spawnMock = vi.mocked(spawn);
    const config: AgentConfig = { sessionId: "session-1", workingDir: workspacePath };
    const tool = createBashTool(config);

    const result = await tool.execute("id", { command: "echo changed > workspace-tree.json" });

    expect(result.isError).toBe(true);
    expect(result.details).toMatchObject({
      error: "WORKSPACE_AUTHORITY_REQUIRED",
      reason: "shell_syntax_blocked",
      workspaceId: "ws-1",
    });
    expect(result.content[0].text).toContain("one simple read-only command");
    expect(result.content[0].text).toContain("without |");
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("拒绝 live Workspace 下执行 node 脚本", async () => {
    const { spawn } = await import("child_process");
    const spawnMock = vi.mocked(spawn);
    const config: AgentConfig = { sessionId: "session-1", workingDir: workspacePath };
    const tool = createBashTool(config);

    const result = await tool.execute("id", { command: "node scripts/check.js" });

    expect(result.isError).toBe(true);
    expect(result.details).toMatchObject({
      error: "WORKSPACE_AUTHORITY_REQUIRED",
      reason: "live_runtime_blocked",
      workspaceId: "ws-1",
    });
    expect(result.content[0].text).toContain("cannot run node, npm, or npx");
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("对 npm 命令返回相同的 live runtime 指引", async () => {
    const config: AgentConfig = { sessionId: "session-1", workingDir: workspacePath };
    const tool = createBashTool(config);

    const result = await tool.execute("id", { command: "npm test" });

    expect(result.isError).toBe(true);
    expect(result.details).toMatchObject({
      error: "WORKSPACE_AUTHORITY_REQUIRED",
      reason: "live_runtime_blocked",
    });
    expect(result.content[0].text).toContain("cannot run node, npm, or npx");
  });

  it("解释只读管道被拒绝的具体原因并给出单命令替代", async () => {
    const { spawn } = await import("child_process");
    const spawnMock = vi.mocked(spawn);
    const config: AgentConfig = { sessionId: "session-1", workingDir: workspacePath };
    const tool = createBashTool(config);

    const result = await tool.execute("id", { command: "grep -rn visibleWhen demos | head -50" });

    expect(result.isError).toBe(true);
    expect(result.details).toMatchObject({
      error: "WORKSPACE_AUTHORITY_REQUIRED",
      reason: "shell_syntax_blocked",
    });
    expect(result.content[0].text).toContain("Pipes");
    expect(result.content[0].text).toContain("grep/head/readFile");
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("允许 live Workspace 下执行简单只读命令", async () => {
    const { spawn } = await import("child_process");
    const spawnMock = vi.mocked(spawn);
    spawnMock.mockImplementation(() => {
      return createMockChildProcess("ok\n", 0).child;
    });
    const config: AgentConfig = { sessionId: "session-1", workingDir: workspacePath };
    const tool = createBashTool(config);

    const result = await tool.execute("id", { command: "ls -la" });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toBe("ok\n");
    expect(spawnMock).toHaveBeenCalled();
  });
});
