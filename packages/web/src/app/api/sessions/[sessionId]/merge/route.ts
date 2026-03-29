import { NextResponse } from 'next/server';
import {
  mergeSession,
  getSessionMeta,
  sessionExists,
  isSessionExpired,
  createApiSuccess,
  createApiError,
} from '@/lib/fs-utils';

export async function POST(
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
    
    const sessionMeta = getSessionMeta(sessionId);
    
    if (sessionMeta && isSessionExpired(sessionMeta)) {
      return NextResponse.json(
        createApiError('SESSION_EXPIRED'),
        { status: 410 }
      );
    }
    
    const success = mergeSession(sessionId);
    
    if (!success) {
      return NextResponse.json(
        createApiError('FILE_WRITE_ERROR', '合并 Session 失败'),
        { status: 500 }
      );
    }
    
    return NextResponse.json(createApiSuccess(null));
  } catch (error) {
    console.error('Error merging session:', error);
    return NextResponse.json(
      createApiError('FILE_WRITE_ERROR', '合并 Session 失败'),
      { status: 500 }
    );
  }
}
