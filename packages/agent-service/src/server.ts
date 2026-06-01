import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

import Fastify from "fastify";
import websocket from "@fastify/websocket";
import rateLimit from "@fastify/rate-limit";
import cors from "@fastify/cors";

import { loadConfig } from "./utils/config";
import { getLogger } from "./utils/logger";
import { getAgentManager } from "./core/agent-manager";
import { getAgentFactory } from "./core/agent-factory";
import { PiAgentBackend } from "./backends";
import { BackendAgent } from "./core/backend-agent";
import { registerRoutes } from "./routes";
import { destroySessionStore } from "./session/session-store";
import { getBackendProvidersManager } from "./config/backend-providers";

const config = loadConfig();
const logger = getLogger();

// 启动时初始化 backendProviders（从 .env PI_AGENT_PROVIDERS 加载）
getBackendProvidersManager().initialize();

async function start() {
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
        "http://localhost:3200",
        "http://127.0.0.1:3200",
        "http://localhost:3300",
        "http://127.0.0.1:3300",
      ];

  await fastify.register(cors, {
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Upgrade", "Connection"],
    credentials: true,
  });
  await fastify.register(websocket);
  await fastify.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.windowMs,
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

  await registerRoutes(fastify);

  fastify.get("/health", async () => {
    const manager = getAgentManager();

    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      agents: manager.count(),
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
  logger.error("Failed to start server:", err);
  process.exit(1);
});
