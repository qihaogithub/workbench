"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface EditorCommand {
  label: string;
  undo: () => Promise<void> | void;
  redo: () => Promise<void> | void;
}

interface UseCommandHistoryOptions {
  onError?: (error: unknown, command: EditorCommand, phase: "undo" | "redo") => void;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest("input,textarea,select,[contenteditable='true']") ||
      target.isContentEditable,
  );
}

export function shouldIgnoreGlobalUndoRedoEvent(event: KeyboardEvent): boolean {
  if (isEditableTarget(event.target)) return true;
  if (event.defaultPrevented) return true;
  const key = event.key.toLowerCase();
  if (key !== "z" && key !== "y") return true;
  return !(event.metaKey || event.ctrlKey);
}

export function useCommandHistory(options: UseCommandHistoryOptions = {}) {
  const undoStackRef = useRef<EditorCommand[]>([]);
  const redoStackRef = useRef<EditorCommand[]>([]);
  const onErrorRef = useRef(options.onError);
  onErrorRef.current = options.onError;
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);
  const [running, setRunning] = useState(false);

  const syncCounts = useCallback(() => {
    setUndoCount(undoStackRef.current.length);
    setRedoCount(redoStackRef.current.length);
  }, []);

  const recordCommand = useCallback(
    (command: EditorCommand) => {
      undoStackRef.current.push(command);
      redoStackRef.current = [];
      syncCounts();
    },
    [syncCounts],
  );

  const executeCommand = useCallback(
    async (command: EditorCommand) => {
      if (running) return;
      setRunning(true);
      try {
        await command.redo();
        undoStackRef.current.push(command);
        redoStackRef.current = [];
        syncCounts();
      } catch (error) {
        onErrorRef.current?.(error, command, "redo");
        throw error;
      } finally {
        setRunning(false);
      }
    },
    [running, syncCounts],
  );

  const undo = useCallback(async () => {
    if (running) return;
    const command = undoStackRef.current.pop();
    if (!command) return;
    setRunning(true);
    try {
      await command.undo();
      redoStackRef.current.push(command);
      syncCounts();
    } catch (error) {
      undoStackRef.current.push(command);
      syncCounts();
      onErrorRef.current?.(error, command, "undo");
    } finally {
      setRunning(false);
    }
  }, [running, syncCounts]);

  const redo = useCallback(async () => {
    if (running) return;
    const command = redoStackRef.current.pop();
    if (!command) return;
    setRunning(true);
    try {
      await command.redo();
      undoStackRef.current.push(command);
      syncCounts();
    } catch (error) {
      redoStackRef.current.push(command);
      syncCounts();
      onErrorRef.current?.(error, command, "redo");
    } finally {
      setRunning(false);
    }
  }, [running, syncCounts]);

  const reset = useCallback(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    syncCounts();
  }, [syncCounts]);

  const bindKeyboardShortcuts = useCallback(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (shouldIgnoreGlobalUndoRedoEvent(event)) return;
      const key = event.key.toLowerCase();
      const wantsUndo = key === "z" && !event.shiftKey;
      const wantsRedo = key === "y" || (key === "z" && event.shiftKey);
      if (!wantsUndo && !wantsRedo) return;
      event.preventDefault();
      void (wantsUndo ? undo() : redo());
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [redo, undo]);

  return useMemo(
    () => ({
      canUndo: undoCount > 0 && !running,
      canRedo: redoCount > 0 && !running,
      running,
      executeCommand,
      recordCommand,
      undo,
      redo,
      reset,
      bindKeyboardShortcuts,
    }),
    [
      bindKeyboardShortcuts,
      executeCommand,
      recordCommand,
      redo,
      redoCount,
      reset,
      running,
      undo,
      undoCount,
    ],
  );
}
