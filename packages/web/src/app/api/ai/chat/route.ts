import { NextRequest, NextResponse } from 'next/server';

const OPENCODE_SERVER_URL = process.env.OPENCODE_SERVER_URL || 'http://localhost:4096/v1/chat/completions';

async function checkOpenCodeServerHealth(): Promise<boolean> {
  try {
    const healthUrl = OPENCODE_SERVER_URL.replace('/v1/chat/completions', '/health');
    const response = await fetch(healthUrl, { method: 'GET', signal: AbortSignal.timeout(3000) });
    return response.ok;
  } catch {
    return false;
  }
}

export async function GET() {
  const isHealthy = await checkOpenCodeServerHealth();
  return NextResponse.json({
    status: isHealthy ? 'healthy' : 'unavailable',
    serverUrl: OPENCODE_SERVER_URL,
    timestamp: new Date().toISOString(),
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, sessionId, demoId } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: { message: 'messages is required and must be an array' } },
        { status: 400 }
      );
    }

    const isServerHealthy = await checkOpenCodeServerHealth();
    if (!isServerHealthy) {
      return NextResponse.json(
        {
          error: {
            message: `OpenCode Server 未运行或无法访问 (${OPENCODE_SERVER_URL})。请确保 OpenCode Server 已启动。`,
            code: 'SERVER_UNAVAILABLE',
          }
        },
        { status: 503 }
      );
    }

    const response = await fetch(OPENCODE_SERVER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'opencode',
        messages,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: { message: `OpenCode server error: ${errorText}` } },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('AI API proxy error:', error);
    return NextResponse.json(
      { error: { message: error instanceof Error ? error.message : 'Internal server error' } },
      { status: 500 }
    );
  }
}