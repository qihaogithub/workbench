import fs from "node:fs";
import path from "node:path";
import "./bootstrap-env.js";
import Fastify from "fastify";
import { resolveDataDir } from "@workbench/runtime-config/paths";
import { resolveSecrets } from "@workbench/runtime-config/secrets";
import type { InventoryQuery } from "@workbench/shared";
import { PROJECT_INVENTORY_GENERATOR_VERSION } from "@workbench/shared";

import {
  SqliteKnowledgeCatalog,
  reconcileTemplateProjects,
} from "./sqlite-catalog.js";
import { SqliteInventoryCatalog, type InventoryGenerationRequest } from "./inventory-catalog.js";
import {
  decodeMarkdownReferenceUri,
  encodeMarkdownReferenceUri,
  isInventoryEvidenceRef,
  isInventoryGeneratedSemantic,
  isInventorySnapshot,
} from "./shared-runtime.js";

interface SearchBody {
  query?: unknown;
  currentProjectId?: unknown;
  limit?: unknown;
}

interface ReadBody {
  sourceRef?: unknown;
}

interface InventorySearchBody extends InventoryQuery {
  projectId?: unknown;
}

interface InventoryPublishBody {
  snapshot?: unknown;
}

interface InventoryJobsBody {
  projectId?: unknown;
  generatorVersion?: unknown;
  requests?: unknown;
}

interface InventoryAnnotationBody {
  projectId?: unknown;
  canonicalUri?: unknown;
  sourceFingerprint?: unknown;
  generated?: unknown;
}

resolveSecrets({ required: ["INTERNAL_API_TOKEN"] });
const port = numberEnv("PORT", 4203);
const host = process.env.HOST ?? "0.0.0.0";
const dataDir = resolveDataDir();
const reconcileIntervalMs = numberEnv(
  "KNOWLEDGE_RECONCILE_INTERVAL_MS",
  60_000,
);
const backupIntervalMs = numberEnv(
  "KNOWLEDGE_BACKUP_INTERVAL_MS",
  24 * 60 * 60 * 1_000,
);
const backupRetentionDays = numberEnv("KNOWLEDGE_BACKUP_RETENTION_DAYS", 7);
const internalToken = process.env.INTERNAL_API_TOKEN?.trim();

const app = Fastify({ logger: true });
const catalog = new SqliteKnowledgeCatalog({ dataDir });
const inventoryCatalog = new SqliteInventoryCatalog({ dataDir, databasePath: catalog.databasePath });
let reconciling = false;
let lastReconcileAt: number | null = null;
let lastReconcileError: string | null = null;
let lastBackupAt: number | null = null;
let lastBackupError: string | null = null;

function authorized(authorization: string | undefined): boolean {
  if (!internalToken) return true;
  return authorization === `Bearer ${internalToken}`;
}

async function reconcile(): Promise<ReturnType<typeof reconcileTemplateProjects>> {
  if (reconciling) {
    return {
      activeProjects: catalog.stats().activeProjects,
      indexedProjects: 0,
      deactivatedProjects: 0,
      documentCount: 0,
      chunkCount: 0,
    };
  }
  reconciling = true;
  try {
    const result = reconcileTemplateProjects(catalog, dataDir);
    lastReconcileAt = Date.now();
    lastReconcileError = null;
    return result;
  } catch (error) {
    lastReconcileError = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    reconciling = false;
  }
}

async function backup(): Promise<string> {
  const backupDir = path.join(dataDir, "backups", "knowledge");
  const fileName = `knowledge-${new Date().toISOString().replace(/[:.]/g, "-")}.db`;
  const destinationPath = path.join(backupDir, fileName);
  try {
    await catalog.backup(destinationPath);
    lastBackupAt = Date.now();
    lastBackupError = null;
    pruneBackups(backupDir, backupRetentionDays);
    return destinationPath;
  } catch (error) {
    lastBackupError = error instanceof Error ? error.message : String(error);
    throw error;
  }
}

app.addHook("onRequest", async (request, reply) => {
  if (request.url === "/health") return;
  if (!authorized(request.headers.authorization)) {
    await reply.code(401).send({
      success: false,
      error: { code: "UNAUTHORIZED", message: "内部服务鉴权失败" },
    });
  }
});

app.get("/health", async () => ({
  status: lastReconcileError ? "degraded" : "ok",
  timestamp: new Date().toISOString(),
  lastReconcileAt,
  lastReconcileError,
  lastBackupAt,
  lastBackupError,
  stats: catalog.stats(),
}));

app.get("/api/knowledge/status", async () => ({
  success: true,
  data: {
    stats: catalog.stats(),
    lastReconcileAt,
    lastReconcileError,
    lastBackupAt,
    lastBackupError,
    integrityOk: catalog.integrityCheck(),
  },
}));

app.post("/api/knowledge/reconcile", async () => ({
  success: true,
  data: await reconcile(),
}));

app.post("/api/knowledge/backup", async () => ({
  success: true,
  data: { path: await backup() },
}));

app.post<{ Body: SearchBody }>(
  "/api/knowledge/search",
  async (request, reply) => {
    if (
      typeof request.body?.query !== "string" ||
      !request.body.query.trim()
    ) {
      return reply.code(400).send({
        success: false,
        error: { code: "INVALID_REQUEST", message: "query 不能为空" },
      });
    }
    const hits = catalog.search({
      query: request.body.query,
      currentProjectId:
        typeof request.body.currentProjectId === "string"
          ? request.body.currentProjectId
          : undefined,
      limit:
        typeof request.body.limit === "number" ? request.body.limit : undefined,
    });
    return { success: true, data: { hits } };
  },
);

app.post<{ Body: ReadBody }>(
  "/api/knowledge/read",
  async (request, reply) => {
    if (typeof request.body?.sourceRef !== "string") {
      return reply.code(400).send({
        success: false,
        error: { code: "INVALID_REQUEST", message: "sourceRef 无效" },
      });
    }
    const source = catalog.read(request.body.sourceRef);
    if (!source) {
      return reply.code(404).send({
        success: false,
        error: { code: "KNOWLEDGE_SOURCE_NOT_FOUND", message: "知识来源不存在" },
      });
    }
    return { success: true, data: { source } };
  },
);

app.get("/api/inventory/status", async () => ({
  success: true,
  data: { stats: inventoryCatalog.stats(), integrityOk: inventoryCatalog.integrityCheck() },
}));

app.get<{ Querystring: { projectId?: string } }>("/api/inventory/snapshot", async (request, reply) => {
  if (!request.query.projectId) return reply.code(400).send({ success: false, error: { code: "INVALID_REQUEST", message: "projectId 无效" } });
  const snapshot = inventoryCatalog.activeSnapshot(request.query.projectId);
  if (!snapshot) return reply.code(404).send({ success: false, error: { code: "INVENTORY_NOT_FOUND", message: "清单不存在" } });
  return { success: true, data: snapshot };
});

app.post<{ Body: InventoryPublishBody }>(
  "/api/inventory/publish",
  async (request, reply) => {
    if (!isInventorySnapshot(request.body?.snapshot)) {
      return reply.code(400).send({
        success: false,
        error: { code: "INVENTORY_INVALID_SNAPSHOT", message: "清单快照无效" },
      });
    }
    const generationId = inventoryCatalog.publish(request.body.snapshot);
    return { success: true, data: { generationId } };
  },
);

app.post<{ Body: InventorySearchBody }>(
  "/api/inventory/search",
  async (request, reply) => {
    if (typeof request.body?.projectId !== "string" || !request.body.projectId) {
      return reply.code(400).send({
        success: false,
        error: { code: "INVALID_REQUEST", message: "projectId 无效" },
      });
    }
    const { projectId, ...query } = request.body;
    return { success: true, data: inventoryCatalog.search({ projectId, ...query }) };
  },
);

app.post<{ Body: InventoryJobsBody }>(
  "/api/inventory/jobs",
  async (request, reply) => {
    if (typeof request.body?.projectId !== "string" || !request.body.projectId || request.body.projectId.length > 256 || !isInventoryGenerationRequests(request.body.requests)) {
      return reply.code(400).send({
        success: false,
        error: { code: "INVALID_REQUEST", message: "生成任务参数无效" },
      });
    }
    const generatorVersion = typeof request.body.generatorVersion === "string"
      ? request.body.generatorVersion
      : PROJECT_INVENTORY_GENERATOR_VERSION;
    if (!generatorVersion || generatorVersion.length > 120) {
      return reply.code(400).send({ success: false, error: { code: "INVALID_REQUEST", message: "生成器版本无效" } });
    }
    const requests = request.body.requests;
    const inserted = inventoryCatalog.createGenerationJobs(request.body.projectId, requests, generatorVersion);
    return { success: true, data: { inserted } };
  },
);

app.post<{ Body: { projectId?: unknown; limit?: unknown } }>(
  "/api/inventory/jobs/claim",
  async (request, reply) => {
    if (typeof request.body?.projectId !== "string" || !request.body.projectId || request.body.projectId.length > 256 || (request.body.limit !== undefined && (!Number.isSafeInteger(request.body.limit) || (request.body.limit as number) < 1 || (request.body.limit as number) > 32))) {
      return reply.code(400).send({ success: false, error: { code: "INVALID_REQUEST", message: "projectId 或 limit 无效" } });
    }
    return {
      success: true,
      data: {
        jobs: inventoryCatalog.claimGenerationJobs(
          request.body.projectId,
          typeof request.body.limit === "number" ? request.body.limit : undefined,
        ),
      },
    };
  },
);

app.post<{ Body: InventoryAnnotationBody }>(
  "/api/inventory/annotations",
  async (request, reply) => {
    const body = request.body;
    if (typeof body?.projectId !== "string" || typeof body.canonicalUri !== "string" || typeof body.sourceFingerprint !== "string" || !isInventoryGeneratedSemantic(body.generated)) {
      return reply.code(400).send({ success: false, error: { code: "INVALID_REQUEST", message: "固定清单注解格式无效" } });
    }
    const applied = inventoryCatalog.applyAnnotation({ projectId: body.projectId, canonicalUri: body.canonicalUri, sourceFingerprint: body.sourceFingerprint, generated: body.generated });
    if (!applied) return reply.code(409).send({ success: false, error: { code: "INVENTORY_STALE", message: "清单注解已过期" } });
    return { success: true, data: { applied: true } };
  },
);

app.post<{ Body: { projectId?: unknown; canonicalUri?: unknown; sourceFingerprint?: unknown; error?: unknown } }>(
  "/api/inventory/jobs/fail",
  async (request, reply) => {
    const body = request.body;
    if (typeof body?.projectId !== "string" || typeof body.canonicalUri !== "string" || typeof body.sourceFingerprint !== "string" || typeof body.error !== "string") {
      return reply.code(400).send({ success: false, error: { code: "INVALID_REQUEST", message: "失败任务参数无效" } });
    }
    const updated = inventoryCatalog.markGenerationFailed({ projectId: body.projectId, canonicalUri: body.canonicalUri, sourceFingerprint: body.sourceFingerprint, error: body.error });
    return { success: true, data: { updated } };
  },
);

const timer = setInterval(() => {
  void reconcile().catch((error) => {
    app.log.error({ error }, "knowledge reconcile failed");
  });
}, reconcileIntervalMs);
timer.unref();
const backupTimer = setInterval(() => {
  void backup().catch((error) => {
    app.log.error({ error }, "knowledge backup failed");
  });
}, backupIntervalMs);
backupTimer.unref();

const shutdown = async (): Promise<void> => {
  clearInterval(timer);
  clearInterval(backupTimer);
  await app.close();
  inventoryCatalog.close();
  catalog.close();
};
process.once("SIGINT", () => void shutdown().finally(() => process.exit(0)));
process.once("SIGTERM", () => void shutdown().finally(() => process.exit(0)));

async function start(): Promise<void> {
  await reconcile();
  await app.listen({ port, host });
}

void start().catch((error) => {
  app.log.error({ error }, "knowledge service failed to start");
  catalog.close();
  process.exit(1);
});

function numberEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function pruneBackups(directory: string, retentionDays: number): void {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1_000;
  for (const entry of fsEntries(directory)) {
    if (!entry.name.startsWith("knowledge-") || !entry.name.endsWith(".db")) {
      continue;
    }
    const filePath = path.join(directory, entry.name);
    if (entry.mtimeMs < cutoff) {
      try {
        fs.rmSync(filePath, { force: true });
      } catch (error) {
        app.log.warn({ error, filePath }, "failed to prune knowledge backup");
      }
    }
  }
}

function fsEntries(directory: string): Array<{ name: string; mtimeMs: number }> {
  try {
    return fs
      .readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => ({
        name: entry.name,
        mtimeMs: fs.statSync(path.join(directory, entry.name)).mtimeMs,
      }));
  } catch {
    return [];
  }
}

function isInventoryGenerationRequests(value: unknown): value is InventoryGenerationRequest[] {
  return Array.isArray(value)
    && value.length <= 100
    && value.every((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return false;
      const request = item as Partial<InventoryGenerationRequest>;
      const target = typeof request.canonicalUri === "string"
        ? decodeMarkdownReferenceUri(request.canonicalUri)
        : undefined;
      return Boolean(target && request.canonicalUri === encodeCanonicalUri(target))
        && typeof request.sourceFingerprint === "string"
        && request.sourceFingerprint.length > 0
        && request.sourceFingerprint.length <= 256
        && Array.isArray(request.evidenceRefs)
        && request.evidenceRefs.length <= 8
        && request.evidenceRefs.every(isInventoryEvidenceRef);
    });
}

function encodeCanonicalUri(target: NonNullable<ReturnType<typeof decodeMarkdownReferenceUri>>): string {
  return encodeMarkdownReferenceUri(target);
}
