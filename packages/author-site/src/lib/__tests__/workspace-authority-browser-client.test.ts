import {
  acknowledgeWorkspaceProjectionFromBrowser,
  readWorkspaceAuthorityEventsFromBrowser,
  readWorkspaceAuthorityResourceFromBrowser,
} from "../workspace-authority-browser-client";

describe("workspace authority browser client", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("只访问 author-site 同源代理，不暴露 agent-service 地址", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: [] }),
    })) as unknown as typeof fetch;

    await readWorkspaceAuthorityEventsFromBrowser({
      projectId: "project-1", workspaceId: "live-1", sessionId: "session-1", afterRevision: 4,
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/workspace-authority/project-1/live-1/events?sessionId=session-1&afterRevision=4",
      { method: "GET" },
    );
  });

  it("资源读取保持路径分段编码，projection ack 通过同源 POST", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { acknowledged: true } }),
    })) as unknown as typeof fetch;

    await readWorkspaceAuthorityResourceFromBrowser({
      projectId: "project-1", workspaceId: "live-1", sessionId: "session-1", path: "knowledge/说明 文档.md",
    });
    await acknowledgeWorkspaceProjectionFromBrowser({
      projectId: "project-1", workspaceId: "live-1", sessionId: "session-1", revision: 4,
      clientId: "preview-1", surface: "active-preview", status: "applied", acknowledgedAt: 10,
    });

    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      "/api/workspace-authority/project-1/live-1/resources/knowledge/%E8%AF%B4%E6%98%8E%20%E6%96%87%E6%A1%A3.md?sessionId=session-1",
      { method: "GET" },
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "/api/workspace-authority/project-1/live-1/projection-ack",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
