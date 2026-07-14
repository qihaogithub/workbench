"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import * as decoding from "lib0/decoding";

import type {
  CollabPresence,
  CollabRoomDescriptor,
  CollabSyncStatus,
} from "@workbench/shared";

export interface CollabUser {
  userId: string;
  username: string;
  color: string;
}

export interface CollabDocumentState {
  value: string;
  status: CollabSyncStatus;
  awareness: CollabPresence[];
  provider: WebsocketProvider | null;
  ydoc: Y.Doc | null;
  ytext: Y.Text | null;
  flush: () => Promise<void>;
  error: string | null;
}

export interface CollabPresenceState {
  users: CollabPresence[];
  activePageByUser: Record<string, string | undefined>;
  status: CollabSyncStatus;
  error: string | null;
}

const USER_COLORS = ["#2563eb", "#059669", "#dc2626", "#7c3aed", "#ea580c", "#0891b2"];
const OFFLINE_STATUS_DELAY_MS = 5000;

function pickColor(seed: string): string {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return USER_COLORS[hash % USER_COLORS.length];
}

function getCollabBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_COLLAB_WS_URL;
  if (configured) return configured.replace(/\/$/, "");

  const agentUrl = process.env.NEXT_PUBLIC_AGENT_SERVICE_URL || "http://localhost:3201";
  return agentUrl.replace(/^http:/, "ws:").replace(/^https:/, "wss:").replace(/\/$/, "");
}

function encodeRoomName(resourcePath: string): string {
  return btoa(unescape(encodeURIComponent(resourcePath)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function readPresence(provider: WebsocketProvider | null): CollabPresence[] {
  if (!provider) return [];
  const states = Array.from(provider.awareness.getStates().values());
  return states
    .map((state) => state.presence)
    .filter((presence): presence is CollabPresence => {
      return Boolean(presence && typeof presence.userId === "string");
    });
}

function getPresenceSignature(presence: CollabPresence): string {
  return JSON.stringify({
    userId: presence.userId,
    username: presence.username,
    color: presence.color,
    activePageId: presence.activePageId,
    resourcePath: presence.resourcePath,
  });
}

function arePresenceListsEqual(
  current: CollabPresence[],
  next: CollabPresence[],
): boolean {
  if (current.length !== next.length) return false;
  const currentSignatures = current.map(getPresenceSignature).sort();
  const nextSignatures = next.map(getPresenceSignature).sort();
  return currentSignatures.every(
    (signature, index) => signature === nextSignatures[index],
  );
}

export interface BaselineResetInfo {
  baselineRevision: number;
  baselineHash: string;
  resourcePath: string;
}

export interface CollabDocumentOptions {
  /** Called when the server sends a BASELINE_RESET message after conflict self-healing */
  onBaselineReset?: (info: BaselineResetInfo) => void;
}

export function useCollabDocument(
  descriptor: CollabRoomDescriptor | null,
  user?: Partial<CollabUser>,
  options?: CollabDocumentOptions,
): CollabDocumentState {
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<CollabSyncStatus>("offline");
  const [awareness, setAwareness] = useState<CollabPresence[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<WebsocketProvider | null>(null);
  const [ydoc, setYdoc] = useState<Y.Doc | null>(null);
  const [ytext, setYtext] = useState<Y.Text | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const offlineStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onBaselineResetRef = useRef<((info: BaselineResetInfo) => void) | undefined>(options?.onBaselineReset);
  onBaselineResetRef.current = options?.onBaselineReset;
  const descriptorProjectId = descriptor?.projectId ?? "";
  const descriptorWorkspaceId = descriptor?.workspaceId ?? "";
  const descriptorSessionId = descriptor?.sessionId ?? "";
  const descriptorResourcePath = descriptor?.resourcePath ?? "";
  const descriptorKind: CollabRoomDescriptor["kind"] | "" = descriptor?.kind ?? "";
  const descriptorKey = descriptor
    ? [
        descriptorProjectId,
        descriptorWorkspaceId,
        descriptorSessionId,
        descriptorResourcePath,
        descriptorKind,
      ].join("\u0000")
    : "";
  const stableDescriptor = useMemo<CollabRoomDescriptor | null>(() => {
    if (!descriptorKey || !descriptorKind) return null;
    return {
      projectId: descriptorProjectId,
      workspaceId: descriptorWorkspaceId,
      sessionId: descriptorSessionId,
      resourcePath: descriptorResourcePath,
      kind: descriptorKind,
    };
  }, [
    descriptorKey,
    descriptorKind,
    descriptorProjectId,
    descriptorResourcePath,
    descriptorSessionId,
    descriptorWorkspaceId,
  ]);
  const descriptorRef = useRef<CollabRoomDescriptor | null>(stableDescriptor);
  descriptorRef.current = stableDescriptor;

  const collabUser = useMemo<CollabUser>(() => {
    const userId = user?.userId || stableDescriptor?.sessionId || "anonymous";
    return {
      userId,
      username: user?.username || "协作者",
      color: user?.color || pickColor(userId),
    };
  }, [stableDescriptor?.sessionId, user?.color, user?.userId, user?.username]);

  useEffect(() => {
    const clearOfflineStatusTimer = () => {
      if (!offlineStatusTimerRef.current) return;
      clearTimeout(offlineStatusTimerRef.current);
      offlineStatusTimerRef.current = null;
    };

    if (!stableDescriptor) {
      clearOfflineStatusTimer();
      setStatus((current) => (current === "offline" ? current : "offline"));
      setValue((current) => (current === "" ? current : ""));
      setAwareness((current) => (current.length === 0 ? current : []));
      setProvider((current) => (current === null ? current : null));
      setYdoc((current) => (current === null ? current : null));
      setYtext((current) => (current === null ? current : null));
      return;
    }

    clearOfflineStatusTimer();
    setStatus((current) =>
      current === "connecting" ? current : "connecting",
    );
    setError((current) => (current === null ? current : null));

    const doc = new Y.Doc();
    const text = doc.getText("content");
    const baseUrl = getCollabBaseUrl();
    const endpoint = `${baseUrl}/api/collab/projects/${encodeURIComponent(
      stableDescriptor.projectId,
    )}/workspaces/${encodeURIComponent(stableDescriptor.workspaceId)}`;
    const nextProvider = new WebsocketProvider(endpoint, encodeRoomName(stableDescriptor.resourcePath), doc, {
      params: {
        sessionId: stableDescriptor.sessionId,
        resourcePath: stableDescriptor.resourcePath,
        kind: stableDescriptor.kind,
      },
    });

    providerRef.current = nextProvider;
    setProvider(nextProvider);
    setYdoc(doc);
    setYtext(text);

    // ── Register custom message handler for server BASELINE_RESET (type 5) ──
    // When the server self-heals a conflict, it broadcasts a MESSAGE_BASELINE_RESET
    // to all connected clients with the new baseline metadata.
    // The client decodes the payload and clears its local dirty state.
    const MESSAGE_BASELINE_RESET = 5;
    const providerAny = nextProvider as any;
    if (Array.isArray(providerAny.messageHandlers)) {
      providerAny.messageHandlers[MESSAGE_BASELINE_RESET] = (
        _encoder: unknown,
        decoder: { pos: number; arr: Uint8Array },
      ) => {
        try {
          const baselineRevision = decoding.readVarUint(decoder);
          const baselineHash = decoding.readVarString(decoder);
          const resourcePath = decoding.readVarString(decoder);
          onBaselineResetRef.current?.({ baselineRevision, baselineHash, resourcePath });
        } catch {
          // Malformed payload — still fire callback with empty info
          onBaselineResetRef.current?.({ baselineRevision: 0, baselineHash: "", resourcePath: "" });
        }
      };
    } else {
      console.warn(
        "[collab] y-websocket messageHandlers not an array, BASELINE_RESET handler not registered",
      );
    }

    const updatePresence = () => {
      const nextPresence = readPresence(nextProvider);
      setAwareness((current) =>
        arePresenceListsEqual(current, nextPresence) ? current : nextPresence,
      );
    };
    nextProvider.awareness.setLocalStateField("user", {
      name: collabUser.username,
      color: collabUser.color,
      colorLight: `${collabUser.color}33`,
    });
    nextProvider.awareness.setLocalStateField("presence", {
      userId: collabUser.userId,
      username: collabUser.username,
      color: collabUser.color,
      activePageId: stableDescriptor.resourcePath.match(/^demos\/([^/]+)\//)?.[1],
      resourcePath: stableDescriptor.resourcePath,
      lastActiveAt: Date.now(),
    } satisfies CollabPresence);
    updatePresence();

    const handleTextChange = () => {
      const nextValue = text.toString();
      setValue((current) => (current === nextValue ? current : nextValue));
      nextProvider.awareness.setLocalStateField("presence", {
        userId: collabUser.userId,
        username: collabUser.username,
        color: collabUser.color,
        activePageId: stableDescriptor.resourcePath.match(/^demos\/([^/]+)\//)?.[1],
        resourcePath: stableDescriptor.resourcePath,
        lastActiveAt: Date.now(),
      } satisfies CollabPresence);
    };

    text.observe(handleTextChange);
    nextProvider.awareness.on("change", updatePresence);
    nextProvider.on("status", ({ status: wsStatus }: { status: "connecting" | "connected" | "disconnected" }) => {
      if (wsStatus === "connected") {
        clearOfflineStatusTimer();
        setStatus((current) => (current === "synced" ? current : "synced"));
        return;
      }

      if (wsStatus === "connecting") {
        clearOfflineStatusTimer();
        setStatus((current) =>
          current === "offline" || current === "synced" || current === "saving"
            ? current
            : "connecting",
        );
        return;
      }

      clearOfflineStatusTimer();
      offlineStatusTimerRef.current = setTimeout(() => {
        if (providerRef.current === nextProvider) {
          setStatus((current) => (current === "offline" ? current : "offline"));
        }
        offlineStatusTimerRef.current = null;
      }, OFFLINE_STATUS_DELAY_MS);
      setStatus((current) =>
        current === "synced" || current === "saving" ? current : "connecting",
      );
    });
    nextProvider.on("sync", (isSynced: boolean) => {
      if (isSynced) {
        clearOfflineStatusTimer();
        const nextValue = text.toString();
        setValue((current) => (current === nextValue ? current : nextValue));
        setStatus((current) => (current === "synced" ? current : "synced"));
      }
    });
    nextProvider.on("connection-error", () => {
      clearOfflineStatusTimer();
      setError((current) =>
        current === "协同连接失败" ? current : "协同连接失败",
      );
      setStatus((current) => (current === "error" ? current : "error"));
    });

    return () => {
      clearOfflineStatusTimer();
      text.unobserve(handleTextChange);
      nextProvider.awareness.off("change", updatePresence);
      nextProvider.destroy();
      doc.destroy();
      if (providerRef.current === nextProvider) providerRef.current = null;
    };
  }, [collabUser.color, collabUser.userId, collabUser.username, stableDescriptor]);

  const flush = useCallback(async () => {
    const current = descriptorRef.current;
    if (!current) return;
    setStatus((prev) => (prev === "offline" ? prev : "saving"));
    const httpBase = (process.env.NEXT_PUBLIC_AGENT_SERVICE_URL || "http://localhost:3201").replace(/\/$/, "");
    const params = new URLSearchParams({
      sessionId: current.sessionId,
      resourcePath: current.resourcePath,
      kind: current.kind,
    });
    let response: Response;
    try {
      response = await fetch(
        `${httpBase}/api/collab/projects/${encodeURIComponent(
          current.projectId,
        )}/workspaces/${encodeURIComponent(current.workspaceId)}/flush?${params.toString()}`,
        { method: "POST" },
      );
    } catch (networkError) {
      // 网络不可达（DNS 失败、连接被拒等）：状态转为 error，避免卡在 saving
      setStatus("error");
      throw new Error(
        networkError instanceof Error
          ? networkError.message
          : "协同草稿落盘网络错误",
      );
    }
    if (!response.ok) {
      setStatus((current) => (current === "error" ? current : "error"));
      throw new Error("协同草稿落盘失败");
    }
    setStatus((current) => (current === "synced" ? current : "synced"));
  }, []);

  return {
    value,
    status,
    awareness,
    provider,
    ydoc,
    ytext,
    flush,
    error,
  };
}

export function useCollabPresence(
  projectId: string,
  workspaceId: string,
  sessionId?: string,
): CollabPresenceState {
  const descriptor = useMemo<CollabRoomDescriptor | null>(() => {
    if (!projectId || !workspaceId || !sessionId) return null;
    return {
      projectId,
      workspaceId,
      sessionId,
      resourcePath: "workspace-tree.json",
      kind: "workspace-tree",
    };
  }, [projectId, sessionId, workspaceId]);
  const collab = useCollabDocument(descriptor, {
    userId: sessionId,
    username: "当前用户",
  });

  return {
    users: collab.awareness,
    activePageByUser: Object.fromEntries(
      collab.awareness.map((presence) => [presence.userId, presence.activePageId]),
    ),
    status: collab.status,
    error: collab.error,
  };
}
