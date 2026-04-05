import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import rateLimit from '@fastify/rate-limit';
import cors from '@fastify/cors';

import { loadConfig } from './utils/config';
import { getLogger } from './utils/logger';
import { getAgentManager } from './core/agent-manager';
import { getAgentFactory } from './core/agent-factory';
import { OpenCodeBackend } from './backends/opencode';
import { registerRoutes } from './routes';

const config = loadConfig();
const logger = getLogger();

async function start() {
  const fastify = Fastify({
    logger: {
      level: config.logLevel,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true },
      },
    },
  });

  await fastify.register(cors, { origin: true });
  await fastify.register(websocket);
  await fastify.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.windowMs,
  });

  const factory = getAgentFactory();
  factory.register('opencode', (agentConfig) => new OpenCodeBackend(agentConfig) as unknown as import('./core/agent').BaseAgent);

  await registerRoutes(fastify);

  fastify.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    agents: getAgentManager().count(),
  }));

  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down...');
    await getAgentManager().destroyAll();
    await fastify.close();
    process.exit(0);
  });

  await fastify.listen({ port: config.port, host: config.host });
  logger.info(`Agent service started on http://${config.host}:${config.port}`);
}

start().catch((err) => {
  logger.error('Failed to start server:', err);
  process.exit(1);
});
