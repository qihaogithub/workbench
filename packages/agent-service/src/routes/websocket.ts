import { FastifyInstance, FastifyRequest } from "fastify";
import WebSocket, { WebSocketServer } from "ws";
import { getAgentManager } from "../core/agent-manager";
import {
  AgentConfig,
  AgentEvent,
  AgentResult,
  AgentStatus,
} from "../core/types";
import { AcpSessionUpdate, AcpPermissionRequest } from "../acp/types";
import { logger } from "../utils/logger";

interface StreamParams {
  sessionId: string;
}

interface ClientMessage {
  type: "message" | "cancel" | "ping" | "resume" | "set_model" | "get_models";
  id?: string;
  content?: string;
  sessionId?: string;
  modelId?: string;
  workingDir?: string;
  options?: {
    timeout?: number;
    stream?: boolean;
    resumeSessionId?: string;
  };
  timestamp?: number;
}

interface ServerMessage {
  type:
    | "stream"
    | "thought"
    | "tool_call"
    | "tool_call_update"
    | "error"
    | "finish"
    | "status"
    | "pong"
    | "permission_request"
    | "models"
    | "file_operation";
  id?: string;
  sessionId?: string;
  content?: string;
  done?: boolean;
  status?: AgentStatus;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  files?: Array<{
    path: string;
    action: "created" | "modified" | "deleted";
    content?: string;
  }>;
  metadata?: {
    model?: string;
    tokens?: {
      prompt: number;
      completion: number;
    };
    duration?: number;
  };
  toolCallId?: string;
  title?: string;
  kind?: "read" | "edit" | "execute";
  toolCallStatus?: "pending" | "in_progress" | "completed" | "failed";
  timestamp?: number;
  permissionRequest?: {
    sessionId: string;
    options: Array<{
      optionId: string;
      name: string;
    }>;
    toolCall: {
      toolCallId: string;
      title?: string;
      kind?: string;
    };
  };
  models?: Array<{
    id: string;
    label: string;
  }>;
  currentModelId?: string;
  canSwitch?: boolean;
  fileOperation?: {
    method: string;
    path: string;
    content?: string;
  };
}

interface ActiveConnection {
  socket: WebSocket;
  sessionId: string;
  lastPing: number;
}

const connections = new Map<string, ActiveConnection>();
let wss: WebSocketServer | null = null;

const HEARTBEAT_INTERVAL = 30000;
const HEARTBEAT_TIMEOUT = 60000;
const MESSAGE_TIMEOUT_MS = 600000;

function heartbeat(): void {
  const now = Date.now();
  for (const [sessionId, conn] of connections) {
    if (now - conn.lastPing > HEARTBEAT_TIMEOUT) {
      logger.info({ sessionId }, "WebSocket connection timed out, closing");
      conn.socket.terminate();
      connections.delete(sessionId);
    }
  }
}

export async function registerWebSocketRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  const manager = getAgentManager();

  wss = new WebSocketServer({ noServer: true });

  setInterval(heartbeat, HEARTBEAT_INTERVAL);

  fastify.get<{ Params: StreamParams }>(
    "/api/agent/:sessionId/stream",
    { websocket: true },
    async (
      socket: WebSocket,
      request: FastifyRequest<{ Params: StreamParams }>,
    ) => {
      const { sessionId } = request.params;
      const connectionId = `${sessionId}-${Date.now()}`;

      logger.info(
        { sessionId, connectionId },
        "WebSocket connection established",
      );

      const connection: ActiveConnection = {
        socket,
        sessionId,
        lastPing: Date.now(),
      };
      connections.set(connectionId, connection);

      const sendMessage = (message: ServerMessage): void => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify(message));
        }
      };

      const handleSessionUpdate = (update: AcpSessionUpdate): void => {
        const sessionUpdate = update.update;

        switch (sessionUpdate.sessionUpdate) {
          case "agent_message_chunk":
            sendMessage({
              type: "stream",
              sessionId,
              content: sessionUpdate.content?.text || "",
              done: false,
            });
            break;

          case "agent_thought_chunk":
            sendMessage({
              type: "thought",
              sessionId,
              content: sessionUpdate.content?.text || "",
              done: false,
            });
            break;

          case "tool_call":
            sendMessage({
              type: "tool_call",
              sessionId,
              toolCallId: sessionUpdate.toolCallId || "",
              title: sessionUpdate.title || "",
              kind:
                (sessionUpdate.kind as "read" | "edit" | "execute") ||
                "execute",
              toolCallStatus: "pending",
            });
            break;

          case "tool_call_update":
            sendMessage({
              type: "tool_call_update",
              sessionId,
              toolCallId: sessionUpdate.toolCallId || "",
              toolCallStatus:
                sessionUpdate.status === "completed" ? "completed" : "failed",
            });
            break;

          case "config_option_update":
            break;

          case "usage_update":
            break;

          default:
            logger.debug(
              { sessionUpdate: sessionUpdate.sessionUpdate },
              "Unhandled session update type",
            );
        }
      };

      const handlePermissionRequest = async (
        request: AcpPermissionRequest,
      ): Promise<{ optionId: string }> => {
        return new Promise((resolve) => {
          const handlePermissionResponse = (data: Buffer): void => {
            try {
              const message = JSON.parse(data.toString());
              if (
                message.type === "permission_response" &&
                message.permissionId
              ) {
                socket.off("message", handlePermissionResponse);
                resolve({ optionId: message.optionId });
              }
            } catch {
              // Ignore parse errors
            }
          };

          socket.on("message", handlePermissionResponse);

          sendMessage({
            type: "permission_request",
            sessionId,
            permissionRequest: {
              sessionId: request.sessionId,
              options: request.options.map((opt) => ({
                optionId: opt.optionId,
                name: opt.name,
              })),
              toolCall: {
                toolCallId: request.toolCall.toolCallId,
                title: request.toolCall.title,
                kind: request.toolCall.kind,
              },
            },
          });

          setTimeout(() => {
            socket.off("message", handlePermissionResponse);
            resolve({ optionId: "reject_once" });
          }, 60000);
        });
      };

      const handleFileOperation = (operation: {
        method: string;
        path: string;
        content?: string;
        sessionId: string;
      }): void => {
        sendMessage({
          type: "file_operation",
          sessionId,
          fileOperation: {
            method: operation.method,
            path: operation.path,
            content: operation.content,
          },
        });
      };

      socket.on("message", async (data: Buffer) => {
        connection.lastPing = Date.now();

        let message: ClientMessage;
        try {
          message = JSON.parse(data.toString());
        } catch {
          sendMessage({
            type: "error",
            id: "unknown",
            error: {
              code: "INVALID_PARAMS",
              message: "消息格式无效，必须为 JSON",
            },
          });
          return;
        }

        switch (message.type) {
          case "message": {
            if (!message.content) {
              sendMessage({
                type: "error",
                id: message.id || "unknown",
                error: {
                  code: "INVALID_PARAMS",
                  message: "消息内容不能为空",
                },
              });
              return;
            }

            logger.info(
              { workingDir: message.workingDir },
              "WebSocket message received",
            );

            try {
              const config: AgentConfig = {
                sessionId,
                backend: "opencode",
                workingDir: message.workingDir,
              };

              logger.info(
                { workingDir: config.workingDir },
                "Agent config created",
              );

              const agent = manager.getOrCreate(sessionId, config);

              if (agent.status === "initializing") {
                sendMessage({
                  type: "status",
                  sessionId,
                  status: "initializing",
                });
                await agent.start();
              }

              sendMessage({
                type: "status",
                sessionId,
                status: "processing",
              });

              const eventHandler = (event: AgentEvent): void => {
                if (event.sessionId !== sessionId) return;

                switch (event.type) {
                  case "stream":
                    sendMessage({
                      type: "stream",
                      id: message.id,
                      sessionId,
                      content: event.content,
                      done: event.done,
                    });
                    break;

                  case "thought":
                    sendMessage({
                      type: "thought",
                      id: message.id,
                      sessionId,
                      content: event.content,
                      done: event.done,
                    });
                    break;

                  case "tool_call":
                    sendMessage({
                      type: "tool_call",
                      id: message.id,
                      sessionId,
                      toolCallId: event.toolCallId,
                      title: event.title,
                      kind: event.kind,
                      toolCallStatus: event.status,
                    });
                    break;

                  case "tool_call_update":
                    sendMessage({
                      type: "tool_call_update",
                      id: message.id,
                      sessionId,
                      toolCallId: event.toolCallId,
                      toolCallStatus: event.status,
                    });
                    break;

                  case "plan":
                    sendMessage({
                      type: "plan",
                      id: message.id,
                      sessionId,
                      content: event.content,
                    });
                    break;

                  case "error":
                    sendMessage({
                      type: "error",
                      id: message.id,
                      sessionId,
                      error: event.error,
                    });
                    break;

                  case "status":
                    sendMessage({
                      type: "status",
                      id: message.id,
                      sessionId,
                      status: event.status,
                    });
                    break;

                  case "file_operation":
                    logger.info(
                      {
                        event: "file_operation",
                        path: event.fileOperation?.path,
                        contentLength: event.fileOperation?.content?.length,
                      },
                      "[WebSocket] Forwarding file_operation event to client",
                    );
                    sendMessage({
                      type: "file_operation",
                      sessionId,
                      fileOperation: event.fileOperation,
                    });
                    break;
                }
              };

              agent.on("stream", eventHandler);
              agent.on("thought", eventHandler);
              agent.on("tool_call", eventHandler);
              agent.on("tool_call_update", eventHandler);
              agent.on("plan", eventHandler);
              agent.on("error", eventHandler);
              agent.on("status", eventHandler);
              agent.on("file_operation", eventHandler);

              let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
              try {
                const sendPromise = agent.sendMessage(
                  message.content,
                  message.options,
                );
                const timeoutPromise = new Promise<AgentResult>((resolve) => {
                  timeoutHandle = setTimeout(() => {
                    logger.warn(
                      { sessionId, timeoutMs: MESSAGE_TIMEOUT_MS },
                      "Agent sendMessage timed out, cancelling",
                    );
                    agent.cancel();
                    resolve({
                      success: false,
                      error: {
                        code: "MESSAGE_TIMEOUT",
                        message: `消息处理超时（${Math.round(
                          MESSAGE_TIMEOUT_MS / 1000,
                        )}s 无响应），已自动取消`,
                        retryable: true,
                      },
                    });
                  }, MESSAGE_TIMEOUT_MS);
                });

                const result: AgentResult = await Promise.race([
                  sendPromise,
                  timeoutPromise,
                ]);

                if (result.success) {
                  sendMessage({
                    type: "finish",
                    id: message.id,
                    sessionId,
                    files: result.files,
                    metadata: result.metadata,
                  });
                } else {
                  sendMessage({
                    type: "error",
                    id: message.id,
                    sessionId,
                    error: result.error || {
                      code: "INTERNAL_ERROR",
                      message: "Unknown error",
                    },
                  });
                }

                sendMessage({
                  type: "status",
                  sessionId,
                  status: "ready",
                });
              } finally {
                if (timeoutHandle) clearTimeout(timeoutHandle);
                agent.off("stream", eventHandler);
                agent.off("thought", eventHandler);
                agent.off("tool_call", eventHandler);
                agent.off("tool_call_update", eventHandler);
                agent.off("plan", eventHandler);
                agent.off("error", eventHandler);
                agent.off("status", eventHandler);
                agent.off("file_operation", eventHandler);
              }
            } catch (error) {
              sendMessage({
                type: "error",
                id: message.id || "unknown",
                sessionId,
                error: {
                  code: "MESSAGE_SEND_ERROR",
                  message:
                    error instanceof Error ? error.message : "Unknown error",
                },
              });
            }
            break;
          }

          case "resume": {
            const resumeSessionId =
              message.options?.resumeSessionId || message.sessionId;
            if (!resumeSessionId) {
              sendMessage({
                type: "error",
                id: message.id,
                error: {
                  code: "INVALID_PARAMS",
                  message: "resumeSessionId is required",
                },
              });
              return;
            }

            try {
              const config: AgentConfig = {
                sessionId: resumeSessionId,
                backend: "opencode",
                workingDir: message.workingDir,
              };

              const agent = manager.getOrCreate(resumeSessionId, config);

              if (agent.status === "initializing") {
                sendMessage({
                  type: "status",
                  sessionId: resumeSessionId,
                  status: "initializing",
                });
                await agent.start({ resumeSessionId });
              }

              sendMessage({
                type: "status",
                sessionId: resumeSessionId,
                status: agent.status,
              });
            } catch (error) {
              sendMessage({
                type: "error",
                id: message.id,
                error: {
                  code: "SESSION_RESUME_ERROR",
                  message:
                    error instanceof Error
                      ? error.message
                      : "Failed to resume session",
                },
              });
            }
            break;
          }

          case "cancel": {
            const targetSessionId = message.sessionId || sessionId;
            const agent = manager.get(targetSessionId);
            if (agent) {
              agent.cancel();
              sendMessage({
                type: "status",
                sessionId: targetSessionId,
                status: "ready",
              });
            }
            break;
          }

          case "set_model": {
            if (!message.modelId) {
              sendMessage({
                type: "error",
                id: message.id,
                error: {
                  code: "INVALID_PARAMS",
                  message: "modelId is required",
                },
              });
              return;
            }

            try {
              const agent = manager.get(sessionId);
              if (agent && "setModel" in agent) {
                await (
                  agent as { setModel: (modelId: string) => Promise<void> }
                ).setModel(message.modelId);
                sendMessage({
                  type: "models",
                  sessionId,
                  currentModelId: message.modelId,
                });
              } else {
                sendMessage({
                  type: "error",
                  id: message.id,
                  error: {
                    code: "SESSION_NOT_FOUND",
                    message:
                      "Session not found or does not support model switching",
                  },
                });
              }
            } catch (error) {
              sendMessage({
                type: "error",
                id: message.id,
                error: {
                  code: "SET_MODEL_ERROR",
                  message:
                    error instanceof Error
                      ? error.message
                      : "Failed to set model",
                },
              });
            }
            break;
          }

          case "get_models": {
            try {
              let agent = manager.get(sessionId);
              if (!agent) {
                const config: AgentConfig = {
                  sessionId,
                  backend: "opencode",
                  workingDir: process.cwd(),
                };
                agent = manager.getOrCreate(sessionId, config);
                if (agent.status === "initializing") {
                  sendMessage({
                    type: "status",
                    sessionId,
                    status: "initializing",
                  });
                  await agent.start();
                }
              }
              if (agent && "getModelInfo" in agent) {
                const modelInfo = await (
                  agent as {
                    getModelInfo: () => {
                      currentModelId: string | null;
                      availableModels: Array<{ id: string; label: string }>;
                      canSwitch: boolean;
                    } | null;
                  }
                ).getModelInfo();
                if (modelInfo) {
                  sendMessage({
                    type: "models",
                    sessionId,
                    models: modelInfo.availableModels,
                    currentModelId: modelInfo.currentModelId || undefined,
                    canSwitch: modelInfo.canSwitch,
                  });
                } else {
                  sendMessage({
                    type: "models",
                    sessionId,
                    models: [],
                    canSwitch: false,
                  });
                }
              } else {
                sendMessage({
                  type: "error",
                  id: message.id,
                  error: {
                    code: "SESSION_NOT_FOUND",
                    message: "Session not found",
                  },
                });
              }
            } catch (error) {
              sendMessage({
                type: "error",
                id: message.id,
                error: {
                  code: "GET_MODELS_ERROR",
                  message:
                    error instanceof Error
                      ? error.message
                      : "Failed to get models",
                },
              });
            }
            break;
          }

          case "ping": {
            sendMessage({
              type: "pong",
              timestamp: Date.now(),
            });
            break;
          }

          default: {
            sendMessage({
              type: "error",
              id: message.id || "unknown",
              error: {
                code: "INVALID_PARAMS",
                message: `未知的消息类型: ${(message as { type: string }).type}`,
              },
            });
          }
        }
      });

      socket.on("close", (code, reason) => {
        logger.info(
          { sessionId, connectionId, code, reason: reason.toString() },
          "WebSocket connection closed",
        );
        connections.delete(connectionId);
      });

      socket.on("error", (error) => {
        logger.error({ sessionId, connectionId, error }, "WebSocket error");
        connections.delete(connectionId);
      });

      sendMessage({
        type: "status",
        sessionId,
        status: "ready",
      });
    },
  );
}

export function broadcastToSession(
  sessionId: string,
  message: ServerMessage,
): void {
  for (const [connectionId, conn] of connections) {
    if (
      conn.sessionId === sessionId &&
      conn.socket.readyState === WebSocket.OPEN
    ) {
      conn.socket.send(JSON.stringify(message));
    }
  }
}

export function closeAllConnections(): void {
  for (const [connectionId, conn] of connections) {
    conn.socket.close(1000, "Server shutting down");
  }
  connections.clear();
}
