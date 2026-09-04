import fs from "fs";
import os from "os";
import path from "path";

const mockDataDir = fs.mkdtempSync(
  path.join(os.tmpdir(), "editor-diagnostics-retention-"),
);

jest.mock("@/lib/fs-utils", () => ({
  getDataDir: () => mockDataDir,
}));

import { appendServerEditorDiagnosticEvent } from "./store";
import {
  cleanupEditorDiagnosticsRetention,
  EDITOR_DIAGNOSTICS_RETENTION_DAYS,
} from "./retention";

const NOW = Date.parse("2026-09-04T00:00:00.000Z");
const OLD = new Date(
  NOW - (EDITOR_DIAGNOSTICS_RETENTION_DAYS * 24 * 60 * 60 * 1000 + 1_000),
).toISOString();
const FRESH = new Date(NOW - 1_000).toISOString();

describe("editor diagnostics retention", () => {
  beforeEach(() => {
    fs.rmSync(mockDataDir, { recursive: true, force: true });
    fs.mkdirSync(mockDataDir, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(mockDataDir, { recursive: true, force: true });
  });

  it("删除 SQLite 和前端 fallback 的三天前事件，并保留 agent spool", async () => {
    appendServerEditorDiagnosticEvent({
      id: "old-sqlite",
      ts: OLD,
      projectId: "project-1",
      level: "info",
      eventGroup: "system",
      eventType: "old",
    });
    appendServerEditorDiagnosticEvent({
      id: "fresh-sqlite",
      ts: FRESH,
      projectId: "project-1",
      level: "info",
      eventGroup: "system",
      eventType: "fresh",
    });

    const fallbackPath = path.join(
      mockDataDir,
      "editor-diagnostics",
      "editor-session-1.jsonl",
    );
    fs.mkdirSync(path.dirname(fallbackPath), { recursive: true });
    fs.writeFileSync(
      fallbackPath,
      `${JSON.stringify({ ts: OLD, eventType: "old-fallback" })}\n${JSON.stringify({ ts: FRESH, eventType: "fresh-fallback" })}\n`,
    );
    const agentSpoolPath = path.join(
      mockDataDir,
      "editor-diagnostics",
      "agent-service.jsonl",
    );
    fs.writeFileSync(
      agentSpoolPath,
      `${JSON.stringify({ ts: OLD, eventType: "agent-old" })}\n`,
    );

    const result = await cleanupEditorDiagnosticsRetention(mockDataDir, NOW);

    expect(result.sqliteRowsRemoved).toBe(1);
    expect(result.fallbackLinesRemoved).toBe(1);
    expect(fs.readFileSync(fallbackPath, "utf8")).toContain("fresh-fallback");
    expect(fs.readFileSync(fallbackPath, "utf8")).not.toContain("old-fallback");
    expect(fs.readFileSync(agentSpoolPath, "utf8")).toContain("agent-old");
  });
});
