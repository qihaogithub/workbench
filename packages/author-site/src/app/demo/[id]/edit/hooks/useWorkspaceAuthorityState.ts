"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type {
  WorkspaceRevision,
  WorkspaceMutationCommittedEvent,
  WorkspaceProjectionAck,
} from "@workbench/shared/contracts";

import {
  readWorkspaceAuthorityStateFromBrowser,
  readWorkspaceAuthorityEventsFromBrowser,
  readWorkspaceProjectionAcksFromBrowser,
  acknowledgeWorkspaceProjectionFromBrowser,
} from "@/lib/workspace-authority-browser-client";
import { WorkspaceAuthorityClientError } from "@/lib/workspace-authority-shared";

export interface WorkspaceAuthorityConflict {
  resourcePath: string;
  localHash: string;
  serverHash: string;
}

export type PreviewStatus = "idle" | "updating" | "applied" | "failed";
export type CanonicalStatus = "synced" | "lagging" | "error";

export interface WorkspaceAuthorityState {
  /** 本地草稿版本（每次本地变更递增） */
  draftVersion: number;
  /** Authority 已提交的 revision */
  committedRevision: number;
  /** Authority 已提交的 rootHash */
  committedRootHash: string;
  /** 各资源当前已知 hash */
  resourceHashes: Record<string, string>;
  /** 预览已应用的 revision */
  previewAppliedRevision: number;
  /** 预览投影状态 */
  previewStatus: PreviewStatus;
  /** canonical 已同步到的 revision（独立于 autosave） */
  canonicalSyncedRevision: number | null;
  /** canonical 同步状态 */
  canonicalStatus: CanonicalStatus;
  /** 与 Authority 的连接状态 */
  isConnected: boolean;
  /** revision 是否存在缺口 */
  hasGap: boolean;
  /** 资源冲突 */
  conflict: WorkspaceAuthorityConflict | null;
}

export interface UseWorkspaceAuthorityStateOptions {
  projectId: string;
  workspaceId: string;
  sessionId: string;
  /** 事件轮询间隔（ms），默认 2000 */
  pollIntervalMs?: number;
  /** 是否启用轮询，默认 true */
  enabled?: boolean;
}

export interface UseWorkspaceAuthorityStateReturn extends WorkspaceAuthorityState {
  /** 递增 draftVersion（每次本地变更调用） */
  markDraftChanged: () => void;
  /** 向 Authority 发送预览投影 ack */
  ackPreview: (revision: WorkspaceRevision, status: "applied" | "failed") => void;
  /** 手动触发一次状态拉取 */
  refresh: () => Promise<void>;
  /** 设置 canonical 同步状态 */
  setCanonicalStatus: (status: CanonicalStatus, revision?: number | null) => void;
  /** 设置资源冲突 */
  setConflict: (conflict: WorkspaceAuthorityConflict | null) => void;
}

const DEFAULT_POLL_INTERVAL_MS = 2000;

export function useWorkspaceAuthorityState(
  options: UseWorkspaceAuthorityStateOptions,
): UseWorkspaceAuthorityStateReturn {
  const { projectId, workspaceId, sessionId, enabled = true } = options;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  const [state, setState] = useState<WorkspaceAuthorityState>({
    draftVersion: 0,
    committedRevision: 0,
    committedRootHash: "",
    resourceHashes: {},
    previewAppliedRevision: 0,
    previewStatus: "idle",
    canonicalSyncedRevision: null,
    canonicalStatus: "synced",
    isConnected: false,
    hasGap: false,
    conflict: null,
  });

  /** 跟踪上次拉取事件时的 revision，用于 gap 检测 */
  const lastPolledRevisionRef = useRef<number>(0);
  const mountedRef = useRef(true);
  /** 连续失败计数，避免单次瞬态错误导致离线误报 */
  const consecutiveFailuresRef = useRef(0);
  const CONSECUTIVE_FAILURE_THRESHOLD = 2;

  const fetchState = useCallback(async () => {
    try {
      const snapshot = await readWorkspaceAuthorityStateFromBrowser({
        projectId,
        workspaceId,
        sessionId,
      });
      if (!mountedRef.current) return;
      setState((prev) => ({
        ...prev,
        committedRevision: snapshot.revision,
        committedRootHash: snapshot.rootHash,
        resourceHashes: snapshot.resourceHashes,
        isConnected: true,
      }));
      lastPolledRevisionRef.current = snapshot.revision;
    } catch (error: unknown) {
      if (!mountedRef.current) return;
      if (error instanceof WorkspaceAuthorityClientError && error.status === 401) {
        return;
      }
      setState((prev) => ({
        ...prev,
        isConnected: false,
      }));
    }
  }, [projectId, workspaceId, sessionId]);

  const pollProjectionAcks = useCallback(async () => {
    try {
      const afterRevision = lastPolledRevisionRef.current as WorkspaceRevision;
      const acks = await readWorkspaceProjectionAcksFromBrowser({
        projectId,
        workspaceId,
        sessionId,
        afterRevision,
      });
      if (!mountedRef.current) return;

      setState((prev) => {
        let next = prev;
        for (const ack of acks) {
          if (ack.revision > next.previewAppliedRevision) {
            next = {
              ...next,
              previewAppliedRevision: ack.revision,
              previewStatus: ack.status === "applied" ? "applied" : "failed",
            };
          }
        }
        return next;
      });
    } catch {
      // projection-acks 获取失败不影响连接状态，下次轮询重试
    }
  }, [projectId, workspaceId, sessionId]);

  const pollEvents = useCallback(async () => {
    try {
      const afterRevision = lastPolledRevisionRef.current as WorkspaceRevision;
      const events = await readWorkspaceAuthorityEventsFromBrowser({
        projectId,
        workspaceId,
        sessionId,
        afterRevision,
      });
      if (!mountedRef.current) return;

      consecutiveFailuresRef.current = 0;

      setState((prev) => {
        let next = prev;

        for (const event of events) {
          if (event.type === "workspace_mutation_committed") {
            const committedEvent = event as WorkspaceMutationCommittedEvent;
            const newRevision = committedEvent.receipt.revision;

            if (
              lastPolledRevisionRef.current > 0 &&
              newRevision > lastPolledRevisionRef.current + 1
            ) {
              next = { ...next, hasGap: true };
            }

            if (newRevision > next.committedRevision) {
              next = {
                ...next,
                committedRevision: newRevision,
                committedRootHash: committedEvent.receipt.rootHash,
              };
              lastPolledRevisionRef.current = newRevision;
            }
          }
        }

        if (!next.isConnected) {
          next = { ...next, isConnected: true };
        }

        return next;
      });
    } catch (error: unknown) {
      if (!mountedRef.current) return;
      if (error instanceof WorkspaceAuthorityClientError && error.status === 401) {
        return;
      }
      consecutiveFailuresRef.current += 1;
      if (consecutiveFailuresRef.current >= CONSECUTIVE_FAILURE_THRESHOLD) {
        setState((prev) => ({
          ...prev,
          isConnected: false,
        }));
      }
    }
  }, [projectId, workspaceId, sessionId]);

  const refresh = useCallback(async () => {
    await fetchState();
    await pollEvents();
    void pollProjectionAcks();
  }, [fetchState, pollEvents, pollProjectionAcks]);

  // 初始拉取
  useEffect(() => {
    if (!enabled) return;
    mountedRef.current = true;
    void fetchState();
    return () => {
      mountedRef.current = false;
    };
  }, [enabled, fetchState]);

  // 轮询事件
  useEffect(() => {
    if (!enabled) return;

    const interval = setInterval(() => {
      if (document.hidden) return;
      void pollEvents();
      void pollProjectionAcks();
    }, pollIntervalMs);

    return () => clearInterval(interval);
  }, [enabled, pollIntervalMs, pollEvents, pollProjectionAcks]);

  const markDraftChanged = useCallback(() => {
    setState((prev) => ({
      ...prev,
      draftVersion: prev.draftVersion + 1,
    }));
  }, []);

  const ackPreview = useCallback(
    (revision: WorkspaceRevision, status: "applied" | "failed") => {
      setState((prev) => ({
        ...prev,
        previewStatus: status === "applied" ? "applied" : "failed",
        previewAppliedRevision: revision,
      }));
      // 异步发送 ack（不阻塞 UI）
      void acknowledgeWorkspaceProjectionFromBrowser({
        projectId,
        workspaceId,
        sessionId,
        revision,
        clientId: sessionId,
        surface: "active-preview",
        status,
        acknowledgedAt: Date.now(),
      }).catch(() => {
        // ack 失败静默处理，下次轮询会重新获取
      });
    },
    [projectId, workspaceId, sessionId],
  );

  const setCanonicalStatus = useCallback(
    (status: CanonicalStatus, revision?: number | null) => {
      setState((prev) => ({
        ...prev,
        canonicalStatus: status,
        canonicalSyncedRevision:
          revision !== undefined ? revision : prev.canonicalSyncedRevision,
      }));
    },
    [],
  );

  const setConflict = useCallback(
    (conflict: WorkspaceAuthorityConflict | null) => {
      setState((prev) => ({
        ...prev,
        conflict,
      }));
    },
    [],
  );

  return {
    ...state,
    markDraftChanged,
    ackPreview,
    refresh,
    setCanonicalStatus,
    setConflict,
  };
}
