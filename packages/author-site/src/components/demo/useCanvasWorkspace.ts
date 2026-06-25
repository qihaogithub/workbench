"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CanvasSaveStatus,
  CanvasState,
  PreviewMode,
} from "@opencode-workbench/shared/demo";
import {
  loadCanvasLayout,
  saveCanvasLayout,
} from "@opencode-workbench/shared/demo";

const DEFAULT_CANVAS_STATE: CanvasState = {
  viewport: { x: 40, y: 40, zoom: 0.5 },
  pages: {},
  nodes: {},
};

const SAVE_DELAY = 700;

interface UseCanvasWorkspaceOptions {
  sessionId?: string;
  projectId?: string;
}

export function useCanvasWorkspace({
  sessionId,
  projectId,
}: UseCanvasWorkspaceOptions) {
  const [previewMode, setPreviewMode] = useState<PreviewMode>("single");
  const [canvasState, setCanvasState] =
    useState<CanvasState>(DEFAULT_CANVAS_STATE);
  const [canvasEditingPageId, setCanvasEditingPageId] = useState<string | null>(
    null,
  );
  const [focusCanvasPageId, setFocusCanvasPageId] = useState<string>();
  const [saveStatus, setSaveStatus] = useState<CanvasSaveStatus>("idle");
  const [saveError, setSaveError] = useState<string>();
  const [hasUnsavedCanvasChanges, setHasUnsavedCanvasChanges] = useState(false);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  const lastPersistedRef = useRef("");

  const setCanvasPersistenceDirty = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
  }, []);

  useEffect(() => {
    if (focusCanvasPageId) {
      const timer = setTimeout(() => setFocusCanvasPageId(undefined), 100);
      return () => clearTimeout(timer);
    }
  }, [focusCanvasPageId]);

  useEffect(() => {
    if (previewMode === "canvas") {
      setCanvasEditingPageId(null);
    }
  }, [previewMode]);

  useEffect(() => {
    if (!sessionId) return;

    const currentSessionId = sessionId;
    let cancelled = false;

    async function loadLayout() {
      setSaveStatus("loading");
      setSaveError(undefined);
      try {
        const state = await loadCanvasLayout(currentSessionId);
        if (cancelled) return;

        if (state) {
          setCanvasState(state);
          lastPersistedRef.current = JSON.stringify(state);
        } else {
          setCanvasState(DEFAULT_CANVAS_STATE);
          lastPersistedRef.current = "";
        }
        setCanvasPersistenceDirty(false);
        setHasUnsavedCanvasChanges(false);
        setSaveStatus("idle");
      } catch (error) {
        if (cancelled) return;
        console.warn("[canvas] 加载画布布局失败", {
          sessionId: currentSessionId,
          error,
        });
        setSaveStatus("error");
        setSaveError(error instanceof Error ? error.message : "加载画布布局失败");
      }
    }

    loadLayout();

    return () => {
      cancelled = true;
    };
  }, [sessionId, setCanvasPersistenceDirty]);

  useEffect(() => {
    if (!sessionId || !projectId || !dirtyRef.current) return;

    const currentSessionId = sessionId;
    const currentProjectId = projectId;
    const serialized = JSON.stringify(canvasState);
    if (serialized === lastPersistedRef.current) {
      setCanvasPersistenceDirty(false);
      return;
    }

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    setSaveStatus("saving");
    setSaveError(undefined);

    saveTimerRef.current = setTimeout(async () => {
      try {
        await saveCanvasLayout(currentSessionId, currentProjectId, canvasState);
        lastPersistedRef.current = serialized;
        setCanvasPersistenceDirty(false);
        setSaveStatus("saved");
      } catch (error) {
        console.warn("[canvas] 保存画布布局失败", {
          sessionId: currentSessionId,
          projectId: currentProjectId,
          error,
        });
        setSaveStatus("error");
        setSaveError(error instanceof Error ? error.message : "保存画布布局失败");
      }
    }, SAVE_DELAY);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [canvasState, projectId, sessionId, setCanvasPersistenceDirty]);

  const flushCanvasState = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    if (!sessionId || !projectId) return;

    const serialized = JSON.stringify(canvasState);
    if (serialized === lastPersistedRef.current && !dirtyRef.current) {
      setCanvasPersistenceDirty(false);
      return;
    }

    setSaveStatus("saving");
    setSaveError(undefined);

    try {
      await saveCanvasLayout(sessionId, projectId, canvasState);
      lastPersistedRef.current = serialized;
      setCanvasPersistenceDirty(false);
      setSaveStatus("saved");
    } catch (error) {
      console.warn("[canvas] 保存画布布局失败", {
        sessionId,
        projectId,
        error,
      });
      setSaveStatus("error");
      setSaveError(error instanceof Error ? error.message : "保存画布布局失败");
      throw error;
    }
  }, [canvasState, projectId, sessionId, setCanvasPersistenceDirty]);

  const updateCanvasState = useCallback((nextState: CanvasState) => {
    setCanvasPersistenceDirty(true);
    setHasUnsavedCanvasChanges(true);
    setCanvasState(nextState);
  }, [setCanvasPersistenceDirty]);

  const markCanvasChangesSaved = useCallback(() => {
    setHasUnsavedCanvasChanges(false);
  }, []);

  const focusCanvasPage = useCallback((pageId: string) => {
    setFocusCanvasPageId(pageId);
    setCanvasEditingPageId(pageId);
  }, []);

  const clearCanvasSelection = useCallback(() => {
    setCanvasEditingPageId(null);
  }, []);

  return {
    previewMode,
    setPreviewMode,
    canvasState,
    setCanvasState: updateCanvasState,
    canvasEditingPageId,
    setCanvasEditingPageId,
    focusCanvasPageId,
    setFocusCanvasPageId,
    focusCanvasPage,
    clearCanvasSelection,
    flushCanvasState,
    saveStatus,
    saveError,
    hasUnsavedCanvasChanges,
    markCanvasChangesSaved,
  };
}
