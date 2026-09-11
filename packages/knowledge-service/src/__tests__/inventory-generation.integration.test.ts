import { createServer, type Server } from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import {
  PROJECT_INVENTORY_GENERATOR_VERSION,
  PROJECT_INVENTORY_SCHEMA_VERSION,
  type InventoryEntry,
  type InventorySnapshot,
} from "@workbench/shared";
import { InventoryAgentClient } from "../inventory-agent-client.js";
import { SqliteInventoryCatalog } from "../inventory-catalog.js";
import { runInventoryGeneration } from "../inventory-generation.js";
import { normalizeInventoryHuman } from "../shared-runtime.js";

const openCatalogs: SqliteInventoryCatalog[] = [];
const tempDirs: string[] = [];
const servers: Server[] = [];

type ExecutorMode = "success" | "unavailable" | "timeout" | "late-duplicate";

interface ExecutorState {
  mode: ExecutorMode;
  summary: string;
  requests: Array<{ attemptId: string; taskKey: string }>;
}

afterEach(async () => {
  for (const catalog of openCatalogs.splice(0)) catalog.close();
  for (const server of servers.splice(0)) {
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function entry(canonicalUri: string): InventoryEntry {
  return {
    canonicalUri,
    resourceType: "page",
    scope: "local",
    parentUri: "wb://project/p1",
    refreshMode: "auto",
    native: { name: "首页", aliases: ["home"], description: null, metadata: {} },
    generated: null,
    human: normalizeInventoryHuman(undefined),
    sourceState: "active",
    generationState: "pending",
    reviewState: "unreviewed",
  };
}

function snapshot(item: InventoryEntry): InventorySnapshot {
  return {
    schemaVersion: PROJECT_INVENTORY_SCHEMA_VERSION,
    projectId: "p1",
    workspaceRevision: 3,
    workspaceRootHash: "root-3",
    catalogFingerprint: `catalog-${item.canonicalUri}`,
    overlayHash: "overlay-0",
    projectionFingerprint: `projection-${item.canonicalUri}`,
    generatorVersion: PROJECT_INVENTORY_GENERATOR_VERSION,
    builtAt: "2026-09-11T00:00:00.000Z",
    freshness: "fresh",
    entries: [item],
  };
}

function catalog(): SqliteInventoryCatalog {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "inventory-generation-integration-"));
  tempDirs.push(dir);
  const value = new SqliteInventoryCatalog({ dataDir: dir });
  openCatalogs.push(value);
  return value;
}

function publishJob(
  value: SqliteInventoryCatalog,
  name: string,
  sourceFingerprint = `source-${name}`,
): { canonicalUri: string; generationId: number } {
  const canonicalUri = `wb://page/p1/${name}`;
  const generationId = value.publish(snapshot(entry(canonicalUri)));
  value.createGenerationJobs({
    projectId: "p1",
    workspaceId: "w1",
    generationId,
    generatorVersion: PROJECT_INVENTORY_GENERATOR_VERSION,
    requests: [{ canonicalUri, sourceFingerprint, evidenceRefs: [] }],
  });
  return { canonicalUri, generationId };
}

async function readJson(request: import("node:http").IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

async function startExecutor(state: ExecutorState, port?: number): Promise<number> {
  const server = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/internal/inventory/generate") {
      response.statusCode = 404;
      response.end();
      return;
    }
    const body = await readJson(request);
    const attemptId = typeof body.attemptId === "string" ? body.attemptId : "";
    const taskKey = typeof body.taskKey === "string" ? body.taskKey : "";
    state.requests.push({ attemptId, taskKey });

    if (state.mode === "unavailable") {
      response.statusCode = 503;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ success: false, error: { code: "AGENT_UNAVAILABLE" } }));
      return;
    }
    if (state.mode === "timeout") {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    const taskRequests = state.requests.filter((request) => request.taskKey === taskKey);
    if (state.mode === "late-duplicate" && taskRequests.length === 1) {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
    }
    if (!response.destroyed) {
      response.statusCode = 200;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ success: true, data: { summary: state.summary } }));
    }
  });
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port ?? 0, "127.0.0.1", () => resolve());
  });
  return (server.address() as { port: number }).port;
}

async function stopExecutor(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

describe("inventory generation cross-service boundary", () => {
  it("retries unavailable and timeout executions, survives restart/config change, and fences a late duplicate", async () => {
    const value = catalog();
    const state: ExecutorState = { mode: "unavailable", summary: "配置 v1", requests: [] };
    const port = await startExecutor(state);
    const client = new InventoryAgentClient({ baseUrl: `http://127.0.0.1:${port}`, timeoutMs: 100 });
    const run = (options: Parameters<typeof runInventoryGeneration>[3] = {}) => runInventoryGeneration(
      value,
      null,
      { generateJob: ({ entry: resource, job }) => client.generate({ entry: resource, job }) },
      options,
    );

    const unavailable = publishJob(value, "unavailable");
    const first = await run({ random: () => 0 });
    expect(first).toMatchObject({ claimed: 1, retried: 1, ready: 0 });
    expect(value.activeSnapshot("p1")?.entries[0]?.generationState).toBe("pending");

    const firstServer = servers.at(-1)!;
    await stopExecutor(firstServer);
    state.mode = "success";
    state.summary = "配置热更新后的摘要";
    await startExecutor(state, port);
    const recovered = await run({ now: Date.now() + 5_000, random: () => 0 });
    expect(recovered).toMatchObject({ claimed: 1, ready: 1, retried: 0 });
    expect(value.activeSnapshot("p1")?.entries.find((item) => item.canonicalUri === unavailable.canonicalUri)?.generated?.summary)
      .toBe("配置热更新后的摘要");

    const timedOut = publishJob(value, "timeout");
    state.mode = "timeout";
    const timeoutResult = await run({ random: () => 0 });
    expect(timeoutResult).toMatchObject({ claimed: 1, retried: 1, ready: 0 });
    const secondServer = servers.at(-1)!;
    await stopExecutor(secondServer);
    state.mode = "success";
    state.summary = "服务重启后的摘要";
    await startExecutor(state, port);
    const afterTimeoutRestart = await run({ now: Date.now() + 5_000, random: () => 0 });
    expect(afterTimeoutRestart).toMatchObject({ claimed: 1, ready: 1 });
    expect(value.activeSnapshot("p1")?.entries.find((item) => item.canonicalUri === timedOut.canonicalUri)?.generated?.summary)
      .toBe("服务重启后的摘要");

    const late = publishJob(value, "late-duplicate");
    state.mode = "late-duplicate";
    state.summary = "迟到响应不应覆盖新尝试";
    const slowClient = new InventoryAgentClient({ baseUrl: `http://127.0.0.1:${port}`, timeoutMs: 3_000 });
    const runSlow = (options: Parameters<typeof runInventoryGeneration>[3] = {}) => runInventoryGeneration(
      value,
      null,
      { generateJob: ({ entry: resource, job }) => slowClient.generate({ entry: resource, job }) },
      options,
    );
    const firstAttempt = runSlow({ leaseMs: 1_000, random: () => 0 });
    await new Promise((resolve) => setTimeout(resolve, 1_050));
    const secondAttempt = runSlow({ now: Date.now(), leaseMs: 1_000, random: () => 0 });
    const [lateResult, winningResult] = await Promise.all([firstAttempt, secondAttempt]);
    expect(winningResult.ready).toBe(1);
    expect(lateResult.ready).toBe(1);
    const lateRequests = state.requests.filter((request) => request.taskKey.includes(late.generationId.toString()) || request.taskKey.includes("late-duplicate"));
    expect(lateRequests.length).toBe(2);
    expect(lateRequests[0]?.attemptId).not.toBe(lateRequests[1]?.attemptId);
    expect(value.activeSnapshot("p1")?.entries.find((item) => item.canonicalUri === late.canonicalUri)?.generated?.summary)
      .toBe("迟到响应不应覆盖新尝试");
  });
});
