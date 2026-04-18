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
