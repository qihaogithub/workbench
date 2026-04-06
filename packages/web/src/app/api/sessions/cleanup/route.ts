import { NextResponse } from 'next/server';
import { getAgentClient } from '@/lib/agent-client';
import { createApiSuccess, createApiError } from '@/lib/fs-utils';

export async function POST() {
  try {
    const agentClient = getAgentClient();
    const health = await agentClient.health();

    if (!health.success) {
      return NextResponse.json(
        createApiError('AGENT_SERVICE_ERROR', health.error.message),
        { status: 500 }
      );
    }

    return NextResponse.json(createApiSuccess({ 
      cleaned: [], 
      count: 0,
      serviceStatus: health.data.status 
    }));
  } catch (error) {
    console.error('Error cleaning up sessions:', error);
    return NextResponse.json(
      createApiError('FILE_WRITE_ERROR', '清理 Session 失败'),
      { status: 500 }
    );
  }
}
