import { NextResponse } from 'next/server';
import { saveEditSession } from '@/lib/session-manager';
import { createApiSuccess, createApiError } from '@/lib/fs-utils';

export async function POST(
  _request: Request,
  { params }: { params: { sessionId: string } }
) {
  try {
    const { sessionId } = params;
    
    const success = saveEditSession(sessionId);
    
    if (!success) {
      return NextResponse.json(
        createApiError('SESSION_NOT_FOUND'),
        { status: 404 }
      );
    }
    
    return NextResponse.json(createApiSuccess(null));
  } catch (error) {
    console.error('Error saving session:', error);
    return NextResponse.json(
      createApiError('FILE_WRITE_ERROR', '保存 Session 失败'),
      { status: 500 }
    );
  }
}
