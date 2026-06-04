import { NextResponse } from 'next/server';
import { getEditSession } from '@/lib/session-manager';
import { syncSessionFromProject } from '@/lib/workspace-manager';
import { createApiSuccess, createApiError } from '@/lib/fs-utils';
import { getAuthCookie, verifyToken } from '@/lib/auth/jwt';

export async function POST(
  _request: Request,
  { params }: { params: { sessionId: string } }
) {
  try {
    const token = getAuthCookie();
    if (!token) {
      return NextResponse.json(createApiError('UNAUTHORIZED', '未登录'), {
        status: 401,
      });
    }

    const payload = await verifyToken(token);
    if (!payload) {
      return NextResponse.json(createApiError('UNAUTHORIZED', '登录已过期'), {
        status: 401,
      });
    }

    const { sessionId } = params;
    const sessionMeta = getEditSession(sessionId);
    if (!sessionMeta) {
      return NextResponse.json(createApiError('SESSION_NOT_FOUND'), {
        status: 404,
      });
    }

    if (!sessionMeta.workspaceId) {
      return NextResponse.json(
        createApiError('INVALID_REQUEST', 'Session 未绑定 workspaceId'),
        { status: 400 }
      );
    }

    const syncedPath = syncSessionFromProject(
      sessionMeta.userId || payload.userId,
      sessionMeta.demoId,
      sessionMeta.workspaceId,
    );

    if (!syncedPath) {
      return NextResponse.json(
        createApiError('FILE_WRITE_ERROR', '同步工作区失败'),
        { status: 500 }
      );
    }

    return NextResponse.json(createApiSuccess({ syncedPath }));
  } catch (error) {
    console.error('Error syncing session workspace:', error);
    return NextResponse.json(
      createApiError('FILE_WRITE_ERROR', '同步会话工作区失败'),
      { status: 500 }
    );
  }
}
