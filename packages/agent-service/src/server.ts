import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

import Fastify from "fastify";
import websocket from "@fastify/websocket";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";

import { loadConfig } from "./utils/config";
import { getLogger } from "./utils/logger";
import { getAgentManager } from "./core/agent-manager";
import { getAgentFactory } from "./core/agent-factory";
import { PiAgentBackend } from "./backends";
import { BackendAgent } from "./core/backend-agent";
import { registerRoutes } from "./routes";
import { destroySessionStore } from "./session/session-store";
import { getBackendProvidersManager } from "./config/backend-providers";
import { getDefaultDataDir } from "./collab/workspace-file-persistence";
import {
  getWorkspaceAuthorityStartupRecoveryStatus,
  recoverWorkspaceAuthoritiesOnStartup,
} from "./workspace/workspace-authority-startup-recovery";
import { assertWorkspaceAuthorityInstancePolicy } from "./workspace/workspace-authority-instance-policy";
import { recoverCommentTasksOnStartup } from "./routes/comment-ai-task";

const config = loadConfig();
const logger = getLogger();

// 启动时初始化 backendProviders（从 .env PI_AGENT_PROVIDERS 加载）
getBackendProvidersManager().initialize();

async function start() {
  const workspaceAuthorityInstancePolicy = assertWorkspaceAuthorityInstancePolicy();
  logger.info({ workspaceAuthorityInstancePolicy }, "Workspace Authority instance policy accepted");
  const fastify = Fastify({
    logger: {
      level: config.logLevel,
      transport: {
        target: "pino-pretty",
        options: { colorize: true },
      },
    },
  });

  // 配置 CORS 允许的来源
  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",")
    : [
        "http://localhost:4200",
        "http://127.0.0.1:4200",
        "http://localhost:4300",
        "http://127.0.0.1:4300",
      ];

  await fastify.register(cors, {
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Upgrade", "Connection"],
    credentials: true,
  });
  await fastify.register(websocket);
  await fastify.register(multipart, {
    limits: { files: 1, fileSize: 20 * 1024 * 1024 },
  });

  const factory = getAgentFactory();

  // PiAgentBackend: 动态导入 (ESM-only 依赖 @earendil-works/pi-agent-core)
  try {
    factory.register(
      "pi-agent",
      (agentConfig) =>
        new BackendAgent(agentConfig, new PiAgentBackend(agentConfig)),
    );
  } catch (err) {
    console.warn(
      "[Server] pi-agent backend not available (ESM dependency issue):",
      (err as Error).message,
    );
  }

  const recovery = await recoverWorkspaceAuthoritiesOnStartup(getDefaultDataDir());
  logger.info({ recovery }, "Workspace Authority startup recovery completed");

  // 评论 @AI 任务队列启动恢复（重新入队 pending/超时的评论任务）
  recoverCommentTasksOnStartup().catch((err) => {
    logger.warn({ err }, "Comment task startup recovery failed");
  });

  await registerRoutes(fastify);

  fastify.get("/health", async () => {
    const manager = getAgentManager();

    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      agents: manager.count(),
      workspaceAuthorityRecovery: getWorkspaceAuthorityStartupRecoveryStatus(),
    };
  });

  process.on("SIGTERM", async () => {
    logger.info("Received SIGTERM, shutting down...");
    await getAgentManager().destroyAll();
    destroySessionStore();
    await fastify.close();
    process.exit(0);
  });

  await fastify.listen({ port: config.port, host: config.host });
  logger.info(`Agent service started on http://${config.host}:${config.port}`);
}

start().catch((err) => {
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});
