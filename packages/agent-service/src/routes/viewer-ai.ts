import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { BackendAgent } from "../core/backend-agent";
import { getAgentManager } from "../core/agent-manager";
import type { AgentConfig } from "../core/types";
import { getSessionModelConfigs } from "../config/session-model-configs";
import { projectWorkspaceManager } from "../workspace/project-workspace-manager";
import {
  buildViewerAiPromptContext,
  buildViewerAiSystemPrompt,
  type ViewerAiHistoryMessage,
} from "../services/viewer-ai-context";
import { getViewerReadonlyToolCapabilities } from "../backends/pi-tools";
import { logger } from "../utils/logger";

interface ViewerAiChatBody {
  projectId?: string;
  sessionId?: string;
  message?: string;
  activePageId?: string;
  activeConfig?: Record<string, unknown>;
  history?: ViewerAiHistoryMessage[];
}

function createSessionId(projectId: string): string {
  return `viewer-ai-${projectId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function registerViewerAiRoutes(fastify: FastifyInstance): Promise<void> {
  await projectWorkspaceManager.init();
  const manager = getAgentManager();

  fastify.post<{ Body: ViewerAiChatBody }>(
    "/api/viewer-ai/chat",
    async (
      request: FastifyRequest<{ Body: ViewerAiChatBody }>,
      reply: FastifyReply,
    ) => {
      const body = request.body || {};
      const projectId = body.projectId?.trim();
      const message = body.message?.trim();

      if (!projectId) {
        return reply.code(400).send({
          success: false,
          error: { code: "INVALID_REQUEST", message: "projectId 参数必填" },
        });
      }

      if (!message) {
        return reply.code(400).send({
          success: false,
          error: { code: "INVALID_REQUEST", message: "message 参数必填" },
        });
      }

      try {
        const { project } = await projectWorkspaceManager.getProject(projectId);
        const sessionId = body.sessionId?.trim() || createSessionId(projectId);
        const toolCapabilities = getViewerReadonlyToolCapabilities();
        const context = buildViewerAiPromptContext({
          project,
          activePageId: body.activePageId,
          activeConfig: body.activeConfig,
          history: body.history,
        });

        const config: AgentConfig = {
          sessionId,
          workingDir: project.workspacePath,
          demoId: body.activePageId,
          toolMode: "viewer-readonly",
          toolVersion: toolCapabilities.toolVersion,
          backendProviders: getSessionModelConfigs().get(sessionId),
          permissions: {
            allowedPaths: [
              "workspace-tree.json",
              "project.config.schema.json",
              "memory.md",
              "demos",
              "demos/**",
              "knowledge",
              "knowledge/**",
            ],
            deniedPatterns: [
              "**/*.env",
              "**/*.env.*",
              "**/.git",
              "**/.git/**",
              "**/node_modules",
              "**/node_modules/**",
              "**/.session.json",
              "**/.workspace.json",
            ],
            allowedCommands: [],
            deniedCommands: ["*"],
          },
        };

        const agent = manager.getOrCreate(sessionId, config);
        if (agent.status === "initializing") {
          await agent.start();
        }

        if (agent instanceof BackendAgent) {
          await agent.updateSystemPrompt(buildViewerAiSystemPrompt());
        }

        const result = await agent.sendMessage(
          `${context}\n\n## 当前使用者问题\n${message}`,
          { stream: false },
        );

        if (!result.success) {
          return reply.code(500).send({
            success: false,
            error: {
              code: result.error?.code || "MESSAGE_SEND_ERROR",
              message: result.error?.message || "AI 问答失败",
            },
          });
        }

        return reply.send({
          success: true,
          data: {
            sessionId,
            answer: result.content || "",
            metadata: result.metadata,
          },
        });
      } catch (error) {
        if (error instanceof Error && error.message === "PROJECT_NOT_FOUND") {
          return reply.code(404).send({
            success: false,
            error: { code: "PROJECT_NOT_FOUND", message: "项目不存在" },
          });
        }

        logger.error({ error, projectId }, "使用端 AI 问答失败");
        return reply.code(500).send({
          success: false,
          error: {
            code: "VIEWER_AI_ERROR",
            message: error instanceof Error ? error.message : "使用端 AI 问答失败",
          },
        });
      }
    },
  );
}
