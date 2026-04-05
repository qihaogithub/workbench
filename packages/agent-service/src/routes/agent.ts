import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AgentManager, getAgentManager } from '../core/agent-manager';
import { AgentFactory, getAgentFactory } from '../core/agent-factory';
import { MemorySessionStore } from '../session/session-store';
import { getChangedFiles } from '../session/session-guard';
import { AgentConfig, AgentType } from '../core/types';

interface SessionParams {
  sessionId: string;
}

interface SendMessageBody {
  content: string;
  demoId?: string;
  backend?: AgentType;
  workingDir?: string;
  options?: {
    timeout?: number;
    stream?: boolean;
  };
}

interface ListSessionsQuery {
  status?: string;
  limit?: string;
  offset?: string;
}

interface RollbackBody {
  files?: string[];
}

export async function registerAgentRoutes(fastify: FastifyInstance) {
  const manager = getAgentManager();
  const factory = getAgentFactory();

  const sessionStore = new MemorySessionStore();

  fastify.post<{ Params: SessionParams; Body: SendMessageBody }>(
    '/api/agent/:sessionId/message',
    async (request: FastifyRequest<{ Params: SessionParams; Body: SendMessageBody }>, reply: FastifyReply) => {
      const { sessionId } = request.params;
      const { content, demoId, backend, workingDir, options } = request.body;

      if (!content) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'INVALID_PARAMS',
            message: '消息内容不能为空',
          },
        });
      }

      try {
        const config: AgentConfig = {
          sessionId,
          backend: backend || 'opencode',
          demoId,
          workingDir,
        };

        const agent = manager.getOrCreate(sessionId, config);

        if (agent.status === 'initializing') {
          await agent.start();
        }

        sessionStore.update(sessionId, {
          status: 'processing',
          messageCount: (sessionStore.get(sessionId)?.messageCount || 0) + 1,
        });

        const result = await agent.sendMessage(content, options);

        sessionStore.update(sessionId, {
          status: result.success ? 'ready' : 'error',
        });

        return reply.send({
          success: true,
          data: {
            sessionId,
            content: result.content,
            files: result.files,
            metadata: result.metadata,
          },
        });
      } catch (error) {
        sessionStore.update(sessionId, { status: 'error' });

        return reply.code(500).send({
          success: false,
          error: {
            code: 'MESSAGE_SEND_ERROR',
            message: error instanceof Error ? error.message : 'Unknown error',
          },
        });
      }
    }
  );

  fastify.get<{ Params: SessionParams }>(
    '/api/agent/:sessionId',
    async (request: FastifyRequest<{ Params: SessionParams }>, reply: FastifyReply) => {
      const { sessionId } = request.params;
      const agent = manager.get(sessionId);

      if (!agent) {
        return reply.code(404).send({
          success: false,
          error: {
            code: 'SESSION_NOT_FOUND',
            message: `Session ${sessionId} 不存在`,
          },
        });
      }

      return reply.send({
        success: true,
        data: agent.getInfo(),
      });
    }
  );

  fastify.delete<{ Params: SessionParams }>(
    '/api/agent/:sessionId',
    async (request: FastifyRequest<{ Params: SessionParams }>, reply: FastifyReply) => {
      const { sessionId } = request.params;

      await manager.destroy(sessionId);
      sessionStore.delete(sessionId);

      return reply.send({
        success: true,
        data: {
          sessionId,
          destroyed: true,
        },
      });
    }
  );

  fastify.get<{ Params: SessionParams; Querystring: { includeContent?: string } }>(
    '/api/agent/:sessionId/files',
    async (request: FastifyRequest<{ Params: SessionParams; Querystring: { includeContent?: string } }>, reply: FastifyReply) => {
      const { sessionId } = request.params;
      const agent = manager.get(sessionId);

      if (!agent) {
        return reply.code(404).send({
          success: false,
          error: {
            code: 'SESSION_NOT_FOUND',
            message: `Session ${sessionId} 不存在`,
          },
        });
      }

      const info = agent.getInfo();
      const workingDir = info.workingDir;

      if (!workingDir) {
        return reply.send({
          success: true,
          data: {
            sessionId,
            files: [],
          },
        });
      }

      const files = getChangedFiles(workingDir);

      return reply.send({
        success: true,
        data: {
          sessionId,
          files: files.map((file) => ({
            path: file,
            action: 'modified' as const,
          })),
        },
      });
    }
  );

  fastify.get<{ Querystring: ListSessionsQuery }>(
    '/api/sessions',
    async (request: FastifyRequest<{ Querystring: ListSessionsQuery }>, reply: FastifyReply) => {
      const { status, limit, offset } = request.query;

      const sessions = manager.list();
      const total = sessions.length;
      const limitNum = parseInt(limit || '50', 10);
      const offsetNum = parseInt(offset || '0', 10);

      const filtered = status
        ? sessions.filter((s) => s.status === status)
        : sessions;

      return reply.send({
        success: true,
        data: {
          sessions: filtered.slice(offsetNum, offsetNum + limitNum),
          total: filtered.length,
          limit: limitNum,
          offset: offsetNum,
        },
      });
    }
  );

  fastify.post<{ Params: SessionParams; Body: RollbackBody }>(
    '/api/agent/:sessionId/rollback',
    async (request: FastifyRequest<{ Params: SessionParams; Body: RollbackBody }>, reply: FastifyReply) => {
      const { sessionId } = request.params;
      const { files } = request.body || {};

      return reply.send({
        success: true,
        data: {
          sessionId,
          rolledBack: files || [],
        },
      });
    }
  );
}
