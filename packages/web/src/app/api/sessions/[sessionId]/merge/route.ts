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
    console.log(`[API merge] 收到合并请求, sessionId: ${sessionId}`);
    
    if (!sessionExists(sessionId)) {
      console.error(`[API merge] session 不存在: ${sessionId}`);
      return NextResponse.json(
        createApiError('SESSION_NOT_FOUND'),
        { status: 404 }
      );
    }
    
    const sessionMeta = getSessionMeta(sessionId);
    console.log(`[API merge] sessionMeta:`, sessionMeta);
    
    if (sessionMeta && isSessionExpired(sessionMeta)) {
      console.error(`[API merge] session 已过期: ${sessionId}`);
      return NextResponse.json(
        createApiError('SESSION_EXPIRED'),
        { status: 410 }
      );
    }
    
    console.log(`[API merge] 开始执行 mergeSession...`);
    const success = mergeSession(sessionId);
    console.log(`[API merge] mergeSession 结果: ${success}`);
    
    if (!success) {
      console.error(`[API merge] mergeSession 返回 false`);
      return NextResponse.json(
        createApiError('FILE_WRITE_ERROR', '合并 Session 失败'),
        { status: 500 }
      );
    }
    
    console.log(`[API merge] 合并成功!`);
    return NextResponse.json(createApiSuccess(null));
  } catch (error) {
    console.error('[API merge] Error merging session:', error);
    return NextResponse.json(
      createApiError('FILE_WRITE_ERROR', '合并 Session 失败'),
      { status: 500 }
    );
  }
}
