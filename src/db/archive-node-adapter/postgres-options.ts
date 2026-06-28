import type postgres from 'postgres';

export { buildPostgresOptions, resolvePoolConfig, POOL_DEFAULTS };
export type { PostgresPoolConfig };

/**
 * Connection-pool and timeout configuration for the archive-node Postgres
 * client. Without these limits a single expensive query can hold a connection
 * open indefinitely, exhausting the pool and cascading into an outage. The
 * defaults are deliberately conservative so the server is safe to expose
 * publicly out of the box, and every value is tunable via the environment.
 */
interface PostgresPoolConfig {
  /** Maximum number of pooled connections (per host). */
  max: number;
  /** Seconds a connection may sit idle before it is closed. */
  idleTimeout: number;
  /** Seconds to wait for a new connection before giving up. */
  connectTimeout: number;
  /**
   * Server-side `statement_timeout` in milliseconds. A query running longer
   * than this is cancelled by Postgres. `0` disables the timeout.
   */
  statementTimeout: number;
}

const POOL_DEFAULTS: PostgresPoolConfig = {
  max: 10,
  idleTimeout: 30,
  connectTimeout: 30,
  statementTimeout: 30_000,
};

/**
 * Parse a non-negative integer from an env value, falling back to `fallback`
 * when the value is missing or malformed. We fall back rather than throw so a
 * stray typo never silently disables a safety limit (e.g. `max` becoming 0).
 */
function intFromEnv(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return fallback;
  return parsed;
}

type EnvSource = Record<string, string | undefined>;

function resolvePoolConfig(env: EnvSource = process.env): PostgresPoolConfig {
  return {
    // `max` must be at least 1 — a pool of 0 connections can never serve a query.
    max: Math.max(1, intFromEnv(env.PG_MAX_CONNECTIONS, POOL_DEFAULTS.max)),
    idleTimeout: intFromEnv(env.PG_IDLE_TIMEOUT, POOL_DEFAULTS.idleTimeout),
    connectTimeout: intFromEnv(
      env.PG_CONNECT_TIMEOUT,
      POOL_DEFAULTS.connectTimeout
    ),
    statementTimeout: intFromEnv(
      env.PG_STATEMENT_TIMEOUT,
      POOL_DEFAULTS.statementTimeout
    ),
  };
}

/**
 * Build the options object passed to `postgres()`. `statement_timeout` is sent
 * as a startup connection parameter so it applies to every query on every
 * connection in the pool.
 */
function buildPostgresOptions(
  env: EnvSource = process.env
): postgres.Options<Record<string, never>> {
  const config = resolvePoolConfig(env);
  return {
    max: config.max,
    idle_timeout: config.idleTimeout,
    connect_timeout: config.connectTimeout,
    connection: {
      // Sent as a startup connection parameter, so it applies to every query.
      statement_timeout: config.statementTimeout,
    },
  };
}
