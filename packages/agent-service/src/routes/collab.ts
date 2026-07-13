import { FastifyInstance, FastifyRequest } from "fastify";
import WebSocket from "ws";

import type { CollabResourceKind } from "@workbench/shared/contracts";
import { collabRoomManager } from "../collab/collab-room-manager";
import { WorkspaceMutationAuthorityError } from "../workspace/workspace-mutation-authority";

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
) {
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
  collabRoomManager.startCleanup();

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
      await collabRoomManager.handleConnection(socket, descriptor);
    },
  );

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
        const result = await collabRoomManager.flush(descriptor);
        return { success: true, data: result };
      } catch (error) {
        return collabFailure(reply, error);
      }
    },
  );

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
        const result = await collabRoomManager.flushWorkspace(
          request.params.projectId,
          request.params.workspaceId,
          sessionId,
        );
        return { success: true, data: result };
      } catch (error) {
        return collabFailure(reply, error);
      }
    },
  );
}
