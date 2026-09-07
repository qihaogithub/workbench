import { AgentClient, AgentClientRequestError } from "@workbench/agent-client";

describe("AgentClient.uploadAttachment", () => {
  const file = new File(["hello"], "notes.txt", { type: "text/plain" });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("返回成功的附件记录", async () => {
    const response = {
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        success: true,
        data: {
          id: "attachment-1",
          name: "notes.txt",
          mimeType: "text/plain",
          size: 5,
          textExtracted: true,
        },
      }),
    } as unknown as Response;
    jest.spyOn(global, "fetch").mockResolvedValue(response);

    await expect(
      new AgentClient({ baseUrl: "http://localhost:4201" }).uploadAttachment(
        "session-1",
        "project-1",
        file,
      ),
    ).resolves.toMatchObject({ success: true, data: { id: "attachment-1" } });

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:4201/api/agent/session-1/attachments?projectId=project-1",
      expect.objectContaining({ method: "POST", body: expect.any(FormData) }),
    );
  });

  it("保留服务端非 2xx 的业务错误，便于 UI 展示校验原因", async () => {
    const response = {
      ok: false,
      status: 400,
      json: jest.fn().mockResolvedValue({
        success: false,
        error: {
          code: "INVALID_FILE_TYPE",
          message: "不支持的文件格式",
        },
      }),
    } as unknown as Response;
    jest.spyOn(global, "fetch").mockResolvedValue(response);

    await expect(
      new AgentClient({ baseUrl: "http://localhost:4201" }).uploadAttachment(
        "session-1",
        "project-1",
        file,
      ),
    ).rejects.toMatchObject<Partial<AgentClientRequestError>>({
      kind: "server",
      status: 400,
      code: "INVALID_FILE_TYPE",
      message: "不支持的文件格式",
    });
  });

  it("将 5xx 附件上传响应标记为可重试的 HTTP 错误", async () => {
    const response = {
      ok: false,
      status: 502,
      json: jest.fn().mockResolvedValue({
        success: false,
        error: {
          code: "ATTACHMENT_UPLOAD_FAILED",
          message: "文件上传失败",
        },
      }),
    } as unknown as Response;
    jest.spyOn(global, "fetch").mockResolvedValue(response);

    await expect(
      new AgentClient({ baseUrl: "http://localhost:4201" }).uploadAttachment(
        "session-1",
        "project-1",
        file,
      ),
    ).rejects.toMatchObject<Partial<AgentClientRequestError>>({
      kind: "http",
      status: 502,
      code: "ATTACHMENT_UPLOAD_FAILED",
    });
  });

  it("将网络/CORS 失败标记为可重试的网络错误", async () => {
    jest.spyOn(global, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(
      new AgentClient({ baseUrl: "http://localhost:4201" }).uploadAttachment(
        "session-1",
        "project-1",
        file,
      ),
    ).rejects.toMatchObject<Partial<AgentClientRequestError>>({
      kind: "network",
      message: "附件上传请求无法连接 AI 服务",
    });
  });
});
