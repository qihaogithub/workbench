import { FastifyInstance, FastifyRequest } from "fastify";
import WebSocket, { WebSocketServer } from "ws";
import { getAgentManager } from "../core/agent-manager";
import { BackendAgent } from "../core/backend-agent";
import {
  AgentConfig,
  AgentResult,
  ImageAttachment,
} from "../core/types";
import { logger } from "../utils/logger";
import {
  WebSocketEventRouter,
  SendMessageFn,
  ServerMessage,
} from "./ws-event-router";
import { getSessionStore } from "../session/session-store";
import { getSessionModelConfigs } from "../config/session-model-configs";
import { workspaceManager } from "../workspace/workspace-manager";
import { snapshotService } from "../session/snapshot-service";
import { consoleBuffer } from "../session/console-buffer";
import { getWorkbenchToolCapabilities } from "../backends/pi-tools";
import type { BaseAgent } from "../core/agent";

function resolveDefaultModelId(): string {
  const raw = process.env.NEXT_PUBLIC_DEFAULT_MODEL_IDS || process.env.DEFAULT_MODEL || "";
  const first = raw.split(",")[0]?.trim();
  return first || "";
}

const DEFAULT_MODEL_ID = resolveDefaultModelId();

interface StreamParams {
  sessionId: string;
}

interface ClientMessage {
  type: "message" | "cancel" | "ping" | "resume" | "set_model" | "get_models" | "permission_response" | "console_data";
  id?: string;
  content?: string;
  sessionId?: string;
  modelId?: string;
  workingDir?: string;
  demoId?: string;
  images?: ImageAttachment[];
  /** v3.2: 静态 system prompt 注入（L2 + L4） */
  systemPrompt?: string;
  entries?: Array<{ level: 'log' | 'warn' | 'error' | 'info' | 'debug'; args: string; timestamp: number }>;
  options?: {
    timeout?: number;
    stream?: boolean;
    resumeSessionId?: string;
  };
  timestamp?: number;
  /** permission_response: 权限确认响应 */
  permissionId?: string;
  optionId?: string;
}

interface ActiveConnection {
  socket: WebSocket;
  sessionId: string;
  lastPing: number;
  eventRouter: WebSocketEventRouter;
}

const connections = new Map<string, ActiveConnection>();

const HEARTBEAT_INTERVAL = 30000;
const HEARTBEAT_TIMEOUT = 60000;
const MESSAGE_TIMEOUT_MS = 300000;
const MESSAGE_TIMEOUT_CHECK_INTERVAL_MS = 5000;

async function resolveCurrentModelId(agent: BaseAgent | undefined): Promise<string | null> {
  if (!agent || !("getModelInfo" in agent)) return null;

  const modelInfo = await (
    agent as {
      getModelInfo: () =>
        | { currentModelId: string | null }
        | null
        | Promise<{ currentModelId: string | null } | null>;
    }
  ).getModelInfo();

  return modelInfo?.currentModelId ?? null;
}

function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

function heartbeat(): void {
  const now = Date.now();
  for (const [sessionId, conn] of connections) {
    if (now - conn.lastPing > HEARTBEAT_TIMEOUT) {
      logger.info({ sessionId }, "WebSocket connection timed out, closing");
      conn.eventRouter.destroy();
      conn.socket.terminate();
      connections.delete(sessionId);
    }
  }
}

export async function registerWebSocketRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  const manager = getAgentManager();

  new WebSocketServer({ noServer: true });

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

      const sendMessage: SendMessageFn = (message: ServerMessage): void => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify(message));
        }
      };

      let lastAgentActivityAt = Date.now();
      const eventRouter = new WebSocketEventRouter(sessionId, sendMessage, () => {
        lastAgentActivityAt = Date.now();
      });

      const connection: ActiveConnection = {
        socket,
        sessionId,
        lastPing: Date.now(),
        eventRouter,
      };
      connections.set(connectionId, connection);

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

        // Handle console_data before switch — auxiliary data channel, no Agent involvement
        if (message.type === "console_data" && Array.isArray(message.entries)) {
          for (const entry of message.entries) {
            consoleBuffer.addEntry(sessionId, entry);
          }
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
              const existingAgent = manager.get(sessionId);
              const currentModelId = await resolveCurrentModelId(existingAgent);

              const config: AgentConfig = {
                sessionId,
                workingDir: message.workingDir,
                demoId: message.demoId,
                model: currentModelId || DEFAULT_MODEL_ID,
                toolVersion: getWorkbenchToolCapabilities().toolVersion,
                backendProviders: getSessionModelConfigs().get(sessionId),
              };

              const agent = manager.getOrCreate(sessionId, config);

              eventRouter.bindAgent(agent);

              if (agent.status === "initializing") {
                sendMessage({
                  type: "status",
                  sessionId,
                  status: "initializing",
                });
                await agent.start();

                // 同步会话元数据到全局 SessionStore
                const sessionStore = getSessionStore();
                if (!sessionStore.get(sessionId)) {
                  let workspaceInfo: { path: string; customWorkspace: boolean; type: "user" | "temp" } | undefined;
                  if (message.workingDir) {
                    workspaceInfo = await workspaceManager.create({
                      workspace: message.workingDir,
                    });
                  }

                  const snapshotInfo = workspaceInfo
                    ? await snapshotService.init(workspaceInfo.path)
                    : null;

                  sessionStore.create(sessionId, {
                    ...config,
                    workingDir: workspaceInfo?.path || message.workingDir,
                    workspaceMeta: workspaceInfo
                      ? {
                          workingDir: workspaceInfo.path,
                          customWorkspace: workspaceInfo.customWorkspace,
                          workspaceType: workspaceInfo.type,
                          snapshotMode: snapshotInfo?.mode ?? null,
                          snapshotBranch: snapshotInfo?.branch ?? null,
                        }
                      : undefined,
                  });
                }
              }

              // v3.2: 注入静态 system prompt（必须在 agent.start() 之后，因为 Pi Agent 实例在 start() 时才创建）
              if (message.systemPrompt && agent instanceof BackendAgent) {
                logger.info({ sessionId, promptLength: message.systemPrompt.length }, 'WebSocket: calling updateSystemPrompt');
                await agent.updateSystemPrompt(message.systemPrompt);
              } else if (!message.systemPrompt) {
                logger.info({ sessionId }, 'WebSocket: no systemPrompt in message, skipping update');
              } else {
                logger.warn({ sessionId, agentType: agent.constructor.name }, 'WebSocket: agent is not BackendAgent, cannot updateSystemPrompt');
              }

              sendMessage({
                type: "status",
                sessionId,
                status: "processing",
              });

              // 同步处理状态到 SessionStore
              const sessionStore = getSessionStore();
              sessionStore.update(sessionId, {
                status: "processing",
                messageCount: (sessionStore.get(sessionId)?.messageCount || 0) + 1,
              });

              const messageId = message.id || generateMessageId();
              eventRouter.startMessage(messageId, {
                contentLength: message.content.length,
                workingDir: message.workingDir,
                demoId: message.demoId,
                model: config.model,
              });

              let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

              try {
                lastAgentActivityAt = Date.now();
                const sendPromise = agent.sendMessage(
                  message.content,
                  {
                    ...message.options,
                    images: message.images,
                  },
                );
                const timeoutPromise = new Promise<AgentResult>((resolve) => {
                  const checkTimeout = () => {
                    const idleMs = Date.now() - lastAgentActivityAt;
                    if (idleMs >= MESSAGE_TIMEOUT_MS) {
                      logger.warn(
                        { sessionId, timeoutMs: MESSAGE_TIMEOUT_MS, idleMs },
                        "Agent sendMessage idle timed out, cancelling",
                      );
                      eventRouter.cancelMessage();
                      agent.cancel();
                      const partialFiles =
                        agent instanceof BackendAgent ? agent.getFiles() : [];
                      resolve({
                        success: false,
                        files: partialFiles.length > 0 ? partialFiles : undefined,
                        error: {
                          code: "MESSAGE_TIMEOUT",
                          message: `消息处理超时（连续 ${Math.round(
                            MESSAGE_TIMEOUT_MS / 1000,
                          )}s 无响应），已自动取消`,
                          retryable: true,
                        },
                      });
                      return;
                    }

                    timeoutHandle = setTimeout(
                      checkTimeout,
                      Math.min(
                        MESSAGE_TIMEOUT_CHECK_INTERVAL_MS,
                        Math.max(1000, MESSAGE_TIMEOUT_MS - idleMs),
                      ),
                    );
                  };

                  timeoutHandle = setTimeout(checkTimeout, MESSAGE_TIMEOUT_MS);
                });

                const result: AgentResult = await Promise.race([
                  sendPromise,
                  timeoutPromise,
                ]);

                if (!result.success && result.error?.code === "MESSAGE_TIMEOUT") {
                  eventRouter.cancelMessage();
                }

                eventRouter.recordFinish(result);

                if (result.success) {
                  sendMessage({
                    type: "finish",
                    id: messageId,
                    sessionId,
                    content: result.content,
                    files: result.files,
                    metadata: result.metadata,
                  });
                } else {
                  sendMessage({
                    type: "error",
                    id: messageId,
                    sessionId,
                    files: result.files,
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

                // 同步完成状态到 SessionStore
                getSessionStore().update(sessionId, {
                  status: result.success ? "ready" : "error",
                });
              } catch (error) {
                eventRouter.recordError({
                  code: "MESSAGE_SEND_ERROR",
                  message:
                    error instanceof Error ? error.message : "Unknown error",
                });
                throw error;
              } finally {
                if (timeoutHandle) clearTimeout(timeoutHandle);
                eventRouter.finishMessage();
              }
            } catch (error) {
              eventRouter.recordError({
                code: "MESSAGE_SEND_ERROR",
                message:
                  error instanceof Error ? error.message : "Unknown error",
              });
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
              const existingAgent = manager.get(resumeSessionId);
              const currentModelId = await resolveCurrentModelId(existingAgent);

              const config: AgentConfig = {
                sessionId: resumeSessionId,
                workingDir: message.workingDir,
                demoId: message.demoId,
                model: currentModelId || DEFAULT_MODEL_ID,
                toolVersion: getWorkbenchToolCapabilities().toolVersion,
                backendProviders: getSessionModelConfigs().get(resumeSessionId),
              };

              const agent = manager.getOrCreate(resumeSessionId, config);

              eventRouter.bindAgent(agent);

              if (agent.status === "initializing") {
                sendMessage({
                  type: "status",
                  sessionId: resumeSessionId,
                  status: "initializing",
                });
                await agent.start({ resumeSessionId });

                // 同步恢复会话的元数据到全局 SessionStore
                const sessionStore = getSessionStore();
                if (!sessionStore.get(resumeSessionId)) {
                  sessionStore.create(resumeSessionId, config);
                }
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
              eventRouter.cancelMessage();
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
              const sessionBackendProviders = getSessionModelConfigs().get(sessionId);
              if (!agent) {
                const config: AgentConfig = {
                  sessionId,
                  workingDir: message.workingDir || process.cwd(),
                  demoId: message.demoId,
                  model: DEFAULT_MODEL_ID,
                  toolVersion: getWorkbenchToolCapabilities().toolVersion,
                  backendProviders: sessionBackendProviders,
                };
                agent = manager.getOrCreate(sessionId, config);

                eventRouter.bindAgent(agent);

                if (agent.status === "initializing") {
                  sendMessage({
                    type: "status",
                    sessionId,
                    status: "initializing",
                  });
                  await agent.start();
                }
              } else if (sessionBackendProviders) {
                agent = manager.getOrCreate(sessionId, {
                  ...agent.getConfig(),
                  workingDir: message.workingDir || agent.getConfig().workingDir,
                  demoId: message.demoId || agent.getConfig().demoId,
                  toolVersion: getWorkbenchToolCapabilities().toolVersion,
                  backendProviders: sessionBackendProviders,
                });
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

          case "permission_response": {
            const permissionId = message.permissionId;
            const optionId = message.optionId;
            if (!permissionId || !optionId) {
              sendMessage({
                type: "error",
                id: message.id || "unknown",
                error: {
                  code: "INVALID_PARAMS",
                  message: "permission_response 需要 permissionId 和 optionId",
                },
              });
              return;
            }

            const approved = optionId === 'allow_once';
            logger.info(
              { sessionId, permissionId, optionId, approved },
              "WebSocket permission_response received",
            );

            try {
              const agent = manager.get(sessionId);
              if (agent && agent instanceof BackendAgent) {
                agent.resolvePermission(permissionId, approved);
              } else {
                logger.warn({ sessionId }, "No agent found for permission_response");
              }
            } catch (error) {
              logger.error({ error, permissionId }, "Failed to resolve permission");
            }
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

      socket.on("close", async (code, reason) => {
        logger.info(
          { sessionId, connectionId, code, reason: reason.toString() },
          "WebSocket connection closed",
        );

        eventRouter.destroy();
        connections.delete(connectionId);

        const hasOtherConnections = Array.from(connections.values()).some(
          (conn) => conn.sessionId === sessionId,
        );
        if (!hasOtherConnections) {
          const agent = manager.get(sessionId);
          if (agent && agent.status !== "processing") {
            logger.info(
              { sessionId },
              "No active connections for session, cleaning up agent",
            );
            void manager.destroy(sessionId);

            // 清理临时工作空间和会话元数据
            const sessionStore = getSessionStore();
            const session = sessionStore.get(sessionId);
            if (session?.workingDir && session.workspaceType === "temp") {
              await workspaceManager.cleanup(session.workingDir);
              snapshotService.clearSnapshot(session.workingDir);
            }
            consoleBuffer.clear(sessionId);
            getSessionModelConfigs().delete(sessionId);
            sessionStore.delete(sessionId);
          }
        }
      });

      socket.on("error", (error) => {
        logger.error({ sessionId, connectionId, error }, "WebSocket error");
        eventRouter.destroy();
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
  for (const [, conn] of connections) {
    if (
      conn.sessionId === sessionId &&
      conn.socket.readyState === WebSocket.OPEN
    ) {
      conn.socket.send(JSON.stringify(message));
    }
  }
}

export function closeAllConnections(): void {
  for (const [, conn] of connections) {
    conn.eventRouter.destroy();
    conn.socket.close(1000, "Server shutting down");
  }
  connections.clear();
}
