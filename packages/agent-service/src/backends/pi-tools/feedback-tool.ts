/**
 * Pi Agent 反馈工具
 *
 * 让 Agent 能够主动提交系统 bug 报告到 data/feedback/feedback.json。
 * 写入后无需 WS 广播（反馈不涉及实时协作通知）。
 */
import * as fs from "fs";
import * as path from "path";
import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type {
  FeedbackItem,
  FeedbackStoreData,
  FeedbackAuthor,
  FeedbackCategory,
  FeedbackSeverity,
} from "@workbench/shared";
import type { AgentConfig } from "../../core/types";
import { logger } from "../../utils/logger";

const AGENT_AUTHOR: FeedbackAuthor = {
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

function getFeedbackPath(): string {
  const dataDir = path.resolve(
    process.env.DATA_DIR || path.join(findProjectRoot(process.cwd()), "data"),
  );
  return path.join(dataDir, "feedback", "feedback.json");
}

function readFeedbackStore(): FeedbackStoreData {
  const filePath = getFeedbackPath();
  if (!fs.existsSync(filePath)) {
    return { items: [] };
  }
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw) as FeedbackStoreData;
    if (!Array.isArray(data.items)) {
      return { items: [] };
    }
    return data;
  } catch {
    return { items: [] };
  }
}

function writeFeedbackStore(data: FeedbackStoreData): void {
  const filePath = getFeedbackPath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function generateId(): string {
  return `fb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function inferSource(toolMode?: string): FeedbackItem["source"] {
  return toolMode === "viewer-readonly" ? "viewer-site" : "author-site";
}

const CATEGORIES: FeedbackCategory[] = ["bug", "suggestion", "question", "other"];
const SEVERITIES: FeedbackSeverity[] = ["high", "medium", "low"];

const SubmitFeedbackParams = Type.Object({
  category: Type.String({ description: "反馈类别: bug / suggestion / question / other" }),
  severity: Type.String({ description: "严重程度: high / medium / low" }),
  tags: Type.Optional(Type.Array(Type.String(), { description: "标签，如 预览、保存、对话、上传、AI行为" })),
  title: Type.Optional(Type.String({ description: "反馈标题（简短概括）" })),
  content: Type.String({ description: "反馈内容描述" }),
  report: Type.Optional(
    Type.Object({
      background: Type.String({ description: "问题背景：用户当时在做什么" }),
      symptom: Type.String({ description: "现象：观察到的异常" }),
      expected: Type.Optional(Type.String({ description: "期望行为" })),
      stepsToReproduce: Type.Optional(Type.String({ description: "复现线索/步骤" })),
      aiAssessment: Type.String({ description: "AI 判断为系统 bug 的依据" }),
      diagnosticClues: Type.Optional(Type.Array(Type.String(), { description: "AI 尝试的动作与工具返回/报错等排查线索" })),
    }),
  ),
  contact: Type.Optional(Type.String({ description: "用户姓名（内部系统，姓名即可联系）" })),
});
type SubmitFeedbackParams = Static<typeof SubmitFeedbackParams>;

export function createSubmitFeedbackTool(
  config: AgentConfig,
  toolMode?: string,
): AgentTool<typeof SubmitFeedbackParams> {
  return {
    name: "submit_feedback",
    label: "Submit Feedback",
    description:
      "提交系统问题反馈。当用户描述了平台功能故障、工具报错、预览/保存/上传失败、AI 行为异常等系统 bug 时，主动调用此工具生成结构化问题报告。",
    parameters: SubmitFeedbackParams,
    execute: async (_toolCallId: string, args: SubmitFeedbackParams) => {
      if (!CATEGORIES.includes(args.category as FeedbackCategory)) {
        return {
          content: [{ type: "text", text: `Error: 无效的反馈类别: ${args.category}，有效值: ${CATEGORIES.join(", ")}` }],
          details: { error: "INVALID_CATEGORY" },
          isError: true,
        };
      }
      if (!SEVERITIES.includes(args.severity as FeedbackSeverity)) {
        return {
          content: [{ type: "text", text: `Error: 无效的严重程度: ${args.severity}，有效值: ${SEVERITIES.join(", ")}` }],
          details: { error: "INVALID_SEVERITY" },
          isError: true,
        };
      }
      if (!args.content || !args.content.trim()) {
        return {
          content: [{ type: "text", text: "Error: 反馈内容不能为空" }],
          details: { error: "EMPTY_CONTENT" },
          isError: true,
        };
      }

      const source = inferSource(toolMode);
      const now = Date.now();
      const id = generateId();

      const author: FeedbackAuthor = {
        ...AGENT_AUTHOR,
        contact: args.contact || undefined,
      };

      const feedback: FeedbackItem = {
        id,
        category: args.category as FeedbackCategory,
        severity: args.severity as FeedbackSeverity,
        tags: args.tags,
        title: args.title,
        content: args.content.trim(),
        report: args.report
          ? {
              background: args.report.background,
              symptom: args.report.symptom,
              expected: args.report.expected,
              stepsToReproduce: args.report.stepsToReproduce,
              aiAssessment: args.report.aiAssessment,
              diagnosticClues: args.report.diagnosticClues,
            }
          : undefined,
        author,
        channel: "chat",
        source,
        status: "open",
        context: {
          projectId: config.projectId || undefined,
          sessionId: config.sessionId || undefined,
        },
        createdAt: now,
        updatedAt: now,
        history: [],
      };

      try {
        const data = readFeedbackStore();
        data.items.push(feedback);
        writeFeedbackStore(data);

        logger.info({ feedbackId: id, category: args.category }, "submit_feedback 已写入");

        return {
          content: [
            {
              type: "text",
              text: `已生成问题报告 #${id.slice(-4)}。类别: ${args.category}，严重程度: ${args.severity}。${args.contact ? `联系人: ${args.contact}` : ""}`,
            },
          ],
          details: { feedbackId: id },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error({ error: message }, "submit_feedback 写入失败");
        return {
          content: [{ type: "text", text: `Error: 反馈写入失败: ${message}` }],
          details: { error: "WRITE_FAILED" },
          isError: true,
        };
      }
    },
  };
}
