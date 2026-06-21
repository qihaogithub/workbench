"use client";

import { useState, useCallback, useEffect, useRef } from "react";

const POLL_INTERVAL = 1500;
const MAX_POLL_DURATION_MS = 60_000;
const MAX_POLL_FAILURES = 3;

export interface PageScreenshotState {
  screenshotUrl?: string;
  hash?: string;
  expectedHash?: string;
  loading: boolean;
  error?: string;
}

interface UseScreenshotGenerationOptions {
  projectId?: string;
  sessionId?: string;
  enabled?: boolean;
}

interface BatchPageInput {
  pageId: string;
  code: string;
  configData: Record<string, unknown>;
  width?: number;
  height?: number;
  fullPage?: boolean;
}

interface BatchResult {
  pageId: string;
  url?: string;
  hash?: string;
  status: "pending" | "rendering" | "done" | "failed";
  error?: string;
}

function isServiceUnavailable(result: unknown): boolean {
  if (!result || typeof result !== "object") return false;
  const error = (result as { error?: { code?: string } }).error;
  return error?.code === "SCREENSHOT_SERVICE_UNAVAILABLE";
}

export function useScreenshotGeneration(
  options: UseScreenshotGenerationOptions,
) {
  const { projectId, sessionId, enabled = true } = options;

  const [pageScreenshots, setPageScreenshots] = useState<
    Record<string, PageScreenshotState>
  >({});
  const [batchId, setBatchId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [serviceAvailable, setServiceAvailable] = useState<boolean | null>(
    null,
  );
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const batchIdRef = useRef<string | null>(null);
  const pollStartedAtRef = useRef<number | null>(null);
  const pollFailuresRef = useRef(0);
  const pageRequestVersionsRef = useRef<Record<string, number>>({});

  const getScreenshotUrl = useCallback(
    (pageId: string, hash?: string) => {
      if (!projectId) return "";
      const base = `/api/screenshots/file/${encodeURIComponent(
        projectId,
      )}/${encodeURIComponent(pageId)}`;
      return hash ? `${base}?hash=${encodeURIComponent(hash)}` : base;
    },
    [projectId],
  );

  const setPagesLoading = useCallback((pages: BatchPageInput[]) => {
    setPageScreenshots((prev) => {
      const next = { ...prev };
      for (const page of pages) {
        const existing = next[page.pageId];
        next[page.pageId] = {
          screenshotUrl: existing?.screenshotUrl,
          hash: existing?.hash,
          expectedHash: existing?.expectedHash,
          loading: true,
        };
      }
      return next;
    });
  }, []);

  const setPagesUnavailable = useCallback((pages: BatchPageInput[]) => {
    setServiceAvailable(false);
    setPageScreenshots((prev) => {
      const next = { ...prev };
      for (const page of pages) {
        const existing = next[page.pageId];
        next[page.pageId] = {
          screenshotUrl: existing?.screenshotUrl,
          hash: existing?.hash,
          expectedHash: existing?.expectedHash,
          loading: false,
          error: "截图服务不可达",
        };
      }
      return next;
    });
  }, []);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    pollStartedAtRef.current = null;
    pollFailuresRef.current = 0;
    setIsGenerating(false);
  }, []);

  const cancelBatch = useCallback(
    async (targetBatchId?: string | null) => {
      const id = targetBatchId || batchIdRef.current;
      if (!projectId || !id) return;

      await fetch(
        `/api/screenshots/cancel/${encodeURIComponent(
          projectId,
        )}/${encodeURIComponent(id)}`,
        { method: "POST" },
      ).catch(() => {});
    },
    [projectId],
  );

  const markPollingFailure = useCallback(() => {
    pollFailuresRef.current += 1;
    if (pollFailuresRef.current >= MAX_POLL_FAILURES) {
      stopPolling();
      setServiceAvailable(false);
    }
  }, [stopPolling]);

  const checkServiceHealth = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch("/api/screenshots/health", {
        cache: "no-store",
      });
      const result = await response.json();
      const available = response.ok && result.success;
      setServiceAvailable(available);
      return available;
    } catch {
      setServiceAvailable(false);
      return false;
    }
  }, []);

  const pollBatchStatus = useCallback(
    async (currentBatchId: string) => {
      if (!projectId) return;
      if (batchIdRef.current !== currentBatchId) return;

      if (
        pollStartedAtRef.current &&
        Date.now() - pollStartedAtRef.current > MAX_POLL_DURATION_MS
      ) {
        stopPolling();
        setServiceAvailable(false);
        return;
      }

      try {
        const response = await fetch(
          `/api/screenshots/status/${encodeURIComponent(
            projectId,
          )}/${encodeURIComponent(currentBatchId)}`,
        );
        if (!response.ok) {
          markPollingFailure();
          return;
        }

        const result = await response.json();
        if (batchIdRef.current !== currentBatchId) return;

        if (!result.success) {
          markPollingFailure();
          return;
        }

        pollFailuresRef.current = 0;
        setServiceAvailable(true);
        const { data } = result;
        const statusResults = Array.isArray(data.results)
          ? (data.results as BatchResult[])
          : [];

        for (const pageResult of statusResults) {
          if (pageResult.status === "done" && pageResult.url && pageResult.hash) {
            setPageScreenshots((prev) => {
              const existing = prev[pageResult.pageId];
              if (
                existing?.expectedHash &&
                existing.expectedHash !== pageResult.hash
              ) {
                return prev;
              }

              return {
                ...prev,
                [pageResult.pageId]: {
                  screenshotUrl: getScreenshotUrl(
                    pageResult.pageId,
                    pageResult.hash,
                  ),
                  hash: pageResult.hash,
                  expectedHash: pageResult.hash,
                  loading: false,
                },
              };
            });
          } else if (pageResult.status === "failed") {
            setPageScreenshots((prev) => {
              const existing = prev[pageResult.pageId];
              if (
                pageResult.hash &&
                existing?.expectedHash &&
                existing.expectedHash !== pageResult.hash
              ) {
                return prev;
              }

              return {
                ...prev,
                [pageResult.pageId]: {
                  screenshotUrl: existing?.screenshotUrl,
                  hash: existing?.hash,
                  expectedHash: existing?.expectedHash,
                  loading: false,
                  error: pageResult.error || "截图生成失败",
                },
              };
            });
          }
        }

        if (data.status === "completed" || data.cancelled) {
          stopPolling();
        }
      } catch {
        markPollingFailure();
      }
    },
    [projectId, getScreenshotUrl, markPollingFailure, stopPolling],
  );

  const startBatchGeneration = useCallback(
    async (pages: BatchPageInput[]) => {
      if (!projectId || !enabled || pages.length === 0) return;

      if (batchIdRef.current) {
        await cancelBatch(batchIdRef.current);
      }
      stopPolling();
      setPagesLoading(pages);
      setIsGenerating(true);

      try {
        const response = await fetch("/api/screenshots/generate-batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            pages: pages.map((p) => ({
              pageId: p.pageId,
              code: p.code,
              configData: p.configData || {},
              width: p.width,
              height: p.height,
              fullPage: p.fullPage,
            })),
            sessionId,
          }),
        });

        const result = await response.json();

        if (result.success && result.data?.batchId) {
          setServiceAvailable(true);
          const newBatchId = result.data.batchId;
          batchIdRef.current = newBatchId;
          setBatchId(newBatchId);
          pollStartedAtRef.current = Date.now();
          pollFailuresRef.current = 0;

          const batchResults = Array.isArray(result.data.results)
            ? (result.data.results as BatchResult[])
            : [];
          setPageScreenshots((prev) => {
            const next = { ...prev };
            for (const pageResult of batchResults) {
              if (!pageResult.hash) continue;
              const existing = next[pageResult.pageId];
              next[pageResult.pageId] = {
                screenshotUrl: existing?.screenshotUrl,
                hash: existing?.hash,
                expectedHash: pageResult.hash,
                loading: true,
              };
            }
            return next;
          });

          if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
          }
          pollTimerRef.current = setInterval(
            () => pollBatchStatus(newBatchId),
            POLL_INTERVAL,
          );

          pollBatchStatus(newBatchId);
        } else {
          stopPolling();
          if (isServiceUnavailable(result)) {
            setPagesUnavailable(pages);
            return;
          }

          const errorMessage = result.error?.message || "批量截图创建失败";
          setPageScreenshots((prev) => {
            const next = { ...prev };
            for (const page of pages) {
              const existing = next[page.pageId];
              next[page.pageId] = {
                screenshotUrl: existing?.screenshotUrl,
                hash: existing?.hash,
                expectedHash: existing?.expectedHash,
                loading: false,
                error: errorMessage,
              };
            }
            return next;
          });
        }
      } catch {
        stopPolling();
        setPagesUnavailable(pages);
      }
    },
    [
      projectId,
      sessionId,
      enabled,
      pollBatchStatus,
      cancelBatch,
      stopPolling,
      setPagesLoading,
      setPagesUnavailable,
    ],
  );

  const regeneratePage = useCallback(
    async (
      pageId: string,
      code: string,
      configData: Record<string, unknown>,
      width?: number,
      height?: number,
    ) => {
      if (!projectId || !enabled) return;

      const requestVersion =
        (pageRequestVersionsRef.current[pageId] || 0) + 1;
      pageRequestVersionsRef.current[pageId] = requestVersion;

      setPageScreenshots((prev) => {
        const existing = prev[pageId];
        return {
          ...prev,
          [pageId]: {
            screenshotUrl: existing?.screenshotUrl,
            hash: existing?.hash,
            expectedHash: existing?.expectedHash,
            loading: true,
          },
        };
      });

      try {
        const response = await fetch("/api/screenshots/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            pageId,
            code,
            configData: configData || {},
            width,
            height,
            sessionId,
          }),
        });

        const result = await response.json();
        if (pageRequestVersionsRef.current[pageId] !== requestVersion) return;

        if (result.success && result.data?.url && result.data?.hash) {
          setServiceAvailable(true);
          setPageScreenshots((prev) => ({
            ...prev,
            [pageId]: {
              screenshotUrl: getScreenshotUrl(pageId, result.data.hash),
              hash: result.data.hash,
              expectedHash: result.data.hash,
              loading: false,
            },
          }));
        } else {
          if (isServiceUnavailable(result)) {
            setServiceAvailable(false);
          }

          setPageScreenshots((prev) => {
            const existing = prev[pageId];
            return {
              ...prev,
              [pageId]: {
                screenshotUrl: existing?.screenshotUrl,
                hash: existing?.hash,
                expectedHash: existing?.expectedHash,
                loading: false,
                error: result.error?.message || "截图生成失败",
              },
            };
          });
        }
      } catch {
        if (pageRequestVersionsRef.current[pageId] !== requestVersion) return;
        setServiceAvailable(false);
        setPageScreenshots((prev) => {
          const existing = prev[pageId];
          return {
            ...prev,
            [pageId]: {
              screenshotUrl: existing?.screenshotUrl,
              hash: existing?.hash,
              expectedHash: existing?.expectedHash,
              loading: false,
              error: "截图服务不可达",
            },
          };
        });
      }
    },
    [projectId, sessionId, enabled, getScreenshotUrl],
  );

  useEffect(() => {
    checkServiceHealth();
  }, [checkServiceHealth]);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      pollStartedAtRef.current = null;
      pollFailuresRef.current = 0;
      void cancelBatch(batchIdRef.current);
    };
  }, [cancelBatch]);

  return {
    pageScreenshots,
    isGenerating,
    batchId,
    serviceAvailable,
    checkServiceHealth,
    startBatchGeneration,
    regeneratePage,
    getScreenshotUrl,
  };
}
