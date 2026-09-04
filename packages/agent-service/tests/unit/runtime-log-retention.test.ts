import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  cleanupAgentRuntimeLogs,
  RUNTIME_LOG_RETENTION_DAYS,
} from "../../src/session/runtime-log-retention";

const roots: string[] = [];
const NOW = Date.parse("2026-09-04T00:00:00.000Z");
const OLD = new Date(
  NOW - (RUNTIME_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000 + 1_000),
).toISOString();
const FRESH = new Date(NOW - 1_000).toISOString();

function writeJsonl(filePath: string, records: unknown[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
    "utf8",
  );
}

afterEach(() => {
  while (roots.length)
    fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("runtime log retention", () => {
  it("清理三天前的运行日志，但保留新日志和用户项目素材", async () => {
    const dataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "runtime-log-retention-"),
    );
    roots.push(dataDir);
    const runLog = path.join(
      dataDir,
      "agent-run-logs",
      "session-1",
      "message-1.jsonl",
    );
    writeJsonl(runLog, [
      { timestamp: OLD, eventType: "run_start" },
      { timestamp: FRESH, eventType: "finish" },
    ]);
    const diagnosticLog = path.join(
      dataDir,
      "editor-diagnostics",
      "agent-service.jsonl",
    );
    writeJsonl(diagnosticLog, [
      { ts: OLD, eventType: "old" },
      { ts: FRESH, eventType: "fresh" },
    ]);
    const projectAsset = path.join(
      dataDir,
      "projects",
      "project-1",
      "workspace",
      "assets",
      "video.mp4",
    );
    fs.mkdirSync(path.dirname(projectAsset), { recursive: true });
    fs.writeFileSync(projectAsset, "user asset");

    const result = await cleanupAgentRuntimeLogs(dataDir, NOW);

    expect(result.runLogLinesRemoved).toBe(1);
    expect(result.diagnosticLinesRemoved).toBe(1);
    expect(fs.readFileSync(runLog, "utf8")).toContain('"eventType":"finish"');
    expect(fs.readFileSync(runLog, "utf8")).not.toContain(
      '"eventType":"run_start"',
    );
    expect(fs.readFileSync(diagnosticLog, "utf8")).toContain(
      '"eventType":"fresh"',
    );
    expect(fs.existsSync(projectAsset)).toBe(true);
    expect(fs.readFileSync(projectAsset, "utf8")).toBe("user asset");
  });

  it("Authority 存在未完成事务时跳过 journal，恢复后才清理", async () => {
    const dataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "authority-log-retention-"),
    );
    roots.push(dataDir);
    const authorityDir = path.join(
      dataDir,
      "workspace-authority",
      "workspace-1",
    );
    const journal = path.join(authorityDir, "journal.jsonl");
    writeJsonl(journal, [
      { at: NOW - 10 * 24 * 60 * 60 * 1000, type: "committed" },
      { at: NOW, type: "committed" },
    ]);
    writeJsonl(path.join(authorityDir, "projection-acks.jsonl"), [
      { acknowledgedAt: NOW - 10 * 24 * 60 * 60 * 1000 },
      { acknowledgedAt: NOW },
    ]);
    const prepared = path.join(authorityDir, "prepared", "pending.json");
    writeJsonl(prepared, [{ pending: true }]);

    const skipped = await cleanupAgentRuntimeLogs(dataDir, NOW);
    expect(skipped.authority).toEqual([
      expect.objectContaining({ skippedPrepared: true }),
    ]);
    expect(fs.readFileSync(journal, "utf8")).toContain("committed");

    fs.rmSync(prepared);
    const cleaned = await cleanupAgentRuntimeLogs(dataDir, NOW);
    expect(cleaned.authority).toEqual([
      expect.objectContaining({
        journalEntriesRemoved: 1,
        projectionAckEntriesRemoved: 1,
        skippedPrepared: false,
      }),
    ]);
    expect(fs.readFileSync(journal, "utf8")).toContain(`"at":${NOW}`);
  });
});
