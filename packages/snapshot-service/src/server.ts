import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { registerSnapshotRoutes } from "./routes/snapshots";
import { destroyBrowser } from "./snapshot-renderer";

const PORT = parseInt(process.env.SNAPSHOT_SERVICE_PORT || "3202", 10);
const HOST = process.env.SNAPSHOT_SERVICE_HOST || "0.0.0.0";

async function start() {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || "info",
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

  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
  });

  await registerSnapshotRoutes(fastify);

  fastify.get("/health", async () => ({
    status: "ok",
    service: "snapshot-service",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  }));

  process.on("SIGTERM", async () => {
    fastify.log.info("Received SIGTERM, shutting down...");
    await destroyBrowser();
    await fastify.close();
    process.exit(0);
  });

  await fastify.listen({ port: PORT, host: HOST });
  fastify.log.info(`Snapshot service started on http://${HOST}:${PORT}`);
}

start().catch((err) => {
  console.error("Failed to start snapshot service:", err);
  process.exit(1);
});
