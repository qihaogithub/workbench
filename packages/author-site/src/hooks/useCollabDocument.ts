"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

import type {
  CollabPresence,
  CollabRoomDescriptor,
  CollabSyncStatus,
} from "@opencode-workbench/shared";

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

export function useCollabDocument(
  descriptor: CollabRoomDescriptor | null,
  user?: Partial<CollabUser>,
): CollabDocumentState {
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<CollabSyncStatus>("offline");
  const [awareness, setAwareness] = useState<CollabPresence[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<WebsocketProvider | null>(null);
  const [ydoc, setYdoc] = useState<Y.Doc | null>(null);
  const [ytext, setYtext] = useState<Y.Text | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const descriptorRef = useRef<CollabRoomDescriptor | null>(descriptor);
  descriptorRef.current = descriptor;

  const collabUser = useMemo<CollabUser>(() => {
    const userId = user?.userId || descriptor?.sessionId || "anonymous";
    return {
      userId,
      username: user?.username || "协作者",
      color: user?.color || pickColor(userId),
    };
  }, [descriptor?.sessionId, user?.color, user?.userId, user?.username]);

  useEffect(() => {
    if (!descriptor) {
      setStatus("offline");
      setValue("");
      setAwareness([]);
      setProvider(null);
      setYdoc(null);
      setYtext(null);
      return;
    }

    setStatus("connecting");
    setError(null);

    const doc = new Y.Doc();
    const text = doc.getText("content");
    const baseUrl = getCollabBaseUrl();
    const endpoint = `${baseUrl}/api/collab/projects/${encodeURIComponent(
      descriptor.projectId,
    )}/workspaces/${encodeURIComponent(descriptor.workspaceId)}`;
    const nextProvider = new WebsocketProvider(endpoint, encodeRoomName(descriptor.resourcePath), doc, {
      params: {
        sessionId: descriptor.sessionId,
        resourcePath: descriptor.resourcePath,
        kind: descriptor.kind,
      },
    });

    providerRef.current = nextProvider;
    setProvider(nextProvider);
    setYdoc(doc);
    setYtext(text);

    const updatePresence = () => setAwareness(readPresence(nextProvider));
    nextProvider.awareness.setLocalStateField("user", {
      name: collabUser.username,
      color: collabUser.color,
      colorLight: `${collabUser.color}33`,
    });
    nextProvider.awareness.setLocalStateField("presence", {
      userId: collabUser.userId,
      username: collabUser.username,
      color: collabUser.color,
      activePageId: descriptor.resourcePath.match(/^demos\/([^/]+)\//)?.[1],
      resourcePath: descriptor.resourcePath,
      lastActiveAt: Date.now(),
    } satisfies CollabPresence);
    updatePresence();

    const handleTextChange = () => {
      const nextValue = text.toString();
      setValue(nextValue);
      nextProvider.awareness.setLocalStateField("presence", {
        userId: collabUser.userId,
        username: collabUser.username,
        color: collabUser.color,
        activePageId: descriptor.resourcePath.match(/^demos\/([^/]+)\//)?.[1],
        resourcePath: descriptor.resourcePath,
        lastActiveAt: Date.now(),
      } satisfies CollabPresence);
    };

    text.observe(handleTextChange);
    nextProvider.awareness.on("change", updatePresence);
    nextProvider.on("status", ({ status: wsStatus }: { status: "connecting" | "connected" | "disconnected" }) => {
      setStatus(wsStatus === "connected" ? "synced" : wsStatus === "connecting" ? "connecting" : "offline");
    });
    nextProvider.on("sync", (isSynced: boolean) => {
      if (isSynced) {
        setValue(text.toString());
        setStatus("synced");
      }
    });
    nextProvider.on("connection-error", () => {
      setError("协同连接失败");
      setStatus("error");
    });

    return () => {
      text.unobserve(handleTextChange);
      nextProvider.awareness.off("change", updatePresence);
      nextProvider.destroy();
      doc.destroy();
      if (providerRef.current === nextProvider) providerRef.current = null;
    };
  }, [collabUser.color, collabUser.userId, collabUser.username, descriptor]);

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
    const response = await fetch(
      `${httpBase}/api/collab/projects/${encodeURIComponent(
        current.projectId,
      )}/workspaces/${encodeURIComponent(current.workspaceId)}/flush?${params.toString()}`,
      { method: "POST" },
    );
    if (!response.ok) {
      setStatus("error");
      throw new Error("协同草稿落盘失败");
    }
    setStatus("synced");
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
