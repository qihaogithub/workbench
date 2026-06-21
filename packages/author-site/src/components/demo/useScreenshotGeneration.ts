"use client";

import { useState, useCallback, useEffect, useRef } from "react";

const POLL_INTERVAL = 1500;

export interface PageScreenshotState {
  screenshotUrl?: string;
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

  const getScreenshotUrl = useCallback(
    (pageId: string, timestamp?: number) => {
      if (!projectId) return "";
      const t = timestamp || Date.now();
      return `/api/screenshots/file/${encodeURIComponent(
        projectId,
      )}/${encodeURIComponent(pageId)}?t=${t}`;
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
          loading: false,
          error: "截图服务不可达",
        };
      }
      return next;
    });
  }, []);

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

      try {
        const response = await fetch(
          `/api/screenshots/status/${encodeURIComponent(
            projectId,
          )}/${encodeURIComponent(currentBatchId)}`,
        );
        if (!response.ok) return;

        const result = await response.json();
        if (!result.success) return;

        setServiceAvailable(true);
        const { data } = result;

        for (const pageResult of data.results) {
          if (pageResult.status === "done" && pageResult.url) {
            setPageScreenshots((prev) => ({
              ...prev,
              [pageResult.pageId]: {
                screenshotUrl: getScreenshotUrl(pageResult.pageId),
                loading: false,
              },
            }));
          } else if (pageResult.status === "failed") {
            setPageScreenshots((prev) => {
              const existing = prev[pageResult.pageId];
              return {
                ...prev,
                [pageResult.pageId]: {
                  screenshotUrl: existing?.screenshotUrl,
                  loading: false,
                  error: pageResult.error || "截图生成失败",
                },
              };
            });
          }
        }

        if (data.status === "completed") {
          if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
          }
          setIsGenerating(false);
        }
      } catch {
        // Polling errors are retried on the next interval.
      }
    },
    [projectId, getScreenshotUrl],
  );

  const startBatchGeneration = useCallback(
    async (pages: BatchPageInput[]) => {
      if (!projectId || !enabled || pages.length === 0) return;

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
            })),
            sessionId,
          }),
        });

        const result = await response.json();

        if (result.success && result.data?.batchId) {
          setServiceAvailable(true);
          const newBatchId = result.data.batchId;
          setBatchId(newBatchId);

          if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
          }
          pollTimerRef.current = setInterval(
            () => pollBatchStatus(newBatchId),
            POLL_INTERVAL,
          );

          pollBatchStatus(newBatchId);
        } else {
          setIsGenerating(false);
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
                loading: false,
                error: errorMessage,
              };
            }
            return next;
          });
        }
      } catch {
        setIsGenerating(false);
        setPagesUnavailable(pages);
      }
    },
    [
      projectId,
      sessionId,
      enabled,
      pollBatchStatus,
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

      setPageScreenshots((prev) => {
        const existing = prev[pageId];
        return {
          ...prev,
          [pageId]: {
            screenshotUrl: existing?.screenshotUrl,
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

        if (result.success && result.data?.url) {
          setServiceAvailable(true);
          setPageScreenshots((prev) => ({
            ...prev,
            [pageId]: {
              screenshotUrl: getScreenshotUrl(pageId, Date.now()),
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
                loading: false,
                error: result.error?.message || "截图生成失败",
              },
            };
          });
        }
      } catch {
        setServiceAvailable(false);
        setPageScreenshots((prev) => {
          const existing = prev[pageId];
          return {
            ...prev,
            [pageId]: {
              screenshotUrl: existing?.screenshotUrl,
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
      }
    };
  }, []);

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

