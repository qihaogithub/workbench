import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { normalizeAiError } from "@workbench/shared";
import { BackendAgent } from "../core/backend-agent";
import { getAgentManager } from "../core/agent-manager";
import type { AgentConfig, ImageAttachment } from "../core/types";
import { getSessionModelConfigs } from "../config/session-model-configs";
import { getSessionExternalAuthConfigs } from "../config/session-external-auth";
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
  model?: string;
  activePageId?: string;
  activeConfig?: Record<string, unknown>;
  history?: ViewerAiHistoryMessage[];
  images?: ImageAttachment[];
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
          externalAuth: getSessionExternalAuthConfigs().get(sessionId),
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
          if (body.model?.trim()) {
            await agent.setModel(body.model.trim());
          }
          await agent.updateSystemPrompt(buildViewerAiSystemPrompt());
        }

        const result = await agent.sendMessage(
          `${context}\n\n## 当前使用者问题\n${message}`,
          {
            stream: false,
            images: Array.isArray(body.images) ? body.images : undefined,
          },
        );

        if (!result.success) {
          const normalized = normalizeAiError(result.error, {
            fallbackCode: result.error?.code || "MESSAGE_SEND_ERROR",
            fallbackMessage: "AI 问答失败，请稍后重试。",
          });
          logger.warn(
            {
              projectId,
              sessionId,
              code: normalized.code,
              category: normalized.category,
              technicalMessage: normalized.technicalMessage,
            },
            "使用端 AI 问答返回失败",
          );
          return reply.code(500).send({
            success: false,
            error: {
              code: normalized.code,
              message: normalized.userMessage,
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

        const normalized = normalizeAiError(error, {
          fallbackCode: "VIEWER_AI_ERROR",
          fallbackMessage: "使用端 AI 问答失败，请稍后重试。",
        });
        logger.error(
          {
            error,
            projectId,
            code: normalized.code,
            category: normalized.category,
            technicalMessage: normalized.technicalMessage,
          },
          "使用端 AI 问答失败",
        );
        return reply.code(500).send({
          success: false,
          error: {
            code: normalized.code,
            message: normalized.userMessage,
          },
        });
      }
    },
  );
}
