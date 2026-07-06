import { FastifyInstance } from 'fastify';
import { projectWorkspaceManager } from '../workspace/project-workspace-manager';
import type {
  CreateProjectRequest,
  OpenProjectEditRequest,
  SaveProjectChangesRequest,
  RestoreVersionRequest,
} from '@workbench/shared/contracts';
import { logger } from '../utils/logger';

/**
 * 注册项目管理路由
 */
export async function registerProjectRoutes(fastify: FastifyInstance): Promise<void> {
  // 初始化项目工作空间管理器
  await projectWorkspaceManager.init();

  // ===== 项目管理 =====

  // 获取项目列表
  fastify.get('/api/projects', async (request, reply) => {
    try {
      const result = await projectWorkspaceManager.getProjects();
      return { success: true, data: result };
    } catch (error) {
      logger.error({ error }, '获取项目列表失败');
      return reply.code(500).send({
        success: false,
        error: {
          code: 'FILE_READ_ERROR',
          message: '获取项目列表失败',
        },
      });
    }
  });

  // 创建新项目
  fastify.post('/api/projects', async (request, reply) => {
    try {
      const body = request.body as CreateProjectRequest;

      if (!body.name) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: '项目名称不能为空',
          },
        });
      }

      const project = await projectWorkspaceManager.createProject(body);
      return { success: true, data: project };
    } catch (error) {
      logger.error({ error }, '创建项目失败');
      return reply.code(500).send({
        success: false,
        error: {
          code: 'WORKSPACE_CREATE_ERROR',
          message: '创建项目失败',
        },
      });
    }
  });

  // 获取项目详情
  fastify.get('/api/projects/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const result = await projectWorkspaceManager.getProject(id);
      return { success: true, data: result };
    } catch (error) {
      if (error instanceof Error && error.message === 'PROJECT_NOT_FOUND') {
        return reply.code(404).send({
          success: false,
          error: {
            code: 'PROJECT_NOT_FOUND',
            message: '项目不存在',
          },
        });
      }

      logger.error({ error }, '获取项目详情失败');
      return reply.code(500).send({
        success: false,
        error: {
          code: 'FILE_READ_ERROR',
          message: '获取项目详情失败',
        },
      });
    }
  });

  // 删除项目
  fastify.delete('/api/projects/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      await projectWorkspaceManager.deleteProject(id);
      return { success: true, message: '项目已删除' };
    } catch (error) {
      logger.error({ error }, '删除项目失败');
      return reply.code(500).send({
        success: false,
        error: {
          code: 'FILE_WRITE_ERROR',
          message: '删除项目失败',
        },
      });
    }
  });

  // ===== 编辑会话管理 =====

  // 打开项目编辑
  fastify.post('/api/projects/:id/edit', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = request.body as OpenProjectEditRequest;

      if (!body.username) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: '用户名不能为空',
          },
        });
      }

      const result = await projectWorkspaceManager.openProjectForEdit(id, body.username);
      return { success: true, data: result };
    } catch (error) {
      if (error instanceof Error && error.message === 'PROJECT_NOT_FOUND') {
        return reply.code(404).send({
          success: false,
          error: {
            code: 'PROJECT_NOT_FOUND',
            message: '项目不存在',
          },
        });
      }

      logger.error({ error }, '打开项目编辑失败');
      return reply.code(500).send({
        success: false,
        error: {
          code: 'WORKSPACE_CREATE_ERROR',
          message: '打开项目编辑失败',
        },
      });
    }
  });

  // 获取会话信息
  fastify.get('/api/sessions/:sessionId', async (request, reply) => {
    try {
      const { sessionId } = request.params as { sessionId: string };
      const { projectId } = request.query as { projectId: string };

      if (!projectId) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: '缺少 projectId 参数',
          },
        });
      }

      const session = await projectWorkspaceManager.getSession(sessionId, projectId);
      return { success: true, data: session };
    } catch (error) {
      if (error instanceof Error && error.message === 'SESSION_NOT_FOUND') {
        return reply.code(404).send({
          success: false,
          error: {
            code: 'SESSION_NOT_FOUND',
            message: '会话不存在',
          },
        });
      }

      logger.error({ error }, '获取会话信息失败');
      return reply.code(500).send({
        success: false,
        error: {
          code: 'FILE_READ_ERROR',
          message: '获取会话信息失败',
        },
      });
    }
  });

  // 保存项目变更
  fastify.post('/api/sessions/:sessionId/save', async (request, reply) => {
    try {
      const { sessionId } = request.params as { sessionId: string };
      const { projectId } = request.query as { projectId: string };
      const body = request.body as SaveProjectChangesRequest;

      if (!projectId) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: '缺少 projectId 参数',
          },
        });
      }

      const result = await projectWorkspaceManager.saveProjectChanges(sessionId, projectId, {
        note: body.note,
      });

      return { success: true, data: result };
    } catch (error) {
      if (error instanceof Error && error.message === 'SESSION_NOT_EDITING') {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'SESSION_NOT_EDITING',
            message: '会话不在编辑状态',
          },
        });
      }

      logger.error({ error }, '保存项目变更失败');
      return reply.code(500).send({
        success: false,
        error: {
          code: 'FILE_WRITE_ERROR',
          message: '保存项目变更失败',
        },
      });
    }
  });

  // 放弃编辑
  fastify.post('/api/sessions/:sessionId/discard', async (request, reply) => {
    try {
      const { sessionId } = request.params as { sessionId: string };
      const { projectId } = request.query as { projectId: string };

      if (!projectId) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: '缺少 projectId 参数',
          },
        });
      }

      await projectWorkspaceManager.discardProjectChanges(sessionId, projectId);
      return { success: true, message: '已放弃编辑' };
    } catch (error) {
      if (error instanceof Error && error.message === 'SESSION_NOT_EDITING') {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'SESSION_NOT_EDITING',
            message: '会话不在编辑状态',
          },
        });
      }

      logger.error({ error }, '放弃编辑失败');
      return reply.code(500).send({
        success: false,
        error: {
          code: 'FILE_WRITE_ERROR',
          message: '放弃编辑失败',
        },
      });
    }
  });

  // ===== 版本管理 =====

  // 获取版本历史
  fastify.get('/api/projects/:id/versions', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const result = await projectWorkspaceManager.getVersionHistory(id);
      return { success: true, data: result };
    } catch (error) {
      if (error instanceof Error && error.message === 'PROJECT_NOT_FOUND') {
        return reply.code(404).send({
          success: false,
          error: {
            code: 'PROJECT_NOT_FOUND',
            message: '项目不存在',
          },
        });
      }

      logger.error({ error }, '获取版本历史失败');
      return reply.code(500).send({
        success: false,
        error: {
          code: 'FILE_READ_ERROR',
          message: '获取版本历史失败',
        },
      });
    }
  });

  // 恢复指定版本
  fastify.post('/api/projects/:id/restore', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = request.body as RestoreVersionRequest;

      if (!body.versionId) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: '版本号不能为空',
          },
        });
      }

      if (!body.username) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: '用户名不能为空',
          },
        });
      }

      const result = await projectWorkspaceManager.restoreVersion(id, body.versionId, body.username);
      return { success: true, data: result };
    } catch (error) {
      if (error instanceof Error && error.message === 'VERSION_NOT_FOUND') {
        return reply.code(404).send({
          success: false,
          error: {
            code: 'VERSION_NOT_FOUND',
            message: '版本不存在',
          },
        });
      }

      logger.error({ error }, '恢复版本失败');
      return reply.code(500).send({
        success: false,
        error: {
          code: 'FILE_WRITE_ERROR',
          message: '恢复版本失败',
        },
      });
    }
  });

  logger.info('项目管理路由已注册');
}
