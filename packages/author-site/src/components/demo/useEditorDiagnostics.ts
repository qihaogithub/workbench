"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  EditorDiagnosticCategory,
  EditorDiagnosticContext,
  EditorDiagnosticEvent,
  EditorDiagnosticExport,
  EditorDiagnosticLevel,
} from "@/lib/editor-diagnostics/types";
import { sanitizeDiagnosticDetails } from "@/lib/editor-diagnostics/types";

const MAX_LOCAL_EVENTS = 2000;
const FLUSH_DELAY_MS = 1000;

interface UseEditorDiagnosticsOptions {
  projectId: string;
  sessionId?: string;
  workspaceId?: string;
  activePageId?: string;
  previewMode?: "single" | "canvas";
  getSnapshot?: () => Record<string, unknown>;
}

interface RecordEditorDiagnosticEventInput {
  category: EditorDiagnosticCategory;
  name: string;
  traceId?: string;
  level?: EditorDiagnosticLevel;
  details?: Record<string, unknown>;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function shouldEnableDiagnostics(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("diagnostics") === "1";
}

function downloadJson(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function useEditorDiagnostics({
  projectId,
  sessionId,
  workspaceId,
  activePageId,
  previewMode,
  getSnapshot,
}: UseEditorDiagnosticsOptions) {
  const [enabled, setEnabled] = useState(false);
  const [remoteWriteFailed, setRemoteWriteFailed] = useState(false);
  const editorSessionIdRef = useRef<string>(createId("editor"));
  const eventsRef = useRef<EditorDiagnosticEvent[]>([]);
  const pendingRef = useRef<EditorDiagnosticEvent[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contextRef = useRef<EditorDiagnosticContext>({
    editorSessionId: editorSessionIdRef.current,
    projectId,
    sessionId,
    workspaceId,
    activePageId,
    previewMode,
  });
  const getSnapshotRef = useRef(getSnapshot);
  getSnapshotRef.current = getSnapshot;

  const context = useMemo<EditorDiagnosticContext>(
    () => ({
      editorSessionId: editorSessionIdRef.current,
      projectId,
      sessionId,
      workspaceId,
      activePageId,
      previewMode,
    }),
    [activePageId, previewMode, projectId, sessionId, workspaceId],
  );
  contextRef.current = context;

  const flush = useCallback(async () => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    if (pendingRef.current.length === 0) return;
    const events = pendingRef.current.splice(0, pendingRef.current.length);
    try {
      const response = await fetch("/api/editor-diagnostics/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events }),
        keepalive: events.length <= 20,
      });
      if (!response.ok) {
        setRemoteWriteFailed(true);
        return;
      }
      const result = (await response.json().catch(() => null)) as
        | ApiResponse<{ written: number }>
        | null;
      if (!result?.success) {
        setRemoteWriteFailed(true);
        return;
      }
      setRemoteWriteFailed(false);
    } catch {
      setRemoteWriteFailed(true);
    }
  }, []);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current) return;
    flushTimerRef.current = setTimeout(() => {
      void flush();
    }, FLUSH_DELAY_MS);
  }, [flush]);

  const recordEvent = useCallback(
    ({ category, name, traceId, level = "info", details }: RecordEditorDiagnosticEventInput) => {
      const event: EditorDiagnosticEvent = {
        ...contextRef.current,
        id: createId("evt"),
        timestamp: Date.now(),
        category,
        name,
        traceId,
        level,
        details: sanitizeDiagnosticDetails(details),
      };

      eventsRef.current.push(event);
      if (eventsRef.current.length > MAX_LOCAL_EVENTS) {
        eventsRef.current = eventsRef.current.slice(-MAX_LOCAL_EVENTS);
      }
      pendingRef.current.push(event);
      scheduleFlush();
    },
    [scheduleFlush],
  );

  const createTraceId = useCallback((scope = "trace") => createId(scope), []);

  const exportDiagnostics = useCallback(async () => {
    await flush();
    const response = await fetch(
      `/api/editor-diagnostics/export?editorSessionId=${encodeURIComponent(
        editorSessionIdRef.current,
      )}`,
    );
    const result = (await response.json().catch(() => null)) as
      | ApiResponse<EditorDiagnosticExport>
      | null;
    if (!response.ok || !result?.success || !result.data) {
      throw new Error(result?.error?.message || "导出编辑页诊断包失败");
    }

    const payload: EditorDiagnosticExport = {
      ...result.data,
      localEvents: eventsRef.current,
      snapshot: getSnapshotRef.current?.(),
      warnings: remoteWriteFailed
        ? [...result.data.warnings, "前端检测到部分诊断事件后端写入失败，已包含本地缓冲事件"]
        : result.data.warnings,
    };
    downloadJson(
      `editor-diagnostics-${editorSessionIdRef.current}.json`,
      payload,
    );
  }, [flush, remoteWriteFailed]);

  useEffect(() => {
    setEnabled(shouldEnableDiagnostics());
  }, []);

  useEffect(() => {
    recordEvent({
      category: "system",
      name: "editor_diagnostics.started",
      details: { enabled: shouldEnableDiagnostics() },
    });
    return () => {
      void flush();
    };
  }, [flush, recordEvent]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey !== true) return;
      if (event.key.toLowerCase() !== "d") return;
      event.preventDefault();
      setEnabled(true);
      recordEvent({
        category: "ui",
        name: "diagnostics_export_shortcut",
      });
      void exportDiagnostics();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [exportDiagnostics, recordEvent]);

  return {
    editorSessionId: editorSessionIdRef.current,
    diagnosticsEnabled: enabled,
    remoteWriteFailed,
    recordEvent,
    createTraceId,
    exportDiagnostics,
    getLocalEvents: () => eventsRef.current,
  };
}
