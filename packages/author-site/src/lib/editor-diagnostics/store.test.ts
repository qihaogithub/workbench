import fs from "fs";
import os from "os";
import path from "path";

const mockDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "editor-diagnostics-"));

jest.mock("@/lib/fs-utils", () => ({
  getDataDir: () => mockDataDir,
}));

import {
  appendEditorDiagnosticEvents,
  buildEditorDiagnosticExport,
  queryEditorDiagnosticEvents,
  readEditorDiagnosticEvents,
} from "./store";

describe("editor diagnostics store", () => {
  beforeEach(() => {
    fs.rmSync(mockDataDir, { recursive: true, force: true });
    fs.mkdirSync(mockDataDir, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(mockDataDir, { recursive: true, force: true });
  });

  it("SQLite 写入成功时保留 editor-session JSONL 镜像，并按 editorSessionId 导出", async () => {
    await appendEditorDiagnosticEvents([
      {
        id: "evt-1",
        editorSessionId: "editor-session-1",
        projectId: "project-1",
        sessionId: "session-1",
        timestamp: 1,
        category: "autosave",
        name: "autosave.flush_started",
        details: {
          token: "secret",
          revision: 1,
        },
      },
    ]);

    const events = await readEditorDiagnosticEvents("editor-session-1");
    expect(events).toHaveLength(1);

    const queried = await queryEditorDiagnosticEvents({
      editorSessionId: "editor-session-1",
    });
    expect(queried.diagnostics.sqliteUsed).toBe(true);
    expect(queried.events).toEqual([
      expect.objectContaining({
        schemaVersion: 1,
        eventGroup: "autosave",
        eventType: "autosave.flush_started",
        editorSessionId: "editor-session-1",
        payload: {
          token: "[redacted]",
          revision: 1,
        },
      }),
    ]);

    fs.mkdirSync(path.join(mockDataDir, "agent-run-logs", "session-1"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(mockDataDir, "agent-run-logs", "session-1", "msg-1.jsonl"),
      "{}\n",
    );

    const exported = await buildEditorDiagnosticExport("editor-session-1");
    expect(exported.events).toHaveLength(1);
    expect(exported.normalizedEvents).toHaveLength(1);
    expect(exported.fallbackEvents).toBeUndefined();
    expect(exported.diagnostics.sqliteUsed).toBe(true);
    expect(exported.agentRunLogs).toEqual([
      {
        sessionId: "session-1",
        messageIds: ["msg-1"],
      },
    ]);
  });

  it("SQLite 写入失败时创建 JSONL spool，并在查询中标记 fallback", async () => {
    fs.writeFileSync(path.join(mockDataDir, "diagnostics"), "not-a-directory");

    const result = await appendEditorDiagnosticEvents([
      {
        id: "evt-fallback-1",
        editorSessionId: "editor-session-fallback",
        projectId: "project-1",
        sessionId: "session-1",
        timestamp: 1,
        category: "autosave",
        name: "autosave.flush_failed",
        level: "error",
        details: {
          token: "secret",
          revision: 2,
        },
      },
    ]);

    expect(result.sqliteWritten).toBe(0);
    expect(result.diagnostics).toEqual(
      expect.objectContaining({
        sqliteUsed: false,
        jsonlFallbackUsed: true,
        dbUnavailable: true,
        eventGapDetected: true,
      }),
    );

    const fallbackEvents = await readEditorDiagnosticEvents("editor-session-fallback");
    expect(fallbackEvents).toHaveLength(1);
    expect(fallbackEvents[0].details).toEqual({
      token: "[redacted]",
      revision: 2,
    });

    const queried = await queryEditorDiagnosticEvents({
      editorSessionId: "editor-session-fallback",
    });
    expect(queried.diagnostics).toEqual(
      expect.objectContaining({
        sqliteUsed: false,
        jsonlFallbackUsed: true,
        dbUnavailable: true,
        eventGapDetected: true,
      }),
    );
    expect(queried.events).toEqual([
      expect.objectContaining({
        eventType: "autosave.flush_failed",
        payload: {
          token: "[redacted]",
          revision: 2,
        },
      }),
    ]);
  });

  it("隔离损坏的 SQLite 主库，重建后仍明确报告历史缺口", async () => {
    const diagnosticsDir = path.join(mockDataDir, "diagnostics");
    fs.mkdirSync(diagnosticsDir, { recursive: true });
    fs.writeFileSync(path.join(diagnosticsDir, "editor-events.db"), "not-a-sqlite-database");

    const result = await appendEditorDiagnosticEvents([
      {
        id: "evt-after-recovery",
        editorSessionId: "editor-session-recovery",
        projectId: "project-1",
        timestamp: 1,
        category: "system",
        name: "diagnostic.after_recovery",
      },
    ]);

    expect(result.sqliteWritten).toBe(1);
    expect(result.diagnostics).toEqual(
      expect.objectContaining({
        sqliteUsed: true,
        jsonlFallbackUsed: false,
        dbUnavailable: false,
        eventGapDetected: true,
      }),
    );
    expect(result.diagnostics.warnings.join(" ")).toContain("已隔离原库");

    const quarantineRoot = path.join(diagnosticsDir, "quarantine");
    const quarantineEntries = fs.readdirSync(quarantineRoot);
    expect(quarantineEntries).toHaveLength(1);
    expect(
      fs.readFileSync(
        path.join(quarantineRoot, quarantineEntries[0], "editor-events.db"),
        "utf8",
      ),
    ).toBe("not-a-sqlite-database");

    const queried = await queryEditorDiagnosticEvents({
      editorSessionId: "editor-session-recovery",
    });
    expect(queried.diagnostics.sqliteUsed).toBe(true);
    expect(queried.diagnostics.eventGapDetected).toBe(true);
    expect(queried.diagnostics.warnings.join(" ")).toContain("曾发生损坏");
    expect(queried.events).toEqual([
      expect.objectContaining({ eventType: "diagnostic.after_recovery" }),
    ]);
  });

  it("拒绝混合 editorSessionId 的批量写入", async () => {
    await expect(
      appendEditorDiagnosticEvents([
        {
          id: "evt-1",
          editorSessionId: "editor-session-2",
          projectId: "project-1",
          timestamp: 1,
          category: "system",
          name: "one",
        },
        {
          id: "evt-2",
          editorSessionId: "editor-session-3",
          projectId: "project-1",
          timestamp: 2,
          category: "system",
          name: "two",
        },
      ]),
    ).rejects.toThrow("MIXED_EDITOR_SESSION_ID");
  });
});
