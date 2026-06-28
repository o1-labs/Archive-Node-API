import pino from 'pino';
import type { LogLevel } from 'graphql-yoga';

export { createLogger, logger, resolveLogLevel, resolveYogaLogLevel };
export type { Logger };

type Logger = pino.Logger;
type PinoLogLevel =
  | 'trace'
  | 'debug'
  | 'info'
  | 'warn'
  | 'error'
  | 'fatal'
  | 'silent';

const VALID_LEVELS = new Set<PinoLogLevel>([
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
  'silent',
]);

function resolveLogLevel(
  env: Record<string, string | undefined> = process.env
): PinoLogLevel {
  const requested = (env.LOG_LEVEL ?? 'info').toLowerCase();
  return VALID_LEVELS.has(requested as PinoLogLevel)
    ? (requested as PinoLogLevel)
    : 'info';
}

function resolveYogaLogLevel(
  env: Record<string, string | undefined> = process.env
): LogLevel | false {
  const level = resolveLogLevel(env);
  if (level === 'trace') return 'debug';
  if (level === 'fatal') return 'error';
  if (level === 'silent') return false;
  return level;
}

/**
 * Build the application logger. Emits structured JSON (one object per line) with
 * ISO timestamps, suitable for log aggregation, and is independent of the
 * optional Jaeger tracing. The level comes from `LOG_LEVEL`; an unrecognised
 * value falls back to `info` rather than throwing at startup.
 */
function createLogger(
  env: Record<string, string | undefined> = process.env
): Logger {
  const level = resolveLogLevel(env);
  return pino({
    level,
    base: { service: env.JAEGER_SERVICE_NAME ?? 'archive-api' },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      // Log the level name ("info") instead of its numeric code.
      level: (label) => ({ level: label }),
    },
  });
}

const logger = createLogger();
