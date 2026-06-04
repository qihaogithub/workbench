import { FastifyInstance } from "fastify";
import { registerAgentRoutes } from "./agent";
import { registerWebSocketRoutes } from "./websocket";
import { registerProjectRoutes } from "./projects";
import { registerValidateRoutes } from "./validate";
import { registerModelsRoutes } from "./models";
import { registerInternalConfigRoutes } from "./internal-config";
import { registerSnapshotRoutes } from "./snapshots";

export async function registerRoutes(fastify: FastifyInstance) {
  await registerAgentRoutes(fastify);
  await registerWebSocketRoutes(fastify);
  await registerProjectRoutes(fastify);
  await registerValidateRoutes(fastify);
  await registerModelsRoutes(fastify);
  await registerInternalConfigRoutes(fastify);
  await registerSnapshotRoutes(fastify);
}
