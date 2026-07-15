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
    expect(result.details).toMatchObject({ error: "WORKSPACE_AUTHORITY_REQUIRED", workspaceId: "ws-1" });
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("拒绝 live Workspace 下执行 node 脚本", async () => {
    const { spawn } = await import("child_process");
    const spawnMock = vi.mocked(spawn);
    const config: AgentConfig = { sessionId: "session-1", workingDir: workspacePath };
    const tool = createBashTool(config);

    const result = await tool.execute("id", { command: "node scripts/check.js" });

    expect(result.isError).toBe(true);
    expect(result.details).toMatchObject({ error: "WORKSPACE_AUTHORITY_REQUIRED", workspaceId: "ws-1" });
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
