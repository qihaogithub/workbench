import pino from 'pino';

export interface Logger {
  info(obj: Record<string, unknown>, message?: string): void;
  info(message: string, ...args: unknown[]): void;
  warn(obj: Record<string, unknown>, message?: string): void;
  warn(message: string, ...args: unknown[]): void;
  error(obj: Record<string, unknown>, message?: string): void;
  error(message: string, ...args: unknown[]): void;
  debug(obj: Record<string, unknown>, message?: string): void;
  debug(message: string, ...args: unknown[]): void;
}

export function createLogger(name: string): Logger {
  return pino({
    name,
    level: process.env.LOG_LEVEL || 'info',
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
    },
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
      },
    },
  }) as unknown as Logger;
}

let globalLogger: Logger | null = null;

export function getLogger(): Logger {
  if (!globalLogger) {
    globalLogger = createLogger('agent-service');
  }
  return globalLogger;
}

export const logger = getLogger();
