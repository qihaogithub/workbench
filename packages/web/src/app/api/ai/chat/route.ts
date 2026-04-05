import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { getSessionPath } from '@/lib/fs-utils';
import { validateFileChanges, rollbackIllegalChanges } from '@/lib/session-guard';

const AGENT_SERVICE_URL = process.env.AGENT_SERVICE_URL || 'http://localhost:3001';

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

    const agentSessionId = localSessionId || `session-${Date.now()}`;

    const response = await fetch(`${AGENT_SERVICE_URL}/api/agent/${agentSessionId}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: message,
        demoId,
        workingDir: localSessionId ? getSessionPath(localSessionId) : undefined,
      }),
      signal: AbortSignal.timeout(120000),
    });

    const result = await response.json() as {
      success: boolean;
      data?: { content?: string; files?: Array<{ path: string; action: string; content?: string }> };
      error?: { code: string; message: string };
    };

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { code: result.error?.code || 'AGENT_ERROR', message: result.error?.message || 'Agent 服务错误' } },
        { status: response.status }
      );
    }

    let updatedCode: string | undefined;
    let updatedSchema: string | undefined;

    if (localSessionId) {
      const sessionPath = getSessionPath(localSessionId);
      if (fs.existsSync(sessionPath)) {
        const codePath = path.join(sessionPath, 'index.tsx');
        const schemaPath = path.join(sessionPath, 'config.schema.json');

        if (fs.existsSync(codePath)) updatedCode = fs.readFileSync(codePath, 'utf-8');
        if (fs.existsSync(schemaPath)) updatedSchema = fs.readFileSync(schemaPath, 'utf-8');
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        sessionId: agentSessionId,
        aiReply: result.data?.content || '',
        code: updatedCode,
        schema: updatedSchema,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: { code: 'FILE_WRITE_ERROR', message: error instanceof Error ? error.message : '未知错误' } },
      { status: 500 }
    );
  }
}
