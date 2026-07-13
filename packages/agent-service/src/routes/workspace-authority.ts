import type { FastifyInstance, FastifyRequest } from "fastify";
import WebSocket from "ws";

import type {
  WorkspaceAuthorityApiErrorCode,
  WorkspaceAuthorityStreamEvent,
  WorkspaceMutationCommittedEvent,
  WorkspaceMutationRequest,
  WorkspaceProjectionAck,
  WorkspaceProjectionAcknowledgedEvent,
} from "@workbench/shared/contracts";
import { isWorkspaceAuthorityApiErrorCode } from "@workbench/shared/contracts";
import { WorkspaceFilePersistence } from "../collab/workspace-file-persistence";
import { WorkspaceMutationAuthorityError } from "../workspace/workspace-mutation-authority";

interface WorkspaceParams { projectId: string; workspaceId: string; }
interface SessionQuery { sessionId?: string; }
interface EventsQuery extends SessionQuery { afterRevision?: string; }
interface ResourceParams extends WorkspaceParams { "*": string; }

const ERROR_STATUS: Record<WorkspaceAuthorityApiErrorCode, number> = {
  INVALID_REQUEST: 400,
  SESSION_NOT_FOUND: 401,
  SESSION_EXPIRED: 401,
  PROJECT_MISMATCH: 403,
  WORKSPACE_MISMATCH: 403,
  WORKSPACE_PROJECT_MISMATCH: 403,
  WORKSPACE_NOT_FOUND: 404,
  WORKSPACE_RESOURCE_NOT_FOUND: 404,
  WORKSPACE_AUTHORITY_NOT_READY: 503,
  WORKSPACE_RESOURCE_CONFLICT: 409,
  WORKSPACE_MUTATION_ID_REUSED: 409,
  WORKSPACE_INVALID_OPERATION: 400,
  WORKSPACE_EXTERNAL_DRIFT: 409,
  WORKSPACE_AUTHORITY_BACKUP_MISSING: 503,
  WORKSPACE_WRITE_LEASE_UNAVAILABLE: 503,
  WORKSPACE_MUTATION_FAILED: 500,
};

function stableErrorCode(error: unknown): WorkspaceAuthorityApiErrorCode {
  const candidate = error instanceof WorkspaceMutationAuthorityError
    ? error.code
    : error instanceof Error
      ? error.message
      : "WORKSPACE_MUTATION_FAILED";
  return isWorkspaceAuthorityApiErrorCode(candidate) ? candidate : "WORKSPACE_MUTATION_FAILED";
}

function failure(reply: { code: (status: number) => unknown }, error: unknown) {
  const code = stableErrorCode(error);
  const status = ERROR_STATUS[code];
  reply.code(status);
  return { success: false, error: { code, message: code } };
}

function parseRevision(value: string | undefined): number | null {
  const revision = value === undefined ? 0 : Number(value);
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : null;
}

export async function registerWorkspaceAuthorityRoutes(
  fastify: FastifyInstance,
  persistence = new WorkspaceFilePersistence(),
): Promise<void> {
  fastify.addContentTypeParser("application/octet-stream", { parseAs: "buffer" }, (_request, body, done) => done(null, body));

  fastify.get<{ Params: WorkspaceParams; Querystring: SessionQuery }>(
    "/api/workspace-authority/projects/:projectId/workspaces/:workspaceId/state",
    async (request, reply) => {
      if (!request.query.sessionId) return failure(reply, new Error("SESSION_NOT_FOUND"));
      try {
        return { success: true, data: await persistence.getAuthorityState({ ...request.params, sessionId: request.query.sessionId }) };
      } catch (error) { return failure(reply, error); }
    },
  );

  fastify.get<{ Params: ResourceParams; Querystring: SessionQuery }>(
    "/api/workspace-authority/projects/:projectId/workspaces/:workspaceId/resources/*",
    async (request, reply) => {
      if (!request.query.sessionId) return failure(reply, new Error("SESSION_NOT_FOUND"));
      try {
        return { success: true, data: await persistence.getAuthorityResource({
          projectId: request.params.projectId,
          workspaceId: request.params.workspaceId,
          sessionId: request.query.sessionId,
          resourcePath: request.params["*"],
        }) };
      } catch (error) { return failure(reply, error); }
    },
  );

  fastify.get<{ Params: WorkspaceParams; Querystring: EventsQuery }>(
    "/api/workspace-authority/projects/:projectId/workspaces/:workspaceId/events",
    async (request, reply) => {
      if (!request.query.sessionId) return failure(reply, new Error("SESSION_NOT_FOUND"));
      const afterRevision = parseRevision(request.query.afterRevision);
      if (afterRevision === null) return failure(reply, new Error("INVALID_REQUEST"));
      try {
        return { success: true, data: await persistence.getAuthorityEvents({
          ...request.params,
          sessionId: request.query.sessionId,
          afterRevision,
        }) };
      } catch (error) { return failure(reply, error); }
    },
  );

  fastify.get<{ Params: WorkspaceParams; Querystring: EventsQuery }>(
    "/api/workspace-authority/projects/:projectId/workspaces/:workspaceId/projection-acks",
    async (request, reply) => {
      if (!request.query.sessionId) return failure(reply, new Error("SESSION_NOT_FOUND"));
      const afterRevision = parseRevision(request.query.afterRevision);
      if (afterRevision === null) return failure(reply, new Error("INVALID_REQUEST"));
      try {
        return { success: true, data: await persistence.getAuthorityProjectionAcks({
          ...request.params,
          sessionId: request.query.sessionId,
          afterRevision,
        }) };
      } catch (error) { return failure(reply, error); }
    },
  );

  fastify.get<{ Params: WorkspaceParams; Querystring: EventsQuery }>(
    "/api/workspace-authority/projects/:projectId/workspaces/:workspaceId/stream",
    { websocket: true, config: { rateLimit: false } },
    async (
      socket: WebSocket,
      request: FastifyRequest<{ Params: WorkspaceParams; Querystring: EventsQuery }>,
    ) => {
      const { projectId, workspaceId } = request.params;
      const sessionId = request.query.sessionId;
      const lastAppliedRevision = parseRevision(request.query.afterRevision);
      if (!sessionId || lastAppliedRevision === null) {
        socket.close(1008, !sessionId ? "SESSION_NOT_FOUND" : "INVALID_REQUEST");
        return;
      }
      const validation = persistence.validateWorkspaceSession({ projectId, workspaceId, sessionId });
      if (!validation.ok) {
        socket.close(1008, stableErrorCode(new Error(validation.reason ?? "WORKSPACE_MUTATION_FAILED")));
        return;
      }

      let cursor = lastAppliedRevision;
      let initializing = true;
      const bufferedCommitted: WorkspaceMutationCommittedEvent[] = [];
      const bufferedProjection: WorkspaceProjectionAcknowledgedEvent[] = [];
      const send = (event: WorkspaceAuthorityStreamEvent) => {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event));
      };
      const sendCommitted = (event: WorkspaceMutationCommittedEvent) => {
        if (event.receipt.projectId !== projectId || event.receipt.workspaceId !== workspaceId || event.receipt.revision <= cursor) return;
        if (event.receipt.revision > cursor + 1) {
          send({ type: "workspace_revision_gap", projectId, workspaceId, expectedRevision: cursor + 1, currentRevision: event.receipt.revision });
        }
        send(event);
        cursor = event.receipt.revision;
      };
      const unsubscribeCommitted = persistence.onMutationCommitted((event) => {
        if (initializing) bufferedCommitted.push(event);
        else sendCommitted(event);
      });
      const unsubscribeProjection = persistence.onProjectionAck((event) => {
        if (event.ack.projectId !== projectId || event.ack.workspaceId !== workspaceId) return;
        if (initializing) bufferedProjection.push(event);
        else send(event);
      });
      const cleanup = () => { unsubscribeCommitted(); unsubscribeProjection(); };
      socket.once("close", cleanup);
      socket.once("error", cleanup);

      try {
        const [state, catchup] = await Promise.all([
          persistence.getAuthorityState({ projectId, workspaceId, sessionId }),
          persistence.getAuthorityEvents({ projectId, workspaceId, sessionId, afterRevision: cursor }),
        ]);
        send({ type: "workspace_authority_ready", projectId, workspaceId, revision: state.revision, rootHash: state.rootHash });
        const hasGap = cursor < state.revision && (catchup.length === 0 || catchup[0].receipt.revision > cursor + 1);
        if (hasGap) {
          send({ type: "workspace_revision_gap", projectId, workspaceId, expectedRevision: cursor + 1, currentRevision: state.revision });
          cursor = state.revision;
        } else {
          catchup.forEach(sendCommitted);
        }
        initializing = false;
        bufferedCommitted.sort((left, right) => left.receipt.revision - right.receipt.revision).forEach(sendCommitted);
        bufferedProjection.sort((left, right) => left.ack.acknowledgedAt - right.ack.acknowledgedAt).forEach(send);
      } catch (error) {
        cleanup();
        socket.close(1011, stableErrorCode(error));
      }
    },
  );

  fastify.get<{ Params: WorkspaceParams; Querystring: SessionQuery }>(
    "/api/workspace-authority/projects/:projectId/workspaces/:workspaceId/snapshot",
    async (request, reply) => {
      if (!request.query.sessionId) return failure(reply, new Error("SESSION_NOT_FOUND"));
      try {
        return { success: true, data: await persistence.getAuthoritySnapshot({ ...request.params, sessionId: request.query.sessionId }) };
      } catch (error) { return failure(reply, error); }
    },
  );

  fastify.get<{ Params: WorkspaceParams; Querystring: SessionQuery }>(
    "/api/workspace-authority/projects/:projectId/workspaces/:workspaceId/health",
    async (request, reply) => {
      if (!request.query.sessionId) return failure(reply, new Error("SESSION_NOT_FOUND"));
      try {
        return { success: true, data: persistence.getAuthorityHealth({ ...request.params, sessionId: request.query.sessionId }) };
      } catch (error) { return failure(reply, error); }
    },
  );

  fastify.post<{ Params: WorkspaceParams; Body: WorkspaceMutationRequest }>(
    "/api/workspace-authority/projects/:projectId/workspaces/:workspaceId/mutate",
    async (request, reply) => {
      const body = request.body;
      if (!body || body.projectId !== request.params.projectId || body.workspaceId !== request.params.workspaceId) {
        reply.code(400); return { success: false, error: { code: "INVALID_REQUEST", message: "Workspace mutation 参数不匹配" } };
      }
      try { return { success: true, data: await persistence.commitMutation(body) }; }
      catch (error) { return failure(reply, error); }
    },
  );

  fastify.post<{ Params: WorkspaceParams; Querystring: SessionQuery; Body: Buffer }>(
    "/api/workspace-authority/projects/:projectId/workspaces/:workspaceId/staging",
    { bodyLimit: 20 * 1024 * 1024 },
    async (request, reply) => {
      if (!request.query.sessionId || !Buffer.isBuffer(request.body)) {
        reply.code(400);
        return { success: false, error: { code: "INVALID_REQUEST", message: "二进制 staging 请求无效" } };
      }
      try {
        return { success: true, data: await persistence.stageBinary({
          ...request.params,
          sessionId: request.query.sessionId,
          content: request.body,
        }) };
      } catch (error) { return failure(reply, error); }
    },
  );

  fastify.post<{ Params: WorkspaceParams; Querystring: SessionQuery }>(
    "/api/workspace-authority/projects/:projectId/workspaces/:workspaceId/reconcile/adopt",
    async (request, reply) => {
      if (!request.query.sessionId) return failure(reply, new Error("SESSION_NOT_FOUND"));
      try {
        return { success: true, data: await persistence.reconcileAuthorityAdopt({ ...request.params, sessionId: request.query.sessionId }) };
      } catch (error) { return failure(reply, error); }
    },
  );

  fastify.post<{ Params: WorkspaceParams; Querystring: SessionQuery }>(
    "/api/workspace-authority/projects/:projectId/workspaces/:workspaceId/reconcile/restore",
    async (request, reply) => {
      if (!request.query.sessionId) return failure(reply, new Error("SESSION_NOT_FOUND"));
      try {
        return { success: true, data: await persistence.reconcileAuthorityRestore({ ...request.params, sessionId: request.query.sessionId }) };
      } catch (error) { return failure(reply, error); }
    },
  );

  fastify.post<{ Params: WorkspaceParams; Body: WorkspaceProjectionAck & { sessionId?: string } }>(
    "/api/workspace-authority/projects/:projectId/workspaces/:workspaceId/projection-ack",
    async (request, reply) => {
      const ack = request.body;
      const sessionId = ack?.sessionId;
      if (!sessionId || ack.projectId !== request.params.projectId || ack.workspaceId !== request.params.workspaceId) {
        reply.code(400); return { success: false, error: { code: "INVALID_REQUEST", message: "Projection ack 参数不匹配" } };
      }
      try { await persistence.recordProjectionAck({ ...ack, sessionId }); return { success: true, data: { acknowledged: true } }; }
      catch (error) { return failure(reply, error); }
    },
  );
}
