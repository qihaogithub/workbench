/**
 * Pi Agent 评论工具
 *
 * 让 Agent 能够读取、检查、回复、解决项目评论。
 * 评论存储为纯 JSON 文件（data/projects/<projectId>/comments.json），
 * Agent 直接读写该文件，写入后通过 broadcastCommentEvent 触发 WS 广播。
 *
 * 工具清单：
 * - read_comments：按 projectId + 可选 pageId/resolved 读取评论，输出格式化结构化文本
 * - inspect_element：按 domPath / sourceLocation 获取元素当前状态（读源码 + 解析结构）
 * - reply_comment：向指定线程添加回复（可同时更新 aiTaskStatus）
 * - resolve_comment：标记线程已解决/重新打开
 */
import * as fs from "fs";
import * as path from "path";
import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type {
  CommentThread,
  CommentStoreData,
  CommentReply,
  CommentAuthor,
} from "@workbench/shared";
import type { AgentConfig } from "../../core/types";
import { logger } from "../../utils/logger";
import { broadcastCommentEvent } from "../../routes/comments-ws";

/** Agent 回复时使用的作者身份 */
export const AGENT_AUTHOR: CommentAuthor = {
  id: "agent",
  name: "AI 助手",
  isAnonymous: false,
  isAgent: true,
};

function findProjectRoot(cwd: string): string {
  let current = path.resolve(cwd);
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml"))) {
      return current;
    }
    current = path.dirname(current);
  }
  return cwd;
}

export function getProjectsDir(): string {
  const dataDir = path.resolve(
    process.env.DATA_DIR || path.join(findProjectRoot(process.cwd()), "data"),
  );
  return path.join(dataDir, "projects");
}

function getCommentsPath(projectId: string): string {
  return path.join(getProjectsDir(), projectId, "comments.json");
}

export function readCommentStore(projectId: string): CommentStoreData {
  const filePath = getCommentsPath(projectId);
  if (!fs.existsSync(filePath)) {
    return { threads: [] };
  }
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw) as CommentStoreData;
    if (!Array.isArray(data.threads)) {
      return { threads: [] };
    }
    return data;
  } catch {
    return { threads: [] };
  }
}

export function writeCommentStore(projectId: string, data: CommentStoreData): void {
  const filePath = getCommentsPath(projectId);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export function generateReplyId(): string {
  return `rep_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function resolveProjectId(
  config: AgentConfig,
  argProjectId?: string,
): string | null {
  const projectId = argProjectId || config.projectId;
  return projectId || null;
}

export function formatThread(thread: CommentThread): string {
  const shortId = thread.id.slice(-4);
  const status = thread.resolved ? "已解决" : "未解决";
  const authorLabel = thread.author.isAnonymous
    ? `匿名(${thread.author.name})`
    : thread.author.isAgent
      ? `AI(${thread.author.name})`
      : `用户(${thread.author.name})`;

  const lines: string[] = [];
  lines.push(`[评论 #${shortId}] id=${thread.id} | 页面: ${thread.pageId} | 状态: ${status}`);
  if (thread.aiTaskStatus) {
    lines.push(`  AI任务状态: ${thread.aiTaskStatus}`);
  }
  lines.push(`  ${authorLabel}: ${thread.content}`);
  if (thread.anchor) {
    const snapshot = thread.anchor.snapshot;
    const snippet = snapshot?.outerHtml || thread.anchor.textSnippet;
    const className = snapshot?.className;
    lines.push(
      `  位置元素: <${thread.anchor.tagName}${className ? ` class="${className}"` : ""}>${snippet ? ` ${snippet}` : ""}`,
    );
    if (thread.anchor.domPath) {
      lines.push(`  domPath: ${thread.anchor.domPath}`);
    }
    const loc = snapshot?.sourceLocation;
    if (loc) {
      lines.push(
        `  源码位置: ${loc.file}${loc.line ? `:${loc.line}` : ""}${loc.column ? `:${loc.column}` : ""}`,
      );
    }
  }
  if (thread.replies.length > 0) {
    lines.push(`  --- 回复 (${thread.replies.length}) ---`);
    for (const reply of thread.replies) {
      const replyAuthor = reply.author.isAnonymous
        ? `匿名(${reply.author.name})`
        : reply.author.isAgent
          ? `AI(${reply.author.name})`
          : `用户(${reply.author.name})`;
      lines.push(`  ${replyAuthor}: ${reply.content}`);
    }
  }
  return lines.join("\n");
}

// ============================================================
// read_comments
// ============================================================

const ReadCommentsParams = Type.Object({
  projectId: Type.Optional(
    Type.String({ description: "项目 ID（不传则使用当前会话项目）" }),
  ),
  pageId: Type.Optional(Type.String({ description: "按页面 ID 过滤" })),
  resolved: Type.Optional(
    Type.Boolean({ description: "按解决状态过滤（true=已解决，false=未解决）" }),
  ),
});
type ReadCommentsParams = Static<typeof ReadCommentsParams>;

export function createReadCommentsTool(
  config: AgentConfig,
): AgentTool<typeof ReadCommentsParams> {
  return {
    name: "read_comments",
    label: "Read Comments",
    description:
      "读取项目评论列表。返回格式化的评论线程（内容、位置元素、源码位置、回复）。用于了解用户留下的评论意图和位置上下文。",
    parameters: ReadCommentsParams,
    execute: async (_toolCallId: string, args: ReadCommentsParams) => {
      const projectId = resolveProjectId(config, args.projectId);
      if (!projectId) {
        return {
          content: [{ type: "text", text: "Error: 缺少 projectId" }],
          details: { error: "MISSING_PROJECT_ID" },
          isError: true,
        };
      }

      let threads = readCommentStore(projectId).threads;
      if (args.pageId) {
        threads = threads.filter((t) => t.pageId === args.pageId);
      }
      if (args.resolved !== undefined) {
        threads = threads.filter((t) => t.resolved === args.resolved);
      }
      threads = threads.sort((a, b) => b.createdAt - a.createdAt);

      if (threads.length === 0) {
        return {
          content: [{ type: "text", text: "（暂无评论）" }],
          details: { projectId, count: 0 },
        };
      }

      const output = threads.map(formatThread).join("\n---\n\n");
      return {
        content: [{ type: "text", text: output }],
        details: { projectId, count: threads.length },
      };
    },
  };
}

// ============================================================
// inspect_element
// ============================================================

const InspectElementParams = Type.Object({
  projectId: Type.Optional(
    Type.String({ description: "项目 ID（不传则使用当前会话项目）" }),
  ),
  sourceFile: Type.Optional(
    Type.String({ description: "源码文件相对路径（相对项目工作区），如 demos/page-1/index.tsx" }),
  ),
  line: Type.Optional(Type.Number({ description: "源码行号" })),
  domPath: Type.Optional(
    Type.String({ description: "元素 DOM 选择器路径（用于在源码中辅助定位）" }),
  ),
  contextLines: Type.Optional(
    Type.Number({ description: "返回目标行上下文的行数（默认 20）" }),
  ),
});
type InspectElementParams = Static<typeof InspectElementParams>;

export function createInspectElementTool(
  config: AgentConfig,
): AgentTool<typeof InspectElementParams> {
  return {
    name: "inspect_element",
    label: "Inspect Element",
    description:
      "按源码位置获取评论锚点元素的当前状态。读取源码文件的目标行及上下文，帮助了解元素当前的真实结构（评论快照可能已过期）。",
    parameters: InspectElementParams,
    execute: async (_toolCallId: string, args: InspectElementParams) => {
      const projectId = resolveProjectId(config, args.projectId);
      if (!projectId) {
        return {
          content: [{ type: "text", text: "Error: 缺少 projectId" }],
          details: { error: "MISSING_PROJECT_ID" },
          isError: true,
        };
      }

      if (!args.sourceFile) {
        return {
          content: [{ type: "text", text: "Error: 缺少 sourceFile 参数" }],
          details: { error: "MISSING_SOURCE_FILE" },
          isError: true,
        };
      }

      const workingDir = config.workingDir || path.join(getProjectsDir(), projectId);
      const filePath = path.resolve(workingDir, args.sourceFile);

      // 安全检查：确保路径在工作区内
      if (!filePath.startsWith(path.resolve(workingDir))) {
        return {
          content: [{ type: "text", text: "Error: 源码路径超出工作区范围" }],
          details: { error: "PATH_OUT_OF_WORKSPACE" },
          isError: true,
        };
      }

      if (!fs.existsSync(filePath)) {
        return {
          content: [{ type: "text", text: `Error: 源码文件不存在: ${args.sourceFile}` }],
          details: { error: "FILE_NOT_FOUND", sourceFile: args.sourceFile },
          isError: true,
        };
      }

      try {
        const content = fs.readFileSync(filePath, "utf-8");
        const lines = content.split("\n");
        const contextLines = args.contextLines ?? 20;
        const targetLine = args.line ? Math.max(1, Math.min(args.line, lines.length)) : 1;
        const start = Math.max(0, targetLine - 1 - Math.floor(contextLines / 2));
        const end = Math.min(lines.length, start + contextLines);
        const snippet = lines
          .slice(start, end)
          .map((line, i) => `${start + i + 1}→${line}`)
          .join("\n");

        const header = [
          `# 元素当前状态`,
          `文件: ${args.sourceFile}`,
          args.line ? `目标行: ${args.line}` : "",
          args.domPath ? `domPath: ${args.domPath}` : "",
          `总行数: ${lines.length}`,
          "",
        ]
          .filter(Boolean)
          .join("\n");

        return {
          content: [{ type: "text", text: `${header}\n${snippet}` }],
          details: {
            sourceFile: args.sourceFile,
            line: targetLine,
            totalLines: lines.length,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error({ error: message }, "inspect_element 读取源码失败");
        return {
          content: [{ type: "text", text: `Error: 读取源码失败: ${message}` }],
          details: { error: "READ_FAILED" },
          isError: true,
        };
      }
    },
  };
}

// ============================================================
// reply_comment
// ============================================================

const ReplyCommentParams = Type.Object({
  projectId: Type.Optional(
    Type.String({ description: "项目 ID（不传则使用当前会话项目）" }),
  ),
  threadId: Type.String({ description: "评论线程 ID" }),
  content: Type.String({ description: "回复内容" }),
  aiTaskStatus: Type.Optional(
    Type.Union([Type.Literal("done"), Type.Literal("failed")], {
      description: "同时更新该评论的 AI 任务状态（处理完成=done，处理失败=failed）",
    }),
  ),
});
type ReplyCommentParams = Static<typeof ReplyCommentParams>;

export function createReplyCommentTool(
  config: AgentConfig,
): AgentTool<typeof ReplyCommentParams> {
  return {
    name: "reply_comment",
    label: "Reply Comment",
    description:
      "向指定评论线程添加 AI 回复。处理完一条评论后调用此工具回复结果，并可将 aiTaskStatus 标记为 done（完成）或 failed（失败）。",
    parameters: ReplyCommentParams,
    execute: async (_toolCallId: string, args: ReplyCommentParams) => {
      const projectId = resolveProjectId(config, args.projectId);
      if (!projectId) {
        return {
          content: [{ type: "text", text: "Error: 缺少 projectId" }],
          details: { error: "MISSING_PROJECT_ID" },
          isError: true,
        };
      }
      if (!args.content || !args.content.trim()) {
        return {
          content: [{ type: "text", text: "Error: 回复内容不能为空" }],
          details: { error: "EMPTY_CONTENT" },
          isError: true,
        };
      }

      const data = readCommentStore(projectId);
      const thread = data.threads.find((t) => t.id === args.threadId);
      if (!thread) {
        return {
          content: [{ type: "text", text: `Error: 评论不存在: ${args.threadId}` }],
          details: { error: "COMMENT_NOT_FOUND", threadId: args.threadId },
          isError: true,
        };
      }

      const reply: CommentReply = {
        id: generateReplyId(),
        content: args.content.trim(),
        author: AGENT_AUTHOR,
        createdAt: Date.now(),
      };
      thread.replies.push(reply);
      thread.updatedAt = Date.now();

      if (args.aiTaskStatus) {
        thread.aiTaskStatus = args.aiTaskStatus;
      }

      writeCommentStore(projectId, data);

      broadcastCommentEvent(projectId, {
        type: "comment:replied",
        threadId: thread.id,
        reply,
      });
      if (args.aiTaskStatus) {
        broadcastCommentEvent(projectId, {
          type: "comment:ai-status",
          threadId: thread.id,
          aiTaskStatus: args.aiTaskStatus,
        });
      }

      return {
        content: [
          {
            type: "text",
            text: `已回复评论 #${thread.id.slice(-4)}${args.aiTaskStatus ? `，任务状态已标记为 ${args.aiTaskStatus}` : ""}`,
          },
        ],
        details: { threadId: thread.id, replyId: reply.id },
      };
    },
  };
}

// ============================================================
// resolve_comment
// ============================================================

const ResolveCommentParams = Type.Object({
  projectId: Type.Optional(
    Type.String({ description: "项目 ID（不传则使用当前会话项目）" }),
  ),
  threadId: Type.String({ description: "评论线程 ID" }),
  resolved: Type.Boolean({ description: "true=标记已解决，false=重新打开" }),
});
type ResolveCommentParams = Static<typeof ResolveCommentParams>;

export function createResolveCommentTool(
  config: AgentConfig,
): AgentTool<typeof ResolveCommentParams> {
  return {
    name: "resolve_comment",
    label: "Resolve Comment",
    description:
      "标记评论线程为已解决（resolved=true）或重新打开（resolved=false）。",
    parameters: ResolveCommentParams,
    execute: async (_toolCallId: string, args: ResolveCommentParams) => {
      const projectId = resolveProjectId(config, args.projectId);
      if (!projectId) {
        return {
          content: [{ type: "text", text: "Error: 缺少 projectId" }],
          details: { error: "MISSING_PROJECT_ID" },
          isError: true,
        };
      }

      const data = readCommentStore(projectId);
      const thread = data.threads.find((t) => t.id === args.threadId);
      if (!thread) {
        return {
          content: [{ type: "text", text: `Error: 评论不存在: ${args.threadId}` }],
          details: { error: "COMMENT_NOT_FOUND", threadId: args.threadId },
          isError: true,
        };
      }

      thread.resolved = args.resolved;
      thread.updatedAt = Date.now();
      writeCommentStore(projectId, data);

      broadcastCommentEvent(projectId, {
        type: "comment:resolved",
        threadId: thread.id,
        resolved: args.resolved,
      });

      return {
        content: [
          {
            type: "text",
            text: `评论 #${thread.id.slice(-4)} 已${args.resolved ? "标记为已解决" : "重新打开"}`,
          },
        ],
        details: { threadId: thread.id, resolved: args.resolved },
      };
    },
  };
}
