import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { getSessionPath } from '@/lib/fs-utils';
import { validateFileChanges, rollbackIllegalChanges } from '@/lib/session-guard';

const OPENCODE_SERVER_URL = process.env.OPENCODE_SERVER_URL || 'http://localhost:4096';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, sessionId: localSessionId, demoId } = body as {
      message: string;
      sessionId?: string;
      demoId?: string;
    };

    console.log('[AI Chat] Request:', { message: message?.substring(0, 50), localSessionId, demoId });

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

    let opencodeSessionId: string | undefined;
    let sessionPath: string | undefined;

    if (localSessionId) {
      sessionPath = getSessionPath(localSessionId);
      const metaPath = path.join(sessionPath, '.session.json');
      if (fs.existsSync(metaPath)) {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        opencodeSessionId = meta.opencodeSessionId;
        console.log('[AI Chat] Found opencodeSessionId:', opencodeSessionId);
      }
    }

    if (!opencodeSessionId) {
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

      const sessionText = await sessionRes.text();
      let sessionData: { id?: string };
      try {
        sessionData = sessionText ? JSON.parse(sessionText) : {};
      } catch {
        console.error('[AI Chat] Session response not JSON:', sessionText.substring(0, 100));
        return NextResponse.json(
          { success: false, error: { code: 'SESSION_CREATE_ERROR', message: '创建 Session 响应格式错误' } },
          { status: 500 }
        );
      }
      opencodeSessionId = sessionData.id;
      if (!opencodeSessionId) {
        return NextResponse.json(
          { success: false, error: { code: 'SESSION_CREATE_ERROR', message: '创建 Session 未返回 ID' } },
          { status: 500 }
        );
      }
      console.log('[AI Chat] Opencode session created:', opencodeSessionId);
    }

    const messageRes = await fetch(`${OPENCODE_SERVER_URL}/session/${opencodeSessionId}/message`, {
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

    const responseText = await messageRes.text();
    console.log('[AI Chat] Raw response length:', responseText.length);

    let responseData: unknown = {};
    if (responseText.trim()) {
      try {
        responseData = JSON.parse(responseText);
      } catch {
        console.warn('[AI Chat] Response not JSON, treating as empty');
        responseData = {};
      }
    }

    const aiReply = extractAiReply(responseData);

    let updatedCode: string | undefined;
    let updatedSchema: string | undefined;

    if (sessionPath && fs.existsSync(sessionPath)) {
      const changedFiles = getChangedFilesInSession(sessionPath);
      const violations = validateFileChanges(localSessionId || '', changedFiles);

      if (violations.length > 0) {
        console.warn('[AI Chat] File violations:', violations);
        rollbackIllegalChanges(localSessionId || '', violations);
      }

      const codePath = path.join(sessionPath, 'index.tsx');
      const schemaPath = path.join(sessionPath, 'config.schema.json');

      if (fs.existsSync(codePath)) updatedCode = fs.readFileSync(codePath, 'utf-8');
      if (fs.existsSync(schemaPath)) updatedSchema = fs.readFileSync(schemaPath, 'utf-8');
    }

    return NextResponse.json({
      success: true,
      data: {
        sessionId: localSessionId || opencodeSessionId,
        aiReply,
        code: updatedCode,
        schema: updatedSchema,
      },
    });
  } catch (error) {
    console.error('[AI Chat] Error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'FILE_WRITE_ERROR', message: error instanceof Error ? error.message : '未知错误' } },
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
      if (entry.isFile()) changed.push(entry.name);
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
  if (!responseData || typeof responseData !== 'object') return '';

  const data = responseData as Record<string, unknown>;

  const parts = data.parts as Array<{ type: string; text?: string }> | undefined;
  if (Array.isArray(parts)) {
    const textParts = parts.filter(p => p.type === 'text' && p.text);
    if (textParts.length > 0) return textParts.map(p => p.text!).join('\n');
  }

  const info = data.info as Record<string, unknown> | undefined;
  if (info?.content) return info.content as string;

  if (data.content) return data.content as string;

  return '';
}
