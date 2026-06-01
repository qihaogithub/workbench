import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getAgentManager } from '../core/agent-manager';
import { getSessionStore } from '../session/session-store';
import { validatePath } from '../session/session-guard';
import { snapshotService } from '../session/snapshot-service';
import { workspaceManager } from '../workspace/workspace-manager';
import { getWorkspaceDisplayName } from '../workspace/utils';
import { AgentConfig } from '../core/types';
import type { WorkspaceInfo } from '@opencode-workbench/shared';

interface SessionParams {
  sessionId: string;
}

interface SendMessageBody {
  content: string;
  demoId?: string;
  workingDir?: string;
  customWorkspace?: boolean;
  model?: string;
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

interface UpdateWorkspaceBody {
  workingDir: string;
  customWorkspace?: boolean;
}

interface StageFilesBody {
  files: string[];
}

interface DiscardFilesBody {
  files: Array<{
    path: string;
    operation: 'create' | 'modify' | 'delete';
  }>;
}

export async function registerAgentRoutes(fastify: FastifyInstance) {
  const manager = getAgentManager();

  const sessionStore = getSessionStore();

  fastify.post<{ Params: SessionParams; Body: SendMessageBody }>(
    '/api/agent/:sessionId/message',
    async (request: FastifyRequest<{ Params: SessionParams; Body: SendMessageBody }>, reply: FastifyReply) => {
      const { sessionId } = request.params;
      const { content, demoId, workingDir, customWorkspace, options } = request.body;

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
        let workspaceInfo: WorkspaceInfo | undefined;

        if (workingDir) {
          workspaceInfo = await workspaceManager.create({
            workspace: workingDir,
            customWorkspace,
          });
        } else {
          const existingSession = sessionStore.get(sessionId);
          if (!existingSession) {
            workspaceInfo = await workspaceManager.create({});
          }
        }

        const config: AgentConfig = {
          sessionId,
          demoId,
          workingDir: workspaceInfo?.path || workingDir,
          model: request.body.model,
        };

        const agent = manager.getOrCreate(sessionId, config);

        if (agent.status === 'initializing') {
          await agent.start();

          if (workspaceInfo) {
            const snapshotInfo = await snapshotService.init(workspaceInfo.path);
            sessionStore.create(sessionId, {
              ...config,
              workspaceMeta: {
                workingDir: workspaceInfo.path,
                customWorkspace: workspaceInfo.customWorkspace,
                workspaceType: workspaceInfo.type,
                snapshotMode: snapshotInfo.mode,
                snapshotBranch: snapshotInfo.branch,
              },
            });
          }
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
      const session = sessionStore.get(sessionId);

      if (session?.workingDir && session.workspaceType === 'temp') {
        await workspaceManager.cleanup(session.workingDir);
        snapshotService.clearSnapshot(session.workingDir);
      }

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
      const session = sessionStore.get(sessionId);

      if (!session) {
        return reply.code(404).send({
          success: false,
          error: {
            code: 'SESSION_NOT_FOUND',
            message: `Session ${sessionId} 不存在`,
          },
        });
      }

      const workingDir = session.workingDir;

      if (!workingDir) {
        return reply.send({
          success: true,
          data: {
            sessionId,
            files: [],
            staged: [],
            unstaged: [],
          },
        });
      }

      const compareResult = await snapshotService.compare(workingDir);

      return reply.send({
        success: true,
        data: {
          sessionId,
          files: [...compareResult.staged, ...compareResult.unstaged],
          staged: compareResult.staged,
          unstaged: compareResult.unstaged,
        },
      });
    }
  );

  fastify.get<{ Querystring: ListSessionsQuery }>(
    '/api/sessions',
    async (request: FastifyRequest<{ Querystring: ListSessionsQuery }>, reply: FastifyReply) => {
      const { status, limit, offset } = request.query;

      const sessions = manager.list();
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

  fastify.get<{ Params: SessionParams }>(
    '/api/agent/:sessionId/workspace',
    async (request: FastifyRequest<{ Params: SessionParams }>, reply: FastifyReply) => {
      const { sessionId } = request.params;
      const session = sessionStore.get(sessionId);

      if (!session) {
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
        data: {
          sessionId,
          workingDir: session.workingDir,
          displayName: getWorkspaceDisplayName(session.workingDir),
          customWorkspace: session.customWorkspace,
          workspaceType: session.workspaceType,
          snapshotMode: session.snapshotMode,
          snapshotBranch: session.snapshotBranch,
        },
      });
    }
  );

  fastify.put<{ Params: SessionParams; Body: UpdateWorkspaceBody }>(
    '/api/agent/:sessionId/workspace',
    async (request: FastifyRequest<{ Params: SessionParams; Body: UpdateWorkspaceBody }>, reply: FastifyReply) => {
      const { sessionId } = request.params;
      const { workingDir, customWorkspace } = request.body;

      const session = sessionStore.get(sessionId);
      if (!session) {
        return reply.code(404).send({
          success: false,
          error: {
            code: 'SESSION_NOT_FOUND',
            message: `Session ${sessionId} 不存在`,
          },
        });
      }

      const pathValidation = validatePath(session.workingDir, workingDir);
      if (!pathValidation.valid) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'FILE_ACCESS_DENIED',
            message: pathValidation.violations.join('; '),
          },
        });
      }

      const workspaceInfo = await workspaceManager.create({
        workspace: workingDir,
        customWorkspace,
      });

      const snapshotInfo = await snapshotService.init(workspaceInfo.path);

      sessionStore.update(sessionId, {
        workingDir: workspaceInfo.path,
        customWorkspace: workspaceInfo.customWorkspace,
        workspaceType: workspaceInfo.type,
        snapshotMode: snapshotInfo.mode,
        snapshotBranch: snapshotInfo.branch,
      });

      return reply.send({
        success: true,
        data: {
          sessionId,
          workingDir: workspaceInfo.path,
          displayName: getWorkspaceDisplayName(workspaceInfo.path),
          customWorkspace: workspaceInfo.customWorkspace,
          workspaceType: workspaceInfo.type,
          snapshotMode: snapshotInfo.mode,
          snapshotBranch: snapshotInfo.branch,
        },
      });
    }
  );

  fastify.post<{ Params: SessionParams; Body: StageFilesBody }>(
    '/api/agent/:sessionId/files/stage',
    async (request: FastifyRequest<{ Params: SessionParams; Body: StageFilesBody }>, reply: FastifyReply) => {
      const { sessionId } = request.params;
      const { files } = request.body;

      const session = sessionStore.get(sessionId);
      if (!session) {
        return reply.code(404).send({
          success: false,
          error: {
            code: 'SESSION_NOT_FOUND',
            message: `Session ${sessionId} 不存在`,
          },
        });
      }

      if (!session.workingDir) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'INVALID_PARAMS',
            message: 'Session 没有绑定工作空间',
          },
        });
      }

      const stagedFiles: string[] = [];
      for (const file of files) {
        const validation = validatePath(session.workingDir, file);
        if (validation.valid) {
          await snapshotService.stageFile(session.workingDir, file);
          stagedFiles.push(file);
        }
      }

      return reply.send({
        success: true,
        data: {
          sessionId,
          staged: stagedFiles,
        },
      });
    }
  );

  fastify.post<{ Params: SessionParams; Body: DiscardFilesBody }>(
    '/api/agent/:sessionId/files/discard',
    async (request: FastifyRequest<{ Params: SessionParams; Body: DiscardFilesBody }>, reply: FastifyReply) => {
      const { sessionId } = request.params;
      const { files } = request.body;

      const session = sessionStore.get(sessionId);
      if (!session) {
        return reply.code(404).send({
          success: false,
          error: {
            code: 'SESSION_NOT_FOUND',
            message: `Session ${sessionId} 不存在`,
          },
        });
      }

      if (!session.workingDir) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'INVALID_PARAMS',
            message: 'Session 没有绑定工作空间',
          },
        });
      }

      const discardedFiles: string[] = [];
      for (const file of files) {
        const validation = validatePath(session.workingDir, file.path);
        if (validation.valid) {
          await snapshotService.discardFile(session.workingDir, file.path, file.operation);
          discardedFiles.push(file.path);
        }
      }

      return reply.send({
        success: true,
        data: {
          sessionId,
          discarded: discardedFiles,
        },
      });
    }
  );
}
