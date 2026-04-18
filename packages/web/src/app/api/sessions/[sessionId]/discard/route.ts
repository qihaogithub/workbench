import { NextResponse } from 'next/server';
import { discardEditSession, getEditSession } from '@/lib/session-manager';
import { createApiSuccess, createApiError } from '@/lib/fs-utils';

export async function POST(
  _request: Request,
  { params }: { params: { sessionId: string } }
) {
  try {
    const { sessionId } = params;

    const sessionMeta = getEditSession(sessionId);
    if (!sessionMeta) {
      return NextResponse.json(
        createApiError('SESSION_NOT_FOUND'),
        { status: 404 }
      );
    }

    const success = discardEditSession(sessionId);

    if (!success) {
      return NextResponse.json(
        createApiError('FILE_WRITE_ERROR', '放弃编辑失败'),
        { status: 500 }
      );
    }

    return NextResponse.json(createApiSuccess({ sessionId, message: '已放弃编辑' }));
  } catch (error) {
    console.error('Error discarding session:', error);
    return NextResponse.json(
      createApiError('FILE_WRITE_ERROR', '放弃编辑失败'),
      { status: 500 }
    );
  }
}
