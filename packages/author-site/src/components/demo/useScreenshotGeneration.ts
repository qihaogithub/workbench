"use client";

import { useState, useCallback, useEffect, useRef } from "react";

const SCREENSHOT_SERVICE_URL =
  process.env.NEXT_PUBLIC_SCREENSHOT_SERVICE_URL || "http://localhost:3202";

const POLL_INTERVAL = 1500;

interface ScreenshotInfo {
  url: string;
  hash: string;
  elapsed: number;
  cached: boolean;
}

interface PageScreenshotState {
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

export function useScreenshotGeneration(
  options: UseScreenshotGenerationOptions,
) {
  const { projectId, sessionId, enabled = true } = options;

  const [pageScreenshots, setPageScreenshots] = useState<
    Record<string, PageScreenshotState>
  >({});
  const [batchId, setBatchId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const getScreenshotUrl = useCallback(
    (pageId: string, timestamp?: number) => {
      if (!projectId) return "";
      const t = timestamp || Date.now();
      return `${SCREENSHOT_SERVICE_URL}/api/screenshots/file/${projectId}/${pageId}?t=${t}`;
    },
    [projectId],
  );

  const pollBatchStatus = useCallback(
    async (currentBatchId: string) => {
      try {
        const response = await fetch(
          `${SCREENSHOT_SERVICE_URL}/api/screenshots/status/${projectId}/${currentBatchId}`,
        );
        if (!response.ok) return;

        const result = await response.json();
        if (!result.success) return;

        const { data } = result;

        // Update completed pages
        for (const pageResult of data.results) {
          if (pageResult.status === "done" && pageResult.url) {
            setPageScreenshots((prev) => {
              const existing = prev[pageResult.pageId];
              // Skip if already set with same URL
              if (existing?.screenshotUrl && !existing.loading) return prev;
              return {
                ...prev,
                [pageResult.pageId]: {
                  screenshotUrl: getScreenshotUrl(pageResult.pageId),
                  loading: false,
                },
              };
            });
          } else if (pageResult.status === "failed") {
            setPageScreenshots((prev) => ({
              ...prev,
              [pageResult.pageId]: {
                loading: false,
                error: pageResult.error,
              },
            }));
          }
        }

        // Stop polling when done
        if (data.status === "completed") {
          if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
          }
          setIsGenerating(false);
        }
      } catch {
        // Polling error — will retry on next interval
      }
    },
    [projectId, getScreenshotUrl],
  );

  const startBatchGeneration = useCallback(
    async (pages: BatchPageInput[]) => {
      if (!projectId || !enabled || pages.length === 0) return;

      // Mark all pages as loading
      setPageScreenshots((prev) => {
        const next = { ...prev };
        for (const page of pages) {
          next[page.pageId] = { loading: true };
        }
        return next;
      });

      setIsGenerating(true);

      try {
        const response = await fetch(
          `${SCREENSHOT_SERVICE_URL}/api/screenshots/generate-batch`,
          {
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
          },
        );

        const result = await response.json();

        if (result.success && result.data?.batchId) {
          const newBatchId = result.data.batchId;
          setBatchId(newBatchId);

          // Start polling
          if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
          }
          pollTimerRef.current = setInterval(
            () => pollBatchStatus(newBatchId),
            POLL_INTERVAL,
          );

          // Initial poll
          pollBatchStatus(newBatchId);
        } else {
          // Batch creation failed
          setIsGenerating(false);
          setPageScreenshots((prev) => {
            const next = { ...prev };
            for (const page of pages) {
              next[page.pageId] = {
                loading: false,
                error: "批量截图创建失败",
              };
            }
            return next;
          });
        }
      } catch {
        setIsGenerating(false);
        setPageScreenshots((prev) => {
          const next = { ...prev };
          for (const page of pages) {
            next[page.pageId] = {
              loading: false,
              error: "截图服务不可达",
            };
          }
          return next;
        });
      }
    },
    [projectId, sessionId, enabled, pollBatchStatus],
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

      setPageScreenshots((prev) => ({
        ...prev,
        [pageId]: { loading: true },
      }));

      try {
        const response = await fetch(
          `${SCREENSHOT_SERVICE_URL}/api/screenshots/generate`,
          {
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
          },
        );

        const result = await response.json();

        if (result.success && result.data?.url) {
          setPageScreenshots((prev) => ({
            ...prev,
            [pageId]: {
              screenshotUrl: getScreenshotUrl(pageId, Date.now()),
              loading: false,
            },
          }));
        } else {
          setPageScreenshots((prev) => ({
            ...prev,
            [pageId]: {
              loading: false,
              error: result.error?.message || "截图生成失败",
            },
          }));
        }
      } catch {
        setPageScreenshots((prev) => ({
          ...prev,
          [pageId]: {
            loading: false,
            error: "截图服务不可达",
          },
        }));
      }
    },
    [projectId, sessionId, enabled, getScreenshotUrl],
  );

  // Cleanup polling on unmount
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
    startBatchGeneration,
    regeneratePage,
    getScreenshotUrl,
  };
}
