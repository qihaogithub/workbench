import type { NextRequest } from "next/server";

import {
  applySketchScenePatchOperations,
  createDefaultSketchScene,
  type SketchSceneDocument,
  type SketchScenePatchOperation,
} from "@workbench/shared";

jest.mock("fs", () => ({
  existsSync: jest.fn(() => true),
  readFileSync: jest.fn(() => "not-json"),
}));

jest.mock("@/lib/auth/jwt", () => ({
  getAuthCookie: jest.fn(() => "token"),
  verifyToken: jest.fn(async () => ({
    userId: "user-1",
    username: "测试用户",
  })),
}));

jest.mock("@/lib/authoring-feature-flags", () => ({
  isSketchSceneAuthoringEnabled: jest.fn(() => true),
}));

jest.mock("@/lib/editor-diagnostics/store", () => ({
  appendEditorDiagnosticEvents: jest.fn(async () => ({
    written: 1,
    sqliteWritten: 1,
    editorSessionId: "editor-session-1",
    diagnostics: {
      sqliteUsed: true,
      jsonlFallbackUsed: false,
      dbUnavailable: false,
      eventGapDetected: false,
      warnings: [],
    },
  })),
}));

jest.mock("@/lib/schema-validator", () => ({
  validateNoSchemaConflictFromStrings: jest.fn(() => ({ ok: true, conflicts: [] })),
}));

jest.mock("@/lib/project-admin-service", () => ({
  getProjectAdminService: jest.fn(() => ({
    validateDemoPageFilesRuntime: jest.fn(() => ({ ok: true, issues: [] })),
  })),
}));

const commitWorkspaceMutation = jest.fn(async () => ({
  committed: true,
  mutationId: "mutation-test",
  projectId: "project-1",
  workspaceId: "workspace-1",
  baseRevision: 0,
  revision: 2,
  rootHash: "root-hash",
  actor: "author-site",
  resources: [],
  committedAt: Date.now(),
}));

class MockWorkspaceAuthorityClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

jest.mock("@/lib/workspace-authority-client", () => ({
  commitWorkspaceMutation,
  WorkspaceAuthorityClientError: MockWorkspaceAuthorityClientError,
}));

jest.mock("@/lib/fs-utils", () => ({
  createApiError: jest.fn((code: string, message?: string, details?: unknown) => ({
    success: false,
    error: { code, message: message || code, details },
  })),
  createApiSuccess: jest.fn((data: unknown) => ({
    success: true,
    data,
  })),
  findWorkspacePath: jest.fn(() => "/tmp/workspace-1"),
  getDemoDirPath: jest.fn(() => "/tmp/workspace-1/page-sketch"),
  getProjectConfigSchema: jest.fn(() => "{}"),
  getSessionMeta: jest.fn(() => ({
    sessionId: "session-1",
    demoId: "project-1",
    userId: "user-1",
    workspaceId: "workspace-1",
    createdAt: 1,
    expiresAt: Date.now() + 1000,
  })),
  getWorkspaceDemoPageFiles: jest.fn(),
  isSessionExpired: jest.fn(() => false),
  listDemoPages: jest.fn(() => [
    {
      id: "page-sketch",
      name: "手绘页",
      runtimeType: "sketch-scene" as const,
    },
  ]),
  resolvePageRuntimeType: jest.fn(() => "sketch-scene" as const),
  sessionExists: jest.fn(() => true),
  updateWorkspaceDemoFiles: jest.fn(() => true),
}));

class TestResponse {
  status: number;
  headers: Headers;
  private readonly body: BodyInit | null | undefined;

  constructor(body?: BodyInit | null, init?: ResponseInit) {
    this.status = init?.status ?? 200;
    this.headers = new Headers(init?.headers);
    this.body = body;
  }

  async json(): Promise<unknown> {
    if (typeof this.body !== "string") return null;
    return JSON.parse(this.body);
  }

  static json(body: unknown, init?: ResponseInit): TestResponse {
    return new TestResponse(JSON.stringify(body), init);
  }
}

function jsonRequest(body: unknown): NextRequest {
  return {
    json: async () => body,
  } as NextRequest;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (typeof value !== "object" || value === null) return value;
  return Object.keys(value)
    .sort()
    .reduce<Record<string, unknown>>((output, key) => {
      output[key] = sortJsonValue((value as Record<string, unknown>)[key]);
      return output;
    }, {});
}

function sceneWithTitle(text: string): SketchSceneDocument {
  const scene = createDefaultSketchScene();
  return {
    ...scene,
    nodes: scene.nodes.map((node) =>
      node.id === "title" ? { ...node, text } : node,
    ),
  };
}

function sceneWithNodePatch(
  scene: SketchSceneDocument,
  nodeId: string,
  patch: Partial<SketchSceneDocument["nodes"][number]>,
): SketchSceneDocument {
  return {
    ...scene,
    nodes: scene.nodes.map((node) =>
      node.id === nodeId ? { ...node, ...patch, id: node.id } : node,
    ),
  };
}

describe("session demo page files route sketch patch", () => {
  const originalResponse = global.Response;

  beforeEach(() => {
    jest.clearAllMocks();
    global.Response = TestResponse as unknown as typeof Response;
    const fs = jest.requireMock("fs") as { readFileSync: jest.Mock };
    fs.readFileSync.mockReturnValue("not-json");
  });

  afterEach(() => {
    global.Response = originalResponse;
  });

  it("拒绝其他账号读取当前 Session 页面文件", async () => {
    const { GET } = await import("./route");
    const auth = await import("@/lib/auth/jwt");
    const fsUtils = await import("@/lib/fs-utils");

    jest.mocked(auth.verifyToken).mockResolvedValueOnce({
      userId: "user-2",
      username: "其他用户",
    });

    const response = await GET({} as NextRequest, {
      params: { sessionId: "session-1", demoId: "page-sketch" },
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({
      success: false,
      error: {
        code: "FORBIDDEN",
        message: "无权访问其他用户的 Session",
      },
    });
    expect(fsUtils.getWorkspaceDemoPageFiles).not.toHaveBeenCalled();
  });

  it("协同侧已写入新 scene 后拒绝旧基线 sketch patch 并记录诊断", async () => {
    const { PUT } = await import("./route");
    const fsUtils = await import("@/lib/fs-utils");
    const diagnosticsStore = await import("@/lib/editor-diagnostics/store");
    const baseScene = sceneWithTitle("基线标题");
    const collaboratorScene = sceneWithTitle("协同侧标题");
    const localOperations: SketchScenePatchOperation[] = [
      { op: "update", nodeId: "title", patch: { text: "本地侧标题" } },
    ];
    const localTargetScene = applySketchScenePatchOperations(
      baseScene,
      localOperations,
    );

    jest.mocked(fsUtils.getWorkspaceDemoPageFiles).mockReturnValue({
      code: "",
      schema: "{}",
      prototypeHtml: undefined,
      prototypeCss: undefined,
      prototypeMeta: undefined,
      sketchScene: JSON.stringify(collaboratorScene),
      sketchMeta: {},
    });

    const response = await PUT(
      jsonRequest({
        sketchScene: JSON.stringify(localTargetScene),
        sketchPatch: {
          baseSceneKey: stableStringify(baseScene),
          operations: localOperations,
        },
        diagnosticContext: {
          editorSessionId: "editor-session-1",
          traceId: "trace-stale-patch",
        },
      }),
      { params: { sessionId: "session-1", demoId: "page-sketch" } },
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({
      success: false,
      error: {
        code: "INVALID_REQUEST",
        message: "草图 patch 基线已过期，请重新加载后再保存",
      },
    });
    expect(fsUtils.updateWorkspaceDemoFiles).not.toHaveBeenCalled();
    expect(diagnosticsStore.appendEditorDiagnosticEvents).toHaveBeenCalledWith([
      expect.objectContaining({
        editorSessionId: "editor-session-1",
        projectId: "project-1",
        sessionId: "session-1",
        workspaceId: "workspace-1",
        activePageId: "page-sketch",
        category: "page",
        name: "page.sketch_patch_rejected",
        traceId: "trace-stale-patch",
        level: "warn",
        details: expect.objectContaining({
          reason: "base_scene_mismatch",
          status: "rejected",
          success: false,
          operationCount: 1,
          hasBaseSceneKey: true,
        }),
      }),
    ]);
  });

  it("基线匹配时校验 sketch patch 回放后保存目标 scene", async () => {
    const { PUT } = await import("./route");
    const fsUtils = await import("@/lib/fs-utils");
    const diagnosticsStore = await import("@/lib/editor-diagnostics/store");
    const baseScene = sceneWithTitle("基线标题");
    const operations: SketchScenePatchOperation[] = [
      { op: "update", nodeId: "title", patch: { text: "保存后的标题" } },
    ];
    const targetScene = applySketchScenePatchOperations(baseScene, operations);
    const targetSceneJson = JSON.stringify(targetScene);

    jest.mocked(fsUtils.getWorkspaceDemoPageFiles).mockReturnValue({
      code: "",
      schema: "{}",
      prototypeHtml: undefined,
      prototypeCss: undefined,
      prototypeMeta: undefined,
      sketchScene: JSON.stringify(baseScene),
      sketchMeta: {},
    });

    const response = await PUT(
      jsonRequest({
        sketchScene: targetSceneJson,
        sketchPatch: {
          baseSceneKey: stableStringify(baseScene),
          operations,
        },
        diagnosticContext: {
          editorSessionId: "editor-session-1",
          traceId: "trace-valid-patch",
        },
      }),
      { params: { sessionId: "session-1", demoId: "page-sketch" } },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        runtimeValidation: { ok: true, issues: [] },
      },
    });
    expect(fsUtils.updateWorkspaceDemoFiles).toHaveBeenCalledWith(
      "workspace-1",
      "page-sketch",
      expect.objectContaining({
        sketchScene: targetSceneJson,
      }),
    );
    expect(diagnosticsStore.appendEditorDiagnosticEvents).toHaveBeenCalledWith([
      expect.objectContaining({
        name: "page.sketch_patch_validated",
        traceId: "trace-valid-patch",
        details: expect.objectContaining({
          status: "validated",
          success: true,
          operationCount: 1,
          hasBaseSceneKey: true,
          targetSource: "client_scene",
        }),
      }),
    ]);
  });

  it("只提交 sketch patch 时由服务端回放并保存目标 scene", async () => {
    const { PUT } = await import("./route");
    const fsUtils = await import("@/lib/fs-utils");
    const diagnosticsStore = await import("@/lib/editor-diagnostics/store");
    const baseScene = sceneWithTitle("基线标题");
    const operations: SketchScenePatchOperation[] = [
      { op: "update", nodeId: "title", patch: { text: "服务端回放标题" } },
    ];
    const targetScene = applySketchScenePatchOperations(baseScene, operations);

    jest.mocked(fsUtils.getWorkspaceDemoPageFiles).mockReturnValue({
      code: "",
      schema: "{}",
      prototypeHtml: undefined,
      prototypeCss: undefined,
      prototypeMeta: undefined,
      sketchScene: JSON.stringify(baseScene),
      sketchMeta: {},
    });

    const response = await PUT(
      jsonRequest({
        sketchPatch: {
          baseSceneKey: stableStringify(baseScene),
          operations,
        },
        diagnosticContext: {
          editorSessionId: "editor-session-1",
          traceId: "trace-server-patch",
        },
      }),
      { params: { sessionId: "session-1", demoId: "page-sketch" } },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        runtimeValidation: { ok: true, issues: [] },
      },
    });
    const updateWorkspaceDemoFiles = jest.mocked(fsUtils.updateWorkspaceDemoFiles);
    expect(updateWorkspaceDemoFiles).toHaveBeenCalledWith(
      "workspace-1",
      "page-sketch",
      expect.objectContaining({
        sketchScene: expect.any(String),
      }),
    );
    const savedFiles = updateWorkspaceDemoFiles.mock.calls[0]?.[2];
    const savedScene = JSON.parse(savedFiles?.sketchScene ?? "") as SketchSceneDocument;
    expect(savedScene).toMatchObject({
      version: targetScene.version,
      pageSize: targetScene.pageSize,
      nodes: targetScene.nodes,
      assets: targetScene.assets,
      bindings: targetScene.bindings,
      metadata: expect.objectContaining({
        updatedAt: expect.any(Number),
      }),
    });
    expect(diagnosticsStore.appendEditorDiagnosticEvents).toHaveBeenCalledWith([
      expect.objectContaining({
        name: "page.sketch_patch_validated",
        traceId: "trace-server-patch",
        details: expect.objectContaining({
          status: "validated",
          success: true,
          operationCount: 1,
          hasBaseSceneKey: true,
          targetSource: "server_patch",
        }),
      }),
    ]);
  });

  it("live Workspace 保存手绘页面时通过 Authority 提交 scene 与 meta", async () => {
    const { PUT } = await import("./route");
    const fsUtils = await import("@/lib/fs-utils");
    const fs = jest.requireMock("fs") as { readFileSync: jest.Mock };
    const baseScene = sceneWithTitle("基线标题");
    const nextScene = sceneWithTitle("Authority 保存标题");
    const nextSceneJson = JSON.stringify(nextScene);

    fs.readFileSync.mockImplementation((filePath: string) => {
      if (filePath.endsWith(".workspace.json")) {
        return JSON.stringify({ workspaceId: "workspace-1", scope: "live", status: "active" });
      }
      if (filePath.endsWith("sketch.scene.json")) return JSON.stringify(baseScene);
      if (filePath.endsWith("sketch.meta.json")) return JSON.stringify({ old: true });
      return "not-json";
    });
    jest.mocked(fsUtils.getWorkspaceDemoPageFiles).mockReturnValue({
      code: "",
      schema: "{}",
      prototypeHtml: undefined,
      prototypeCss: undefined,
      prototypeMeta: undefined,
      sketchScene: JSON.stringify(baseScene),
      sketchMeta: {},
    });

    const response = await PUT(
      jsonRequest({
        sketchScene: nextSceneJson,
        sketchMeta: { source: "test" },
      }),
      { params: { sessionId: "session-1", demoId: "page-sketch" } },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        runtimeValidation: { ok: true, issues: [] },
      },
    });
    expect(fsUtils.updateWorkspaceDemoFiles).not.toHaveBeenCalled();
    expect(commitWorkspaceMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        workspaceId: "workspace-1",
        sessionId: "session-1",
        actor: "author-site",
        reason: "update_demo_page_files",
        operations: [
          expect.objectContaining({
            type: "put_text",
            path: "demos/page-sketch/sketch.scene.json",
            content: nextSceneJson,
          }),
          expect.objectContaining({
            type: "put_text",
            path: "demos/page-sketch/sketch.meta.json",
            content: JSON.stringify({ source: "test" }, null, 2),
          }),
        ],
      }),
    );
  });

  it("连续高频协同更新时拒绝旧基线 patch 且只保存最新基线改动", async () => {
    const { PUT } = await import("./route");
    const fsUtils = await import("@/lib/fs-utils");
    const diagnosticsStore = await import("@/lib/editor-diagnostics/store");
    let currentScene = sceneWithTitle("基线标题");
    const rejectedTraceIds: string[] = [];
    const validatedTraceIds: string[] = [];

    for (let index = 1; index <= 8; index += 1) {
      const staleBaseScene = currentScene;
      const staleOperations: SketchScenePatchOperation[] = [
        {
          op: "update",
          nodeId: "title",
          patch: {
            text: `本地旧基线标题 ${index}`,
            x: 100 + index,
          },
        },
      ];
      const staleTargetScene = applySketchScenePatchOperations(
        staleBaseScene,
        staleOperations,
      );
      const collaboratorScene = sceneWithNodePatch(staleBaseScene, "title", {
        text: `协同侧标题 ${index}`,
        y: 200 + index,
      });

      jest.mocked(fsUtils.getWorkspaceDemoPageFiles).mockReturnValue({
        code: "",
        schema: "{}",
        prototypeHtml: undefined,
        prototypeCss: undefined,
        prototypeMeta: undefined,
        sketchScene: JSON.stringify(collaboratorScene),
        sketchMeta: {},
      });

      const rejectedTraceId = `trace-stale-patch-${index}`;
      const rejectedResponse = await PUT(
        jsonRequest({
          sketchScene: JSON.stringify(staleTargetScene),
          sketchPatch: {
            baseSceneKey: stableStringify(staleBaseScene),
            operations: staleOperations,
          },
          diagnosticContext: {
            editorSessionId: "editor-session-1",
            traceId: rejectedTraceId,
          },
        }),
        { params: { sessionId: "session-1", demoId: "page-sketch" } },
      );

      expect(rejectedResponse.status).toBe(409);
      expect(fsUtils.updateWorkspaceDemoFiles).not.toHaveBeenCalledWith(
        "workspace-1",
        "page-sketch",
        expect.objectContaining({
          sketchScene: JSON.stringify(staleTargetScene),
        }),
      );
      rejectedTraceIds.push(rejectedTraceId);

      const latestOperations: SketchScenePatchOperation[] = [
        {
          op: "update",
          nodeId: "title",
          patch: {
            text: `最新基线保存标题 ${index}`,
            width: 300 + index,
          },
        },
      ];
      const latestTargetScene = applySketchScenePatchOperations(
        collaboratorScene,
        latestOperations,
      );
      const latestTargetSceneJson = JSON.stringify(latestTargetScene);

      jest.mocked(fsUtils.getWorkspaceDemoPageFiles).mockReturnValue({
        code: "",
        schema: "{}",
        prototypeHtml: undefined,
        prototypeCss: undefined,
        prototypeMeta: undefined,
        sketchScene: JSON.stringify(collaboratorScene),
        sketchMeta: {},
      });

      const validatedTraceId = `trace-valid-patch-${index}`;
      const validatedResponse = await PUT(
        jsonRequest({
          sketchScene: latestTargetSceneJson,
          sketchPatch: {
            baseSceneKey: stableStringify(collaboratorScene),
            operations: latestOperations,
          },
          diagnosticContext: {
            editorSessionId: "editor-session-1",
            traceId: validatedTraceId,
          },
        }),
        { params: { sessionId: "session-1", demoId: "page-sketch" } },
      );

      expect(validatedResponse.status).toBe(200);
      expect(fsUtils.updateWorkspaceDemoFiles).toHaveBeenLastCalledWith(
        "workspace-1",
        "page-sketch",
        expect.objectContaining({
          sketchScene: latestTargetSceneJson,
        }),
      );
      validatedTraceIds.push(validatedTraceId);
      currentScene = latestTargetScene;
    }

    const diagnosticEvents = jest.mocked(diagnosticsStore.appendEditorDiagnosticEvents).mock.calls
      .flatMap(([events]) => events);
    expect(
      diagnosticEvents.filter((event) => event.name === "page.sketch_patch_rejected"),
    ).toHaveLength(rejectedTraceIds.length);
    expect(
      diagnosticEvents.filter((event) => event.name === "page.sketch_patch_validated"),
    ).toHaveLength(validatedTraceIds.length);
    for (const traceId of rejectedTraceIds) {
      expect(diagnosticEvents).toContainEqual(
        expect.objectContaining({
          traceId,
          name: "page.sketch_patch_rejected",
          details: expect.objectContaining({
            reason: "base_scene_mismatch",
            status: "rejected",
            success: false,
            operationCount: 1,
          }),
        }),
      );
    }
    for (const traceId of validatedTraceIds) {
      expect(diagnosticEvents).toContainEqual(
        expect.objectContaining({
          traceId,
          name: "page.sketch_patch_validated",
          details: expect.objectContaining({
            status: "validated",
            success: true,
            operationCount: 1,
          }),
        }),
      );
    }
    expect(currentScene.nodes.find((node) => node.id === "title")).toMatchObject({
      text: "最新基线保存标题 8",
      y: 208,
      width: 308,
    });
  });
});
