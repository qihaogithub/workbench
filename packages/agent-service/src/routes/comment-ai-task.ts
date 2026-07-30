/**
 * 评论 @AI 异步任务队列
 *
 * 核心设计：评论即异步任务。多条 @AI 评论进入项目级队列，
 * 单个 Agent 会话批量消费、统一规划、逐条回复。
 *
 * 接口：POST /internal/comments/ai-task  body: { projectId, threadId }
 *   - 立即返回 202 Accepted（不阻塞 HTTP 响应）
 *   - 检查该项目是否已有活跃 Agent 会话：
 *     无 → 读取该项目所有 pending 评论，启动新 Agent 会话
 *     有 → 新评论由循环在下一轮自动拾取
 *   - Agent 统一规划、顺序执行，每完成一条调用 reply_comment 回复并标记状态
 *   - 队列清空后会话结束，释放项目锁
 *
 * 并发安全：项目级锁（running 标志）保证同一项目同时只有一个评论任务会话。
 * 中断恢复：服务启动时调用 recoverCommentTasksOnStartup() 重新入队。
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import * as fs from "fs";
import * as path from "path";
import type { CommentThread, CommentAiTaskStatus } from "@workbench/shared";
import { getAgentManager } from "../core/agent-manager";
import { BackendAgent } from "../core/backend-agent";
import type { AgentConfig } from "../core/types";
import type { BaseAgent } from "../core/agent";
import { getWorkbenchToolCapabilities } from "../backends/pi-tools";
import {
  readCommentStore,
  writeCommentStore,
  getProjectsDir,
  formatThread,
  AGENT_AUTHOR,
  generateReplyId,
} from "../backends/pi-tools/comment-tools";
import { broadcastCommentEvent } from "./comments-ws";
import { projectWorkspaceManager } from "../workspace/project-workspace-manager";
import { logger } from "../utils/logger";

const TOKEN_HEADER = "x-internal-token";

/** 单批评论处理的超时（毫秒） */
const BATCH_TIMEOUT_MS = 10 * 60 * 1000;
/** 单次会话最多处理的批次数（防止无限循环） */
const MAX_BATCH_ITERATIONS = 20;
/** processing 超过该时长视为失败（用于启动恢复），毫秒 */
const PROCESSING_STALE_MS = 5 * 60 * 1000;

function resolveDefaultModelId(): string {
  const raw =
    process.env.NEXT_PUBLIC_DEFAULT_MODEL_IDS ||
    process.env.DEFAULT_MODEL ||
    "";
  const first = raw.split(",")[0]?.trim();
  return first || "";
}

interface CommentTaskSession {
  projectId: string;
  sessionId: string;
  /** 项目级锁：true 表示该项目的评论任务循环正在运行 */
  running: boolean;
}

/** projectId → 评论任务会话 */
const taskSessions = new Map<string, CommentTaskSession>();

// ============================================================
// 评论状态读写辅助（直接操作 comments.json + WS 广播）
// ============================================================

function getPendingComments(projectId: string): CommentThread[] {
  return readCommentStore(projectId)
    .threads.filter((t) => t.aiTaskStatus === "pending")
    .sort((a, b) => a.createdAt - b.createdAt);
}

function setAiTaskStatus(
  projectId: string,
  threadId: string,
  status: CommentAiTaskStatus,
): void {
  const data = readCommentStore(projectId);
  const thread = data.threads.find((t) => t.id === threadId);
  if (!thread) return;
  thread.aiTaskStatus = status;
  thread.updatedAt = Date.now();
  writeCommentStore(projectId, data);
  broadcastCommentEvent(projectId, {
    type: "comment:ai-status",
    threadId,
    aiTaskStatus: status,
  });
}

/** 将评论标记为失败并追加一条说明回复 */
function markFailedWithReply(
  projectId: string,
  threadId: string,
  reason: string,
): void {
  const data = readCommentStore(projectId);
  const thread = data.threads.find((t) => t.id === threadId);
  if (!thread) return;

  thread.aiTaskStatus = "failed";
  thread.updatedAt = Date.now();
  thread.replies.push({
    id: generateReplyId(),
    content: `处理失败：${reason}`,
    author: AGENT_AUTHOR,
    createdAt: Date.now(),
  });
  writeCommentStore(projectId, data);

  broadcastCommentEvent(projectId, {
    type: "comment:ai-status",
    threadId,
    aiTaskStatus: "failed",
  });
}

// ============================================================
// 提示词构建
// ============================================================

function buildCommentSystemPrompt(): string {
  return [
    "你是一个负责处理页面评论任务的设计开发助手。",
    "用户在页面上留下了评论并 @AI，你需要逐条处理这些评论。",
    "",
    "工作流程：",
    "1. 阅读每条评论的内容和其位置元素上下文（domPath、源码位置、元素快照）。",
    "2. 评论快照可能已过期，必要时使用 inspect_element 工具按源码位置查看元素当前状态。",
    "3. 根据评论意图修改页面代码（使用你的文件编辑工具）。",
    "4. 每处理完一条评论，必须调用 reply_comment 工具回复处理结果，",
    "   并将 aiTaskStatus 设为 done（成功）或 failed（无法处理，并说明原因）。",
    "5. 如果多条评论涉及同一文件或相关修改，请统一规划、顺序执行，避免冲突。",
    "6. 全部处理完成后结束本轮。",
    "",
    "注意：评论的位置元素只是位置参考，评论意图可能与该元素相关，也可能是页面级反馈，请结合内容自行判断。",
  ].join("\n");
}

function buildCommentTaskPrompt(
  threads: CommentThread[],
  iteration: number,
): string {
  const header =
    iteration === 0
      ? `以下是当前待处理的 ${threads.length} 条评论任务，请统一规划后逐条处理：`
      : `在你处理上一批评论期间，又有 ${threads.length} 条新评论加入队列，请继续处理：`;

  const body = threads.map(formatThread).join("\n\n---\n\n");

  return [
    header,
    "",
    body,
    "",
    "请现在开始处理。处理完每一条后，务必调用 reply_comment 回复结果并标记 aiTaskStatus（done/failed）。",
  ].join("\n");
}

// ============================================================
// 任务循环
// ============================================================

async function resolveProjectWorkingDir(
  projectId: string,
): Promise<string | null> {
  try {
    await projectWorkspaceManager.init();
    const { project } = await projectWorkspaceManager.getProject(projectId);
    return project.workspacePath || null;
  } catch (error) {
    logger.warn(
      { projectId, error: error instanceof Error ? error.message : String(error) },
      "无法解析项目工作区",
    );
    return null;
  }
}

async function runCommentTaskLoop(session: CommentTaskSession): Promise<void> {
  const { projectId, sessionId } = session;
  const manager = getAgentManager();
  let agent: BaseAgent | null = null;

  try {
    const workingDir = await resolveProjectWorkingDir(projectId);
    if (!workingDir) {
      logger.error({ projectId }, "评论任务：项目工作区不存在，放弃处理");
      return;
    }

    const config: AgentConfig = {
      sessionId,
      workingDir,
      projectId,
      model: resolveDefaultModelId(),
      toolVersion: getWorkbenchToolCapabilities().toolVersion,
    };

    let iteration = 0;
    while (iteration < MAX_BATCH_ITERATIONS) {
      const pending = getPendingComments(projectId);
      if (pending.length === 0) break;

      // 标记本批为 processing
      for (const thread of pending) {
        setAiTaskStatus(projectId, thread.id, "processing");
      }

      // 惰性创建 Agent（首批时创建并注入系统提示词）
      if (!agent) {
        agent = manager.getOrCreate(sessionId, config);
        if (agent.status === "initializing") {
          await agent.start();
        }
        if (agent instanceof BackendAgent) {
          try {
            await agent.updateSystemPrompt(buildCommentSystemPrompt());
          } catch (error) {
            logger.warn(
              { sessionId, error: error instanceof Error ? error.message : String(error) },
              "评论任务：注入系统提示词失败（继续执行）",
            );
          }
        }
      }

      const prompt = buildCommentTaskPrompt(pending, iteration);
      logger.info(
        { projectId, sessionId, count: pending.length, iteration },
        "评论任务：发送批次给 Agent",
      );

      try {
        await agent.sendMessage(prompt, { timeout: BATCH_TIMEOUT_MS });
      } catch (error) {
        logger.error(
          { projectId, sessionId, error: error instanceof Error ? error.message : String(error) },
          "评论任务：Agent 处理批次出错",
        );
      }

      // 兜底：本批中仍为 processing 的评论（Agent 未完成）标记为 failed
      for (const thread of pending) {
        const current = readCommentStore(projectId).threads.find(
          (t) => t.id === thread.id,
        );
        if (current && current.aiTaskStatus === "processing") {
          markFailedWithReply(projectId, thread.id, "AI 未能在本轮完成处理，请重试");
        }
      }

      iteration += 1;
    }

    logger.info({ projectId, sessionId, iteration }, "评论任务：队列已清空");
  } catch (error) {
    logger.error(
      { projectId, sessionId, error: error instanceof Error ? error.message : String(error) },
      "评论任务：会话异常终止",
    );
  } finally {
    // 释放 Agent 与项目锁
    if (agent) {
      await manager.destroy(sessionId).catch(() => undefined);
    }
    taskSessions.delete(projectId);
  }
}

/**
 * 将项目评论任务入队。若该项目已有运行中的会话则直接返回（新评论由循环拾取）。
 */
export function enqueueCommentTask(projectId: string): void {
  let session = taskSessions.get(projectId);
  if (!session) {
    session = {
      projectId,
      sessionId: `comment-task-${projectId}`,
      running: false,
    };
    taskSessions.set(projectId, session);
  }

  if (session.running) {
    logger.info({ projectId }, "评论任务：会话运行中，新评论将由循环拾取");
    return;
  }

  session.running = true;
  void runCommentTaskLoop(session).finally(() => {
    session.running = false;
  });
}

// ============================================================
// 启动恢复
// ============================================================

/**
 * 服务启动时扫描各项目 comments.json：
 * - processing 超过 PROCESSING_STALE_MS 的评论重置为 pending
 * - 存在 pending 评论的项目重新入队
 */
export async function recoverCommentTasksOnStartup(): Promise<{
  scannedProjects: number;
  requeuedProjects: number;
  resetStaleComments: number;
}> {
  const projectsDir = getProjectsDir();
  const result = { scannedProjects: 0, requeuedProjects: 0, resetStaleComments: 0 };

  if (!fs.existsSync(projectsDir)) return result;

  let projectIds: string[] = [];
  try {
    projectIds = fs
      .readdirSync(projectsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return result;
  }

  const now = Date.now();
  for (const projectId of projectIds) {
    const commentsPath = path.join(projectsDir, projectId, "comments.json");
    if (!fs.existsSync(commentsPath)) continue;

    result.scannedProjects += 1;
    const data = readCommentStore(projectId);
    let changed = false;
    let hasPending = false;

    for (const thread of data.threads) {
      if (thread.aiTaskStatus === "processing") {
        const stale = now - thread.updatedAt > PROCESSING_STALE_MS;
        if (stale) {
          thread.aiTaskStatus = "pending";
          result.resetStaleComments += 1;
          changed = true;
        }
      }
    }
    if (changed) {
      writeCommentStore(projectId, data);
    }

    hasPending = data.threads.some((t) => t.aiTaskStatus === "pending");
    if (hasPending) {
      result.requeuedProjects += 1;
      enqueueCommentTask(projectId);
    }
  }

  logger.info(result, "评论任务：启动恢复完成");
  return result;
}

// ============================================================
// 路由
// ============================================================

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
      error: { code: "UNAUTHORIZED", message: "内部接口鉴权失败" },
    });
    return false;
  }
  return true;
}

interface AiTaskBody {
  projectId?: string;
  threadId?: string;
}

export async function registerCommentAiTaskRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  /**
   * @AI 任务入队接口。author-site 检测到 @AI 提及后调用。
   * 立即返回 202，任务在后台异步处理。
   */
  fastify.post(
    "/internal/comments/ai-task",
    async (request: FastifyRequest<{ Body: AiTaskBody }>, reply: FastifyReply) => {
      if (!checkInternalToken(request, reply)) return;

      const { projectId, threadId } = request.body || {};
      if (!projectId || typeof projectId !== "string") {
        return reply.code(400).send({
          success: false,
          error: { code: "INVALID_REQUEST", message: "projectId 必填" },
        });
      }

      // 立即返回 202，不阻塞 HTTP 响应
      reply.code(202).send({
        success: true,
        data: { accepted: true, projectId, threadId: threadId || null },
      });

      // 后台入队处理
      enqueueCommentTask(projectId);
    },
  );
}
