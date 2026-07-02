import {
  flushAndSyncProjectWorkspace,
  flushWorkspaceBeforeCriticalAction,
  WorkspaceFlushError,
} from "../workspace-flush";
import {
  advanceWorkspaceBaseIfLatestSessionVersion,
  syncActiveWorkspaceToCanonical,
} from "../workspace-manager";
import { renewEditSession } from "../session-manager";

jest.mock("../workspace-manager", () => ({
  syncActiveWorkspaceToCanonical: jest.fn(() => ({
    success: true,
    workspacePath: "/tmp/project/workspace",
  })),
  advanceWorkspaceBaseIfLatestSessionVersion: jest.fn(() => false),
}));

jest.mock("../session-manager", () => ({
  renewEditSession: jest.fn(() => true),
}));

function mockJsonResponse(value: unknown, init: { status: number; ok: boolean }) {
  return {
    ok: init.ok,
    status: init.status,
    json: jest.fn(async () => value),
  } as unknown as Response;
}

describe("workspace-flush", () => {
  const originalFetch = global.fetch;
  const originalAgentServiceUrl = process.env.AGENT_SERVICE_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AGENT_SERVICE_URL = "http://agent.test/";
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalAgentServiceUrl === undefined) delete process.env.AGENT_SERVICE_URL;
    else process.env.AGENT_SERVICE_URL = originalAgentServiceUrl;
  });

  it("skips when session has no workspace", async () => {
    const result = await flushWorkspaceBeforeCriticalAction({
      projectId: "proj-1",
      workspaceId: null,
      sessionId: "session-1",
    });

    expect(result).toEqual({ status: "skipped", flushedRooms: 0 });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(renewEditSession).not.toHaveBeenCalled();
  });

  it("flushes workspace through agent-service", async () => {
    jest.mocked(global.fetch).mockResolvedValue(
      mockJsonResponse(
        {
          success: true,
          data: { status: "flushed", flushedRooms: 2 },
        },
        { status: 200, ok: true },
      ),
    );

    const result = await flushWorkspaceBeforeCriticalAction({
      projectId: "proj 1",
      workspaceId: "workspace/1",
      sessionId: "session 1",
    });

    expect(result).toEqual({ status: "flushed", flushedRooms: 2 });
    expect(renewEditSession).toHaveBeenCalledWith("session 1");
    expect(global.fetch).toHaveBeenCalledWith(
      "http://agent.test/api/collab/projects/proj%201/workspaces/workspace%2F1/flush-all?sessionId=session+1",
      { method: "POST" },
    );
  });

  it("throws a typed error when agent-service rejects flush", async () => {
    jest.mocked(global.fetch).mockResolvedValue(
      mockJsonResponse(
        {
          success: false,
          error: { code: "COLLAB_FLUSH_FAILED", message: "SESSION_EXPIRED" },
        },
        { status: 403, ok: false },
      ),
    );

    await expect(
      flushWorkspaceBeforeCriticalAction({
        projectId: "proj-1",
        workspaceId: "ws-1",
        sessionId: "session-1",
      }),
    ).rejects.toMatchObject({
      name: "WorkspaceFlushError",
      code: "COLLAB_FLUSH_FAILED",
      status: 403,
      message: "SESSION_EXPIRED",
    } satisfies Partial<WorkspaceFlushError>);
  });

  it("throws a typed error when agent-service is unreachable", async () => {
    jest.mocked(global.fetch).mockRejectedValue(new Error("connect ECONNREFUSED"));

    await expect(
      flushWorkspaceBeforeCriticalAction({
        projectId: "proj-1",
        workspaceId: "ws-1",
        sessionId: "session-1",
      }),
    ).rejects.toMatchObject({
      name: "WorkspaceFlushError",
      code: "COLLAB_FLUSH_FAILED",
      status: 502,
      message: "connect ECONNREFUSED",
    } satisfies Partial<WorkspaceFlushError>);
  });

  it("repairs same-session stale workspace base before retrying project sync", async () => {
    jest.mocked(global.fetch).mockResolvedValue(
      mockJsonResponse(
        {
          success: true,
          data: { status: "no_active_room", flushedRooms: 0 },
        },
        { status: 200, ok: true },
      ),
    );
    jest
      .mocked(syncActiveWorkspaceToCanonical)
      .mockReturnValueOnce({
        success: false,
        code: "WORKSPACE_STALE",
        error: "当前工作区已过期，请刷新项目后重试",
      })
      .mockReturnValueOnce({
        success: true,
        workspacePath: "/tmp/project/workspace",
      });
    jest
      .mocked(advanceWorkspaceBaseIfLatestSessionVersion)
      .mockReturnValueOnce(true);

    const result = await flushAndSyncProjectWorkspace({
      projectId: "proj-1",
      workspaceId: "live-1",
      sessionId: "session-1",
    });

    expect(result).toEqual({
      status: "no_active_room",
      flushedRooms: 0,
      workspacePath: "/tmp/project/workspace",
    });
    expect(advanceWorkspaceBaseIfLatestSessionVersion).toHaveBeenCalledWith(
      "proj-1",
      "live-1",
      "session-1",
    );
    expect(syncActiveWorkspaceToCanonical).toHaveBeenCalledTimes(2);
  });
});
