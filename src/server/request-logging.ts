import { randomUUID } from 'node:crypto';
import type { Plugin } from 'graphql-yoga';
import { logger as defaultLogger } from './logger.js';
import type { Logger } from './logger.js';

export { useRequestLogging, requestIdFor };

/** Paths whose requests are not access-logged (frequent orchestrator probes). */
const QUIET_PATHS = new Set(['/healthcheck', '/readiness']);
const MAX_REQUEST_ID_LENGTH = 128;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=-]+$/;

/**
 * Correlation id per in-flight request. Stored in a WeakMap so it is dropped
 * automatically once the request is garbage-collected. Other log sites (e.g. the
 * GraphQL error logger) can look it up to tie their lines to the access log.
 */
const requestIds = new WeakMap<Request, string>();

function requestIdFor(request: Request): string | undefined {
  return requestIds.get(request);
}

function pathOf(rawUrl: string): string {
  try {
    return new URL(rawUrl).pathname;
  } catch {
    return rawUrl;
  }
}

function requestIdFromHeader(header: string | null): string {
  const candidate = header?.trim();
  if (
    candidate &&
    candidate.length <= MAX_REQUEST_ID_LENGTH &&
    REQUEST_ID_PATTERN.test(candidate)
  ) {
    return candidate;
  }
  return randomUUID();
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
      const id = requestIdFromHeader(request.headers.get('x-request-id'));
      requestIds.set(request, id);
      startTimes.set(request, Date.now());
    },
    onResponse({ request, response }) {
      const path = pathOf(request.url);
      if (QUIET_PATHS.has(path)) return;

      const start = startTimes.get(request);
      log.info(
        {
          requestId: requestIds.get(request),
          method: request.method,
          path,
          status: response.status,
          durationMs: start !== undefined ? Date.now() - start : undefined,
        },
        'request completed'
      );
    },
  };
}
