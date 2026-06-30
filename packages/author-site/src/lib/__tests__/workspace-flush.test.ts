import {
  flushWorkspaceBeforeCriticalAction,
  WorkspaceFlushError,
} from "../workspace-flush";

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
});
