import fs from "node:fs";
import path from "node:path";
import "./bootstrap-env.js";
import Fastify from "fastify";
import { resolveDataDir } from "@workbench/runtime-config/paths";
import { resolveSecrets } from "@workbench/runtime-config/secrets";
import type { InventoryQuery } from "@workbench/shared";

import {
  SqliteKnowledgeCatalog,
  reconcileTemplateProjects,
} from "./sqlite-catalog.js";
import { SqliteInventoryCatalog, type InventoryGenerationRequest } from "./inventory-catalog.js";
import { runInventoryGeneration, type InventoryGenerationRunResult } from "./inventory-generation.js";
import { InventoryAgentClient } from "./inventory-agent-client.js";
import { inspectDatabaseIntegrity, prepareKnowledgeDatabase, readLatestKnowledgeDatabaseRecovery } from "./database-lifecycle.js";
import {
  decodeMarkdownReferenceUri,
  encodeMarkdownReferenceUri,
  isInventoryEvidenceRef,
  isInventorySnapshot,
  PROJECT_INVENTORY_GENERATOR_VERSION,
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
  workspaceId?: unknown;
  generationId?: unknown;
  generatorVersion?: unknown;
  requests?: unknown;
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
const inventoryWorkerIntervalMs = numberEnv(
  "KNOWLEDGE_INVENTORY_WORKER_INTERVAL_MS",
  5_000,
);
const inventoryWorkerBatchSize = numberEnv(
  "KNOWLEDGE_INVENTORY_WORKER_BATCH_SIZE",
  4,
);
const internalToken = process.env.INTERNAL_API_TOKEN?.trim();

const app = Fastify({ logger: true });
const databaseRecovery = prepareKnowledgeDatabase({ dataDir }) ?? readLatestKnowledgeDatabaseRecovery(dataDir);
const catalog = new SqliteKnowledgeCatalog({ dataDir });
const inventoryCatalog = new SqliteInventoryCatalog({ dataDir, databasePath: catalog.databasePath });
const inventoryAgentClient = new InventoryAgentClient({ internalToken });
let reconciling = false;
let generatingInventory = false;
let lastInventoryGenerationAt: number | null = null;
let lastInventoryGenerationError: string | null = null;
let lastInventoryGeneration: InventoryGenerationRunResult | null = null;
let inventoryGenerationPromise: Promise<void> | null = null;
let lastReconcileAt: number | null = null;
let lastReconcileError: string | null = null;
let lastBackupAt: number | null = null;
let lastBackupError: string | null = null;

function integrityState(): { knowledge: boolean; inventory: boolean } {
  try {
    return { knowledge: catalog.integrityCheck(), inventory: inventoryCatalog.integrityCheck() };
  } catch {
    return { knowledge: false, inventory: false };
  }
}

function recoveryStatus() {
  return databaseRecovery ? {
    recoveredAt: databaseRecovery.recoveredAt,
    quarantinePath: databaseRecovery.quarantinePath,
    movedFiles: databaseRecovery.movedFiles.map((filePath) => path.basename(filePath)),
    integrityOk: databaseRecovery.integrity?.ok ?? false,
    error: databaseRecovery.error,
  } : null;
}

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
    const integrity = inspectDatabaseIntegrity(destinationPath);
    if (!integrity.ok) {
      const quarantineDir = path.join(backupDir, "quarantine");
      fs.mkdirSync(quarantineDir, { recursive: true });
      const quarantinedPath = path.join(quarantineDir, path.basename(destinationPath));
      fs.renameSync(destinationPath, quarantinedPath);
      fs.writeFileSync(`${quarantinedPath}.json`, `${JSON.stringify({ quarantinedAt: new Date().toISOString(), integrity }, null, 2)}\n`, "utf8");
      throw new Error("KNOWLEDGE_BACKUP_INTEGRITY_FAILED");
    }
    lastBackupAt = Date.now();
    lastBackupError = null;
    pruneBackups(backupDir, backupRetentionDays);
    return destinationPath;
  } catch (error) {
    lastBackupError = error instanceof Error ? error.message : String(error);
    throw error;
  }
}

async function generateInventory(): Promise<void> {
  if (generatingInventory) return;
  generatingInventory = true;
  const run = runInventoryGeneration(
    inventoryCatalog,
    null,
    {
      generateJob: ({ entry, job }) => inventoryAgentClient.generate({ entry, job }),
    },
    {
      limit: inventoryWorkerBatchSize,
      owner: `knowledge-worker:${process.pid}`,
    },
  );
  inventoryGenerationPromise = run.then((result) => {
    lastInventoryGenerationAt = Date.now();
    lastInventoryGenerationError = null;
    lastInventoryGeneration = result;
  }).catch((error) => {
    lastInventoryGenerationError = error instanceof Error ? error.message : String(error);
    app.log.error({ error }, "inventory generation worker failed");
  }).finally(() => {
    generatingInventory = false;
    inventoryGenerationPromise = null;
  });
  await inventoryGenerationPromise;
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

app.get("/health", async () => {
  const integrity = integrityState();
  return {
  status: lastReconcileError || lastBackupError || lastInventoryGenerationError || !integrity.knowledge || !integrity.inventory ? "degraded" : "ok",
  timestamp: new Date().toISOString(),
  integrity,
  reconcile: { running: reconciling, lastAt: lastReconcileAt, lastError: lastReconcileError },
  backup: { lastAt: lastBackupAt, lastError: lastBackupError },
  recovery: recoveryStatus(),
  generationWorker: {
    running: generatingInventory,
    lastAt: lastInventoryGenerationAt,
    lastError: lastInventoryGenerationError,
    lastRun: lastInventoryGeneration,
  },
  lastReconcileAt,
  lastReconcileError,
  lastBackupAt,
  lastBackupError,
  lastInventoryGenerationAt,
  lastInventoryGenerationError,
  inventoryGeneration: lastInventoryGeneration,
  stats: catalog.stats(),
  };
});

app.get("/api/knowledge/status", async () => {
  const integrity = integrityState();
  return {
  success: true,
  data: {
    stats: catalog.stats(),
    lastReconcileAt,
    lastReconcileError,
    lastBackupAt,
    lastBackupError,
    lastInventoryGenerationAt,
    lastInventoryGenerationError,
    inventoryGeneration: lastInventoryGeneration,
    integrityOk: integrity.knowledge,
    inventoryIntegrityOk: integrity.inventory,
    recovery: recoveryStatus(),
    reconcileRunning: reconciling,
    inventoryGenerationRunning: generatingInventory,
  },
  };
});

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

app.get("/api/inventory/status", async () => {
  const integrity = integrityState();
  return {
  success: true,
  data: {
    stats: inventoryCatalog.stats(),
    integrityOk: integrity.inventory,
    recovery: recoveryStatus(),
    reconcile: { running: reconciling, lastAt: lastReconcileAt, lastError: lastReconcileError },
    backup: { lastAt: lastBackupAt, lastError: lastBackupError },
    generationWorker: { running: generatingInventory, lastAt: lastInventoryGenerationAt, lastError: lastInventoryGenerationError, lastRun: lastInventoryGeneration },
  },
  };
});

app.get<{ Querystring: { projectId?: string } }>("/api/inventory/snapshot", async (request, reply) => {
  if (!request.query.projectId) return reply.code(400).send({ success: false, error: { code: "INVALID_REQUEST", message: "projectId 无效" } });
  const snapshot = inventoryCatalog.activeSnapshot(request.query.projectId);
  if (!snapshot) return reply.code(404).send({ success: false, error: { code: "INVENTORY_NOT_FOUND", message: "清单不存在" } });
  return { success: true, data: { snapshot, generationActivity: inventoryCatalog.generationActivity(request.query.projectId) } };
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
    if (typeof request.body?.projectId !== "string" || !request.body.projectId || request.body.projectId.length > 256
      || typeof request.body.workspaceId !== "string" || !request.body.workspaceId || request.body.workspaceId.length > 256
      || !Number.isSafeInteger(request.body.generationId) || (request.body.generationId as number) < 1
      || !isInventoryGenerationRequests(request.body.requests)) {
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
    const inserted = inventoryCatalog.createGenerationJobs({
      projectId: request.body.projectId,
      workspaceId: request.body.workspaceId,
      generationId: request.body.generationId as number,
      requests,
      generatorVersion,
    });
    return { success: true, data: { inserted } };
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
const inventoryWorkerTimer = setInterval(() => {
  void generateInventory();
}, inventoryWorkerIntervalMs);
inventoryWorkerTimer.unref();

const shutdown = async (): Promise<void> => {
  clearInterval(timer);
  clearInterval(backupTimer);
  clearInterval(inventoryWorkerTimer);
  await inventoryGenerationPromise;
  await app.close();
  inventoryCatalog.close();
  catalog.close();
};
process.once("SIGINT", () => void shutdown().finally(() => process.exit(0)));
process.once("SIGTERM", () => void shutdown().finally(() => process.exit(0)));

async function start(): Promise<void> {
  await app.listen({ port, host });
  void reconcile().catch((error) => {
    app.log.error({ error }, "initial knowledge reconcile failed");
  });
  void generateInventory();
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
