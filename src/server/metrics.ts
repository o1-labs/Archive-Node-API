import type { Plugin } from 'graphql-yoga';
import {
  Registry,
  collectDefaultMetrics,
  Counter,
  Histogram,
  Gauge,
} from 'prom-client';

export { createMetrics, useMetrics, METRICS_PATH };
export type { Metrics };

const METRICS_PATH = '/metrics';

/** Known routes — anything else is bucketed as `other` to bound label cardinality. */
const KNOWN_ROUTES = new Set(['/', '/healthcheck', '/readiness', METRICS_PATH]);

interface Metrics {
  registry: Registry;
  requestsTotal: Counter<'method' | 'route' | 'status'>;
  requestDuration: Histogram<'method' | 'route' | 'status'>;
  inFlight: Gauge;
}

/**
 * Build a Prometheus registry with RED HTTP metrics (rate, errors, duration) and,
 * unless disabled, the standard Node process metrics (CPU, memory, event loop,
 * GC). `collectDefault` is off in tests to avoid leaving background collectors.
 */
function createMetrics({ collectDefault = true } = {}): Metrics {
  const registry = new Registry();
  if (collectDefault) collectDefaultMetrics({ register: registry });

  const requestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total HTTP requests',
    labelNames: ['method', 'route', 'status'] as const,
    registers: [registry],
  });
  const requestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [registry],
  });
  const inFlight = new Gauge({
    name: 'http_requests_in_flight',
    help: 'HTTP requests currently being processed',
    registers: [registry],
  });

  return { registry, requestsTotal, requestDuration, inFlight };
}

function routeOf(rawUrl: string): string {
  let path: string;
  try {
    path = new URL(rawUrl).pathname;
  } catch {
    return 'other';
  }
  return KNOWN_ROUTES.has(path) ? path : 'other';
}

/**
 * Yoga plugin that serves the Prometheus exposition at `/metrics` and records RED
 * metrics for every other request. The `/metrics` scrape itself is not counted.
 */
function useMetrics(metrics: Metrics = createMetrics()): Plugin {
  const startTimes = new WeakMap<Request, number>();
  return {
    async onRequest({ request, url, endResponse, fetchAPI }) {
      if (url.pathname === METRICS_PATH) {
        endResponse(
          new fetchAPI.Response(await metrics.registry.metrics(), {
            status: 200,
            headers: { 'content-type': metrics.registry.contentType },
          })
        );
        return;
      }
      metrics.inFlight.inc();
      startTimes.set(request, Date.now());
    },
    onResponse({ request, response }) {
      const route = routeOf(request.url);
      if (route === METRICS_PATH) return;

      const labels = {
        method: request.method,
        route,
        status: String(response.status),
      };
      metrics.requestsTotal.inc(labels);
      const start = startTimes.get(request);
      if (start === undefined) return;

      startTimes.delete(request);
      metrics.inFlight.dec();
      metrics.requestDuration.observe(labels, (Date.now() - start) / 1000);
    },
  };
}
