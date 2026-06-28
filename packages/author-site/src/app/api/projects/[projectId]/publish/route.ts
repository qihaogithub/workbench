import { NextRequest, NextResponse } from 'next/server';
import { publishProject } from '@/lib/publish-manager';
import { createApiSuccess, createApiError } from '@/lib/fs-utils';
import { getAuthCookie, verifyToken } from '@/lib/auth/jwt';
import { getEditSession, syncEditSessionToProjectWorkspace } from '@/lib/session-manager';

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } },
) {
  try {
    const token = getAuthCookie();
    if (!token) {
      return NextResponse.json(createApiError('UNAUTHORIZED', '未登录'), { status: 401 });
    }

    const payload = await verifyToken(token);
    if (!payload) {
      return NextResponse.json(createApiError('UNAUTHORIZED', '登录已过期'), { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const sessionId =
      typeof body.sessionId === "string" && body.sessionId.trim()
        ? body.sessionId
        : undefined;
    if (sessionId) {
      const session = getEditSession(sessionId);
      if (!session || session.demoId !== params.projectId) {
        return NextResponse.json(createApiError('SESSION_NOT_FOUND'), { status: 404 });
      }
      if (session.userId && session.userId !== payload.userId) {
        return NextResponse.json(createApiError('FORBIDDEN', '无权操作其他用户的 Session'), { status: 403 });
      }
      const synced = syncEditSessionToProjectWorkspace(sessionId);
      if (!synced.success) {
        return NextResponse.json(
          createApiError('FILE_WRITE_ERROR', synced.error || '发布前同步失败'),
          { status: 500 },
        );
      }
    }

    const result = await publishProject(params.projectId);
    return NextResponse.json(createApiSuccess(result));
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'PROJECT_NOT_FOUND') {
        return NextResponse.json(createApiError('PROJECT_NOT_FOUND'), { status: 404 });
      }
      if (error.message === 'NO_CONTENT_TO_PUBLISH') {
        return NextResponse.json(createApiError('NO_CONTENT_TO_PUBLISH', '项目没有可发布的Demo页面'), { status: 400 });
      }
      if (error.message === 'SNAPSHOT_CREATE_ERROR') {
        return NextResponse.json(createApiError('SNAPSHOT_CREATE_ERROR', '创建发布快照失败'), { status: 500 });
      }
    }
    console.error('发布失败:', error);
    return NextResponse.json(createApiError('PUBLISH_FAILED'), { status: 500 });
  }
}
