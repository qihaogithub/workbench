import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import {
  applyFilters,
  buildDiagnosticsResult,
  buildWorkspaceFlows,
  formatDiagnosticFailureDetails,
  readSqliteEvents,
  summarizeDiagnosticPerformance,
} from "./diagnostics.js";

function makeDataDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "workbench-cli-diagnostics-"));
}

function createDiagnosticsDb(dataDir: string): Database.Database {
  const diagnosticsDir = path.join(dataDir, "diagnostics");
  fs.mkdirSync(diagnosticsDir, { recursive: true });
  const db = new Database(path.join(diagnosticsDir, "editor-events.db"));
  db.exec(`
    CREATE TABLE editor_events (
      id TEXT PRIMARY KEY,
      ts TEXT NOT NULL,
      schema_version INTEGER NOT NULL,
      source TEXT NOT NULL,
      level TEXT NOT NULL,
      event_group TEXT NOT NULL,
      event_type TEXT NOT NULL,
      project_id TEXT,
      session_id TEXT,
      workspace_id TEXT,
      editor_session_id TEXT,
      trace_id TEXT,
      operation_id TEXT,
      page_id TEXT,
      resource_path TEXT,
      message TEXT,
      payload_json TEXT NOT NULL
    );
  `);
  return db;
}

function insertEvent(
  db: Database.Database,
  input: {
    id: string;
    group: string;
    type: string;
    ts?: string;
    payload?: Record<string, unknown>;
  },
): void {
  db.prepare(`
    INSERT INTO editor_events (
      id,
      ts,
      schema_version,
      source,
      level,
      event_group,
      event_type,
      project_id,
      session_id,
      workspace_id,
      editor_session_id,
      trace_id,
      operation_id,
      page_id,
      resource_path,
      message,
      payload_json
    ) VALUES (
      @id,
      @ts,
      1,
      'frontend',
      'info',
      @group,
      @type,
      'project-1',
      'session-1',
      'workspace-1',
      'editor-1',
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      @payloadJson
    )
  `).run({
    id: input.id,
    ts: input.ts ?? "2026-07-09T00:00:00.000Z",
    group: input.group,
    type: input.type,
    payloadJson: JSON.stringify(input.payload ?? {}),
  });
}

test("readSqliteEvents filters by event group", () => {
  const dataDir = makeDataDir();
  try {
    const db = createDiagnosticsDb(dataDir);
    try {
      insertEvent(db, {
        id: "autosave-1",
        group: "autosave",
        type: "autosave.flush_failed",
      });
      insertEvent(db, {
        id: "collab-1",
        group: "collab",
        type: "collab.status_snapshot",
      });
    } finally {
      db.close();
    }

    const result = readSqliteEvents(dataDir, {
      project: "project-1",
      group: "autosave",
    }, 20);

    assert.equal(result.dbMissing, false);
    assert.deepEqual(
      result.events.map((event) => event.eventType),
      ["autosave.flush_failed"],
    );
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("applyFilters uses the same group filtering for JSONL fallback events", () => {
  const events = [
    {
      id: "autosave-1",
      schemaVersion: 1,
      ts: "2026-07-09T00:00:00.000Z",
      source: "frontend" as const,
      level: "error" as const,
      eventGroup: "autosave" as const,
      eventType: "autosave.flush_failed",
      projectId: "project-1",
      payload: {},
    },
    {
      id: "collab-1",
      schemaVersion: 1,
      ts: "2026-07-09T00:00:01.000Z",
      source: "frontend" as const,
      level: "warn" as const,
      eventGroup: "collab" as const,
      eventType: "collab.status_snapshot",
      projectId: "project-1",
      payload: {},
    },
  ];

  const filtered = applyFilters(events, {
    project: "project-1",
    group: "autosave",
  }, 20);

  assert.deepEqual(
    filtered.map((event) => event.eventType),
    ["autosave.flush_failed"],
  );
});

test("SQLite and JSONL filters support the same multi-group workspace flow scope", () => {
  const dataDir = makeDataDir();
  try {
    const db = createDiagnosticsDb(dataDir);
    try {
      insertEvent(db, { id: "autosave", group: "autosave", type: "autosave.flush_started", ts: "2026-07-09T00:00:00.000Z" });
      insertEvent(db, { id: "workspace", group: "workspace", type: "workspace.mutation_committed", ts: "2026-07-09T00:00:01.000Z" });
      insertEvent(db, { id: "preview", group: "preview", type: "preview.content_loaded", ts: "2026-07-09T00:00:02.000Z" });
      insertEvent(db, { id: "ui", group: "ui", type: "ui.changed", ts: "2026-07-09T00:00:03.000Z" });
    } finally {
      db.close();
    }
    const groups = "autosave,collab,preview,workspace";
    const sqlite = readSqliteEvents(dataDir, { project: "project-1", groups }, 20);
    assert.deepEqual(sqlite.events.map((event) => event.id), ["autosave", "workspace", "preview"]);
    const filtered = applyFilters([
      ...sqlite.events,
      {
        id: "ui-jsonl", schemaVersion: 1, ts: "2026-07-09T00:00:04.000Z",
        source: "frontend" as const, level: "info" as const, eventGroup: "ui" as const,
        eventType: "ui.changed", projectId: "project-1", payload: {},
      },
    ], { project: "project-1", groups }, 20);
    assert.deepEqual(filtered.map((event) => event.id), ["autosave", "workspace", "preview"]);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("workspace flows correlate mutation projection and canonical events by revision", () => {
  const base = {
    schemaVersion: 1,
    source: "agent-service" as const,
    level: "info" as const,
    eventGroup: "workspace" as const,
    projectId: "project-1",
    workspaceId: "workspace-1",
  };
  const flows = buildWorkspaceFlows([
    { ...base, id: "received", ts: "2026-07-09T00:00:00.000Z", eventType: "workspace.mutation_received", traceId: "mutation-1", payload: { mutationId: "mutation-1", revision: null } },
    { ...base, id: "committed", ts: "2026-07-09T00:00:01.000Z", eventType: "workspace.mutation_committed", traceId: "mutation-1", payload: { mutationId: "mutation-1", revision: 2 } },
    { ...base, id: "projection", ts: "2026-07-09T00:00:02.000Z", eventType: "workspace.projection_applied", traceId: "mutation-1", payload: { mutationId: "mutation-1", revision: 2 } },
    { ...base, source: "author-api" as const, id: "canonical", ts: "2026-07-09T00:00:03.000Z", eventType: "workspace.canonical_materialization_succeeded", traceId: "canonical:project-1:workspace-1:2", payload: { revision: 2 } },
  ]);
  assert.equal(flows.length, 1);
  assert.deepEqual(flows[0], {
    workspaceId: "workspace-1",
    revision: 2,
    mutationIds: ["mutation-1"],
    traceIds: ["mutation-1", "canonical:project-1:workspace-1:2"],
    eventIds: ["received", "committed", "projection", "canonical"],
    eventTypes: [
      "workspace.mutation_received",
      "workspace.mutation_committed",
      "workspace.projection_applied",
      "workspace.canonical_materialization_succeeded",
    ],
    startedAt: "2026-07-09T00:00:00.000Z",
    completedAt: "2026-07-09T00:00:03.000Z",
    status: "canonical_succeeded",
  });
});

test("performance summary emits stable p50 p95 p99 fields for every WMA metric", () => {
  const metricPayloads = [10, 20, 30].map((value, index) => ({
    id: `metric-${index}`,
    schemaVersion: 1,
    ts: `2026-07-09T00:00:0${index}.000Z`,
    source: "agent-service" as const,
    level: "info" as const,
    eventGroup: "workspace" as const,
    eventType: "workspace.mutation_committed",
    workspaceId: "workspace-1",
    payload: {
      queueWaitMs: value,
      commitLatencyMs: value * 2,
      remoteUpdateLatencyMs: value * 3,
      draftPreviewLatencyMs: value * 4,
      projectionLatencyMs: value * 5,
      reconnectConvergenceMs: value * 6,
    },
  }));
  const summary = summarizeDiagnosticPerformance([
    ...metricPayloads,
    {
      ...metricPayloads[0], id: "debounce", eventGroup: "autosave", eventType: "autosave.flush_debounced",
      payload: { delayMs: 800 },
    },
  ]);
  assert.deepEqual(summary.metrics.queueWait, {
    count: 3, min: 10, p50: 20, p95: 30, p99: 30, max: 30, average: 20,
  });
  assert.equal(summary.metrics.autosaveDebounceWait.p50, 800);
  assert.equal(summary.metrics.commitLatency.p95, 60);
  assert.equal(summary.metrics.remoteUpdateLatency.p95, 90);
  assert.equal(summary.metrics.draftPreviewLatency.p95, 120);
  assert.equal(summary.metrics.projectionLatency.p95, 150);
  assert.equal(summary.metrics.reconnectConvergence.p95, 180);
  assert.equal(summary.metrics.canonicalLag.count, 0);
});

test("export merges SQLite canonical events with agent-service JSONL mutation spool", () => {
  const dataDir = makeDataDir();
  try {
    const db = createDiagnosticsDb(dataDir);
    try {
      insertEvent(db, {
        id: "canonical",
        group: "workspace",
        type: "workspace.canonical_materialization_succeeded",
        ts: "2026-07-09T00:00:03.000Z",
        payload: { revision: 2, rootHash: "root-2", durationMs: 40 },
      });
    } finally {
      db.close();
    }
    const jsonlDir = path.join(dataDir, "editor-diagnostics");
    fs.mkdirSync(jsonlDir, { recursive: true });
    fs.writeFileSync(path.join(jsonlDir, "agent-service.jsonl"), `${JSON.stringify({
      id: "committed",
      schemaVersion: 1,
      ts: "2026-07-09T00:00:01.000Z",
      source: "agent-service",
      level: "info",
      eventGroup: "workspace",
      eventType: "workspace.mutation_committed",
      projectId: "project-1",
      sessionId: "session-1",
      workspaceId: "workspace-1",
      traceId: "mutation-1",
      operationId: "mutation-1",
      payload: { mutationId: "mutation-1", revision: 2, queueWaitMs: 5, commitLatencyMs: 25 },
    })}\n`);

    const result = buildDiagnosticsResult("export", { dataDir }, { project: "project-1" });
    assert.deepEqual(result.events.map((event) => event.id), ["committed", "canonical"]);
    assert.equal(result.workspaceFlows[0]?.status, "canonical_succeeded");
    assert.equal(result.performance.metrics.canonicalLag.p50, 2000);
    assert.equal(result.diagnostics.jsonlFallbackUsed, true);
    assert.equal(result.diagnostics.eventGapDetected, false);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("formatDiagnosticFailureDetails includes sync failure summary fields", () => {
  const summary = formatDiagnosticFailureDetails({
    id: "evt-1",
    schemaVersion: 1,
    ts: "2026-07-09T00:00:00.000Z",
    source: "frontend",
    level: "error",
    eventGroup: "autosave",
    eventType: "autosave.exit_flush_failed",
    projectId: "project-1",
    sessionId: "session-1",
    workspaceId: "workspace-1",
    pageId: "page-1",
    payload: {
      phase: "persist-workspace",
      errorCode: "WORKSPACE_STALE",
      httpStatus: 409,
    },
  });

  assert.equal(
    summary,
    " workspace=workspace-1 page=page-1 phase=persist-workspace code=WORKSPACE_STALE status=409",
  );
});
