import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createListTransferSourcePagesTool,
  createTransferPagesTool,
} from "../../src/backends/pi-tools/page-transfer-tools";
import { ToolHookManager } from "../../src/backends/managers/tool-hook-manager";
import type { AgentConfig } from "../../src/core/types";

const auth = {
  userId: "user-1",
  role: "editor" as const,
  projectId: "target-project",
  expiresAt: Date.now() + 60_000,
  source: "author-session" as const,
};

const config: AgentConfig = {
  sessionId: "session-1",
  projectId: "target-project",
  authorAuthorization: auth,
  referencedProjects: [{ projectId: "source-project" }],
};

function response(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("page transfer tools", () => {
  it("defaults an omitted Agent mode to reference", async () => {
    vi.stubEnv("AUTHOR_SITE_URL", "http://author.test");
    vi.stubEnv("INTERNAL_API_TOKEN", "internal-token");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({ jobId: "job-default", status: "prepared" }),
      )
      .mockResolvedValueOnce(
        response({ jobId: "job-default", status: "completed" }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createTransferPagesTool(config).execute(
      "call-default",
      {
        sourceProjectId: "source-project",
        sourcePageIds: ["page-1"],
        idempotencyKey: "retry-default",
      },
    );

    expect(result.isError).toBeFalsy();
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(request.body))).toMatchObject({
      mode: "reference",
    });
  });

  it("keeps an explicit copy mode", async () => {
    vi.stubEnv("AUTHOR_SITE_URL", "http://author.test");
    vi.stubEnv("INTERNAL_API_TOKEN", "internal-token");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({ jobId: "job-copy", status: "prepared" }),
      )
      .mockResolvedValueOnce(
        response({ jobId: "job-copy", status: "completed" }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await createTransferPagesTool(config).execute("call-copy", {
      sourceProjectId: "source-project",
      sourcePageIds: ["page-1"],
      mode: "copy",
      idempotencyKey: "retry-copy",
    });

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(request.body))).toMatchObject({ mode: "copy" });
  });

  it("explains reference permissions without executing or switching to copy", async () => {
    vi.stubEnv("AUTHOR_SITE_URL", "http://author.test");
    vi.stubEnv("INTERNAL_API_TOKEN", "internal-token");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          error: { code: "FORBIDDEN", message: "项目不可编辑" },
        }),
        { status: 403, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createTransferPagesTool(config).execute(
      "call-forbidden",
      {
        sourceProjectId: "source-project",
        sourcePageIds: ["page-1"],
        idempotencyKey: "retry-forbidden",
      },
    );

    expect(result.isError).toBe(true);
    expect(result.details.error).toBe("FORBIDDEN");
    expect(result.details.message).toBe("项目不可编辑");
    expect(result.content[0].text).toContain("引用需要源项目编辑或管理权限");
    expect(result.content[0].text).toContain("询问用户是否明确改用复制");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body),
    ).toContain('"mode":"reference"');
  });

  it("preserves the server error message and details", async () => {
    vi.stubEnv("AUTHOR_SITE_URL", "http://author.test");
    vi.stubEnv("INTERNAL_API_TOKEN", "internal-token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: false,
            error: {
              code: "WORKSPACE_STALE",
              message: "源项目 canonical proof 不可用",
              details: { sourceProjectId: "source-project", revision: 14 },
            },
          }),
          { status: 409, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    const result = await createTransferPagesTool(config).execute("call-error", {
      sourceProjectId: "source-project",
      sourcePageIds: ["page-1"],
      idempotencyKey: "retry-error",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("源项目 canonical proof 不可用");
    expect(result.details).toMatchObject({
      error: "WORKSPACE_STALE",
      message: "源项目 canonical proof 不可用",
      errorDetails: { sourceProjectId: "source-project", revision: 14 },
    });
  });

  it("never accepts a model-supplied target project or role", async () => {
    vi.stubEnv("AUTHOR_SITE_URL", "http://author.test");
    vi.stubEnv("INTERNAL_API_TOKEN", "internal-token");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ jobId: "job-1", status: "prepared" }))
      .mockResolvedValueOnce(response({ jobId: "job-1", status: "completed" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createTransferPagesTool(config).execute("call-1", {
      sourceProjectId: "source-project",
      sourcePageIds: ["page-1"],
      mode: "reference",
      idempotencyKey: "retry-1",
      targetProjectId: "attacker-project",
      role: "admin",
    } as any);

    expect(result.isError).toBeFalsy();
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(request.body));
    expect(body).toEqual({
      sourceProjectId: "source-project",
      sourcePageIds: ["page-1"],
      mode: "reference",
      idempotencyKey: "retry-1",
    });
    expect(body.targetProjectId).toBeUndefined();
    expect(request.headers).toMatchObject({
      "x-agent-project-id": "target-project",
      "x-agent-user-id": "user-1",
      "x-agent-role": "editor",
      "x-agent-session-id": "session-1",
    });
  });

  it("fails closed without a bound author authorization", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await createTransferPagesTool({
      ...config,
      authorAuthorization: null,
    }).execute("call-1", {
      sourceProjectId: "source-project",
      sourcePageIds: ["page-1"],
      mode: "reference",
      idempotencyKey: "retry-1",
    });

    expect(result.isError).toBe(true);
    expect(result.details.error).toBe("PAGE_TRANSFER_UNAUTHORIZED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("enforces referencedProjects for a cross-project source", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await createListTransferSourcePagesTool({
      ...config,
      referencedProjects: [{ projectId: "other-project" }],
    }).execute("call-1", { projectId: "source-project" });

    expect(result.isError).toBe(true);
    expect(result.details.error).toBe("PAGE_TRANSFER_SOURCE_NOT_AUTHORIZED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns needs_resolution without executing the prepared job", async () => {
    vi.stubEnv("AUTHOR_SITE_URL", "http://author.test");
    vi.stubEnv("INTERNAL_API_TOKEN", "internal-token");
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        jobId: "job-conflict",
        status: "needs_resolution",
        conflicts: [{ sourcePageId: "page-1", reason: "name_collision" }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createTransferPagesTool(config).execute("call-1", {
      sourceProjectId: "source-project",
      sourcePageIds: ["page-1"],
      mode: "reference",
      idempotencyKey: "retry-conflict",
    });

    expect(result.isError).toBeFalsy();
    expect(result.details.status).toBe("needs_resolution");
    expect(result.details.conflicts).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps transfer receipt resources before any tool-name fallback", () => {
    const manager = new ToolHookManager(config);
    const changes = manager.getFileChangesForTool("transferPages", {}, false, {
      result: {},
      details: {
        receipts: [
          {
            committed: true,
            mutationId: "mutation-1",
            revision: 4,
            actor: "author-site",
            resources: [
              {
                path: "workspace-tree.json",
                action: "modified",
                beforeHash: "a",
                afterHash: "b",
              },
              {
                path: "demos/new-page/",
                action: "created",
                beforeHash: null,
                afterHash: "c",
              },
            ],
          },
        ],
      },
    });

    expect(changes).toEqual([
      { path: "workspace-tree.json", action: "modified" },
      { path: "demos/new-page/", action: "created" },
    ]);
  });
});
