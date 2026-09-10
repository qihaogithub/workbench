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

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    await Promise.resolve();
  }
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
  const globalBackendProvidersConfig = {
    providers: [
      {
        id: "admin",
        name: "Admin",
        baseURL: "https://admin.example.com/v1",
        apiKey: "sk-admin",
        models: ["admin-model"],
        defaultModel: "admin-model",
        enabled: true,
      },
    ],
    activeProviderId: "admin",
    activeModelId: "admin/admin-model",
  };

  beforeEach(() => {
    jest.resetModules();
    global.Response = TestResponse as unknown as typeof Response;

    jest.doMock("@/lib/auth/jwt", () => ({
      getAuthCookie: jest.fn(async () => "token"),
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
      readProjectMeta: jest.fn(() => ({
        id: "project-1",
        name: "测试项目",
        thumbnail: "/cover.png",
        authoringPreferences: { sketchEditorEngine: "native" },
      })),
      listWorkspaceDemoPages: jest.fn(() => [
        { id: "page_1", name: "页面 1", order: 0, parentId: null },
        { id: "page_2", name: "页面 2", order: 1, parentId: null },
      ]),
      readFoldersMeta: jest.fn(() => []),
      getProjectConfigSchema: jest.fn(() => '{"type":"object"}'),
      getProjectConfigValues: jest.fn(() => ({ theme: "dark" })),
    }));
    jest.doMock("@/lib/session-manager", () => ({
      archiveActiveSession: jest.fn(),
      bindEditSessionRole: jest.fn((sessionId, userId, userRole) => ({
        sessionId,
        userId,
        userRole,
        projectId: "project-1",
        expiresAt: Date.now() + 60_000,
      })),
      createEditSession: jest.fn(async () => ({
        sessionId: "session-new",
        workspaceId: "workspace-new",
        workspaceScope: "live",
        isSharedWorkspace: true,
        workspacePath: "/tmp/workspace",
        tempWorkspace: "/tmp/workspace",
      })),
      enforceSessionLimit: jest.fn(),
      ensureSessionUsesProjectActiveWorkspace: jest.fn(),
      findActiveSession: jest.fn(() => null),
      touchSessionActivity: jest.fn(),
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
      pushSessionAuthorizationToAgent: jest.fn(async () => ({
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
      getModelConfig: jest.fn(async () => ({
        backendProviders: globalBackendProvidersConfig,
        multimodalModels: ["admin/vision-model"],
      })),
    }));
    jest.doMock("@/lib/user-model-config", () => ({
      readUserBackendProvidersConfig: jest.fn((_userId, fallback) => fallback),
    }));
    jest.doMock("@/lib/agent-client", () => ({
      getAgentClient: jest.fn(() => ({
        listSessions: jest.fn(),
      })),
    }));
    jest.doMock("@/lib/conversation", () => ({
      getConversationService: jest.fn(() => ({
        ensureConversation: jest.fn(),
      })),
    }));
    jest.doMock("@/lib/user", () => ({
      findUserById: jest.fn(() => ({ id: "user-1", role: "editor" })),
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
    jest.dontMock("@/lib/conversation");
    jest.dontMock("@/lib/user");
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

  it("新建会话时推送全局模型配置给 agent-service session", async () => {
    const { POST } = await import("./route");
    const agentProviders = await import("@/lib/agent-providers");
    const userModelConfig = await import("@/lib/user-model-config");

    const response = await POST(createJsonRequest({ demoId: "project-1" }) as never);

    expect(response.status).toBe(201);
    expect(userModelConfig.readUserBackendProvidersConfig).toHaveBeenCalledWith(
      "user-1",
      globalBackendProvidersConfig,
    );
    expect(agentProviders.pushSessionModelConfigToAgent).toHaveBeenCalledWith(
      "session-new",
      globalBackendProvidersConfig,
    );
  });

  it("复用活跃会话时也重新推送已保存授权配置", async () => {
    jest.doMock("@/lib/session-manager", () => ({
      archiveActiveSession: jest.fn(),
      bindEditSessionRole: jest.fn((sessionId, userId, userRole) => ({
        sessionId,
        userId,
        userRole,
        projectId: "project-1",
        expiresAt: Date.now() + 60_000,
      })),
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

  it("复用活跃会话时也重新推送全局模型配置", async () => {
    jest.doMock("@/lib/session-manager", () => ({
      archiveActiveSession: jest.fn(),
      bindEditSessionRole: jest.fn((sessionId, userId, userRole) => ({
        sessionId,
        userId,
        userRole,
        projectId: "project-1",
        expiresAt: Date.now() + 60_000,
      })),
      createEditSession: jest.fn(),
      enforceSessionLimit: jest.fn(),
      ensureSessionUsesProjectActiveWorkspace: jest.fn(),
      findActiveSession: jest.fn(() => "session-existing"),
    }));
    const { POST } = await import("./route");
    const agentProviders = await import("@/lib/agent-providers");

    const response = await POST(createJsonRequest({ demoId: "project-1" }) as never);

    expect(response.status).toBe(200);
    expect(agentProviders.pushSessionModelConfigToAgent).toHaveBeenCalledWith(
      "session-existing",
      globalBackendProvidersConfig,
    );
  });

  it.each([
    { label: "新建会话", reuseSession: false, expectedStatus: 201 },
    { label: "复用会话", reuseSession: true, expectedStatus: 200 },
  ])(
    "$label 时并发启动模型与授权配置推送，并在两者完成前保持 POST pending",
    async ({ reuseSession, expectedStatus }) => {
      const modelPush = createDeferred<{ ok: true; message: string }>();
      const externalAuthPush = createDeferred<{ ok: true; message: string }>();
      const pushSessionModelConfigToAgent = jest.fn(() => modelPush.promise);
      const pushSessionExternalAuthToAgent = jest.fn(
        () => externalAuthPush.promise,
      );

      jest.doMock("@/lib/agent-providers", () => ({
        pushSessionModelConfigToAgent,
        pushSessionExternalAuthToAgent,
        pushSessionAuthorizationToAgent: jest.fn(async () => ({
          ok: true,
          message: "ok",
        })),
      }));
      if (reuseSession) {
        jest.doMock("@/lib/session-manager", () => ({
          archiveActiveSession: jest.fn(),
          bindEditSessionRole: jest.fn((sessionId, userId, userRole) => ({
            sessionId,
            userId,
            userRole,
            projectId: "project-1",
            expiresAt: Date.now() + 60_000,
          })),
          createEditSession: jest.fn(),
          enforceSessionLimit: jest.fn(),
          ensureSessionUsesProjectActiveWorkspace: jest.fn(),
          findActiveSession: jest.fn(() => "session-existing"),
        }));
      }

      const { POST } = await import("./route");
      let responseSettled = false;
      const responsePromise = POST(
        createJsonRequest({ demoId: "project-1" }) as never,
      ).then((response) => {
        responseSettled = true;
        return response;
      });

      await flushMicrotasks();

      expect(pushSessionModelConfigToAgent).toHaveBeenCalledTimes(1);
      expect(pushSessionExternalAuthToAgent).toHaveBeenCalledTimes(1);
      expect(responseSettled).toBe(false);

      modelPush.resolve({ ok: true, message: "ok" });
      await flushMicrotasks();
      expect(responseSettled).toBe(false);

      externalAuthPush.resolve({ ok: true, message: "ok" });
      const response = await responsePromise;
      expect(response.status).toBe(expectedStatus);
    },
  );

  it("复用活跃会话前会确保绑定项目级共享 workspace", async () => {
    jest.doMock("@/lib/session-manager", () => ({
      archiveActiveSession: jest.fn(),
      bindEditSessionRole: jest.fn((sessionId, userId, userRole) => ({
        sessionId,
        userId,
        userRole,
        projectId: "project-1",
        expiresAt: Date.now() + 60_000,
      })),
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
      "editor",
    );
  });

  it("新 Session 只返回轻量 Bootstrap，并按请求选择当前页", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      createJsonRequest({ demoId: "project-1", activePageId: "page_2" }) as never,
    );
    const body = (await response.json()) as {
      data: Record<string, unknown> & { project: Record<string, unknown> };
    };

    expect(response.status).toBe(201);
    expect(body.data.activePageId).toBe("page_2");
    expect(body.data.demoPages).toHaveLength(2);
    expect(body.data.project).toMatchObject({
      id: "project-1",
      name: "测试项目",
      thumbnail: "/cover.png",
    });
    expect(body.data).not.toHaveProperty("demos");
    expect(body.data).not.toHaveProperty("code");
    expect(body.data).not.toHaveProperty("schema");
  });

  it("当 activePageId 无效时稳定回退到目录第一页", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      createJsonRequest({ demoId: "project-1", activePageId: "missing" }) as never,
    );
    const body = (await response.json()) as { data: { activePageId: string } };

    expect(body.data.activePageId).toBe("page_1");
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
      "editor",
    );
  });
});

export {};
