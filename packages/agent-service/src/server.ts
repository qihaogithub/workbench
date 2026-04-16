import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import rateLimit from '@fastify/rate-limit';
import cors from '@fastify/cors';

import { loadConfig } from './utils/config';
import { getLogger } from './utils/logger';
import { getAgentManager } from './core/agent-manager';
import { getAgentFactory } from './core/agent-factory';
import {
  ClaudeBackend,
  CodexBackend,
  GeminiBackend,
  QwenBackend,
  GooseBackend,
  AuggieBackend,
  KimiBackend,
  CopilotBackend,
  QoderBackend,
  VibeBackend,
  CustomBackend,
} from './backends';
import { OpenCodeAcpBackend } from './backends/opencode-acp';
import { BackendAgent } from './core/backend-agent';
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

  // 配置 CORS 允许的来源
  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
    : ['http://localhost:3200', 'http://127.0.0.1:3200'];

  await fastify.register(cors, {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Upgrade', 'Connection'],
    credentials: true,
  });
  await fastify.register(websocket);
  await fastify.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.windowMs,
  });

  const factory = getAgentFactory();

  factory.register('opencode', (agentConfig) => new BackendAgent(agentConfig, new OpenCodeAcpBackend(agentConfig)));
  factory.register('claude', (agentConfig) => new BackendAgent(agentConfig, new ClaudeBackend(agentConfig)));
  factory.register('codex', (agentConfig) => new BackendAgent(agentConfig, new CodexBackend(agentConfig)));
  factory.register('gemini', (agentConfig) => new BackendAgent(agentConfig, new GeminiBackend(agentConfig)));
  factory.register('qwen', (agentConfig) => new BackendAgent(agentConfig, new QwenBackend(agentConfig)));
  factory.register('goose', (agentConfig) => new BackendAgent(agentConfig, new GooseBackend(agentConfig)));
  factory.register('auggie', (agentConfig) => new BackendAgent(agentConfig, new AuggieBackend(agentConfig)));
  factory.register('kimi', (agentConfig) => new BackendAgent(agentConfig, new KimiBackend(agentConfig)));
  factory.register('copilot', (agentConfig) => new BackendAgent(agentConfig, new CopilotBackend(agentConfig)));
  factory.register('qoder', (agentConfig) => new BackendAgent(agentConfig, new QoderBackend(agentConfig)));
  factory.register('vibe', (agentConfig) => new BackendAgent(agentConfig, new VibeBackend(agentConfig)));
  factory.register('custom', (agentConfig) => new BackendAgent(agentConfig, new CustomBackend(agentConfig)));

  await registerRoutes(fastify);

  fastify.get('/health', async () => {
    const backends = factory.getRegisteredTypes();
    const manager = getAgentManager();

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      agents: manager.count(),
      backends,
    };
  });

  fastify.get('/backends', async () => {
    return factory.getRegisteredTypes();
  });

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
