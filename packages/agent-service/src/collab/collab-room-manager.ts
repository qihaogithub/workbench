import fs from "fs";
import path from "path";
import WebSocket from "ws";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";

import type { CollabResourceKind } from "@opencode-workbench/shared/contracts";
import type { FileChange } from "../core/types";
import { logger } from "../utils/logger";
import { ResourceFileState, WorkspaceFilePersistence } from "./workspace-file-persistence";

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const MESSAGE_QUERY_AWARENESS = 3;
const DEFAULT_SAVE_DEBOUNCE_MS = 1000;
const DEFAULT_ROOM_IDLE_TTL_MS = 5 * 60_000;
const DEFAULT_MAX_CONNECTIONS_PER_WORKSPACE = 10;
const SERVER_RELOAD_ORIGIN = Symbol("collab-server-reload");

interface RoomDescriptor {
  projectId: string;
  workspaceId: string;
  sessionId: string;
  resourcePath: string;
  kind: CollabResourceKind;
}

interface CollabConnection {
  socket: WebSocket;
  roomKey: string;
  workspaceKey: string;
  controlledClientIds: Set<number>;
}

interface CollabRoom {
  key: string;
  workspaceKey: string;
  workspacePath: string;
  descriptor: RoomDescriptor;
  doc: Y.Doc;
  text: Y.Text;
  awareness: awarenessProtocol.Awareness;
  connections: Set<CollabConnection>;
  saveTimer: NodeJS.Timeout | null;
  lastActiveAt: number;
  dirty: boolean;
  saving: boolean;
  baselineHash: string;
}

export class CollabRoomManager {
  private rooms = new Map<string, CollabRoom>();
  private readonly persistence: WorkspaceFilePersistence;
  private readonly saveDebounceMs: number;
  private readonly roomIdleTtlMs: number;
  private readonly maxConnectionsPerWorkspace: number;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(persistence = new WorkspaceFilePersistence()) {
    this.persistence = persistence;
    this.saveDebounceMs = Number(process.env.COLLAB_SAVE_DEBOUNCE_MS || DEFAULT_SAVE_DEBOUNCE_MS);
    this.roomIdleTtlMs = Number(process.env.COLLAB_ROOM_IDLE_TTL_MS || DEFAULT_ROOM_IDLE_TTL_MS);
    this.maxConnectionsPerWorkspace = Number(
      process.env.COLLAB_MAX_CONNECTIONS_PER_WORKSPACE || DEFAULT_MAX_CONNECTIONS_PER_WORKSPACE,
    );
  }

  startCleanup(): void {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => {
      this.cleanupIdleRooms().catch((error) => {
        logger.warn({ error }, "Failed to cleanup collab rooms");
      });
    }, Math.min(this.roomIdleTtlMs, 60_000));
  }

  async handleConnection(socket: WebSocket, descriptor: RoomDescriptor): Promise<void> {
    const validation = this.persistence.validateSession(descriptor);
    if (!validation.ok || !validation.workspacePath) {
      socket.close(1008, validation.reason || "COLLAB_FORBIDDEN");
      return;
    }

    const room = this.getOrCreateRoom(descriptor, validation.workspacePath);
    if (this.countWorkspaceConnections(room.workspaceKey) >= this.maxConnectionsPerWorkspace) {
      socket.close(1013, "COLLAB_WORKSPACE_CONNECTION_LIMIT");
      return;
    }

    const connection: CollabConnection = {
      socket,
      roomKey: room.key,
      workspaceKey: room.workspaceKey,
      controlledClientIds: new Set(),
    };
    room.connections.add(connection);
    room.lastActiveAt = Date.now();

    this.sendSyncStep1(socket, room.doc);
    this.sendAwareness(socket, room.awareness, Array.from(room.awareness.getStates().keys()));

    socket.on("message", (data) => {
      try {
        const buffer = this.toBuffer(data);
        this.handleMessage(room, connection, new Uint8Array(buffer));
      } catch (error) {
        logger.warn({ error, roomKey: room.key }, "Invalid collab websocket message");
      }
    });

    socket.on("close", () => {
      this.removeConnection(room, connection);
    });

    socket.on("error", (error) => {
      logger.warn({ error, roomKey: room.key }, "Collab websocket error");
      this.removeConnection(room, connection);
    });
  }

  async flush(descriptor: RoomDescriptor): Promise<{ flushed: boolean }> {
    const validation = this.persistence.validateSession(descriptor);
    if (!validation.ok || !validation.workspacePath) {
      throw new Error(validation.reason || "COLLAB_FORBIDDEN");
    }

    const room = this.rooms.get(this.roomKey(descriptor));
    if (!room) return { flushed: false };
    await this.flushRoom(room);
    return { flushed: true };
  }

  async flushWorkspace(
    projectId: string,
    workspaceId: string,
    sessionId: string,
  ): Promise<{ flushedRooms: number; status: "flushed" | "no_active_room" }> {
    const validation = this.persistence.validateWorkspaceSession({
      projectId,
      workspaceId,
      sessionId,
    });
    if (!validation.ok || !validation.workspacePath) {
      throw new Error(validation.reason || "COLLAB_FORBIDDEN");
    }

    const matched = Array.from(this.rooms.values()).filter((room) => {
      return (
        room.descriptor.projectId === projectId &&
        room.descriptor.workspaceId === workspaceId
      );
    });
    for (const room of matched) {
      await this.flushRoom(room);
    }
    return {
      flushedRooms: matched.length,
      status: matched.length > 0 ? "flushed" : "no_active_room",
    };
  }

  applyExternalFileChanges(
    workspacePath: string,
    changes: Array<Pick<FileChange, "path" | "action">>,
  ): { reloadedRooms: number } {
    const normalizedWorkspacePath = this.normalizeWorkspacePath(workspacePath);
    let reloadedRooms = 0;

    for (const change of changes) {
      const resourcePath = this.normalizeResourcePath(change.path);
      if (!resourcePath) continue;

      for (const room of this.rooms.values()) {
        if (this.normalizeWorkspacePath(room.workspacePath) !== normalizedWorkspacePath) continue;
        if (this.normalizeResourcePath(room.descriptor.resourcePath) !== resourcePath) continue;
        const state = this.persistence.readResourceState(
          room.workspacePath,
          room.descriptor.resourcePath,
          room.descriptor.kind,
        );
        this.reloadRoomFromFileState(room, state);
        reloadedRooms += 1;
      }
    }

    return { reloadedRooms };
  }

  private getOrCreateRoom(descriptor: RoomDescriptor, workspacePath: string): CollabRoom {
    const key = this.roomKey(descriptor);
    const existing = this.rooms.get(key);
    if (existing) {
      const currentFileState = this.persistence.readResourceState(
        workspacePath,
        descriptor.resourcePath,
        descriptor.kind,
      );
      if (currentFileState.hash !== existing.baselineHash && currentFileState.content !== existing.text.toString()) {
        this.reloadRoomFromFileState(existing, currentFileState);
      } else if (!existing.dirty && !existing.saving && existing.text.length === 0 && currentFileState.content) {
        existing.text.insert(0, currentFileState.content);
        existing.baselineHash = currentFileState.hash;
      }
      return existing;
    }

    const doc = new Y.Doc();
    const text = doc.getText("content");
    const initial = this.persistence.readResourceState(workspacePath, descriptor.resourcePath, descriptor.kind);
    if (initial.content) text.insert(0, initial.content);

    const awareness = new awarenessProtocol.Awareness(doc);
    const room: CollabRoom = {
      key,
      workspaceKey: `${descriptor.projectId}:${descriptor.workspaceId}`,
      workspacePath,
      descriptor,
      doc,
      text,
      awareness,
      connections: new Set(),
      saveTimer: null,
      lastActiveAt: Date.now(),
      dirty: false,
      saving: false,
      baselineHash: initial.hash,
    };

    doc.on("update", (update: Uint8Array, origin: unknown) => {
      room.lastActiveAt = Date.now();
      if (origin !== SERVER_RELOAD_ORIGIN) {
        room.dirty = true;
        this.scheduleSave(room);
      }
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeUpdate(encoder, update);
      this.broadcast(room, encoding.toUint8Array(encoder), origin);
    });

    awareness.on("update", ({ added, updated, removed }: {
      added: number[];
      updated: number[];
      removed: number[];
    }, origin: unknown) => {
      const changedClients = added.concat(updated, removed);
      if (origin && typeof origin === "object" && "controlledClientIds" in origin) {
        const connection = origin as CollabConnection;
        changedClients.forEach((clientId) => connection.controlledClientIds.add(clientId));
      }
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(room.awareness, changedClients),
      );
      this.broadcast(room, encoding.toUint8Array(encoder), origin);
    });

    this.rooms.set(key, room);
    return room;
  }

  private handleMessage(room: CollabRoom, connection: CollabConnection, message: Uint8Array): void {
    room.lastActiveAt = Date.now();
    const decoder = decoding.createDecoder(message);
    const encoder = encoding.createEncoder();
    const messageType = decoding.readVarUint(decoder);

    if (messageType === MESSAGE_SYNC) {
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.readSyncMessage(decoder, encoder, room.doc, connection);
      const response = encoding.toUint8Array(encoder);
      if (response.length > 1) this.send(connection.socket, response);
      return;
    }

    if (messageType === MESSAGE_AWARENESS) {
      awarenessProtocol.applyAwarenessUpdate(
        room.awareness,
        decoding.readVarUint8Array(decoder),
        connection,
      );
      return;
    }

    if (messageType === MESSAGE_QUERY_AWARENESS) {
      this.sendAwareness(connection.socket, room.awareness, Array.from(room.awareness.getStates().keys()));
    }
  }

  private removeConnection(room: CollabRoom, connection: CollabConnection): void {
    room.connections.delete(connection);
    if (connection.controlledClientIds.size > 0) {
      awarenessProtocol.removeAwarenessStates(
        room.awareness,
        Array.from(connection.controlledClientIds),
        connection,
      );
    }
    room.lastActiveAt = Date.now();
  }

  private scheduleSave(room: CollabRoom): void {
    if (room.saveTimer) clearTimeout(room.saveTimer);
    room.saveTimer = setTimeout(() => {
      this.flushRoom(room).catch((error) => {
        logger.error({ error, roomKey: room.key }, "Failed to save collab room");
      });
    }, this.saveDebounceMs);
  }

  private async flushRoom(room: CollabRoom): Promise<void> {
    if (room.saveTimer) {
      clearTimeout(room.saveTimer);
      room.saveTimer = null;
    }
    if (!room.dirty || room.saving) return;
    room.saving = true;
    try {
      const currentState = this.persistence.readResourceState(
        room.workspacePath,
        room.descriptor.resourcePath,
        room.descriptor.kind,
      );
      const roomContent = room.text.toString();

      if (currentState.content === roomContent) {
        room.baselineHash = currentState.hash;
        room.dirty = false;
        return;
      }

      if (currentState.hash !== room.baselineHash) {
        logger.warn(
          {
            roomKey: room.key,
            resourcePath: room.descriptor.resourcePath,
          },
          "Skipped stale collab flush because resource changed outside the room",
        );
        this.reloadRoomFromFileState(room, currentState);
        return;
      }

      const writtenState = this.persistence.writeResource(
        room.workspacePath,
        room.descriptor.resourcePath,
        room.descriptor.kind,
        roomContent,
      );
      room.baselineHash = writtenState.hash;
      room.dirty = false;
    } finally {
      room.saving = false;
    }
  }

  private reloadRoomFromFileState(room: CollabRoom, state: ResourceFileState): void {
    if (room.saveTimer) {
      clearTimeout(room.saveTimer);
      room.saveTimer = null;
    }

    const current = room.text.toString();
    if (current !== state.content) {
      room.doc.transact(() => {
        if (room.text.length > 0) {
          room.text.delete(0, room.text.length);
        }
        if (state.content) {
          room.text.insert(0, state.content);
        }
      }, SERVER_RELOAD_ORIGIN);
    }

    room.baselineHash = state.hash;
    room.dirty = false;
    room.lastActiveAt = Date.now();
  }

  private async cleanupIdleRooms(): Promise<void> {
    const now = Date.now();
    for (const room of this.rooms.values()) {
      if (room.connections.size > 0 || now - room.lastActiveAt < this.roomIdleTtlMs) continue;
      await this.flushRoom(room);
      room.awareness.destroy();
      room.doc.destroy();
      this.rooms.delete(room.key);
    }
  }

  private sendSyncStep1(socket: WebSocket, doc: Y.Doc): void {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(encoder, doc);
    this.send(socket, encoding.toUint8Array(encoder));
  }

  private sendAwareness(
    socket: WebSocket,
    awareness: awarenessProtocol.Awareness,
    clients: number[],
  ): void {
    if (clients.length === 0) return;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(awareness, clients));
    this.send(socket, encoding.toUint8Array(encoder));
  }

  private broadcast(room: CollabRoom, message: Uint8Array, origin: unknown): void {
    for (const connection of room.connections) {
      if (connection === origin) continue;
      this.send(connection.socket, message);
    }
  }

  private send(socket: WebSocket, message: Uint8Array): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(message);
    }
  }

  private toBuffer(data: WebSocket.RawData): Buffer {
    if (data instanceof Buffer) return data;
    if (Array.isArray(data)) return Buffer.concat(data);
    return Buffer.from(new Uint8Array(data));
  }

  private countWorkspaceConnections(workspaceKey: string): number {
    return Array.from(this.rooms.values()).reduce((count, room) => {
      return room.workspaceKey === workspaceKey ? count + room.connections.size : count;
    }, 0);
  }

  private normalizeWorkspacePath(workspacePath: string): string {
    const resolved = path.resolve(workspacePath);
    try {
      return fs.realpathSync(resolved);
    } catch {
      return resolved;
    }
  }

  private normalizeResourcePath(resourcePath: string): string {
    return resourcePath.replace(/\\/g, "/").replace(/^\/+/, "");
  }

  private roomKey(descriptor: RoomDescriptor): string {
    return [
      descriptor.projectId,
      descriptor.workspaceId,
      descriptor.kind,
      descriptor.resourcePath,
    ].join(":");
  }
}

export const collabRoomManager = new CollabRoomManager();
