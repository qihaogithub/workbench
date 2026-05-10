import { NextResponse } from 'next/server';
import { saveEditSession } from '@/lib/session-manager';
import { createApiSuccess, createApiError } from '@/lib/fs-utils';
import { getAuthCookie, verifyToken } from '@/lib/auth/jwt';

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

    const result = saveEditSession(sessionId, body.userId, body.note);

    if (!result.success) {
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
