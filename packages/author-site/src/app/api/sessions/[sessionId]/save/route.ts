import { NextResponse } from 'next/server';
import { getEditSession, saveEditSession } from '@/lib/session-manager';
import { createApiSuccess, createApiError } from '@/lib/fs-utils';
import { getAuthCookie, verifyToken } from '@/lib/auth/jwt';
import {
  flushWorkspaceBeforeCriticalAction,
  getWorkspaceFlushErrorResponse,
} from "@/lib/workspace-flush";

export async function POST(
  request: Request,
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
    const body = await request.json().catch(() => ({}));

    const session = getEditSession(sessionId);
    if (!session) {
      return NextResponse.json(createApiError('SESSION_NOT_FOUND', 'Session not found'), {
        status: 404,
      });
    }
    if (session.userId && session.userId !== payload.userId) {
      return NextResponse.json(
        createApiError('FORBIDDEN', '无权操作其他用户的 Session'),
        { status: 403 },
      );
    }
    try {
      await flushWorkspaceBeforeCriticalAction({
        projectId: session.demoId,
        workspaceId: session.workspaceId,
        sessionId,
      });
    } catch (error) {
      const flushError = getWorkspaceFlushErrorResponse(error);
      return NextResponse.json(
        createApiError(flushError.code, flushError.message),
        { status: flushError.status },
      );
    }

    const result = saveEditSession(sessionId, payload.username, body.note);

    if (!result.success) {
      if (result.error === 'Session not in editing status') {
        return NextResponse.json(
          createApiError('INVALID_REQUEST', result.error),
          { status: 400 }
        );
      }
      return NextResponse.json(
        createApiError('FILE_WRITE_ERROR', result.error || '保存 Session 失败'),
        { status: 500 }
      );
    }

    return NextResponse.json(createApiSuccess({
      sessionId,
      version: result.version,
      savedAt: result.savedAt,
    }));
  } catch (error) {
    console.error('Error saving session:', error);
    return NextResponse.json(
      createApiError('FILE_WRITE_ERROR', '保存 Session 失败'),
      { status: 500 }
    );
  }
}
