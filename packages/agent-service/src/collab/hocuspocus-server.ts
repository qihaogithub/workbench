import { Hocuspocus } from "@hocuspocus/server";
import type { WebSocketLike } from "@hocuspocus/server";
import type WebSocket from "ws";
import type { IncomingMessage } from "node:http";

import type { CollabResourceKind } from "@workbench/shared/contracts";
import type { WorkspaceMutationRequest } from "@workbench/shared/contracts";
import { logger } from "../utils/logger";
import { decodeDocumentName, encodeDocumentName } from "./document-name";
import { AuthorityPersistenceExtension } from "./extensions/authority-persistence";
import { SessionAuthExtension } from "./extensions/session-auth";
import type { CollabConnectionContext } from "./extensions/session-auth";
import { WorkspaceFilePersistence } from "./workspace-file-persistence";
import { registerCollabDraftProvider } from "../workspace/workspace-mutation-authority";

const DEFAULT_SAVE_DEBOUNCE_MS = 1000;
const DEFAULT_MAX_DEBOUNCE_MS = 10_000;
const DEFAULT_TIMEOUT_MS = 60_000;

export interface RoomDescriptor {
  projectId: string;
  workspaceId: string;
  sessionId: string;
  resourcePath: string;
  kind: CollabResourceKind;
}

/**
 * HocuspocusCollabServer
 *
 * Wraps a Hocuspocus instance configured with:
 *  - SessionAuthExtension (onAuthenticate → validateSession)
 *  - AuthorityPersistenceExtension (onLoadDocument + onStoreDocument)
 *
 * The server does NOT listen on its own port — it is wired into the
 * existing Fastify WebSocket route via `handleConnection()`.
 *
 * Server-internal writes (replacing CollabRoomManager.writeToResource)
 * use `openDirectConnection().transact()`.
 */
export class HocuspocusCollabServer {
  readonly hocuspocus: Hocuspocus<CollabConnectionContext>;
  readonly persistence: WorkspaceFilePersistence;
  private readonly unregisterDraftProvider: () => void;

  constructor(persistence = new WorkspaceFilePersistence()) {
    this.persistence = persistence;

    this.hocuspocus = new Hocuspocus<CollabConnectionContext>({
      name: "workbench-collab",
      debounce: Number(
        process.env.COLLAB_SAVE_DEBOUNCE_MS || DEFAULT_SAVE_DEBOUNCE_MS,
      ),
      maxDebounce: DEFAULT_MAX_DEBOUNCE_MS,
      timeout: DEFAULT_TIMEOUT_MS,
      quiet: true,
      unloadImmediately: true,
      extensions: [
        new SessionAuthExtension(persistence),
        new AuthorityPersistenceExtension(persistence),
      ],
    });

    this.unregisterDraftProvider = registerCollabDraftProvider(
      this.persistence.dataDir,
      {
        flushDraftsForMutation: (request) =>
          this.flushDraftsForMutation(request),
      },
    );
  }

  /**
   * Delegate an incoming WebSocket connection to Hocuspocus.
   * Called from the Fastify WebSocket route handler.
   *
   * Hocuspocus extracts documentName and token from the client's protocol
   * messages (not from URL/query), so we only need to pass the raw socket
   * and a Request object for headers/params access.
   */
  handleConnection(socket: WebSocket, request: IncomingMessage): void {
    const protocol = request.headers.upgrade === "wss" ? "https" : "http";
    const host = request.headers.host || "localhost";
    const url = `${protocol}://${host}${request.url || "/"}`;
    const webRequest = new Request(url, {
      headers: new Headers(request.headers as Record<string, string>),
    });

    // Hocuspocus's handleConnection returns a ClientConnection that does NOT
    // set up its own WebSocket event listeners. The integration layer must
    // forward 'message' and 'close' events to it manually. This mirrors the
    // pattern used by Hocuspocus's built-in Server (crossws hooks).
    const clientConnection = this.hocuspocus.handleConnection(
      socket as unknown as WebSocketLike,
      webRequest,
    );

    socket.on("message", (data: Buffer | ArrayBuffer | Buffer[]) => {
      let bytes: Uint8Array;
      if (Buffer.isBuffer(data)) {
        bytes = data;
      } else if (Array.isArray(data)) {
        bytes = Buffer.concat(data);
      } else {
        bytes = new Uint8Array(data);
      }
      clientConnection.handleMessage(bytes);
    });

    socket.on("close", (code: number, reason: Buffer) => {
      clientConnection.handleClose({ code, reason: reason.toString() });
    });

    socket.on("error", (error: Error) => {
      logger.error({ error }, "collab WebSocket error");
    });
  }

  /**
   * Flush a single room (debounced onStoreDocument runs immediately).
   * Replaces CollabRoomManager.flush().
   */
  async flush(documentName: string): Promise<{ flushed: boolean }> {
    const doc = this.hocuspocus.documents.get(documentName);
    if (!doc) return { flushed: false };

    const debounceId = `onStoreDocument-${doc.name}`;
    if (this.hocuspocus.debouncer.isDebounced(debounceId)) {
      this.hocuspocus.debouncer.executeNow(debounceId);
    }
    return { flushed: true };
  }

  /**
   * Flush all rooms in a workspace.
   * Replaces CollabRoomManager.flushWorkspace().
   *
   * Also validates the workspace session to ensure the caller has access.
   */
  async flushWorkspace(
    projectId: string,
    workspaceId: string,
    sessionId: string,
  ): Promise<{
    flushedRooms: number;
    status: "flushed" | "no_active_room";
    revision: number;
  }> {
    // Validate session first (mirrors original CollabRoomManager behavior).
    const validation = this.persistence.validateWorkspaceSession({
      projectId,
      workspaceId,
      sessionId,
    });
    if (!validation.ok) {
      throw new Error(validation.reason || "COLLAB_FORBIDDEN");
    }

    const matched: string[] = [];
    for (const name of this.hocuspocus.documents.keys()) {
      const decoded = decodeDocumentName(name);
      if (!decoded) continue;
      if (
        decoded.projectId === projectId &&
        decoded.workspaceId === workspaceId
      ) {
        matched.push(name);
      }
    }

    for (const name of matched) {
      await this.flush(name);
    }

    const authorityState = await this.persistence.getAuthorityState({
      projectId,
      workspaceId,
      sessionId,
    });

    return {
      flushedRooms: matched.length,
      status: matched.length === 0 ? "no_active_room" : "flushed",
      revision: authorityState.revision,
    };
  }

  /**
   * Server-internal write: replace Yjs text and flush immediately.
   * Replaces CollabRoomManager.writeToResource().
   *
   * Opens a DirectConnection to the document (loading it if not yet in
   * memory), replaces the Yjs text content, then disconnects to trigger
   * onStoreDocument.
   */
  async writeToResource(
    descriptor: RoomDescriptor,
    content: string,
  ): Promise<{ revision: number; hash: string }> {
    const validation = this.persistence.validateSession(descriptor);
    if (!validation.ok || !validation.workspacePath) {
      throw new Error(validation.reason || "COLLAB_FORBIDDEN");
    }

    const documentName = encodeDocumentName({
      projectId: descriptor.projectId,
      workspaceId: descriptor.workspaceId,
      resourcePath: descriptor.resourcePath,
      kind: descriptor.kind,
    });

    const context: CollabConnectionContext = {
      ok: true,
      projectId: descriptor.projectId,
      workspaceId: descriptor.workspaceId,
      sessionId: descriptor.sessionId,
      resourcePath: descriptor.resourcePath,
      kind: descriptor.kind,
      userId: validation.userId,
      username: validation.username,
      workspacePath: validation.workspacePath,
    };

    const connection = await this.hocuspocus.openDirectConnection(
      documentName,
      context,
    );

    try {
      await connection.transact((doc) => {
        const text = doc.getText("content");
        if (text.length > 0) {
          text.delete(0, text.length);
        }
        if (content) {
          text.insert(0, content);
        }
      });

      // Disconnect with unloadImmediately=true (default) triggers
      // onStoreDocument synchronously, persisting the change.
      await connection.disconnect();
    } catch (error) {
      logger.error(
        { error, documentName },
        "writeToResource: DirectConnection transact failed",
      );
      await connection.disconnect().catch(() => {});
      throw error;
    }

    // Read the committed file state to return the new hash.
    const state = this.persistence.readResourceState(
      validation.workspacePath,
      descriptor.resourcePath,
      descriptor.kind,
    );

    return { revision: 0, hash: state.hash };
  }

  /**
   * Flush all rooms whose resourcePath is targeted by a mutation request.
   * Called by the collab draft provider before Authority commits.
   */
  private async flushDraftsForMutation(
    request: WorkspaceMutationRequest,
  ): Promise<void> {
    const targetPaths = new Set<string>();
    for (const op of request.operations) {
      if (op.type === "move_path") {
        targetPaths.add(op.from);
        targetPaths.add(op.to);
      } else {
        targetPaths.add(op.path);
      }
    }
    if (targetPaths.size === 0) return;

    for (const name of this.hocuspocus.documents.keys()) {
      const decoded = decodeDocumentName(name);
      if (!decoded) continue;
      if (
        decoded.projectId === request.projectId &&
        decoded.workspaceId === request.workspaceId &&
        targetPaths.has(decoded.resourcePath)
      ) {
        await this.flush(name);
      }
    }
  }

  dispose(): void {
    this.unregisterDraftProvider();
    this.hocuspocus.closeConnections();
    this.hocuspocus.flushPendingStores();
  }
}

let _server: HocuspocusCollabServer | null = null;

/**
 * Lazy singleton accessor. Defers WorkspaceFilePersistence initialization
 * (which touches the real filesystem) until first use, avoiding import-time
 * side effects that break unit tests with partial fs mocks.
 */
export function getHocuspocusCollabServer(): HocuspocusCollabServer {
  if (!_server) {
    _server = new HocuspocusCollabServer();
  }
  return _server;
}
