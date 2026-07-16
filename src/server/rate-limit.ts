import type { Plugin } from 'graphql-yoga';

export {
  useRateLimit,
  createRateLimiter,
  resolveRateLimitConfig,
  RATE_LIMIT_DEFAULTS,
};
export type { RateLimitConfig };

/** Health probes must never be throttled, so orchestrators keep working. */
const HEALTHCHECK_PATH = '/healthcheck';

/**
 * Global, per-client-IP request rate limiting. A public GraphQL endpoint with no
 * throttle lets one client monopolise the server and the backing Postgres. This
 * is a coarse first line of defence applied before any GraphQL work happens.
 *
 * The counter is in-memory and therefore per-instance: behind multiple replicas
 * each enforces its own share of the limit. A shared store (e.g. Redis) is the
 * follow-up for exact cross-replica limits — see the deployment hardening issue.
 */
interface RateLimitConfig {
  /** Max requests allowed per client per window. `0` disables rate limiting. */
  max: number;
  /** Length of the fixed window in milliseconds. */
  windowMs: number;
  /**
   * Number of trusted proxy hops in front of this server. `0` (the default)
   * ignores forwarding headers entirely and keys on the socket address, which
   * is the only safe reading when the server is directly exposed.
   */
  trustProxy: number;
}

const RATE_LIMIT_DEFAULTS: RateLimitConfig = {
  max: 600,
  windowMs: 60_000,
  trustProxy: 0,
};

type EnvSource = Record<string, string | undefined>;

/**
 * Parse a non-negative integer from an env value, falling back to `fallback` when
 * it is missing or malformed. We never throw, so a typo can't disable the limiter
 * by accident — it reverts to the safe default.
 */
function intFromEnv(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return fallback;
  return parsed;
}

function resolveRateLimitConfig(env: EnvSource = process.env): RateLimitConfig {
  return {
    max: intFromEnv(env.RATE_LIMIT_MAX, RATE_LIMIT_DEFAULTS.max),
    windowMs: Math.max(
      1,
      intFromEnv(env.RATE_LIMIT_WINDOW_MS, RATE_LIMIT_DEFAULTS.windowMs)
    ),
    trustProxy: intFromEnv(env.TRUST_PROXY, RATE_LIMIT_DEFAULTS.trustProxy),
  };
}

interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

/**
 * Fixed-window counter keyed by client id. `now` is injectable so the windowing
 * logic can be tested deterministically. Counting is independent of how the id
 * is derived, so this takes only the window options.
 */
function createRateLimiter(
  config: Pick<RateLimitConfig, 'max' | 'windowMs'>,
  now: () => number = Date.now
) {
  const buckets = new Map<string, { count: number; resetAt: number }>();

  function check(id: string): RateLimitResult {
    const time = now();
    let bucket = buckets.get(id);
    if (!bucket || time >= bucket.resetAt) {
      bucket = { count: 0, resetAt: time + config.windowMs };
      buckets.set(id, bucket);
    }
    bucket.count += 1;
    return {
      allowed: bucket.count <= config.max,
      limit: config.max,
      remaining: Math.max(0, config.max - bucket.count),
      resetAt: bucket.resetAt,
    };
  }

  /** Drop expired buckets so memory doesn't grow with unique client count. */
  function prune(): void {
    const time = now();
    for (const [id, bucket] of buckets) {
      if (time >= bucket.resetAt) buckets.delete(id);
    }
  }

  return { check, prune, size: () => buckets.size };
}

type MaybeNodeSocket = {
  req?: { socket?: { remoteAddress?: string } };
  socket?: { remoteAddress?: string };
};

function socketAddress(serverContext: unknown): string {
  const ctx = serverContext as MaybeNodeSocket;
  return ctx?.req?.socket?.remoteAddress ?? ctx?.socket?.remoteAddress ?? 'unknown';
}

/**
 * Identify the client, trusting forwarding headers only as far as `trustProxy`
 * hops allow.
 *
 * `X-Forwarded-For` is client-supplied and every proxy *appends* to it, so the
 * left-hand entries are whatever the caller sent and cannot be trusted: reading
 * the first hop lets one source rotate the header to mint a fresh bucket per
 * request and evade the limit entirely (while growing the bucket Map). Only the
 * rightmost entries — appended by proxies we actually control — are meaningful,
 * so with N trusted hops the real client is the Nth entry from the right.
 *
 * Honouring the header at all still matters: it is what keeps NAT'd and
 * LB-fronted clients in their own buckets instead of collapsing onto one shared
 * address. Hence a hop count rather than a blanket on/off.
 */
function clientId(
  request: Request,
  serverContext: unknown,
  trustProxy: number
): string {
  if (trustProxy <= 0) return socketAddress(serverContext);

  const forwarded = request.headers
    .get('x-forwarded-for')
    ?.split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (forwarded?.length) {
    // Undefined when the chain is shorter than the configured hop count (a
    // misconfiguration, or a request injected inside the trust boundary) —
    // fall through to the socket rather than trust an attacker-chosen entry.
    const client = forwarded[forwarded.length - trustProxy];
    if (client) return client;
  }

  // Single-valued and overwritten by the adjacent proxy, so it carries no hop
  // structure; only meaningful once we've established there is a proxy at all.
  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  return socketAddress(serverContext);
}

/**
 * Yoga plugin that rejects over-limit requests with HTTP 429 before they reach
 * GraphQL parsing/execution. Returns a no-op plugin when `max` is 0 (disabled).
 */
function useRateLimit(env: EnvSource = process.env): Plugin {
  const config = resolveRateLimitConfig(env);
  if (config.max <= 0) return {};

  const limiter = createRateLimiter(config);
  // Periodically reclaim memory from expired buckets; unref'd so it never keeps
  // the process alive on shutdown.
  const sweep = setInterval(() => limiter.prune(), config.windowMs);
  if (typeof sweep.unref === 'function') sweep.unref();

  return {
    onRequest({ request, serverContext, url, endResponse, fetchAPI }) {
      if (url.pathname === HEALTHCHECK_PATH) return;

      const result = limiter.check(
        clientId(request, serverContext, config.trustProxy)
      );
      if (result.allowed) return;

      const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
      endResponse(
        new fetchAPI.Response(
          JSON.stringify({
            errors: [
              {
                message: 'Too many requests. Please retry later.',
                extensions: { code: 'RATE_LIMITED' },
              },
            ],
          }),
          {
            status: 429,
            headers: {
              'content-type': 'application/json',
              'retry-after': String(retryAfter),
              'x-ratelimit-limit': String(result.limit),
              'x-ratelimit-remaining': String(result.remaining),
            },
          }
        )
      );
    },
  };
}
