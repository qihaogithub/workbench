import { NextResponse } from 'next/server';
import {
  deleteSession,
  sessionExists,
  createApiSuccess,
  createApiError,
} from '@/lib/fs-utils';

export async function DELETE(
  _request: Request,
  { params }: { params: { sessionId: string } }
) {
  try {
    const { sessionId } = params;
    
    if (!sessionExists(sessionId)) {
      return NextResponse.json(
        createApiError('SESSION_NOT_FOUND'),
        { status: 404 }
      );
    }
    
    const success = deleteSession(sessionId);
    
    if (!success) {
      return NextResponse.json(
        createApiError('FILE_WRITE_ERROR', '删除 Session 失败'),
        { status: 500 }
      );
    }
    
    return NextResponse.json(createApiSuccess(null));
  } catch (error) {
    console.error('Error deleting session:', error);
    return NextResponse.json(
      createApiError('FILE_WRITE_ERROR', '删除 Session 失败'),
      { status: 500 }
    );
  }
}
