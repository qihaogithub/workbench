export interface ServiceConfig {
  port: number;
  host: string;
  logLevel: string;
  internalApiToken?: string;
  screenshotServiceUrl: string;
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
  imageGen: {
    enabled: boolean;
    apiKey: string;
    baseUrl: string;
    model: string;
    apiProfile: "auto" | "gpt-image" | "dall-e-3" | "generation-only";
    timeoutMs: number;
    maxPerSession: number;
    maxRetries: number;
    concurrency: number;
    maxPromptLen: number;
  };
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadConfig(): ServiceConfig {
  return {
    port: parseInt(process.env.PORT || "4201", 10),
    host: process.env.HOST || "0.0.0.0",
    logLevel: process.env.LOG_LEVEL || "info",
    internalApiToken: process.env.INTERNAL_API_TOKEN || "",
    screenshotServiceUrl:
      process.env.SCREENSHOT_SERVICE_URL || "http://localhost:4202",
    piAgent: {
      provider: process.env.PI_AGENT_PROVIDER || "anthropic",
      apiKey: process.env.PI_AGENT_API_KEY || "",
      model: process.env.PI_AGENT_MODEL || "claude-sonnet-4-20250514",
      baseUrl: process.env.PI_AGENT_BASE_URL || "",
      timeout: parseInt(process.env.PI_AGENT_TIMEOUT || "120000", 10),
      subagentsEnabled: process.env.PI_AGENT_SUBAGENTS_ENABLED !== "false",
      subagentTimeout: parseInt(
        process.env.PI_AGENT_SUBAGENT_TIMEOUT || "120000",
        10,
      ),
    },
    rateLimit: {
      max: parseInt(process.env.RATE_LIMIT_MAX || "500", 10),
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || "60000", 10),
    },
    imageGen: {
      enabled: process.env.IMAGE_GEN_ENABLED === "true",
      apiKey: process.env.IMAGE_GEN_API_KEY || "",
      baseUrl: (
        process.env.IMAGE_GEN_BASE_URL || "https://api.openai.com/v1"
      ).replace(/\/+$/, ""),
      model: process.env.IMAGE_GEN_MODEL || "dall-e-3",
      apiProfile:
        (process.env.IMAGE_GEN_API_PROFILE as
          | ServiceConfig["imageGen"]["apiProfile"]
          | undefined) || "auto",
      timeoutMs: parsePositiveInt(process.env.IMAGE_GEN_TIMEOUT_MS, 60000),
      maxPerSession: parsePositiveInt(
        process.env.IMAGE_GEN_MAX_PER_SESSION,
        30,
      ),
      maxRetries: parsePositiveInt(process.env.IMAGE_GEN_MAX_RETRIES, 3),
      concurrency: parsePositiveInt(process.env.IMAGE_GEN_CONCURRENCY, 2),
      maxPromptLen: parsePositiveInt(
        process.env.IMAGE_GEN_MAX_PROMPT_LEN,
        1000,
      ),
    },
  };
}
