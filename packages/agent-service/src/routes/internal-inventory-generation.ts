import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  decodeMarkdownReferenceUri,
  encodeMarkdownReferenceUri,
  isInventoryEvidenceRef,
  type InventoryEvidenceRef,
} from "@workbench/shared";
import {
  InventoryEvidenceError,
  InventoryEvidenceReader,
  type InventoryEvidenceJobIdentity,
} from "../services/inventory-evidence-reader";
import {
  StatelessModelInvoker,
  type StatelessInventoryEvidence,
} from "../services/stateless-model-invoker";

interface GenerateBody {
  projectId?: unknown;
  workspaceId?: unknown;
  taskKey?: unknown;
  generationId?: unknown;
  attemptId?: unknown;
  leaseToken?: unknown;
  canonicalUri?: unknown;
  sourceFingerprint?: unknown;
  generatorVersion?: unknown;
  resourceType?: unknown;
  native?: unknown;
  evidenceRefs?: unknown;
}

interface GenerationDependencies {
  invoker: Pick<StatelessModelInvoker, "complete">;
  evidenceReader: Pick<InventoryEvidenceReader, "read">;
  token?: string;
}

export async function registerInternalInventoryGenerationRoutes(
  fastify: FastifyInstance,
  dependencies: Partial<GenerationDependencies> = {},
): Promise<void> {
  const resolved: GenerationDependencies = {
    invoker: dependencies.invoker ?? new StatelessModelInvoker(),
    evidenceReader: dependencies.evidenceReader ?? new InventoryEvidenceReader(),
    token: dependencies.token ?? process.env.INTERNAL_API_TOKEN?.trim(),
  };

  fastify.post<{ Body: GenerateBody }>(
    "/internal/inventory/generate",
    { bodyLimit: 64 * 1024 },
    async (request, reply) => handleGenerationRequest(request, reply, resolved),
  );
}

async function handleGenerationRequest(
  request: FastifyRequest<{ Body: GenerateBody }>,
  reply: FastifyReply,
  dependencies: GenerationDependencies,
) {
  if (!authorized(request, dependencies.token)) {
    return reply.code(401).send({ success: false, error: { code: "UNAUTHORIZED", message: "内部服务鉴权失败" } });
  }
  const body = request.body ?? {};
  const evidenceRefs = body.evidenceRefs;
  if (!isValidBody(body) || !Array.isArray(evidenceRefs) || evidenceRefs.length > 8 || !evidenceRefs.every(isInventoryEvidenceRef)) {
    return reply.code(400).send({ success: false, error: { code: "INVALID_REQUEST", message: "清单生成请求无效" } });
  }

  const job: InventoryEvidenceJobIdentity = {
    projectId: body.projectId as string,
    workspaceId: body.workspaceId as string,
    generationId: body.generationId as number,
  };
  try {
    const evidence: StatelessInventoryEvidence[] = [];
    for (const reference of evidenceRefs as InventoryEvidenceRef[]) {
      const content = await dependencies.evidenceReader.read(reference, job);
      evidence.push({ sourceKind: reference.sourceKind, selector: reference.selector, content });
    }
    const native = body.native as { name: string; aliases: string[]; description: string | null };
    const result = await dependencies.invoker.complete({
      canonicalUri: body.canonicalUri as string,
      resourceType: body.resourceType as string,
      native,
      evidence,
    });
    return reply.send({
      success: true,
      data: {
        summary: result.summary,
        provider: result.provider,
        model: result.model,
        profileHash: result.profileHash,
      },
    });
  } catch (error) {
    if (error instanceof InventoryEvidenceError) {
      const status = error.code === "INVALID_EVIDENCE" ? 400 : 409;
      return reply.code(status).send({ success: false, error: { code: error.code, message: error.message } });
    }
    const code = error instanceof Error && error.message.startsWith("INVENTORY_")
      ? error.message.slice("INVENTORY_".length)
      : "MODEL_UNAVAILABLE";
    return reply.code(503).send({ success: false, error: { code, message: "清单生成暂时不可用" } });
  }
}

function isValidBody(body: GenerateBody): boolean {
  const target = typeof body.canonicalUri === "string" ? decodeMarkdownReferenceUri(body.canonicalUri) : null;
  const native = body.native;
  return typeof body.projectId === "string" && body.projectId.length > 0 && body.projectId.length <= 256
    && typeof body.workspaceId === "string" && body.workspaceId.length > 0 && body.workspaceId.length <= 256
    && typeof body.taskKey === "string" && body.taskKey.length > 0 && body.taskKey.length <= 512
    && Number.isSafeInteger(body.generationId) && (body.generationId as number) > 0
    && typeof body.attemptId === "string" && body.attemptId.length > 0 && body.attemptId.length <= 128
    && typeof body.leaseToken === "string" && body.leaseToken.length > 0 && body.leaseToken.length <= 128
    && typeof body.sourceFingerprint === "string" && body.sourceFingerprint.length > 0 && body.sourceFingerprint.length <= 256
    && typeof body.generatorVersion === "string" && body.generatorVersion.length > 0 && body.generatorVersion.length <= 120
    && typeof body.resourceType === "string" && body.resourceType.length > 0 && body.resourceType.length <= 64
    && Boolean(target && target.projectId === body.projectId && body.canonicalUri === canonicalUri(target))
    && isNative(native);
}

function isNative(value: unknown): value is { name: string; aliases: string[]; description: string | null } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.name === "string" && record.name.length <= 512
    && Array.isArray(record.aliases) && record.aliases.every((alias) => typeof alias === "string" && alias.length <= 512)
    && (record.description === null || typeof record.description === "string");
}

function canonicalUri(target: NonNullable<ReturnType<typeof decodeMarkdownReferenceUri>>): string {
  return encodeMarkdownReferenceUri(target);
}

function authorized(request: FastifyRequest, token?: string): boolean {
  if (!token) return false;
  const authorization = request.headers.authorization;
  const internalToken = request.headers["x-internal-token"];
  return authorization === `Bearer ${token}` || internalToken === token;
}
