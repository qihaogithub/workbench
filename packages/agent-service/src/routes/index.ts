import { FastifyInstance } from "fastify";
import { registerAgentRoutes } from "./agent";
import { registerWebSocketRoutes } from "./websocket";
import { registerProjectRoutes } from "./projects";
import { registerValidateRoutes } from "./validate";
import { registerModelsRoutes } from "./models";
import { registerInternalConfigRoutes } from "./internal-config";
import { registerCollabRoutes } from "./collab";
import { registerWorkspaceAuthorityRoutes } from "./workspace-authority";
import { registerAttachmentRoutes } from "./attachments";

export async function registerRoutes(fastify: FastifyInstance) {
  await registerAgentRoutes(fastify);
  await registerWebSocketRoutes(fastify);
  await registerAttachmentRoutes(fastify);
  await registerCollabRoutes(fastify);
  await registerWorkspaceAuthorityRoutes(fastify);
  await registerProjectRoutes(fastify);
  await registerValidateRoutes(fastify);
  await registerModelsRoutes(fastify);
  await registerInternalConfigRoutes(fastify);
}
