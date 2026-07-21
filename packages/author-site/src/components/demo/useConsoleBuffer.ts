"use client";

import { useRef, useCallback, useEffect } from "react";
import type { StreamService } from "@workbench/ai-chat-shared";
import type { ConsoleLogPayload } from "@workbench/demo-ui";

const MAX_ENTRIES = 500;
const FLUSH_INTERVAL = 100; // 100ms throttling

export function useConsoleBuffer(
  streamServiceRef: React.RefObject<StreamService | null>,
) {
  const bufferRef = useRef<ConsoleLogPayload[]>([]);
  const pendingRef = useRef<ConsoleLogPayload[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (pendingRef.current.length === 0) return;
    const entries = pendingRef.current;
    pendingRef.current = [];
    timerRef.current = null;

    // Append to local buffer
    bufferRef.current.push(...entries);
    if (bufferRef.current.length > MAX_ENTRIES) {
      bufferRef.current = bufferRef.current.slice(-MAX_ENTRIES);
    }

    // Forward to agent-service via StreamService
    const ws = (streamServiceRef.current as any)?.ws;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "console_data",
          entries,
        }),
      );
    }
  }, [streamServiceRef]);

  const handleConsoleEntry = useCallback(
    (entry: ConsoleLogPayload) => {
      if (entry.args.includes('"source":"preview-runtime"')) {
        try {
          console.info("[PreviewRuntime]", JSON.parse(entry.args));
        } catch {
          console.info("[PreviewRuntime]", entry.args);
        }
      }
      pendingRef.current.push(entry);
      if (!timerRef.current) {
        timerRef.current = setTimeout(flush, FLUSH_INTERVAL);
      }
    },
    [flush],
  );

  const clearBuffer = useCallback(() => {
    bufferRef.current = [];
    pendingRef.current = [];
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => () => clearBuffer(), [clearBuffer]);

  return { handleConsoleEntry, clearBuffer };
}
