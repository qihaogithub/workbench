import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createDelegateTaskTool,
  type SubagentRunner,
} from "../../src/backends/pi-tools/subagent-tool";
import type { AgentConfig } from "../../src/core/types";

let tempDir: string;
let workspacePath: string;

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf-8");
}

function makeRunner(): SubagentRunner {
  return vi.fn(async () => ({
    success: true,
    content: "ok",
    durationMs: 1,
  }));
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "subagent-live-workspace-"));
  workspacePath = path.join(
    tempDir,
    "data",
    "workspaces",
    "projects",
    "proj-1",
    "ws-1",
  );
  fs.mkdirSync(workspacePath, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("createDelegateTaskTool live Workspace 受管工具", () => {
  it("live Workspace 下子 Agent 使用 Authority 受管工具委派任务", async () => {
    writeJson(path.join(workspacePath, ".workspace.json"), {
      workspaceId: "ws-1",
      projectId: "proj-1",
      scope: "live",
      status: "active",
    });
    const runner = makeRunner();
    const config: AgentConfig = {
      sessionId: "session-1",
      workingDir: workspacePath,
    };
    const tool = createDelegateTaskTool(runner, config);

    const result = await tool.execute("id", { task: "修改页面文件" });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toBe("ok");
    expect(runner).toHaveBeenCalledWith(
      { task: "修改页面文件", context: undefined },
      undefined,
    );
  });

  it("允许 branch Workspace 下委派子 Agent", async () => {
    writeJson(path.join(workspacePath, ".workspace.json"), {
      workspaceId: "ws-1",
      projectId: "proj-1",
      scope: "branch",
      status: "active",
    });
    const runner = makeRunner();
    const config: AgentConfig = {
      sessionId: "session-1",
      workingDir: workspacePath,
    };
    const tool = createDelegateTaskTool(runner, config);

    const result = await tool.execute("id", { task: "只在 branch 工作区调查" });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toBe("ok");
    expect(runner).toHaveBeenCalledWith(
      { task: "只在 branch 工作区调查", context: undefined },
      undefined,
    );
  });
});
