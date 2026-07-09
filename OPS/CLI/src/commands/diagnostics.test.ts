import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import {
  applyFilters,
  formatDiagnosticFailureDetails,
  readSqliteEvents,
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
