import type { Plugin } from 'graphql-yoga';
import type { DatabaseAdapter } from '../db/archive-node-adapter/archive-node-adapter.interface.js';

export { useReadiness, READINESS_PATH };

/**
 * Readiness endpoint path. Distinct from Yoga's built-in `/healthcheck`, which is
 * a *liveness* probe (the process is up). Readiness additionally checks that the
 * database is reachable, so an orchestrator can stop routing traffic to an
 * instance whose Postgres is down without killing the pod outright.
 */
const READINESS_PATH = '/readiness';

/**
 * Upper bound on one readiness ping. Keep it below the orchestrator probe
 * timeout so the server answers 503 itself instead of letting the probe hang.
 */
const DEFAULT_PING_TIMEOUT_MS = 2000;

function pingTimeoutFromEnv(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_PING_TIMEOUT_MS;
}

/** Resolves, never rejects: the probe endpoint must not return 500. */
async function pingWithin(
  db: Pick<DatabaseAdapter, 'ping'>,
  timeoutMs: number
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => {
      console.warn(`[readiness] database ping exceeded ${timeoutMs}ms`);
      resolve(false);
    }, timeoutMs);
  });
  const answered = Promise.resolve()
    .then(() => db.ping())
    .catch(() => false);

  try {
    return await Promise.race([answered, timedOut]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Yoga plugin serving a readiness probe at `READINESS_PATH`. Returns 200 when the
 * database answers a trivial query, 503 otherwise. Registered ahead of other
 * request hooks so probes are never throttled or otherwise interfered with.
 */
function useReadiness(
  db: Pick<DatabaseAdapter, 'ping'>,
  timeoutMs = pingTimeoutFromEnv(process.env.READINESS_PING_TIMEOUT_MS)
): Plugin {
  return {
    async onRequest({ url, endResponse, fetchAPI }) {
      if (url.pathname.replace(/\/$/, '') !== READINESS_PATH) return;

      const ready = await pingWithin(db, timeoutMs);
      endResponse(
        new fetchAPI.Response(
          JSON.stringify({ status: ready ? 'ready' : 'not ready' }),
          {
            status: ready ? 200 : 503,
            headers: {
              'content-type': 'application/json',
              'cache-control': 'no-store',
            },
          }
        )
      );
    },
  };
}
