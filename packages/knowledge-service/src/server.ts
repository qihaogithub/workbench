import fs from "node:fs";
import path from "node:path";

import Fastify from "fastify";

import {
  SqliteKnowledgeCatalog,
  reconcileTemplateProjects,
} from "./sqlite-catalog.js";

interface SearchBody {
  query?: unknown;
  currentProjectId?: unknown;
  limit?: unknown;
}

interface ReadBody {
  sourceRef?: unknown;
}

const port = numberEnv("PORT", 3203);
const host = process.env.HOST ?? "0.0.0.0";
const dataDir = path.resolve(process.env.DATA_DIR ?? "data");
const reconcileIntervalMs = numberEnv(
  "KNOWLEDGE_RECONCILE_INTERVAL_MS",
  5_000,
);
const backupIntervalMs = numberEnv(
  "KNOWLEDGE_BACKUP_INTERVAL_MS",
  24 * 60 * 60 * 1_000,
);
const backupRetentionDays = numberEnv("KNOWLEDGE_BACKUP_RETENTION_DAYS", 7);
const internalToken = process.env.INTERNAL_API_TOKEN?.trim();

const app = Fastify({ logger: true });
const catalog = new SqliteKnowledgeCatalog({ dataDir });
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
