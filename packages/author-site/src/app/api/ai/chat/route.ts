import { NextRequest, NextResponse } from 'next/server';
import { getAgentClient } from '@/lib/agent-client';
import { getSessionPath, getSessionWorkspacePath } from '@/lib/fs-utils';
import { buildStaticSystemPrompt, buildDynamicContextPrefix, buildMemoryPrefix } from '@/lib/agent/system-prompt';
import { scanWorkspaceContext, readMemoryContent } from '@/lib/agent/scan-workspace';
import {
  buildActiveViewContextPrefix,
  type ActiveViewContext,
} from '@workbench/ai-chat-shared';

// v3.2: 静态 system prompt 缓存在 module 顶部（应用启动后不再变）
// 缓存收益：每次 sendMessage 都不变 → LLM API prompt caching 100% 命中
const STATIC_SYSTEM_PROMPT = buildStaticSystemPrompt();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, sessionId: localSessionId, demoId, activeViewContext } = body as {
      message: string;
      sessionId?: string;
      demoId?: string;
      activeViewContext?: ActiveViewContext;
    };

    if (!message?.trim()) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_REQUEST', message: 'message 参数必填' } },
        { status: 400 }
      );
    }

    const agentClient = getAgentClient();
    const agentSessionId = localSessionId || `session-${Date.now()}`;

    // v3.2: 扫描工作空间 → 渲染 L3 上下文 → 拼到 user content 前面
    // L3 走 user message 前缀（不进 system prompt），L2 + L5 走 systemPrompt 字段
    // 收益：system prompt 100% 静态 → LLM API 缓存持续命中
    const workingDir = localSessionId
      ? (getSessionWorkspacePath(localSessionId) || getSessionPath(localSessionId))
      : undefined;
    const activeViewPrefix = buildActiveViewContextPrefix(activeViewContext);
    let finalContent = activeViewPrefix ? `${activeViewPrefix}${message}` : message;
    if (workingDir) {
      try {
        const context = scanWorkspaceContext(workingDir);
        const dynamicContext = buildDynamicContextPrefix(context);
        const memoryContent = readMemoryContent(workingDir);
        const memoryPrefix = memoryContent ? buildMemoryPrefix(memoryContent) : '';
        finalContent = `${dynamicContext}${memoryPrefix}${activeViewPrefix}${message}`;
      } catch (scanError) {
        // 扫描失败不应阻塞对话，记录错误继续发送原始消息
        console.warn('[AI Chat] scanWorkspaceContext 失败，使用原始内容:', scanError);
      }
    }

    const result = await agentClient.sendMessage(agentSessionId, finalContent, {
      demoId,
      workingDir,
      options: {
        timeout: 120000,
        stream: false,
        systemPrompt: STATIC_SYSTEM_PROMPT,
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
    console.error('[AI Chat] Agent 服务请求失败:', error);

    const errorMessage = error instanceof Error
      ? error.message
      : '未知错误';

    if (errorMessage.includes('fetch failed') || errorMessage.includes('ECONNREFUSED')) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'AGENT_SERVICE_UNAVAILABLE',
            message: 'Agent 服务不可用，请确保服务已启动 (http://localhost:3201)'
          }
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { success: false, error: { code: 'AGENT_ERROR', message: errorMessage } },
      { status: 500 }
    );
  }
}
