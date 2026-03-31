import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { getSessionPath } from '@/lib/fs-utils';
import { validateFileChanges, rollbackIllegalChanges } from '@/lib/session-guard';

const OPENCODE_SERVER_URL = process.env.OPENCODE_SERVER_URL || 'http://localhost:4096';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, sessionId: existingSessionId, demoId } = body as {
      message: string;
      sessionId?: string;
      demoId?: string;
    };

    console.log('[AI Chat] Request:', { message: message?.substring(0, 50), sessionId: existingSessionId, demoId });

    if (!message?.trim()) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_REQUEST', message: 'message 参数必填' } },
        { status: 400 }
      );
    }

    const health = await checkOpenCodeHealth();
    if (!health.healthy) {
      return NextResponse.json(
        { success: false, error: { code: 'SERVICE_UNAVAILABLE', message: `OpenCode Server 未运行 (${OPENCODE_SERVER_URL})` } },
        { status: 503 }
      );
    }

    let sessionId = existingSessionId;

    if (!sessionId) {
      console.log('[AI Chat] Creating new opencode session...');
      const sessionRes = await fetch(`${OPENCODE_SERVER_URL}/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: demoId ? `Demo: ${demoId}` : 'AI Chat' }),
        signal: AbortSignal.timeout(10000),
      });

      if (!sessionRes.ok) {
        const errorText = await sessionRes.text();
        console.error('[AI Chat] Failed to create session:', errorText);
        return NextResponse.json(
          { success: false, error: { code: 'SESSION_CREATE_ERROR', message: `创建 Session 失败：${errorText}` } },
          { status: 500 }
        );
      }

      const sessionData = await sessionRes.json();
      sessionId = sessionData.id;
      console.log('[AI Chat] Session created:', sessionId);
    }

    const messageRes = await fetch(`${OPENCODE_SERVER_URL}/session/${sessionId}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parts: [{ type: 'text', text: message }],
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!messageRes.ok) {
      const errorText = await messageRes.text();
      console.error('[AI Chat] Message API error:', errorText);
      return NextResponse.json(
        { success: false, error: { code: 'MESSAGE_SEND_ERROR', message: `发送消息失败：${errorText}` } },
        { status: 500 }
      );
    }

    const responseData = await messageRes.json();
    const aiReply = extractAiReply(responseData);

    let updatedCode: string | undefined;
    let updatedSchema: string | undefined;

    if (sessionId) {
      const sessionPath = getSessionPath(sessionId);
      if (fs.existsSync(sessionPath)) {
        const changedFiles = getChangedFilesInSession(sessionPath);
        const violations = validateFileChanges(sessionId, changedFiles);

        if (violations.length > 0) {
          console.warn('[AI Chat] File violations detected:', violations);
          rollbackIllegalChanges(sessionId, violations);
        }

        const codePath = path.join(sessionPath, 'index.tsx');
        const schemaPath = path.join(sessionPath, 'config.schema.json');

        if (fs.existsSync(codePath)) {
          updatedCode = fs.readFileSync(codePath, 'utf-8');
        }
        if (fs.existsSync(schemaPath)) {
          updatedSchema = fs.readFileSync(schemaPath, 'utf-8');
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        sessionId,
        aiReply,
        code: updatedCode,
        schema: updatedSchema,
      },
    });
  } catch (error) {
    console.error('[AI Chat] Error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : '未知错误' } },
      { status: 500 }
    );
  }
}

function getChangedFilesInSession(sessionPath: string): string[] {
  const changed: string[] = [];
  try {
    const entries = fs.readdirSync(sessionPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'opencode.json') continue;
      if (entry.isFile()) {
        changed.push(entry.name);
      }
    }
  } catch {
    return [];
  }
  return changed;
}

async function checkOpenCodeHealth(): Promise<{ healthy: boolean }> {
  try {
    const response = await fetch(`${OPENCODE_SERVER_URL}/global/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    return { healthy: response.ok };
  } catch {
    return { healthy: false };
  }
}

function extractAiReply(responseData: unknown): string {
  if (!responseData || typeof responseData !== 'object') {
    return '';
  }

  const data = responseData as Record<string, unknown>;

  const parts = data.parts as Array<{ type: string; text?: string }> | undefined;
  if (Array.isArray(parts)) {
    const textParts = parts.filter(p => p.type === 'text' && p.text);
    if (textParts.length > 0) {
      return textParts.map(p => p.text!).join('\n');
    }
  }

  const info = data.info as Record<string, unknown> | undefined;
  if (info) {
    const content = info.content as string | undefined;
    if (content) return content;
  }

  const content = data.content as string | undefined;
  if (content) return content;

  return '';
}
