import { FastifyInstance } from 'fastify';
import { registerAgentRoutes } from './agent';
import { registerWebSocketRoutes } from './websocket';
import { registerProjectRoutes } from './projects';

export async function registerRoutes(fastify: FastifyInstance) {
  await registerAgentRoutes(fastify);
  await registerWebSocketRoutes(fastify);
  await registerProjectRoutes(fastify);
}
