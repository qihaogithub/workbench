import { NextRequest, NextResponse } from 'next/server';
import { getAgentClient } from '@/lib/agent-client';
import { listDemos, createApiSuccess, createApiError, getSessionFiles } from '@/lib/fs-utils';
import { findActiveSession, createEditSession } from '@/lib/session-manager';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { demoId } = body;

    if (!demoId || typeof demoId !== 'string') {
      return NextResponse.json(
        createApiError('INVALID_REQUEST', 'demoId 参数必填'),
        { status: 400 }
      );
    }

    const activeSessionId = findActiveSession(demoId);
    if (activeSessionId) {
      const files = getSessionFiles(activeSessionId);
      if (files) {
        return NextResponse.json(createApiSuccess({
          sessionId: activeSessionId,
          code: files.code,
          schema: files.schema,
        }));
      }
    }

    const result = await createEditSession(demoId);
    return NextResponse.json(createApiSuccess(result), { status: 201 });
  } catch (error) {
    console.error('Error creating session:', error);

    if (error instanceof Error && error.message.includes('不存在')) {
      return NextResponse.json(
        createApiError('DEMO_NOT_FOUND'),
        { status: 404 }
      );
    }

    return NextResponse.json(
      createApiError('FILE_WRITE_ERROR', '创建 Session 失败'),
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || undefined;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined;
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : undefined;

    const agentClient = getAgentClient();
    const result = await agentClient.listSessions({ status, limit, offset });

    if (!result.success) {
      return NextResponse.json(
        createApiError('AGENT_SERVICE_ERROR', result.error.message),
        { status: 500 }
      );
    }

    return NextResponse.json(createApiSuccess(result.data));
  } catch (error) {
    console.error('Error listing sessions:', error);
    return NextResponse.json(
      createApiError('FILE_READ_ERROR', '获取 Session 列表失败'),
      { status: 500 }
    );
  }
}
