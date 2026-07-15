import { FastifyInstance, FastifyRequest } from "fastify";
import WebSocket from "ws";

import type { CollabResourceKind } from "@workbench/shared/contracts";
import { WorkspaceMutationAuthorityError } from "../workspace/workspace-mutation-authority";
import {
  getHocuspocusCollabServer,
  type RoomDescriptor,
} from "../collab/hocuspocus-server";
import { encodeDocumentName } from "../collab/document-name";
import { logger } from "../utils/logger";

interface CollabParams {
  projectId: string;
  workspaceId: string;
  room?: string;
}

interface CollabQuery {
  sessionId?: string;
  resourcePath?: string;
  kind?: CollabResourceKind;
}

const RESOURCE_KINDS: CollabResourceKind[] = [
  "page-code",
  "page-prototype-html",
  "page-prototype-css",
  "page-schema",
  "page-sketch-scene",
  "project-schema",
  "workspace-tree",
  "canvas-layout",
  "knowledge-document",
];

function isResourceKind(value: unknown): value is CollabResourceKind {
  return typeof value === "string" && RESOURCE_KINDS.includes(value as CollabResourceKind);
}

function normalizeDescriptor(
  params: CollabParams,
  query: CollabQuery,
): RoomDescriptor | null {
  if (!query.sessionId || !query.resourcePath || !isResourceKind(query.kind)) {
    return null;
  }
  return {
    projectId: params.projectId,
    workspaceId: params.workspaceId,
    sessionId: query.sessionId,
    resourcePath: query.resourcePath,
    kind: query.kind,
  };
}

function collabFailure(reply: { status: (statusCode: number) => unknown }, error: unknown) {
  const code = error instanceof WorkspaceMutationAuthorityError
    ? error.code
    : error instanceof Error
      ? error.message
      : "COLLAB_FLUSH_FAILED";
  const status = code === "WORKSPACE_RESOURCE_CONFLICT" ? 409 : 403;
  reply.status(status);
  return {
    success: false,
    error: {
      code,
      message: code,
    },
  };
}

export async function registerCollabRoutes(fastify: FastifyInstance): Promise<void> {
  // ── WebSocket route: delegate to Hocuspocus ───────────────────────────
  //
  // Hocuspocus extracts documentName and token from the client's protocol
  // messages, so the URL path/query are only used for routing and header
  // extraction. The HocuspocusProvider client sends the JSON-encoded
  // documentName and sessionId token via the protocol handshake.
  fastify.get<{
    Params: CollabParams;
    Querystring: CollabQuery;
  }>(
    "/api/collab/projects/:projectId/workspaces/:workspaceId/:room",
    {
      websocket: true,
      config: {
        rateLimit: false,
      },
    },
    async (
      socket: WebSocket,
      request: FastifyRequest<{ Params: CollabParams; Querystring: CollabQuery }>,
    ) => {
      const descriptor = normalizeDescriptor(request.params, request.query);
      if (!descriptor) {
        socket.close(1008, "INVALID_COLLAB_PARAMS");
        return;
      }

      const server = getHocuspocusCollabServer();
      server.handleConnection(socket, request.raw);
    },
  );

  // ── HTTP flush: trigger debounced onStoreDocument immediately ──────────
  fastify.post<{
    Params: CollabParams;
    Querystring: CollabQuery;
  }>(
    "/api/collab/projects/:projectId/workspaces/:workspaceId/flush",
    async (request, reply) => {
      const descriptor = normalizeDescriptor(request.params, request.query);
      if (!descriptor) {
        reply.status(400);
        return { success: false, error: { code: "INVALID_REQUEST", message: "协同 flush 参数无效" } };
      }

      try {
        const server = getHocuspocusCollabServer();
        const documentName = encodeDocumentName({
          projectId: descriptor.projectId,
          workspaceId: descriptor.workspaceId,
          resourcePath: descriptor.resourcePath,
          kind: descriptor.kind,
        });
        const result = await server.flush(documentName);
        return { success: true, data: result };
      } catch (error) {
        return collabFailure(reply, error);
      }
    },
  );

  // ── HTTP flush-all: flush all rooms in a workspace ────────────────────
  fastify.post<{
    Params: CollabParams;
    Querystring: { sessionId?: string };
  }>(
    "/api/collab/projects/:projectId/workspaces/:workspaceId/flush-all",
    async (request, reply) => {
      const { sessionId } = request.query;
      if (!sessionId) {
        reply.status(400);
        return { success: false, error: { code: "INVALID_REQUEST", message: "sessionId 参数必填" } };
      }

      try {
        const server = getHocuspocusCollabServer();
        const result = await server.flushWorkspace(
          request.params.projectId,
          request.params.workspaceId,
          sessionId,
        );
        return { success: true, data: result };
      } catch (error) {
        logger.warn(
          { error, projectId: request.params.projectId, workspaceId: request.params.workspaceId },
          "flush-all failed",
        );
        return collabFailure(reply, error);
      }
    },
  );

  // ── Yjs-First unified write endpoint ──────────────────────────────────
  // All non-collab write paths (Pi tools, HTTP routes) write text content
  // through this endpoint so that the Yjs room is the single content authority.
  fastify.post<{
    Params: CollabParams;
    Querystring: CollabQuery;
    Body: { content?: string };
  }>(
    "/api/collab/projects/:projectId/workspaces/:workspaceId/write",
    async (request, reply) => {
      const descriptor = normalizeDescriptor(request.params, request.query);
      if (!descriptor) {
        reply.status(400);
        return { success: false, error: { code: "INVALID_REQUEST", message: "write 参数无效" } };
      }

      const content = request.body?.content;
      if (typeof content !== "string") {
        reply.status(400);
        return { success: false, error: { code: "INVALID_REQUEST", message: "content 必须为字符串" } };
      }

      try {
        const server = getHocuspocusCollabServer();
        const result = await server.writeToResource(descriptor, content);
        return { success: true, data: result };
      } catch (error) {
        return collabFailure(reply, error);
      }
    },
  );
}
