import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { AgentConfig } from "../../core/types";

const ListSourcePagesParams = Type.Object({
  projectId: Type.Optional(Type.String({ description: "Source project ID" })),
  query: Type.Optional(Type.String({ description: "Search query" })),
});
type ListSourcePagesParams = Static<typeof ListSourcePagesParams>;

const TransferPagesParams = Type.Object({
  sourceProjectId: Type.String({ description: "Authorized source project ID" }),
  sourcePageIds: Type.Array(Type.String(), { description: "Source page IDs" }),
  mode: Type.Optional(
    Type.Union([Type.Literal("reference"), Type.Literal("copy")], {
      description:
        "Transfer mode. Omit for the default reference mode; use copy only when the user explicitly requests an independent editable copy.",
    }),
  ),
  targetFolderId: Type.Optional(Type.String()),
  placement: Type.Optional(Type.Unknown()),
  idempotencyKey: Type.String({ description: "Stable retry key" }),
});
type TransferPagesParams = Static<typeof TransferPagesParams>;

const TransferStatusParams = Type.Object({
  jobId: Type.String({ description: "Page transfer job ID" }),
});
type TransferStatusParams = Static<typeof TransferStatusParams>;

const ResolveConflictsParams = Type.Object({
  jobId: Type.String({ description: "Page transfer job ID" }),
  resolutions: Type.Array(
    Type.Object({
      conflictId: Type.String(),
      action: Type.Union([
        Type.Literal("reuse_target"),
        Type.Literal("replace_target"),
        Type.Literal("map_to_target"),
        Type.Literal("omit_relation"),
      ]),
      targetKey: Type.Optional(Type.String()),
    }),
  ),
});
type ResolveConflictsParams = Static<typeof ResolveConflictsParams>;

const RevokeReferenceParams = Type.Object({
  grantId: Type.String({ description: "Page reference grant ID" }),
});
type RevokeReferenceParams = Static<typeof RevokeReferenceParams>;

type TransferToolResult = {
  content: [{ type: "text"; text: string }];
  details: Record<string, unknown>;
  isError?: boolean;
};

function failure(
  error: string,
  message = error,
  errorDetails?: unknown,
): TransferToolResult {
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    details: {
      error,
      message,
      ...(errorDetails === undefined ? {} : { errorDetails }),
    },
    isError: true,
  };
}

class PageTransferRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "PageTransferRequestError";
  }
}

function requestFailure(error: unknown): TransferToolResult {
  if (error instanceof PageTransferRequestError) {
    return failure(error.code, error.message, error.details);
  }
  const message =
    error instanceof Error ? error.message : "PAGE_TRANSFER_FAILED";
  return failure(message);
}

function authorization(
  config: AgentConfig,
): { userId: string; projectId: string; role: string } | null {
  const auth = config.authorAuthorization;
  if (
    !auth ||
    !auth.userId ||
    !auth.projectId ||
    !config.projectId ||
    auth.projectId !== config.projectId ||
    auth.expiresAt <= Date.now()
  )
    return null;
  if (auth.role !== "admin" && auth.role !== "editor") return null;
  return { userId: auth.userId, projectId: auth.projectId, role: auth.role };
}

function sourceAuthorized(
  config: AgentConfig,
  sourceProjectId: string,
): boolean {
  const auth = authorization(config);
  if (!auth) return false;
  return (
    sourceProjectId === auth.projectId ||
    Boolean(
      config.referencedProjects?.some(
        (ref) => ref.projectId === sourceProjectId,
      ),
    )
  );
}

function internalRequest(
  config: AgentConfig,
  method: string,
  endpoint: string,
  body?: unknown,
): Promise<Response> {
  const auth = authorization(config);
  if (!auth) throw new Error("PAGE_TRANSFER_UNAUTHORIZED");
  const baseUrl = process.env.AUTHOR_SITE_URL?.replace(/\/$/u, "");
  const token = process.env.INTERNAL_API_TOKEN;
  if (!baseUrl || !token) throw new Error("PAGE_TRANSFER_SERVICE_UNAVAILABLE");
  return fetch(`${baseUrl}${endpoint}`, {
    method,
    redirect: "error",
    headers: {
      "content-type": "application/json",
      "x-internal-token": token,
      "x-agent-user-id": auth.userId,
      "x-agent-project-id": auth.projectId,
      "x-agent-role": auth.role,
      "x-agent-session-id": config.sessionId,
      "x-author-authorization": JSON.stringify(config.authorAuthorization),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15_000),
  });
}

async function readResponse(
  response: Response,
): Promise<{ data: any; raw: any }> {
  const raw = await response.json().catch(() => ({}));
  if (!response.ok || raw?.success === false) {
    const rawError = raw?.error;
    const code =
      (typeof rawError?.code === "string" && rawError.code) ||
      (typeof rawError === "string" && rawError) ||
      `PAGE_TRANSFER_HTTP_${response.status}`;
    const message =
      (typeof rawError?.message === "string" && rawError.message) || code;
    throw new PageTransferRequestError(code, message, rawError?.details);
  }
  return { data: raw?.data ?? raw, raw };
}

function resultText(action: string, data: any): string {
  const jobId = data?.id ?? data?.jobId;
  return `${action} completed${jobId ? ` (jobId=${jobId})` : ""}.`;
}

function withReceipts(data: any): Record<string, unknown> {
  const details = data && typeof data === "object" ? { ...data } : { data };
  if (data?.receipt !== undefined) details.receipt = data.receipt;
  const receipts = [
    ...(Array.isArray(data?.receipts) ? data.receipts : []),
    ...(Array.isArray(data?.items)
      ? data.items.flatMap((item: any) => (item?.receipt ? [item.receipt] : []))
      : []),
  ];
  if (receipts.length) details.receipts = receipts;
  return details;
}

export function createListTransferSourcePagesTool(
  config: AgentConfig,
): AgentTool<typeof ListSourcePagesParams> {
  return {
    name: "listTransferSourcePages",
    label: "List Transfer Source Pages",
    description: "List pages from projects authorized for page transfer.",
    parameters: ListSourcePagesParams,
    execute: async (_id, args) => {
      try {
        const auth = authorization(config);
        if (!auth) return failure("PAGE_TRANSFER_UNAUTHORIZED");
        if (args.projectId && !sourceAuthorized(config, args.projectId))
          return failure("PAGE_TRANSFER_SOURCE_NOT_AUTHORIZED");
        const params = new URLSearchParams();
        if (args.projectId) params.set("sourceProjectId", args.projectId);
        if (args.query) params.set("query", args.query);
        const response = await internalRequest(
          config,
          "GET",
          `/api/internal/page-transfers/${encodeURIComponent(auth.projectId)}/sources?${params}`,
        );
        const { data } = await readResponse(response);
        const items = Array.isArray(data)
          ? data
          : (data?.pages ?? data?.items ?? []);
        const visible = items.filter(
          (item: any) =>
            typeof item?.projectId !== "string" ||
            sourceAuthorized(config, item.projectId),
        );
        return {
          content: [{ type: "text", text: JSON.stringify(visible) }],
          details: { pages: visible },
        };
      } catch (error) {
        return requestFailure(error);
      }
    },
  };
}

export function createTransferPagesTool(
  config: AgentConfig,
): AgentTool<typeof TransferPagesParams> {
  return {
    name: "transferPages",
    label: "Transfer Pages",
    description:
      "Prepare and, when conflict-free, execute an authorized page transfer. Defaults to reference. Use copy only for an explicit request for a copy/independent editable duplicate; ask before calling when wording mixes copy and reference. Never recreate transferred pages with readProjectReference, saveImage, or createPage after an error.",
    parameters: TransferPagesParams,
    execute: async (_id, args) => {
      const mode = args.mode ?? "reference";
      try {
        if (!authorization(config))
          return failure("PAGE_TRANSFER_UNAUTHORIZED");
        if (!sourceAuthorized(config, args.sourceProjectId))
          return failure("PAGE_TRANSFER_SOURCE_NOT_AUTHORIZED");
        if (args.sourcePageIds.length === 0)
          return failure("PAGE_TRANSFER_SOURCE_PAGES_REQUIRED");
        const response = await internalRequest(
          config,
          "POST",
          `/api/internal/page-transfers/${encodeURIComponent(authorization(config)!.projectId)}/prepare`,
          {
            sourceProjectId: args.sourceProjectId,
            sourcePageIds: args.sourcePageIds,
            mode,
            ...(args.targetFolderId === undefined
              ? {}
              : { targetFolderId: args.targetFolderId }),
            ...(args.placement === undefined
              ? {}
              : { placement: args.placement }),
            idempotencyKey: args.idempotencyKey,
          },
        );
        const prepared = (await readResponse(response)).data;
        const status = prepared?.status ?? prepared?.state;
        const needsResolution =
          status === "needs_resolution" ||
          status === "needs-resolution" ||
          prepared?.needsResolution === true ||
          (Array.isArray(prepared?.conflicts) && prepared.conflicts.length > 0);
        if (needsResolution)
          return {
            content: [{ type: "text", text: JSON.stringify(prepared) }],
            details: {
              ...withReceipts(prepared),
              status: "needs_resolution",
              conflicts: prepared.conflicts ?? [],
            },
          };
        const jobId = prepared?.id ?? prepared?.jobId;
        if (!jobId)
          return {
            content: [{ type: "text", text: JSON.stringify(prepared) }],
            details: withReceipts(prepared),
          };
        const executed = (
          await readResponse(
            await internalRequest(
              config,
              "POST",
              `/api/internal/page-transfers/${encodeURIComponent(authorization(config)!.projectId)}/${encodeURIComponent(jobId)}/execute`,
              {},
            ),
          )
        ).data;
        return {
          content: [
            { type: "text", text: resultText("Page transfer", executed) },
          ],
          details: {
            ...withReceipts(executed),
            jobId,
            prepare: prepared,
          },
        };
      } catch (error) {
        const code =
          error instanceof PageTransferRequestError
            ? error.code
            : error instanceof Error
              ? error.message
              : "PAGE_TRANSFER_FAILED";
        if (mode === "reference" && code === "FORBIDDEN") {
          const result = requestFailure(error);
          result.content = [
            {
              type: "text",
              text: "Error: FORBIDDEN：引用需要源项目编辑或管理权限。请询问用户是否明确改用复制；不得自动切换为复制或手工重建页面。",
            },
          ];
          return result;
        }
        return requestFailure(error);
      }
    },
  };
}

export function createGetPageTransferStatusTool(
  config: AgentConfig,
): AgentTool<typeof TransferStatusParams> {
  return {
    name: "getPageTransferStatus",
    label: "Get Page Transfer Status",
    description: "Read the status of a page transfer job.",
    parameters: TransferStatusParams,
    execute: async (_id, args) => {
      try {
        const data = (
          await readResponse(
            await internalRequest(
              config,
              "GET",
              `/api/internal/page-transfers/${encodeURIComponent(authorization(config)!.projectId)}/${encodeURIComponent(args.jobId)}`,
            ),
          )
        ).data;
        return {
          content: [{ type: "text", text: JSON.stringify(data) }],
          details: withReceipts(data),
        };
      } catch (error) {
        return requestFailure(error);
      }
    },
  };
}

export function createResolvePageTransferConflictsTool(
  config: AgentConfig,
): AgentTool<typeof ResolveConflictsParams> {
  return {
    name: "resolvePageTransferConflicts",
    label: "Resolve Page Transfer Conflicts",
    description:
      "Execute a prepared page transfer with explicit conflict resolutions.",
    parameters: ResolveConflictsParams,
    execute: async (_id, args) => {
      try {
        const data = (
          await readResponse(
            await internalRequest(
              config,
              "POST",
              `/api/internal/page-transfers/${encodeURIComponent(authorization(config)!.projectId)}/${encodeURIComponent(args.jobId)}/execute`,
              { resolutions: args.resolutions },
            ),
          )
        ).data;
        return {
          content: [
            {
              type: "text",
              text: resultText("Page transfer conflict resolution", data),
            },
          ],
          details: withReceipts(data),
        };
      } catch (error) {
        return requestFailure(error);
      }
    },
  };
}

export function createRevokePageReferenceTool(
  config: AgentConfig,
): AgentTool<typeof RevokeReferenceParams> {
  return {
    name: "revokePageReference",
    label: "Revoke Page Reference",
    description: "Revoke an existing page reference grant.",
    parameters: RevokeReferenceParams,
    execute: async (_id, args) => {
      try {
        const data = (
          await readResponse(
            await internalRequest(
              config,
              "POST",
              `/api/internal/page-references/${encodeURIComponent(authorization(config)!.projectId)}/${encodeURIComponent(args.grantId)}/revoke`,
              {},
            ),
          )
        ).data;
        return {
          content: [
            {
              type: "text",
              text: resultText("Page reference revocation", data),
            },
          ],
          details: withReceipts(data),
        };
      } catch (error) {
        return requestFailure(error);
      }
    },
  };
}
