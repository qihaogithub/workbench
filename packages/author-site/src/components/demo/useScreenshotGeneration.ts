"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { ScreenshotRenderBox } from "@opencode-workbench/demo-ui";

const POLL_INTERVAL = 1500;
const MIN_POLL_INTERVAL_MS = 300;
const MAX_POLL_INTERVAL_MS = 5_000;
const MAX_POLL_DURATION_MS = 60_000;
const MAX_POLL_FAILURES = 3;
const INVALIDATED_SCREENSHOT_HASH = "__invalidated__";

export type ScreenshotPriority =
  | "active"
  | "visible"
  | "nearby"
  | "thumbnail"
  | "background";

export type ScreenshotRenderMode = "strict" | "fast";

export interface PageScreenshotState {
  screenshotUrl?: string;
  hash?: string;
  expectedHash?: string;
  variant?: ScreenshotRenderMode;
  renderBox?: ScreenshotRenderBox;
  loading: boolean;
  error?: string;
}

interface UseScreenshotGenerationOptions {
  projectId?: string;
  sessionId?: string;
  enabled?: boolean;
  pageIds?: string[];
}

interface BatchPageInput {
  pageId: string;
  code: string;
  configData: Record<string, unknown>;
  width?: number;
  height?: number;
  fullPage?: boolean;
  priority?: ScreenshotPriority;
  renderMode?: ScreenshotRenderMode;
  measuredHeight?: number;
}

interface BatchResult {
  pageId: string;
  url?: string;
  assetUrl?: string;
  hash?: string;
  renderBox?: ScreenshotRenderBox;
  priority?: ScreenshotPriority;
  variant?: ScreenshotRenderMode;
  quality?: ScreenshotRenderMode;
  status: "pending" | "rendering" | "done" | "failed";
  error?: string;
}

interface BatchStatusResponseData {
  status?: "running" | "completed" | "cancelled";
  cancelled?: boolean;
  retryAfterMs?: number;
  results?: BatchResult[];
}

interface ScreenshotMetaResponse {
  currentHash?: string;
  renderBox?: ScreenshotRenderBox;
}

function isServiceUnavailable(result: unknown): boolean {
  if (!result || typeof result !== "object") return false;
  const error = (result as { error?: { code?: string } }).error;
  return error?.code === "SCREENSHOT_SERVICE_UNAVAILABLE";
}

function normalizeRetryAfterMs(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return POLL_INTERVAL;
  }
  return Math.min(
    MAX_POLL_INTERVAL_MS,
    Math.max(MIN_POLL_INTERVAL_MS, Math.round(value)),
  );
}

export function useScreenshotGeneration(
  options: UseScreenshotGenerationOptions,
) {
  const { projectId, sessionId, enabled = true, pageIds = [] } = options;

  const [pageScreenshots, setPageScreenshots] = useState<
    Record<string, PageScreenshotState>
  >({});
  const [batchId, setBatchId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [serviceAvailable, setServiceAvailable] = useState<boolean | null>(
    null,
  );
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const batchIdRef = useRef<string | null>(null);
  const pollStartedAtRef = useRef<number | null>(null);
  const pollFailuresRef = useRef(0);
  const pageRequestVersionsRef = useRef<Record<string, number>>({});

  const getScreenshotUrl = useCallback(
    (pageId: string, hash?: string, variant: ScreenshotRenderMode = "strict") => {
      if (!projectId) return "";
      const base = `/api/screenshots/file/${encodeURIComponent(
        projectId,
      )}/${encodeURIComponent(pageId)}`;
      if (!hash) return base;
      const params = new URLSearchParams({ hash });
      if (variant !== "strict") {
        params.set("variant", variant);
      }
      return `${base}?${params.toString()}`;
    },
    [projectId],
  );

  const setPagesLoading = useCallback((pages: BatchPageInput[]) => {
    setPageScreenshots((prev) => {
      const next = { ...prev };
      for (const page of pages) {
        next[page.pageId] = {
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
        next[page.pageId] = {
          loading: false,
          error: "截图服务不可达",
        };
      }
      return next;
    });
  }, []);

  const invalidatePageScreenshots = useCallback((pageIds: string[]) => {
    if (pageIds.length === 0) return;
    setPageScreenshots((prev) => {
      const next = { ...prev };
      for (const pageId of pageIds) {
        pageRequestVersionsRef.current[pageId] =
          (pageRequestVersionsRef.current[pageId] || 0) + 1;
        next[pageId] = {
          loading: false,
          expectedHash: INVALIDATED_SCREENSHOT_HASH,
        };
      }
      return next;
    });
  }, []);

  const invalidatePageScreenshot = useCallback(
    (pageId: string) => {
      invalidatePageScreenshots([pageId]);
    },
    [invalidatePageScreenshots],
  );

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
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
      if (typeof fetch !== "function") return;

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

  const preloadScreenshotMeta = useCallback(
    async (targetPageIds: string[]) => {
      if (!projectId || !enabled || targetPageIds.length === 0) return;

      const uniquePageIds = Array.from(new Set(targetPageIds)).filter(Boolean);
      await Promise.all(
        uniquePageIds.map(async (pageId) => {
          try {
            const response = await fetch(
              `${getScreenshotUrl(pageId)}?meta=1`,
              { cache: "no-store" },
            );
            if (!response.ok) return;
            const result = await response.json();
            if (!result.success || !result.data?.currentHash) return;
            const data = result.data as ScreenshotMetaResponse;

            setPageScreenshots((prev) => {
              const existing = prev[pageId];
              if (existing?.loading || existing?.screenshotUrl) return prev;

              return {
                ...prev,
                [pageId]: {
                  screenshotUrl: getScreenshotUrl(pageId, data.currentHash),
                  hash: data.currentHash,
                  expectedHash: data.currentHash,
                  variant: "strict",
                  renderBox: data.renderBox,
                  loading: false,
                },
              };
            });
          } catch {
            // 本地 meta 只是首屏弱占位，读取失败不影响主预览链路。
          }
        }),
      );
    },
    [enabled, getScreenshotUrl, projectId],
  );

  const pollBatchStatus = useCallback(
    async (currentBatchId: string) => {
      if (!projectId) return;
      if (batchIdRef.current !== currentBatchId) return;

      const scheduleNextPoll = (retryAfterMs?: number) => {
        if (batchIdRef.current !== currentBatchId) return;
        if (pollTimerRef.current) {
          clearTimeout(pollTimerRef.current);
        }
        pollTimerRef.current = setTimeout(
          () => void pollBatchStatus(currentBatchId),
          normalizeRetryAfterMs(retryAfterMs),
        );
      };

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
          if (pollFailuresRef.current < MAX_POLL_FAILURES) {
            scheduleNextPoll();
          }
          return;
        }

        const result = await response.json();
        if (batchIdRef.current !== currentBatchId) return;

        if (!result.success) {
          markPollingFailure();
          if (pollFailuresRef.current < MAX_POLL_FAILURES) {
            scheduleNextPoll();
          }
          return;
        }

        pollFailuresRef.current = 0;
        setServiceAvailable(true);
        const data = result.data as BatchStatusResponseData;
        const statusResults = Array.isArray(data.results)
          ? data.results
          : [];

        for (const pageResult of statusResults) {
          if (
            pageResult.status === "done" &&
            (pageResult.assetUrl || pageResult.url) &&
            pageResult.hash
          ) {
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
                  screenshotUrl:
                    pageResult.assetUrl ||
                    getScreenshotUrl(
                      pageResult.pageId,
                      pageResult.hash,
                      pageResult.variant || "strict",
                    ),
                  hash: pageResult.hash,
                  expectedHash: pageResult.hash,
                  variant: pageResult.variant || "strict",
                  renderBox: pageResult.renderBox,
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
        } else {
          scheduleNextPoll(data.retryAfterMs);
        }
      } catch {
        markPollingFailure();
        if (pollFailuresRef.current < MAX_POLL_FAILURES) {
          scheduleNextPoll();
        }
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
              priority: p.priority,
              renderMode: p.renderMode,
              measuredHeight: p.measuredHeight,
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
                variant: existing?.variant,
                renderBox: existing?.renderBox,
                expectedHash: pageResult.hash,
                loading: true,
              };
            }
            return next;
          });

          if (pollTimerRef.current) {
            clearTimeout(pollTimerRef.current);
            pollTimerRef.current = null;
          }

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
              next[page.pageId] = {
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
      fullPage?: boolean,
      priority: ScreenshotPriority = "active",
      renderMode: ScreenshotRenderMode = "strict",
      measuredHeight?: number,
    ) => {
      if (!projectId || !enabled) return;

      const requestVersion =
        (pageRequestVersionsRef.current[pageId] || 0) + 1;
      pageRequestVersionsRef.current[pageId] = requestVersion;

      setPageScreenshots((prev) => {
        return {
          ...prev,
          [pageId]: {
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
            fullPage,
            priority,
            renderMode,
            measuredHeight,
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
              screenshotUrl:
                result.data.assetUrl ||
                getScreenshotUrl(
                  pageId,
                  result.data.hash,
                  result.data.variant || "strict",
                ),
              hash: result.data.hash,
              expectedHash: result.data.hash,
              variant: result.data.variant || "strict",
              renderBox: result.data.renderBox,
              loading: false,
            },
          }));
        } else {
          if (isServiceUnavailable(result)) {
            setServiceAvailable(false);
          }

          setPageScreenshots((prev) => {
            return {
              ...prev,
              [pageId]: {
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
          return {
            ...prev,
            [pageId]: {
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
    void preloadScreenshotMeta(pageIds);
  }, [pageIds, preloadScreenshotMeta]);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
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
    preloadScreenshotMeta,
    startBatchGeneration,
    regeneratePage,
    invalidatePageScreenshot,
    invalidatePageScreenshots,
    getScreenshotUrl,
  };
}
