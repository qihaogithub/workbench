import fs from "fs";
import path from "path";

import { getDataDir } from "@/lib/fs-utils";
import {
  type EditorDiagnosticAgentRunLogIndex,
  type EditorDiagnosticEvent,
  type EditorDiagnosticExport,
  isValidEditorSessionId,
  sanitizeDiagnosticEvent,
} from "./types";

const MAX_LOG_FILE_BYTES = 5 * 1024 * 1024;
const TRIM_TO_BYTES = 4 * 1024 * 1024;

function getDiagnosticsDir(): string {
  return path.join(getDataDir(), "editor-diagnostics");
}

function getDiagnosticsPath(editorSessionId: string): string {
  if (!isValidEditorSessionId(editorSessionId)) {
    throw new Error("INVALID_EDITOR_SESSION_ID");
  }
  return path.join(getDiagnosticsDir(), `${editorSessionId}.jsonl`);
}

async function ensureDiagnosticsDir(): Promise<void> {
  await fs.promises.mkdir(getDiagnosticsDir(), { recursive: true });
}

async function trimIfNeeded(filePath: string, appendBytes: number): Promise<void> {
  const stat = await fs.promises.stat(filePath).catch(() => null);
  if (!stat || stat.size + appendBytes <= MAX_LOG_FILE_BYTES) return;

  const current = await fs.promises.readFile(filePath, "utf8");
  const lines = current.trimEnd().split("\n");
  const kept: string[] = [];
  let size = 0;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    const lineBytes = Buffer.byteLength(`${line}\n`);
    if (size + lineBytes > TRIM_TO_BYTES) break;
    kept.unshift(line);
    size += lineBytes;
  }
  await fs.promises.writeFile(filePath, `${kept.join("\n")}\n`, "utf8");
}

export async function appendEditorDiagnosticEvents(
  events: EditorDiagnosticEvent[],
): Promise<{ written: number; editorSessionId: string }> {
  if (events.length === 0) {
    throw new Error("NO_EVENTS");
  }

  const editorSessionId = events[0].editorSessionId;
  if (!isValidEditorSessionId(editorSessionId)) {
    throw new Error("INVALID_EDITOR_SESSION_ID");
  }
  if (events.some((event) => event.editorSessionId !== editorSessionId)) {
    throw new Error("MIXED_EDITOR_SESSION_ID");
  }

  const sanitized = events.map(sanitizeDiagnosticEvent);
  const payload = sanitized.map((event) => JSON.stringify(event)).join("\n") + "\n";
  const filePath = getDiagnosticsPath(editorSessionId);

  await ensureDiagnosticsDir();
  await trimIfNeeded(filePath, Buffer.byteLength(payload));
  await fs.promises.appendFile(filePath, payload, "utf8");

  return { written: sanitized.length, editorSessionId };
}

export async function readEditorDiagnosticEvents(
  editorSessionId: string,
): Promise<EditorDiagnosticEvent[]> {
  const filePath = getDiagnosticsPath(editorSessionId);
  const content = await fs.promises.readFile(filePath, "utf8").catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  });
  if (!content.trim()) return [];

  const events: EditorDiagnosticEvent[] = [];
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line) as EditorDiagnosticEvent);
    } catch {
      events.push({
        id: `invalid-${events.length}`,
        editorSessionId,
        projectId: "unknown",
        timestamp: Date.now(),
        category: "system",
        name: "diagnostic.invalid_jsonl_line",
        level: "warn",
      });
    }
  }
  return events;
}

async function listAgentRunLogs(
  sessionIds: string[],
): Promise<EditorDiagnosticAgentRunLogIndex[]> {
  const root = path.join(getDataDir(), "agent-run-logs");
  const result: EditorDiagnosticAgentRunLogIndex[] = [];
  for (const sessionId of sessionIds) {
    if (!/^[a-zA-Z0-9._:-]{1,160}$/.test(sessionId)) continue;
    const dir = path.join(root, sessionId);
    const entries = await fs.promises.readdir(dir).catch(() => []);
    const messageIds = entries
      .filter((entry) => entry.endsWith(".jsonl"))
      .map((entry) => entry.replace(/\.jsonl$/, ""))
      .sort();
    if (messageIds.length > 0) {
      result.push({ sessionId, messageIds });
    }
  }
  return result;
}

export async function buildEditorDiagnosticExport(
  editorSessionId: string,
): Promise<EditorDiagnosticExport> {
  if (!isValidEditorSessionId(editorSessionId)) {
    throw new Error("INVALID_EDITOR_SESSION_ID");
  }
  const events = await readEditorDiagnosticEvents(editorSessionId);
  const sessionIds = Array.from(
    new Set(events.map((event) => event.sessionId).filter(Boolean) as string[]),
  );

  return {
    editorSessionId,
    exportedAt: Date.now(),
    events,
    agentRunLogs: await listAgentRunLogs(sessionIds),
    warnings: events.length === 0 ? ["未找到后端诊断事件"] : [],
  };
}
