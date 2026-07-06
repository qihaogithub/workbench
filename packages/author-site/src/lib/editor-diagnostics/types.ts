export type {
  EditorDiagnosticEvent as NormalizedEditorDiagnosticEvent,
  EditorDiagnosticEventGroup as EditorDiagnosticCategory,
  EditorDiagnosticLevel,
  EditorDiagnosticQueryDiagnostics,
  EditorDiagnosticQueryResult,
  LegacyEditorDiagnosticContext as EditorDiagnosticContext,
  LegacyEditorDiagnosticEvent as EditorDiagnosticEvent,
} from "@workbench/shared";

export {
  createEditorDiagnosticEvent,
  isValidEditorSessionId,
  normalizeEditorDiagnosticEvent,
  sanitizeDiagnosticDetails,
  sanitizeLegacyEditorDiagnosticEvent as sanitizeDiagnosticEvent,
} from "@workbench/shared";

export interface EditorDiagnosticAgentRunLogIndex {
  sessionId: string;
  messageIds: string[];
}

export interface EditorDiagnosticExport {
  editorSessionId: string;
  exportedAt: number;
  events: Array<
    | import("@workbench/shared").LegacyEditorDiagnosticEvent
    | import("@workbench/shared").EditorDiagnosticEvent
  >;
  normalizedEvents: import("@workbench/shared").EditorDiagnosticEvent[];
  fallbackEvents?: import("@workbench/shared").LegacyEditorDiagnosticEvent[];
  localEvents?: import("@workbench/shared").LegacyEditorDiagnosticEvent[];
  snapshot?: Record<string, unknown>;
  agentRunLogs: EditorDiagnosticAgentRunLogIndex[];
  diagnostics: import("@workbench/shared").EditorDiagnosticQueryDiagnostics;
  warnings: string[];
}
