class TestResponse {
  status: number;
  body: BodyInit | null;
  headers: { get: (name: string) => string | null };
  private readonly buffer: Buffer;

  constructor(body?: BodyInit | null, init?: ResponseInit) {
    this.status = init?.status ?? 200;
    this.body = body ?? null;
    this.headers = {
      get: () => null,
    };
    if (body instanceof Uint8Array) {
      this.buffer = Buffer.from(body);
    } else if (typeof body === "string") {
      this.buffer = Buffer.from(body);
    } else {
      this.buffer = Buffer.alloc(0);
    }
  }

  async json(): Promise<unknown> {
    return JSON.parse(this.buffer.toString("utf-8"));
  }

  static json(body: unknown, init?: ResponseInit): TestResponse {
    return new TestResponse(JSON.stringify(body), init);
  }
}

function createJsonRequest(body: unknown): Request {
  return {
    json: async () => body,
    url: "http://localhost/api/sessions",
  } as unknown as Request;
}

describe("sessions route external auth reuse", () => {
  const originalResponse = global.Response;
  const externalAuthConfig = {
    figma: {
      enabled: true,
      accessToken: "figma-access",
      expiresAt: Date.now() + 60_000,
    },
    dingtalk: {
      enabled: true,
      configDir: "/tmp/dws-user-config",
    },
  };

  beforeEach(() => {
    jest.resetModules();
    global.Response = TestResponse as unknown as typeof Response;

    jest.doMock("@/lib/auth/jwt", () => ({
      getAuthCookie: jest.fn(() => "token"),
      verifyToken: jest.fn(async () => ({
        userId: "user-1",
        username: "测试用户",
      })),
    }));
    jest.doMock("@/lib/fs-utils", () => ({
      createApiSuccess: jest.fn((data) => ({ success: true, data })),
      createApiError: jest.fn((code, message) => ({
        success: false,
        error: { code, message },
      })),
      getSessionPath: jest.fn(() => "/tmp/session"),
      getSessionMeta: jest.fn(() => ({
        sessionId: "session-existing",
        workspaceId: "workspace-existing",
      })),
      findWorkspacePath: jest.fn(() => "/tmp/workspace"),
      getWorkspaceMeta: jest.fn(() => ({
        workspaceId: "workspace-existing",
        demoId: "project-1",
        projectId: "project-1",
        scope: "live",
        status: "active",
        createdAt: 1,
        updatedAt: 2,
      })),
      getWorkspaceMultiDemoFiles: jest.fn(() => ({
        demos: {
          page_1: { code: "code", schema: "schema" },
        },
      })),
      getWorkspaceFiles: jest.fn(() => ({ code: "code", schema: "schema" })),
    }));
    jest.doMock("@/lib/session-manager", () => ({
      archiveActiveSession: jest.fn(),
      createEditSession: jest.fn(async () => ({
        sessionId: "session-new",
        workspaceId: "workspace-new",
        workspaceScope: "live",
        isSharedWorkspace: true,
        workspacePath: "/tmp/workspace",
        code: "",
        schema: "",
        tempWorkspace: "/tmp/workspace",
        demos: { demos: {}, projectConfigSchema: undefined },
      })),
      enforceSessionLimit: jest.fn(),
      ensureSessionUsesProjectActiveWorkspace: jest.fn(),
      findActiveSession: jest.fn(() => null),
    }));
    jest.doMock("@/lib/agent-providers", () => ({
      pushSessionExternalAuthToAgent: jest.fn(async () => ({
        ok: true,
        message: "ok",
      })),
      pushSessionModelConfigToAgent: jest.fn(async () => ({
        ok: true,
        message: "ok",
      })),
    }));
    jest.doMock("@/lib/external-auth", () => ({
      readExternalAuthSessionConfigWithRefresh: jest.fn(async () =>
        externalAuthConfig
      ),
    }));
    jest.doMock("@/lib/model-config", () => ({
      getModelConfig: jest.fn(async () => ({ backendProviders: [] })),
    }));
    jest.doMock("@/lib/user-model-config", () => ({
      readUserBackendProvidersConfig: jest.fn(() => null),
    }));
    jest.doMock("@/lib/agent-client", () => ({
      getAgentClient: jest.fn(() => ({
        listSessions: jest.fn(),
      })),
    }));
  });

  afterEach(() => {
    jest.resetModules();
    jest.dontMock("@/lib/auth/jwt");
    jest.dontMock("@/lib/fs-utils");
    jest.dontMock("@/lib/session-manager");
    jest.dontMock("@/lib/agent-providers");
    jest.dontMock("@/lib/external-auth");
    jest.dontMock("@/lib/model-config");
    jest.dontMock("@/lib/user-model-config");
    jest.dontMock("@/lib/agent-client");
    global.Response = originalResponse;
  });

  it("新建会话时推送已保存的外部授权配置，避免重新授权", async () => {
    const { POST } = await import("./route");
    const agentProviders = await import("@/lib/agent-providers");
    const externalAuth = await import("@/lib/external-auth");

    const response = await POST(createJsonRequest({ demoId: "project-1" }) as never);

    expect(response.status).toBe(201);
    expect(externalAuth.readExternalAuthSessionConfigWithRefresh).toHaveBeenCalledWith(
      "user-1",
    );
    expect(agentProviders.pushSessionExternalAuthToAgent).toHaveBeenCalledWith(
      "session-new",
      externalAuthConfig,
    );
  });

  it("复用活跃会话时也重新推送已保存授权配置", async () => {
    jest.doMock("@/lib/session-manager", () => ({
      archiveActiveSession: jest.fn(),
      createEditSession: jest.fn(),
      enforceSessionLimit: jest.fn(),
      ensureSessionUsesProjectActiveWorkspace: jest.fn(),
      findActiveSession: jest.fn(() => "session-existing"),
    }));
    const { POST } = await import("./route");
    const agentProviders = await import("@/lib/agent-providers");

    const response = await POST(createJsonRequest({ demoId: "project-1" }) as never);

    expect(response.status).toBe(200);
    expect(agentProviders.pushSessionExternalAuthToAgent).toHaveBeenCalledWith(
      "session-existing",
      externalAuthConfig,
    );
  });

  it("复用活跃会话前会确保绑定项目级共享 workspace", async () => {
    jest.doMock("@/lib/session-manager", () => ({
      archiveActiveSession: jest.fn(),
      createEditSession: jest.fn(),
      enforceSessionLimit: jest.fn(),
      ensureSessionUsesProjectActiveWorkspace: jest.fn(),
      findActiveSession: jest.fn(() => "session-existing"),
    }));
    const { POST } = await import("./route");
    const sessionManager = await import("@/lib/session-manager");

    const response = await POST(createJsonRequest({ demoId: "project-1" }) as never);

    expect(response.status).toBe(200);
    expect(sessionManager.ensureSessionUsesProjectActiveWorkspace).toHaveBeenCalledWith(
      "user-1",
      "project-1",
      "session-existing",
    );
  });

  it("没有活跃会话时创建绑定项目级共享 workspace 的新 Session", async () => {
    const { POST } = await import("./route");
    const sessionManager = await import("@/lib/session-manager");

    const response = await POST(createJsonRequest({ demoId: "project-1" }) as never);

    expect(response.status).toBe(201);
    expect(sessionManager.createEditSession).toHaveBeenCalledWith(
      "user-1",
      "project-1",
      undefined,
    );
  });

  it("显式 forceNew 只归档当前对话，不创建用户私有 workspace", async () => {
    const { POST } = await import("./route");
    const sessionManager = await import("@/lib/session-manager");

    const response = await POST(
      createJsonRequest({ demoId: "project-1", forceNew: true }) as never,
    );

    expect(response.status).toBe(201);
    expect(sessionManager.archiveActiveSession).toHaveBeenCalledWith(
      "user-1",
      "project-1",
    );
    expect(sessionManager.createEditSession).toHaveBeenCalledWith(
      "user-1",
      "project-1",
      undefined,
    );
  });
});

export {};
