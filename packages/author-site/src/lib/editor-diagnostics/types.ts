export type {
  EditorDiagnosticEvent as NormalizedEditorDiagnosticEvent,
  EditorDiagnosticEventGroup as EditorDiagnosticCategory,
  EditorDiagnosticLevel,
  EditorDiagnosticQueryDiagnostics,
  EditorDiagnosticQueryResult,
  LegacyEditorDiagnosticContext as EditorDiagnosticContext,
  LegacyEditorDiagnosticEvent as EditorDiagnosticEvent,
} from "@opencode-workbench/shared";

export {
  createEditorDiagnosticEvent,
  isValidEditorSessionId,
  normalizeEditorDiagnosticEvent,
  sanitizeDiagnosticDetails,
  sanitizeLegacyEditorDiagnosticEvent as sanitizeDiagnosticEvent,
} from "@opencode-workbench/shared";

export interface EditorDiagnosticAgentRunLogIndex {
  sessionId: string;
  messageIds: string[];
}

export interface EditorDiagnosticExport {
  editorSessionId: string;
  exportedAt: number;
  events: Array<
    | import("@opencode-workbench/shared").LegacyEditorDiagnosticEvent
    | import("@opencode-workbench/shared").EditorDiagnosticEvent
  >;
  normalizedEvents: import("@opencode-workbench/shared").EditorDiagnosticEvent[];
  fallbackEvents?: import("@opencode-workbench/shared").LegacyEditorDiagnosticEvent[];
  localEvents?: import("@opencode-workbench/shared").LegacyEditorDiagnosticEvent[];
  snapshot?: Record<string, unknown>;
  agentRunLogs: EditorDiagnosticAgentRunLogIndex[];
  diagnostics: import("@opencode-workbench/shared").EditorDiagnosticQueryDiagnostics;
  warnings: string[];
}
