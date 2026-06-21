export interface ServiceConfig {
  port: number;
  host: string;
  logLevel: string;
  internalApiToken?: string;
  piAgent: {
    provider: string;
    apiKey: string;
    model: string;
    baseUrl: string;
    timeout: number;
    subagentsEnabled: boolean;
    subagentTimeout: number;
  };
  rateLimit: {
    max: number;
    windowMs: number;
  };
}

export function loadConfig(): ServiceConfig {
  return {
    port: parseInt(process.env.PORT || '3201', 10),
    host: process.env.HOST || '0.0.0.0',
    logLevel: process.env.LOG_LEVEL || 'info',
    internalApiToken: process.env.INTERNAL_API_TOKEN || '',
    piAgent: {
      provider: process.env.PI_AGENT_PROVIDER || 'anthropic',
      apiKey: process.env.PI_AGENT_API_KEY || '',
      model: process.env.PI_AGENT_MODEL || 'claude-sonnet-4-20250514',
      baseUrl: process.env.PI_AGENT_BASE_URL || '',
      timeout: parseInt(process.env.PI_AGENT_TIMEOUT || '120000', 10),
      subagentsEnabled: process.env.PI_AGENT_SUBAGENTS_ENABLED !== 'false',
      subagentTimeout: parseInt(process.env.PI_AGENT_SUBAGENT_TIMEOUT || '120000', 10),
    },
    rateLimit: {
      max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10),
    },
  };
}
