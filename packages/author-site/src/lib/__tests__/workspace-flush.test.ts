import {
  ensureCanonicalRevision,
  flushAndSyncProjectWorkspace,
  flushWorkspaceBeforeCriticalAction,
  WorkspaceFlushError,
} from "../workspace-flush";
import {
  advanceWorkspaceBaseIfLatestSessionVersion,
  clearCanonicalSyncProofIfMatches,
  isLiveWorkspace,
  syncActiveWorkspaceToCanonical,
} from "../workspace-manager";
import { renewEditSession } from "../session-manager";

jest.mock("../workspace-manager", () => ({
  isLiveWorkspace: jest.fn(() => true),
  syncActiveWorkspaceToCanonical: jest.fn(() => ({
    success: true,
    workspacePath: "/tmp/project/workspace",
  })),
  advanceWorkspaceBaseIfLatestSessionVersion: jest.fn(() => false),
  clearCanonicalSyncProofIfMatches: jest.fn(() => false),
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

function mockFlushSuccess(
  status: "flushed" | "no_active_room" = "flushed",
  flushedRooms = 1,
  revision?: number,
) {
  return mockJsonResponse(
    {
      success: true,
      data: {
        status,
        flushedRooms,
        ...(revision === undefined ? {} : { revision }),
      },
    },
    { status: 200, ok: true },
  );
}

function mockSnapshotSuccess(revision = 7, rootHash = "root-hash-7") {
  return mockJsonResponse(
    {
      success: true,
      data: {
        state: {
          workspaceId: "live-1",
          projectId: "proj-1",
          revision,
          rootHash,
          resourceHashes: {},
          updatedAt: 123,
        },
        resources: {},
      },
    },
    { status: 200, ok: true },
  );
}

describe("workspace-flush", () => {
  const originalFetch = global.fetch;
  const originalAgentServiceUrl = process.env.AGENT_SERVICE_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(isLiveWorkspace).mockReturnValue(true);
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
          data: { status: "flushed", flushedRooms: 2, revision: 6 },
        },
        { status: 200, ok: true },
      ),
    );

    const result = await flushWorkspaceBeforeCriticalAction({
      projectId: "proj 1",
      workspaceId: "workspace/1",
      sessionId: "session 1",
    });

    expect(result).toEqual({ status: "flushed", flushedRooms: 2, revision: 6 });
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
      code: "SESSION_EXPIRED",
      status: 403,
      message: "SESSION_EXPIRED",
    } satisfies Partial<WorkspaceFlushError>);
  });

  it("normalizes collab resource conflicts to workspace stale errors", async () => {
    jest.mocked(global.fetch).mockResolvedValue(
      mockJsonResponse(
        {
          success: false,
          error: { code: "WORKSPACE_RESOURCE_CONFLICT", message: "WORKSPACE_RESOURCE_CONFLICT" },
        },
        { status: 409, ok: false },
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
      code: "WORKSPACE_STALE",
      status: 409,
      message: "WORKSPACE_RESOURCE_CONFLICT",
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
      message: "协同草稿落盘服务不可用，请确认 agent-service 已启动",
    } satisfies Partial<WorkspaceFlushError>);
  });

  it("repairs same-session stale workspace base before retrying project sync", async () => {
    jest
      .mocked(global.fetch)
      .mockResolvedValueOnce(mockFlushSuccess("no_active_room", 0, 12))
      .mockResolvedValueOnce(mockSnapshotSuccess(12, "root-hash-12"))
      .mockResolvedValueOnce(mockSnapshotSuccess(12, "root-hash-12"));
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
      revision: 12,
      workspacePath: "/tmp/project/workspace",
      canonicalRevision: 12,
      canonicalRootHash: "root-hash-12",
    });
    expect(advanceWorkspaceBaseIfLatestSessionVersion).toHaveBeenCalledWith(
      "proj-1",
      "live-1",
      "session-1",
    );
    expect(syncActiveWorkspaceToCanonical).toHaveBeenCalledTimes(2);
    expect(syncActiveWorkspaceToCanonical).toHaveBeenNthCalledWith(
      1,
      "proj-1",
      "live-1",
      { revision: 12, rootHash: "root-hash-12" },
    );
    expect(syncActiveWorkspaceToCanonical).toHaveBeenNthCalledWith(
      2,
      "proj-1",
      "live-1",
      { revision: 12, rootHash: "root-hash-12" },
    );
  });

  it("passes Authority revision and root hash into canonical sync", async () => {
    jest
      .mocked(global.fetch)
      .mockResolvedValueOnce(mockFlushSuccess("flushed", 1, 9))
      .mockResolvedValueOnce(mockSnapshotSuccess(9, "root-hash-9"))
      .mockResolvedValueOnce(mockSnapshotSuccess(9, "root-hash-9"));

    const result = await flushAndSyncProjectWorkspace({
      projectId: "proj-1",
      workspaceId: "live-1",
      sessionId: "session-1",
    });

    expect(result).toEqual({
      status: "flushed",
      flushedRooms: 1,
      revision: 9,
      workspacePath: "/tmp/project/workspace",
      canonicalRevision: 9,
      canonicalRootHash: "root-hash-9",
    });
    expect(syncActiveWorkspaceToCanonical).toHaveBeenCalledWith(
      "proj-1",
      "live-1",
      { revision: 9, rootHash: "root-hash-9" },
    );
    expect(clearCanonicalSyncProofIfMatches).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it("blocks critical action and clears stale canonical proof when Authority revision changes during canonical materialization", async () => {
    jest
      .mocked(global.fetch)
      .mockResolvedValueOnce(mockFlushSuccess("flushed", 1, 9))
      .mockResolvedValueOnce(mockSnapshotSuccess(9, "root-hash-9"))
      .mockResolvedValueOnce(mockSnapshotSuccess(10, "root-hash-10"));

    await expect(
      flushAndSyncProjectWorkspace({
        projectId: "proj-1",
        workspaceId: "live-1",
        sessionId: "session-1",
      }),
    ).rejects.toMatchObject({
      name: "WorkspaceFlushError",
      code: "WORKSPACE_STALE",
      status: 409,
      message: "WORKSPACE_CANONICAL_REVISION_CHANGED_DURING_MATERIALIZE",
    } satisfies Partial<WorkspaceFlushError>);
    expect(syncActiveWorkspaceToCanonical).toHaveBeenCalledWith(
      "proj-1",
      "live-1",
      { revision: 9, rootHash: "root-hash-9" },
    );
    expect(clearCanonicalSyncProofIfMatches).toHaveBeenCalledWith(
      "proj-1",
      "live-1",
      { revision: 9, rootHash: "root-hash-9" },
    );
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it("ensureCanonicalRevision rejects a snapshot behind the target revision", async () => {
    jest
      .mocked(global.fetch)
      .mockResolvedValueOnce(mockSnapshotSuccess(8, "root-hash-8"));

    await expect(
      ensureCanonicalRevision(
        {
          projectId: "proj-1",
          workspaceId: "live-1",
          sessionId: "session-1",
        },
        { revision: 9 },
      ),
    ).rejects.toMatchObject({
      name: "WorkspaceFlushError",
      code: "WORKSPACE_STALE",
      status: 409,
      message: "WORKSPACE_CANONICAL_REVISION_BEHIND",
    } satisfies Partial<WorkspaceFlushError>);
    expect(syncActiveWorkspaceToCanonical).not.toHaveBeenCalled();
  });

  it("ensureCanonicalRevision rejects same-revision root hash mismatch", async () => {
    jest
      .mocked(global.fetch)
      .mockResolvedValueOnce(mockSnapshotSuccess(9, "root-hash-new"));

    await expect(
      ensureCanonicalRevision(
        {
          projectId: "proj-1",
          workspaceId: "live-1",
          sessionId: "session-1",
        },
        { revision: 9, rootHash: "root-hash-old" },
      ),
    ).rejects.toMatchObject({
      name: "WorkspaceFlushError",
      code: "WORKSPACE_STALE",
      status: 409,
      message: "WORKSPACE_CANONICAL_ROOT_HASH_MISMATCH",
    } satisfies Partial<WorkspaceFlushError>);
    expect(syncActiveWorkspaceToCanonical).not.toHaveBeenCalled();
  });

  it("blocks canonical sync when Authority detects external drift", async () => {
    jest
      .mocked(global.fetch)
      .mockResolvedValueOnce(
        mockJsonResponse(
          {
            success: true,
            data: { status: "flushed", flushedRooms: 1 },
          },
          { status: 200, ok: true },
        ),
      )
      .mockResolvedValueOnce(
        mockJsonResponse(
          {
            success: false,
            error: {
              code: "WORKSPACE_EXTERNAL_DRIFT",
              message: "WORKSPACE_EXTERNAL_DRIFT",
            },
          },
          { status: 403, ok: false },
        ),
      );

    await expect(
      flushAndSyncProjectWorkspace({
        projectId: "proj-1",
        workspaceId: "live-1",
        sessionId: "session-1",
      }),
    ).rejects.toMatchObject({
      name: "WorkspaceFlushError",
      code: "WORKSPACE_STALE",
      status: 409,
      message: "WORKSPACE_EXTERNAL_DRIFT",
    } satisfies Partial<WorkspaceFlushError>);

    expect(syncActiveWorkspaceToCanonical).not.toHaveBeenCalled();
    expect(clearCanonicalSyncProofIfMatches).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "http://agent.test/api/workspace-authority/projects/proj-1/workspaces/live-1/snapshot?sessionId=session-1",
      { method: "GET" },
    );
  });

  it("does not call Authority snapshot for non-live workspaces", async () => {
    jest.mocked(isLiveWorkspace).mockReturnValue(false);
    jest.mocked(global.fetch).mockResolvedValue(mockFlushSuccess("flushed", 1));

    const result = await flushAndSyncProjectWorkspace({
      projectId: "proj-1",
      workspaceId: "branch-1",
      sessionId: "session-1",
    });

    expect(result).toEqual({
      status: "flushed",
      flushedRooms: 1,
      workspacePath: "/tmp/project/workspace",
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://agent.test/api/collab/projects/proj-1/workspaces/branch-1/flush-all?sessionId=session-1",
      { method: "POST" },
    );
    expect(syncActiveWorkspaceToCanonical).toHaveBeenCalledWith("proj-1", "branch-1");
  });
});
