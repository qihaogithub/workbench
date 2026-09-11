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
