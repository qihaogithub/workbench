import { NextRequest, NextResponse } from 'next/server';
import { getAgentClient } from '@/lib/agent-client';
import { getSessionPath } from '@/lib/fs-utils';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, sessionId: localSessionId, demoId } = body as {
      message: string;
      sessionId?: string;
      demoId?: string;
    };

    if (!message?.trim()) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_REQUEST', message: 'message 参数必填' } },
        { status: 400 }
      );
    }

    const agentClient = getAgentClient();
    const agentSessionId = localSessionId || `session-${Date.now()}`;

    const result = await agentClient.sendMessage(agentSessionId, message, {
      demoId,
      workingDir: localSessionId ? getSessionPath(localSessionId) : undefined,
      options: {
        timeout: 120000,
        stream: false,
      },
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { code: result.error.code, message: result.error.message } },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        sessionId: agentSessionId,
        aiReply: result.data.content || '',
        code: undefined,
        schema: undefined,
        files: result.data.files,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: { code: 'FILE_WRITE_ERROR', message: error instanceof Error ? error.message : '未知错误' } },
      { status: 500 }
    );
  }
}
