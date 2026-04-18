import { NextResponse } from 'next/server';
import { saveEditSession } from '@/lib/session-manager';
import { createApiSuccess, createApiError } from '@/lib/fs-utils';

export async function POST(
  request: Request,
  { params }: { params: { sessionId: string } }
) {
  try {
    const { sessionId } = params;
    const body = await request.json().catch(() => ({}));

    const result = saveEditSession(sessionId, body.userId, body.note);

    if (!result.success) {
      if (result.error === 'Session not found') {
        return NextResponse.json(
          createApiError('SESSION_NOT_FOUND', result.error),
          { status: 404 }
        );
      }
      if (result.error === 'Session not in editing status') {
        return NextResponse.json(
          createApiError('INVALID_REQUEST', result.error),
          { status: 400 }
        );
      }
      return NextResponse.json(
        createApiError('FILE_WRITE_ERROR', result.error || '合并 Session 失败'),
        { status: 500 }
      );
    }

    return NextResponse.json(createApiSuccess({
      sessionId,
      version: result.version,
      savedAt: result.savedAt,
    }));
  } catch (error) {
    console.error('Error merging session:', error);
    return NextResponse.json(
      createApiError('FILE_WRITE_ERROR', '合并 Session 失败'),
      { status: 500 }
    );
  }
}
