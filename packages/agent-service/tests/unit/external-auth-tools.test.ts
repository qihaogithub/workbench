import { execFile } from "child_process";
import { describe, expect, it, vi } from "vitest";

import { createDingtalkTool } from "../../src/backends/pi-tools/dingtalk-tool";
import { createFigmaMcpTool } from "../../src/backends/pi-tools/figma-mcp-tool";
import {
  parseDwsAccessProbeOutput,
  parseDwsStatusOutput,
} from "../../src/routes/internal-config";
import type { AgentConfig } from "../../src/core/types";

vi.mock("child_process", () => ({
  execFile: vi.fn(),
  spawn: vi.fn(),
}));

const baseConfig: AgentConfig = {
  sessionId: "session-1",
  workingDir: "/tmp/workspace",
};

describe("external auth tools", () => {
  const execFileMock = vi.mocked(execFile);

  beforeEach(() => {
    execFileMock.mockReset();
  });

  it("does not treat successful dws status command as authenticated when authenticated is false", () => {
    expect(parseDwsStatusOutput(JSON.stringify({
      success: true,
      authenticated: false,
      message: "未登录",
    }))).toEqual({ connected: false });
  });

  it("reads authenticated dws status and account label from json output", () => {
    expect(parseDwsStatusOutput(JSON.stringify({
      success: true,
      body: {
        authenticated: true,
        userName: "Ding User",
      },
    }))).toEqual({
      connected: true,
      accountLabel: "Ding User",
    });
  });

  it("treats successful read-only dws document probe as connected", () => {
    expect(parseDwsAccessProbeOutput(JSON.stringify({
      success: true,
      nodes: [{ nodeId: "node-1" }],
    }))).toBe(true);
  });

  it("rejects DingTalk calls without current user authorization", async () => {
    const tool = createDingtalkTool(baseConfig);

    const result = await tool.execute("tool", {
      product: "doc",
      command: ["get", "doc-id"],
    } as any);

    expect(result.isError).toBe(true);
    expect(result.details).toMatchObject({
      kind: "external_auth_required",
      provider: "dingtalk",
      reason: "not_connected",
    });
  });

  it("rejects DingTalk products outside doc, sheet, and wiki", async () => {
    const tool = createDingtalkTool({
      ...baseConfig,
      externalAuth: {
        dingtalk: {
          enabled: true,
          configDir: "/tmp/dws-user-config",
        },
      },
    });

    const result = await tool.execute("tool", {
      product: "contact",
      command: ["list"],
    } as any);

    expect(result.isError).toBe(true);
    expect(result.details).toMatchObject({ error: "product denied" });
  });

  it("asks for confirmation before DingTalk writes and stops when cancelled", async () => {
    const permission = vi.fn().mockResolvedValue(false);
    const tool = createDingtalkTool(
      {
        ...baseConfig,
        externalAuth: {
          dingtalk: {
            enabled: true,
            configDir: "/tmp/dws-user-config",
          },
        },
      },
      permission,
    );

    const result = await tool.execute("tool", {
      product: "sheet",
      command: ["update", "sheet-id", "A1", "value"],
    } as any);

    expect(permission).toHaveBeenCalledWith("tool", expect.objectContaining({
      title: "确认执行钉钉写操作",
      summary: expect.stringContaining("dws sheet update"),
    }));
    expect(result.isError).toBe(true);
    expect(result.details).toMatchObject({ cancelled: true });
  });

  it("returns reauthorization card details when dws reports an expired login", async () => {
    execFileMock.mockImplementation((
      _file,
      _args,
      _options,
      callback,
    ) => {
      const error = new Error("dws auth failed") as Error & {
        stderr?: string;
      };
      error.stderr = "未登录，请先执行 dws auth login";
      callback?.(error, "", error.stderr);
      return null as never;
    });

    const tool = createDingtalkTool({
      ...baseConfig,
      externalAuth: {
        dingtalk: {
          enabled: true,
          configDir: "/tmp/dws-user-config",
        },
      },
    });

    const result = await tool.execute("tool", {
      product: "doc",
      command: ["get", "doc-id"],
    } as any);

    expect(result.isError).toBe(true);
    expect(result.details).toMatchObject({
      kind: "external_auth_required",
      provider: "dingtalk",
      reason: "needs_reauth",
    });
  });

  it("rejects Figma MCP calls without current user authorization", async () => {
    const tool = createFigmaMcpTool(baseConfig);

    const result = await tool.execute("tool", {
      action: "listTools",
    } as any);

    expect(result.isError).toBe(true);
    expect(result.details).toMatchObject({
      kind: "external_auth_required",
      provider: "figma",
      reason: "not_connected",
    });
  });

  it("rejects expired Figma credentials before network access", async () => {
    const tool = createFigmaMcpTool({
      ...baseConfig,
      externalAuth: {
        figma: {
          enabled: true,
          accessToken: "token",
          expiresAt: Date.now() - 1,
        },
      },
    });

    const result = await tool.execute("tool", {
      action: "listTools",
    } as any);

    expect(result.isError).toBe(true);
    expect(result.details).toMatchObject({
      kind: "external_auth_required",
      provider: "figma",
      reason: "expired",
    });
  });

  it("asks for confirmation before Figma write tools and stops when cancelled", async () => {
    const permission = vi.fn().mockResolvedValue(false);
    const tool = createFigmaMcpTool(
      {
        ...baseConfig,
        externalAuth: {
          figma: {
            enabled: true,
            accessToken: "token",
            expiresAt: Date.now() + 60_000,
          },
        },
      },
      permission,
    );

    const result = await tool.execute("tool", {
      action: "callTool",
      toolName: "updateNode",
      args: { nodeId: "1:2" },
    } as any);

    expect(permission).toHaveBeenCalledWith("tool", expect.objectContaining({
      title: "确认执行 Figma 写操作",
      summary: "Figma MCP tool: updateNode",
    }));
    expect(result.isError).toBe(true);
    expect(result.details).toMatchObject({ cancelled: true });
  });
});
