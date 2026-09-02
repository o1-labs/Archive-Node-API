import { randomUUID } from 'node:crypto';
import type { Plugin } from 'graphql-yoga';
import { logger as defaultLogger } from './logger.js';
import type { Logger } from './logger.js';

export { useRequestLogging, requestIdFor };

/** Paths whose requests are not access-logged (frequent orchestrator probes). */
const QUIET_PATHS = new Set(['/healthcheck', '/readiness']);
/** Max characters kept from an inbound X-Request-Id. */
const MAX_REQUEST_ID_LENGTH = 128;
/** Printable ASCII only, minus quote and backslash. */
const UNSAFE_REQUEST_ID_CHARS = /[^\x20-\x7e]|["\\]/g;

/**
 * Correlation id per in-flight request. Stored in a WeakMap so it is dropped
 * automatically once the request is garbage-collected. Other log sites (e.g. the
 * GraphQL error logger) can look it up to tie their lines to the access log.
 */
const requestIds = new WeakMap<Request, string>();

function requestIdFor(request: Request): string | undefined {
  return requestIds.get(request);
}

function sanitizeRequestId(raw: string | null): string {
  if (!raw) return randomUUID();
  const cleaned = raw
    .replace(UNSAFE_REQUEST_ID_CHARS, '')
    .slice(0, MAX_REQUEST_ID_LENGTH)
    .trim();
  return cleaned.length > 0 ? cleaned : randomUUID();
}

function pathOf(rawUrl: string): string {
  try {
    return new URL(rawUrl).pathname;
  } catch {
    return rawUrl;
  }
}

/**
 * Yoga plugin that assigns each request a correlation id (honouring an inbound
 * bounded `X-Request-Id`) and emits one structured access-log line per request
 * with the id, method, path, status, and duration. Probe endpoints are skipped
 * to avoid log spam. `log` is injectable for tests.
 */
function useRequestLogging(log: Logger = defaultLogger): Plugin {
  const startTimes = new WeakMap<Request, number>();
  return {
    onRequest({ request }) {
      const id = sanitizeRequestId(request.headers.get('x-request-id'));
      requestIds.set(request, id);
      startTimes.set(request, Date.now());
    },
    onResponse({ request, response }) {
      const path = pathOf(request.url);
      if (QUIET_PATHS.has(path)) return;

      let id = requestIds.get(request);
      let start = startTimes.get(request);
      if (id === undefined || start === undefined) {
        // CORS and health-check plugins can short-circuit before onRequest, but
        // onResponse still runs. Backfill so access lines remain correlated.
        id = sanitizeRequestId(request.headers.get('x-request-id'));
        start = Date.now();
        requestIds.set(request, id);
        startTimes.set(request, start);
      }
      log.info(
        {
          requestId: id,
          method: request.method,
          path,
          status: response.status,
          durationMs: Date.now() - start,
        },
        'request completed'
      );
    },
  };
}
