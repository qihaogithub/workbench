import { Type, type Static } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { AgentConfig } from '../../core/types';
import { logger } from '../../utils/logger';

const AUTHOR_SITE_URL = process.env.AUTHOR_SITE_URL || 'http://localhost:3200';

const PERMISSION_TIMEOUT_MS = 60_000;

const DeletePageParams = Type.Object({
  pageId: Type.String({
    description: '要删除的页面 ID（demo 目录名），如 "homepage_a3f2"',
  }),
  pageName: Type.String({
    description: '页面名称，用于确认弹窗展示，如 "首页"',
  }),
});

type DeletePageParams = Static<typeof DeletePageParams>;

export function createDeletePageTool(config: AgentConfig): AgentTool<typeof DeletePageParams> {
  return {
    name: 'deletePage',
    label: 'Delete Page',
    description:
      '删除指定页面。调用前系统会自动弹出确认弹窗，需用户确认后才执行删除。删除文件夹时其下所有子页面也会被一并删除。项目至少保留一个页面，无法删除最后一个页面。',
    parameters: DeletePageParams,
    execute: async (_toolCallId: string, args: DeletePageParams) => {
      const { pageId, pageName } = args;
      const projectId = config.demoId;
      const sessionId = config.sessionId;

      if (!projectId) {
        return {
          content: [{ type: 'text' as const, text: 'Error: 项目 ID 不可用，无法执行删除操作' }],
          details: { pageId, error: 'missing_project_id' },
          isError: true,
        };
      }

      if (!sessionId) {
        return {
          content: [{ type: 'text' as const, text: 'Error: 会话 ID 不可用，无法执行删除操作' }],
          details: { pageId, error: 'missing_session_id' },
          isError: true,
        };
      }

      const url = `${AUTHOR_SITE_URL}/api/projects/${projectId}/demos/${pageId}?sessionId=${encodeURIComponent(sessionId)}`;

      try {
        const response = await fetch(url, { method: 'DELETE' });
        const data = await response.json();

        if (!response.ok || !data.success) {
          const errorMessage = data.error?.message || `HTTP ${response.status}`;
          logger.warn({ pageId, pageName, status: response.status, errorMessage }, 'deletePage: API returned error');

          // 针对常见错误给出友好提示
          if (errorMessage.includes('至少保留一个') || errorMessage.includes('最后一个')) {
            return {
              content: [{ type: 'text' as const, text: `无法删除页面「${pageName}」：项目至少需要保留一个页面。` }],
              details: { pageId, pageName, error: 'last_page' },
              isError: true,
            };
          }
          if (response.status === 404) {
            return {
              content: [{ type: 'text' as const, text: `页面「${pageName}」(${pageId}) 不存在，可能已被删除。` }],
              details: { pageId, pageName, error: 'not_found' },
              isError: true,
            };
          }
          if (errorMessage.includes('session') || errorMessage.includes('认证') || errorMessage.includes('过期')) {
            return {
              content: [{ type: 'text' as const, text: `删除页面「${pageName}」失败：会话已过期，请刷新页面后重试。` }],
              details: { pageId, pageName, error: 'session_expired' },
              isError: true,
            };
          }

          return {
            content: [{ type: 'text' as const, text: `删除页面「${pageName}」失败：${errorMessage}` }],
            details: { pageId, pageName, error: 'api_error' },
            isError: true,
          };
        }

        logger.info({ pageId, pageName, projectId }, 'deletePage: page deleted successfully');
        return {
          content: [{ type: 'text' as const, text: `页面「${pageName}」(${pageId}) 已成功删除。` }],
          details: { pageId, pageName, deleted: true },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ pageId, pageName, error: message }, 'deletePage: request failed');
        return {
          content: [{ type: 'text' as const, text: `删除页面「${pageName}」失败：${message}` }],
          details: { pageId, pageName, error: 'request_failed' },
          isError: true,
        };
      }
    },
  };
}

/**
 * 权限等待超时时间（毫秒），供 pi-agent.ts 的 beforeToolCall 使用
 */
export const PERMISSION_TIMEOUT = PERMISSION_TIMEOUT_MS;
