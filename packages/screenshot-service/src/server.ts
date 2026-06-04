import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

import Fastify from "fastify";
import cors from "@fastify/cors";

import { config } from "./config";
import { registerRoutes } from "./routes";
import { getBrowserPool } from "./utils/browser-pool";

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
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  });

  await registerRoutes(fastify);

  fastify.get("/health", async () => {
    const pool = getBrowserPool();
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      browser: pool.getStatus(),
    };
  });

  const shutdown = async (signal: string) => {
    fastify.log.info(`Received ${signal}, shutting down...`);
    const pool = getBrowserPool();
    await pool.close();
    await fastify.close();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  await fastify.listen({ port: config.port, host: config.host });
  fastify.log.info(
    `Screenshot service started on http://${config.host}:${config.port}`,
  );
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
