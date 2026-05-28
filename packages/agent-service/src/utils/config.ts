export interface ServiceConfig {
  port: number;
  host: string;
  logLevel: string;
  opencode: {
    serverUrl: string;
    timeout: number;
  };
  piAgent: {
    provider: string;
    apiKey: string;
    model: string;
    timeout: number;
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
    opencode: {
      serverUrl: process.env.OPENCODE_SERVER_URL || 'http://localhost:4096',
      timeout: parseInt(process.env.OPENCODE_TIMEOUT || '120000', 10),
    },
    piAgent: {
      provider: process.env.PI_AGENT_PROVIDER || 'anthropic',
      apiKey: process.env.PI_AGENT_API_KEY || '',
      model: process.env.PI_AGENT_MODEL || 'claude-sonnet-4-20250514',
      timeout: parseInt(process.env.PI_AGENT_TIMEOUT || '120000', 10),
    },
    rateLimit: {
      max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10),
    },
  };
}
