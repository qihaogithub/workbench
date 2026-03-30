import { NextRequest, NextResponse } from 'next/server';

const OPENCODE_SERVER_URL = process.env.OPENCODE_SERVER_URL || 'http://localhost:4096';

interface OpenCodeMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface SSEEvent {
  type: string;
  data?: unknown;
}

async function checkOpenCodeServerHealth(): Promise<{ healthy: boolean; version?: string }> {
  try {
    const response = await fetch(`${OPENCODE_SERVER_URL}/global/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    if (response.ok) {
      const data = await response.json();
      return { healthy: true, version: data.version };
    }
    return { healthy: false };
  } catch {
    return { healthy: false };
  }
}

export async function GET() {
  const health = await checkOpenCodeServerHealth();
  return NextResponse.json({
    status: health.healthy ? 'healthy' : 'unavailable',
    version: health.version,
    serverUrl: OPENCODE_SERVER_URL,
    timestamp: new Date().toISOString(),
  });
}

function parseSSELine(line: string): { key?: string; value?: string } {
  if (line.startsWith('event:')) {
    return { key: 'event', value: line.slice(6).trim() };
  }
  if (line.startsWith('data:')) {
    return { key: 'data', value: line.slice(5).trim() };
  }
  return {};
}

async function readSSEStream(
  url: string,
  sessionId: string,
  onMessage: (content: string) => void,
  timeoutMs: number = 60000
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { 
        'Accept': 'text/event-stream',
        'x-session-id': sessionId
      },
    });

    console.log('[SSE] Response status:', response.status);
    console.log('[SSE] Response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      throw new Error(`SSE stream error: ${response.status} ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    let buffer = '';
    let lastEventType = '';

    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        console.log('[SSE] Stream completed');
        break;
      }

      const decodedValue = new TextDecoder().decode(value, { stream: true });
      console.log('[SSE] Raw chunk received:', JSON.stringify(decodedValue));
      buffer += decodedValue;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const { key, value: val } = parseSSELine(line);

        if (key === 'event') {
          lastEventType = val || '';
        }

        if (key === 'data') {
          if (val) {
            console.log('[SSE] Raw data:', val); // 添加详细日志
            try {
              const data = JSON.parse(val);
              console.log('[SSE] Parsed data:', JSON.stringify(data, null, 2)); // 解析后的日志
              
              // 处理不同类型的消息事件
              if (lastEventType === 'message' || lastEventType === 'text') {
                if (data.type === 'text' && data.text) {
                  console.log('[SSE] Extracting text from data.type:', data.text);
                  onMessage(data.text);
                }
                if (data.content || data.text) {
                  console.log('[SSE] Extracting content/text:', data.content || data.text);
                  onMessage(data.content || data.text);
                }
              }
              if (lastEventType === 'session.message') {
                if (data.parts) {
                  for (const part of data.parts) {
                    if (part.type === 'text' && part.text) {
                      console.log('[SSE] Extracting from parts:', part.text);
                      onMessage(part.text);
                    }
                  }
                }
              }
              // 处理 assistant 直接返回的消息
              if (data.choices && Array.isArray(data.choices)) {
                const choice = data.choices[0];
                if (choice?.message?.content) {
                  console.log('[SSE] Extracting from choices:', choice.message.content);
                  onMessage(choice.message.content);
                }
              }
              if (data.delta !== undefined && typeof data.delta === 'string') {
                console.log('[SSE] Extracting delta:', data.delta);
                onMessage(data.delta);
              }
              if (lastEventType === 'done') {
                return;
              }
            } catch (e) {
              console.error('[SSE] Failed to parse JSON:', e);
              onMessage(val);
            }
          }
        }
      }
    }
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();
  let isStreamClosed = false;

  console.log('[AI Chat] Received request');

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const body = await request.json();
        const { messages, sessionId: existingSessionId, demoId } = body as {
          messages: OpenCodeMessage[];
          sessionId?: string;
          demoId: string;
        };

        console.log('[AI Chat] Request body:', { messages: messages.length, sessionId: existingSessionId, demoId });

        if (!messages || !Array.isArray(messages)) {
          console.error('[AI Chat] Missing messages');
          controller.enqueue(encoder.encode(JSON.stringify({ error: { message: 'messages is required' } }) + '\n'));
          controller.close();
          return;
        }

        const health = await checkOpenCodeServerHealth();
        console.log('[AI Chat] OpenCode Server health:', health);
        if (!health.healthy) {
          console.error('[AI Chat] OpenCode Server unavailable:', OPENCODE_SERVER_URL);
          controller.enqueue(encoder.encode(JSON.stringify({
            error: { message: `OpenCode Server 未运行 (${OPENCODE_SERVER_URL})` }
          }) + '\n'));
          controller.close();
          return;
        }

        let sessionId = existingSessionId;

        if (!sessionId) {
          console.log('[AI Chat] Creating new session...');
          const sessionRes = await fetch(`${OPENCODE_SERVER_URL}/session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: `Demo: ${demoId}` }),
          });
        
          if (!sessionRes.ok) {
            const errorText = await sessionRes.text();
            console.error('[AI Chat] Failed to create session:', errorText);
            controller.enqueue(encoder.encode(JSON.stringify({ error: { message: `创建 Session 失败：${errorText}` } }) + '\n'));
            controller.close();
            return;
          }

          const sessionData = await sessionRes.json();
          sessionId = sessionData.id;
          console.log('[AI Chat] Session created:', sessionId);
          controller.enqueue(encoder.encode(JSON.stringify({ sessionId }) + '\n'));
        }

        const lastUserMessage = messages.filter((m) => m.role === 'user').pop();
        if (!lastUserMessage) {
          controller.enqueue(encoder.encode(JSON.stringify({ error: { message: 'No user message' } }) + '\n'));
          controller.close();
          return;
        }

        const messageBody = {
          template: 'build',
          parts: [{ type: 'text', text: lastUserMessage.content }],
        };

        const response = await fetch(`${OPENCODE_SERVER_URL}/session/${sessionId}/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(messageBody),
        });

        console.log('[AI Chat] Message sent, status:', response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[AI Chat] Message API error:', errorText);
          controller.enqueue(encoder.encode(JSON.stringify({ error: { message: `API error: ${errorText}` } }) + '\n'));
          controller.close();
          return;
        }

        controller.enqueue(encoder.encode(JSON.stringify({ status: 'waiting_for_response' }) + '\n'));

        let fullResponse = '';
        
        // 监听 session 的事件流
        const eventUrl = `${OPENCODE_SERVER_URL}/session/${sessionId!}/event`;
        console.log('[AI Chat] Listening to SSE stream:', eventUrl);
        
        await readSSEStream(
          eventUrl,
          sessionId!,
          (content) => {
            console.log('[AI Chat] Received content:', content.substring(0, 50));
            if (!isStreamClosed) {
              try {
                controller.enqueue(encoder.encode(JSON.stringify({ delta: content }) + '\n'));
                fullResponse += content;
              } catch (error) {
                console.error('[AI Chat] Error enqueueing content:', error);
              }
            }
          },
          120000 // 增加到 2 分钟超时
        );

        if (!isStreamClosed) {
          controller.enqueue(encoder.encode(JSON.stringify({
            done: true,
            sessionId,
            content: fullResponse,
            choices: [{ message: { role: 'assistant', content: fullResponse } }]
          }) + '\n'));
          controller.close();
        }
      } catch (error) {
        console.error('[AI Chat] Error:', error);
        if (!isStreamClosed) {
          controller.enqueue(encoder.encode(JSON.stringify({
            error: { message: error instanceof Error ? error.message : 'Unknown error' }
          }) + '\n'));
          controller.close();
        }
      }
    },
    cancel() {
      isStreamClosed = true;
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}