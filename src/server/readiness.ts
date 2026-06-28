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
 * Yoga plugin serving a readiness probe at `READINESS_PATH`. Returns 200 when the
 * database answers a trivial query, 503 otherwise. Registered ahead of other
 * request hooks so probes are never throttled or otherwise interfered with.
 */
function useReadiness(db: Pick<DatabaseAdapter, 'ping'>): Plugin {
  return {
    async onRequest({ url, endResponse, fetchAPI }) {
      if (url.pathname !== READINESS_PATH) return;

      const ready = await db.ping();
      endResponse(
        new fetchAPI.Response(
          JSON.stringify({ status: ready ? 'ready' : 'not ready' }),
          {
            status: ready ? 200 : 503,
            headers: { 'content-type': 'application/json' },
          }
        )
      );
    },
  };
}
