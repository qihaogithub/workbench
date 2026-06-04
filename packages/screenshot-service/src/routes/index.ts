import type { FastifyInstance } from "fastify";
import { screenshotRoutes } from "./screenshots";

export async function registerRoutes(fastify: FastifyInstance): Promise<void> {
  await fastify.register(screenshotRoutes, { prefix: "/api/screenshots" });
}
