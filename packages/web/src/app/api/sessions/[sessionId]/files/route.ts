import { NextRequest, NextResponse } from 'next/server';
import {
  getSessionFiles,
  updateSessionFiles,
  getSessionMeta,
  sessionExists,
  isSessionExpired,
  createApiSuccess,
  createApiError,
} from '@/lib/fs-utils';

export async function GET(
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
    
    const files = getSessionFiles(sessionId);
    
    if (!files) {
      return NextResponse.json(
        createApiError('FILE_READ_ERROR', '读取 Session 文件失败'),
        { status: 500 }
      );
    }
    
    return NextResponse.json(createApiSuccess(files));
  } catch (error) {
    console.error('Error getting session files:', error);
    return NextResponse.json(
      createApiError('FILE_READ_ERROR', '读取 Session 文件失败'),
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
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
    
    const body = await request.json();
    const { code, schema } = body;
    
    if (typeof code !== 'string' || typeof schema !== 'string') {
      return NextResponse.json(
        createApiError('INVALID_REQUEST', 'code 和 schema 参数必填'),
        { status: 400 }
      );
    }
    
    const success = updateSessionFiles(sessionId, { code, schema });
    
    if (!success) {
      return NextResponse.json(
        createApiError('FILE_WRITE_ERROR', '更新 Session 文件失败'),
        { status: 500 }
      );
    }
    
    return NextResponse.json(createApiSuccess(null));
  } catch (error) {
    console.error('Error updating session files:', error);
    return NextResponse.json(
      createApiError('FILE_WRITE_ERROR', '更新 Session 文件失败'),
      { status: 500 }
    );
  }
}
