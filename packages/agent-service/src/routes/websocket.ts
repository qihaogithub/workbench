import { FastifyInstance, FastifyRequest } from 'fastify';
import { getAgentManager } from '../core/agent-manager';
import { AgentConfig } from '../core/types';

interface StreamParams {
  sessionId: string;
}

interface ClientMessage {
  type: 'message' | 'cancel' | 'ping';
  id?: string;
  content?: string;
  options?: {
    timeout?: number;
    stream?: boolean;
  };
  timestamp?: number;
}

export async function registerWebSocketRoutes(fastify: FastifyInstance) {
  const manager = getAgentManager();

  fastify.get<{ Params: StreamParams }>('/api/agent/:sessionId/stream', { websocket: true }, async (socket: import('ws'), request: FastifyRequest<{ Params: StreamParams }>) => {
    const { sessionId } = request.params;

    socket.on('message', async (data: Buffer) => {
      let message: ClientMessage;

      try {
        message = JSON.parse(data.toString());
      } catch {
        socket.send(JSON.stringify({
          type: 'error',
          id: 'unknown',
          error: {
            code: 'INVALID_PARAMS',
            message: '消息格式无效，必须为 JSON',
          },
        }));
        return;
      }

      switch (message.type) {
        case 'message': {
          if (!message.content) {
            socket.send(JSON.stringify({
              type: 'error',
              id: message.id || 'unknown',
              error: {
                code: 'INVALID_PARAMS',
                message: '消息内容不能为空',
              },
            }));
            return;
          }

          try {
            const config: AgentConfig = {
              sessionId,
              backend: 'opencode',
            };

            const agent = manager.getOrCreate(sessionId, config);

            if (agent.status === 'initializing') {
              await agent.start();
            }

            socket.send(JSON.stringify({
              type: 'status',
              status: 'processing',
            }));

            agent.on('stream', (event) => {
              socket.send(JSON.stringify({
                type: 'stream',
                id: message.id,
                content: event.content,
                done: event.done,
              }));
            });

            const result = await agent.sendMessage(message.content, message.options);

            if (result.success) {
              socket.send(JSON.stringify({
                type: 'finish',
                id: message.id,
                files: result.files,
                metadata: result.metadata,
              }));
            } else {
              socket.send(JSON.stringify({
                type: 'error',
                id: message.id,
                error: result.error || {
                  code: 'INTERNAL_ERROR',
                  message: 'Unknown error',
                },
              }));
            }

            socket.send(JSON.stringify({
              type: 'status',
              status: 'ready',
            }));
          } catch (error) {
            socket.send(JSON.stringify({
              type: 'error',
              id: message.id || 'unknown',
              error: {
                code: 'MESSAGE_SEND_ERROR',
                message: error instanceof Error ? error.message : 'Unknown error',
              },
            }));
          }
          break;
        }

        case 'cancel': {
          const agent = manager.get(sessionId);
          if (agent) {
            agent.cancel();
            socket.send(JSON.stringify({
              type: 'status',
              status: 'ready',
            }));
          }
          break;
        }

        case 'ping': {
          socket.send(JSON.stringify({
            type: 'pong',
            timestamp: Date.now(),
          }));
          break;
        }

        default: {
          socket.send(JSON.stringify({
            type: 'error',
            id: message.id || 'unknown',
            error: {
              code: 'INVALID_PARAMS',
              message: `未知的消息类型: ${message.type}`,
            },
          }));
        }
      }
    });

    socket.on('close', () => {
      fastify.log.info(`WebSocket connection closed for session ${sessionId}`);
    });
  });
}
