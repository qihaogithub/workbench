import { NextResponse } from 'next/server';
import { getAgentClient } from '@/lib/agent-client';
import { createApiSuccess, createApiError } from '@/lib/fs-utils';

export async function POST(
  _request: Request,
  { params }: { params: { sessionId: string } }
) {
  try {
    const { sessionId } = params;

    const agentClient = getAgentClient();
    const result = await agentClient.destroySession(sessionId);

    if (!result.success) {
      return NextResponse.json(
        createApiError('AGENT_SERVICE_ERROR', result.error.message),
        { status: 500 }
      );
    }

    return NextResponse.json(createApiSuccess({ sessionId }));
  } catch (error) {
    console.error('Error saving session:', error);
    return NextResponse.json(
      createApiError('FILE_WRITE_ERROR', '保存 Session 失败'),
      { status: 500 }
    );
  }
}
