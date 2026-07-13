import {
  commitWorkspaceMutation,
  createTextWorkspaceMutation,
  stageWorkspaceBinary,
  WorkspaceAuthorityClientError,
} from "../workspace-authority-client";

describe("workspace authority client", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("只在 Authority 返回 durable receipt 后成功", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { committed: true, revision: 2 } }),
    })) as unknown as typeof fetch;
    const request = createTextWorkspaceMutation({
      projectId: "project-1", workspaceId: "workspace-1", sessionId: "session-1",
      path: "demos/home/index.tsx", content: "after", previousContent: "before", reason: "test",
    });

    await expect(commitWorkspaceMutation(request)).resolves.toMatchObject({ committed: true, revision: 2 });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/workspace-authority/projects/project-1/workspaces/workspace-1/mutate"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("EXTERNAL_DRIFT 时自动 reconcile adopt 并重试一次", async () => {
    const driftResponse = {
      ok: false,
      status: 409,
      json: async () => ({ success: false, error: { code: "WORKSPACE_EXTERNAL_DRIFT", message: "drift" } }),
    };
    const reconcileResponse = {
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { revision: 7 } }),
    };
    const retryResponse = {
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { committed: true, revision: 8 } }),
    };
    global.fetch = jest.fn()
      .mockResolvedValueOnce(driftResponse)
      .mockResolvedValueOnce(reconcileResponse)
      .mockResolvedValueOnce(retryResponse) as unknown as typeof fetch;

    const request = createTextWorkspaceMutation({
      projectId: "project-1", workspaceId: "workspace-1", sessionId: "session-1",
      path: "demos/home/index.tsx", content: "after", previousContent: "before", reason: "test",
    });

    await expect(commitWorkspaceMutation(request)).resolves.toMatchObject({ committed: true, revision: 8 });
    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(global.fetch).toHaveBeenNthCalledWith(2,
      expect.stringContaining("/reconcile/adopt?sessionId=session-1"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("EXTERNAL_DRIFT 重试后仍失败则抛出重试错误", async () => {
    const driftResponse = {
      ok: false,
      status: 409,
      json: async () => ({ success: false, error: { code: "WORKSPACE_EXTERNAL_DRIFT", message: "drift" } }),
    };
    const reconcileResponse = {
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { revision: 7 } }),
    };
    const conflictResponse = {
      ok: false,
      status: 409,
      json: async () => ({ success: false, error: { code: "WORKSPACE_RESOURCE_CONFLICT", message: "conflict" } }),
    };
    global.fetch = jest.fn()
      .mockResolvedValueOnce(driftResponse)
      .mockResolvedValueOnce(reconcileResponse)
      .mockResolvedValueOnce(conflictResponse) as unknown as typeof fetch;

    const request = createTextWorkspaceMutation({
      projectId: "project-1", workspaceId: "workspace-1", sessionId: "session-1",
      path: "demos/home/index.tsx", content: "after", previousContent: "before", reason: "test",
    });

    await expect(commitWorkspaceMutation(request)).rejects.toMatchObject({
      code: "WORKSPACE_RESOURCE_CONFLICT",
    });
  });

  it("reconcile 本身失败则抛出 reconcile 错误", async () => {
    const driftResponse = {
      ok: false,
      status: 409,
      json: async () => ({ success: false, error: { code: "WORKSPACE_EXTERNAL_DRIFT", message: "drift" } }),
    };
    const reconcileFailResponse = {
      ok: false,
      status: 503,
      json: async () => ({ success: false, error: { code: "WORKSPACE_AUTHORITY_NOT_READY", message: "not ready" } }),
    };
    global.fetch = jest.fn()
      .mockResolvedValueOnce(driftResponse)
      .mockResolvedValueOnce(reconcileFailResponse) as unknown as typeof fetch;

    const request = createTextWorkspaceMutation({
      projectId: "project-1", workspaceId: "workspace-1", sessionId: "session-1",
      path: "demos/home/index.tsx", content: "after", previousContent: "before", reason: "test",
    });

    await expect(commitWorkspaceMutation(request)).rejects.toMatchObject({
      code: "WORKSPACE_AUTHORITY_NOT_READY",
    });
  });

  it("Authority 不可用时 fail closed，不提供本地写入回退", async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({ success: false, error: { code: "WORKSPACE_AUTHORITY_NOT_READY", message: "not ready" } }),
    })) as unknown as typeof fetch;
    const request = createTextWorkspaceMutation({
      projectId: "project-1", workspaceId: "workspace-1", sessionId: "session-1",
      path: "demos/home/index.tsx", content: "after", previousContent: "before", reason: "test",
    });

    await expect(commitWorkspaceMutation(request)).rejects.toMatchObject({
      code: "WORKSPACE_AUTHORITY_NOT_READY",
      status: 503,
    } satisfies Partial<WorkspaceAuthorityClientError>);
  });

  it("二进制内容先上传 Authority staging，mutation 不携带 bytes", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { stagingId: "stage-1", hash: "hash", size: 3 } }),
    })) as unknown as typeof fetch;

    await expect(stageWorkspaceBinary({
      projectId: "project-1", workspaceId: "workspace-1", sessionId: "session-1", content: Buffer.from([1, 2, 3]),
    })).resolves.toEqual({ stagingId: "stage-1", hash: "hash", size: 3 });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/staging?sessionId=session-1"),
      expect.objectContaining({ method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: expect.any(Uint8Array) }),
    );
  });
});
