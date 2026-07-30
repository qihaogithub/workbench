/**
 * 评论实时通知 WebSocket 频道
 *
 * 路径：/ws/comments
 * 协议：
 *   客户端 → 服务端：{ type: "subscribe", projectId } / { type: "unsubscribe", projectId }
 *   服务端 → 客户端：CommentWsEvent（comment:created / replied / resolved / deleted / ai-status）
 *
 * 广播来源：
 *   - POST /internal/comments/notify（author-site REST API 写入后调用，内部 token 鉴权）
 *   - agent-service 内部（AI 任务完成、Agent 工具回复）直接调用 broadcastCommentEvent
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import WebSocket from "ws";
import type { CommentWsEvent } from "@workbench/shared";
import { logger } from "../utils/logger";

const TOKEN_HEADER = "x-internal-token";

/** projectId → 订阅该项目的 WebSocket 连接集合 */
const subscriptions = new Map<string, Set<WebSocket>>();

/** socket → 其订阅的 projectId 集合（用于断开时清理） */
const socketSubscriptions = new Map<WebSocket, Set<string>>();

function subscribe(projectId: string, socket: WebSocket): void {
  let subs = subscriptions.get(projectId);
  if (!subs) {
    subs = new Set();
    subscriptions.set(projectId, subs);
  }
  subs.add(socket);

  let socketSubs = socketSubscriptions.get(socket);
  if (!socketSubs) {
    socketSubs = new Set();
    socketSubscriptions.set(socket, socketSubs);
  }
  socketSubs.add(projectId);
}

function unsubscribe(projectId: string, socket: WebSocket): void {
  subscriptions.get(projectId)?.delete(socket);
  if (subscriptions.get(projectId)?.size === 0) {
    subscriptions.delete(projectId);
  }
  socketSubscriptions.get(socket)?.delete(projectId);
}

function cleanupSocket(socket: WebSocket): void {
  const projectIds = socketSubscriptions.get(socket);
  if (projectIds) {
    for (const projectId of projectIds) {
      subscriptions.get(projectId)?.delete(socket);
      if (subscriptions.get(projectId)?.size === 0) {
        subscriptions.delete(projectId);
      }
    }
  }
  socketSubscriptions.delete(socket);
}

/**
 * 向订阅了指定项目的所有客户端广播评论事件。
 * 供内部通知接口、AI 任务队列、Agent 评论工具共用。
 */
export function broadcastCommentEvent(
  projectId: string,
  event: CommentWsEvent,
): void {
  const subs = subscriptions.get(projectId);
  if (!subs || subs.size === 0) return;

  const payload = JSON.stringify(event);
  for (const socket of subs) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(payload);
    }
  }
  logger.debug(
    { projectId, type: event.type, receivers: subs.size },
    "Broadcast comment event",
  );
}

function checkInternalToken(
  request: FastifyRequest,
  reply: FastifyReply,
): boolean {
  const expected =
    process.env.INTERNAL_API_TOKEN ||
    (process.env.NODE_ENV === "production" ? "" : "dev-internal-token");
  if (!expected) {
    reply.code(503).send({
      success: false,
      error: {
        code: "INTERNAL_TOKEN_NOT_SET",
        message: "agent-service 未配置 INTERNAL_API_TOKEN，拒绝内部请求",
      },
    });
    return false;
  }

  const provided = request.headers[TOKEN_HEADER];
  if (provided !== expected) {
    reply.code(401).send({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "内部接口鉴权失败",
      },
    });
    return false;
  }
  return true;
}

interface NotifyBody {
  projectId?: string;
  event?: CommentWsEvent;
}

export async function registerCommentsWsRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  /**
   * WebSocket 频道：/ws/comments
   */
  fastify.get(
    "/ws/comments",
    {
      websocket: true,
      config: {
        rateLimit: false,
      },
    },
    async (socket: WebSocket) => {
      logger.info("Comments WebSocket connection established");

      socket.on("message", (data: Buffer) => {
        let message: { type?: string; projectId?: string };
        try {
          message = JSON.parse(data.toString("utf-8"));
        } catch {
          socket.send(
            JSON.stringify({ type: "error", message: "无效的 JSON 消息" }),
          );
          return;
        }

        if (message.type === "subscribe" && typeof message.projectId === "string") {
          subscribe(message.projectId, socket);
          socket.send(
            JSON.stringify({ type: "subscribed", projectId: message.projectId }),
          );
        } else if (
          message.type === "unsubscribe" &&
          typeof message.projectId === "string"
        ) {
          unsubscribe(message.projectId, socket);
          socket.send(
            JSON.stringify({ type: "unsubscribed", projectId: message.projectId }),
          );
        }
      });

      socket.on("close", () => {
        cleanupSocket(socket);
        logger.info("Comments WebSocket connection closed");
      });

      socket.on("error", () => {
        cleanupSocket(socket);
      });
    },
  );

  /**
   * 内部通知接口：author-site 写入评论后调用，触发 WS 广播。
   * POST /internal/comments/notify  body: { projectId, event }
   */
  fastify.post(
    "/internal/comments/notify",
    async (request: FastifyRequest<{ Body: NotifyBody }>, reply: FastifyReply) => {
      if (!checkInternalToken(request, reply)) return;

      const { projectId, event } = request.body || {};
      if (!projectId || !event || typeof event.type !== "string") {
        return reply.code(400).send({
          success: false,
          error: { code: "INVALID_REQUEST", message: "projectId 和 event 必填" },
        });
      }

      broadcastCommentEvent(projectId, event);
      return { success: true, data: { delivered: true } };
    },
  );
}
