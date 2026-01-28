/**
 * Structured JSON Logging Configuration
 * Constitution requirement: Structured logging (JSON) MUST be enabled for all services
 */

import pino from 'pino';

export interface LogContext {
  correlationId?: string;
  userId?: string;
  traceId?: string;
  spanId?: string;
  [key: string]: unknown;
}

const logLevel = process.env.LOG_LEVEL ?? 'info';
const serviceName = process.env.SERVICE_NAME ?? 'chatbot';

export const logger = pino({
  name: serviceName,
  level: logLevel,
  formatters: {
    level: (label: string) => ({ level: label }),
    bindings: (bindings: pino.Bindings) => ({
      service: serviceName,
      pid: bindings.pid as number,
      hostname: bindings.hostname as string,
    }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: serviceName,
    version: process.env.SERVICE_VERSION ?? '1.0.0',
    environment: process.env.NODE_ENV ?? 'development',
  },
  redact: {
    paths: ['password', 'token', 'authorization', 'cookie', '*.password', '*.token'],
    censor: '[REDACTED]',
  },
});

/**
 * Create a child logger with additional context
 */
export function createChildLogger(context: LogContext): pino.Logger {
  return logger.child(context);
}

/**
 * Request-scoped logger factory
 */
export function createRequestLogger(correlationId: string, userId?: string): pino.Logger {
  return logger.child({
    correlationId,
    userId,
  });
}

export default logger;
