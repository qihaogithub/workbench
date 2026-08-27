"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CanvasSaveStatus,
  CanvasState,
  PreviewMode,
} from "@workbench/demo-ui/types";
import { loadCanvasLayout } from "@workbench/demo-ui/canvas-utils";
import { rebaseCanvasState } from "@/lib/canvas-state-rebase";

const DEFAULT_CANVAS_STATE: CanvasState = {
  viewport: { x: 40, y: 40, zoom: 0.5 },
  pages: {},
  pageGroups: {},
  hiddenPageIds: [],
  nodes: {},
  hiddenKnowledgeDocumentIds: [],
};

interface UseCanvasWorkspaceOptions {
  sessionId?: string;
  projectId?: string;
}

/** Viewport pan/zoom is local viewing state, not a canvas content mutation. */
function getCanvasContentSignature(state: CanvasState): string {
  return JSON.stringify({
    pages: state.pages ?? {},
    sections: state.sections ?? {},
    pageGroups: state.pageGroups ?? {},
    hiddenPageIds: state.hiddenPageIds ?? [],
    nodes: state.nodes ?? {},
    layers: state.layers ?? {},
    hiddenKnowledgeDocumentIds: state.hiddenKnowledgeDocumentIds ?? [],
  });
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
  const lastCommittedStateRef = useRef<CanvasState>(DEFAULT_CANVAS_STATE);
  const canvasStateRef = useRef<CanvasState>(DEFAULT_CANVAS_STATE);

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
          canvasStateRef.current = state;
          lastCommittedStateRef.current = state;
          setCanvasState(state);
          lastPersistedRef.current = JSON.stringify(state);
        } else {
          canvasStateRef.current = DEFAULT_CANVAS_STATE;
          lastCommittedStateRef.current = DEFAULT_CANVAS_STATE;
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

  // Yjs-First: canvas layout persistence is handled by the Yjs room
  // (canvasLayoutCollab). The edit page writes to canvasLayoutCollab.ytext
  // and the collab room's debounce flush handles persistence.
  // The HTTP save timer has been removed.

  const flushCanvasState = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    // Yjs-First: just clear local dirty state. Actual persistence is
    // handled by the collab room flush (flushWorkspaceCollab).
    setCanvasPersistenceDirty(false);
  }, [setCanvasPersistenceDirty]);

  const updateCanvasState = useCallback((nextState: CanvasState) => {
    const contentChanged =
      getCanvasContentSignature(canvasStateRef.current) !==
      getCanvasContentSignature(nextState);
    canvasStateRef.current = nextState;
    if (contentChanged) {
      setCanvasPersistenceDirty(true);
      setHasUnsavedCanvasChanges(true);
    }
    setCanvasState(nextState);
  }, [setCanvasPersistenceDirty]);

  const applyRemoteCanvasState = useCallback((nextState: CanvasState) => {
    canvasStateRef.current = nextState;
    lastCommittedStateRef.current = nextState;
    lastPersistedRef.current = JSON.stringify(nextState);
    setCanvasPersistenceDirty(false);
    setHasUnsavedCanvasChanges(false);
    setCanvasState(nextState);
    setSaveStatus("saved");
    setSaveError(undefined);
  }, [setCanvasPersistenceDirty]);

  const rebaseRemoteCanvasState = useCallback((remoteState: CanvasState) => {
    const result = rebaseCanvasState(
      lastCommittedStateRef.current,
      canvasStateRef.current,
      remoteState,
    );
    lastCommittedStateRef.current = remoteState;
    if (result.conflicts.length > 0) {
      return { conflicts: result.conflicts, state: canvasStateRef.current };
    }

    const contentChanged =
      getCanvasContentSignature(result.state) !==
      getCanvasContentSignature(remoteState);
    canvasStateRef.current = result.state;
    setCanvasPersistenceDirty(contentChanged);
    setHasUnsavedCanvasChanges(contentChanged);
    setCanvasState(result.state);
    setSaveStatus(contentChanged ? "idle" : "saved");
    setSaveError(undefined);
    return { conflicts: [], state: result.state };
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
    applyRemoteCanvasState,
    rebaseRemoteCanvasState,
    markCanvasChangesSaved,
  };
}
