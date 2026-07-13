import fs from "node:fs";
import path from "node:path";

import { createEditorDiagnosticEvent } from "@workbench/shared";
import type { WorkspaceMutationActor } from "@workbench/shared/contracts";

export const WORKSPACE_AUTHORITY_SYSTEM_SESSION_ID = "workspace-authority";

export function appendWorkspaceProjectionDiagnostic(input: {
  dataDir: string;
  projectId: string;
  workspaceId: string;
  sessionId?: string;
  eventType:
    | "workspace.projection_applied"
    | "workspace.projection_gap_detected"
    | "workspace.projection_failed";
  operationId: string;
  level?: "info" | "warn" | "error";
  revision: number;
  currentRevision: number;
  mutationId?: string;
  clientId: string;
  surface: string;
  errorCode?: string;
  acknowledgedAt: number;
  projectionLatencyMs?: number;
}): void {
  try {
    const event = createEditorDiagnosticEvent({
      id: `workspace-${input.workspaceId}-${input.operationId}-${input.eventType}-${Date.now()}`,
      source: "agent-service",
      level: input.level ?? "info",
      eventGroup: "workspace",
      eventType: input.eventType,
      projectId: input.projectId,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId ?? WORKSPACE_AUTHORITY_SYSTEM_SESSION_ID,
      operationId: input.operationId,
      traceId: input.mutationId ?? input.operationId,
      message: input.eventType,
      payload: {
        mutationId: input.mutationId,
        revision: input.revision,
        currentRevision: input.currentRevision,
        clientId: input.clientId,
        surface: input.surface,
        errorCode: input.errorCode,
        acknowledgedAt: input.acknowledgedAt,
        projectionLatencyMs: input.projectionLatencyMs,
      },
    });
    const filePath = path.join(input.dataDir, "editor-diagnostics", "agent-service.jsonl");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.appendFileSync(filePath, `${JSON.stringify(event)}\n`, "utf-8");
  } catch {
    // Projection diagnostics never change the durable ack or mutation result.
  }
}

export function appendWorkspaceAuthorityDiagnostic(input: {
  dataDir: string;
  projectId: string;
  workspaceId: string;
  eventType:
    | "workspace.mutation_received"
    | "workspace.mutation_prepared"
    | "workspace.mutation_committed"
    | "workspace.mutation_conflicted"
    | "workspace.mutation_rolled_back"
    | "workspace.mutation_recovered"
    | "workspace.external_drift_detected";
  mutationId: string;
  sessionId?: string;
  baseRevision: number;
  revision: number | null;
  actor: WorkspaceMutationActor;
  resourcePaths: string[];
  durationMs: number;
  level?: "info" | "warn" | "error";
  message: string;
  payload?: Record<string, unknown>;
}): void {
  try {
    const traceId = input.mutationId;
    const event = createEditorDiagnosticEvent({
      id: `workspace-${input.workspaceId}-${input.mutationId}-${Date.now()}`,
      source: "agent-service",
      level: input.level ?? "warn",
      eventGroup: "workspace",
      eventType: input.eventType,
      projectId: input.projectId,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId ?? WORKSPACE_AUTHORITY_SYSTEM_SESSION_ID,
      operationId: input.mutationId,
      traceId,
      message: input.message,
      payload: {
        ...input.payload,
        mutationId: input.mutationId,
        baseRevision: input.baseRevision,
        revision: input.revision,
        actor: input.actor,
        resourcePaths: [...new Set(input.resourcePaths)].sort(),
        traceId,
        durationMs: Math.max(0, input.durationMs),
      },
    });
    const filePath = path.join(input.dataDir, "editor-diagnostics", "agent-service.jsonl");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.appendFileSync(filePath, `${JSON.stringify(event)}\n`, "utf-8");
  } catch {
    // Authority state/journal/receipt remain authoritative when the diagnostic spool is unavailable.
  }
}
