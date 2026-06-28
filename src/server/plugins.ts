import { useLogger } from '@envelop/core';
import { useGraphQlJit } from '@envelop/graphql-jit';
import { useDisableIntrospection } from '@envelop/disable-introspection';
import { useOpenTelemetry } from '@envelop/opentelemetry';
import { inspect } from 'node:util';

import type { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import { initJaegerProvider } from '../tracing/jaeger-tracing.js';
import { useMetrics } from './metrics.js';
import { useRateLimit } from './rate-limit.js';
import { buildArmorPlugins } from './graphql-armor.js';

export { buildPlugins };

async function buildPlugins() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plugins: any[] = [];

  // Per-IP request rate limiting. Runs on every request before GraphQL parsing,
  // so over-limit traffic is rejected as cheaply as possible.
  plugins.push(useRateLimit());

  // Query-cost protections (depth / aliases / tokens / cost). These reject
  // abusive query shapes before execution.
  plugins.push(...buildArmorPlugins());

  if (process.env.ENABLE_METRICS === 'true') {
    // Prometheus /metrics endpoint + RED metrics for every request.
    plugins.push(useMetrics());
  }

  plugins.push(useGraphQlJit());

  // Returned so the entry point can flush spans on shutdown.
  let provider: BasicTracerProvider | undefined;
  if (process.env.ENABLE_LOGGING) {
    provider = await initJaegerProvider();
    plugins.push(
      useOpenTelemetry(
        {
          resolvers: true, // Tracks resolvers calls, and tracks resolvers thrown errors
          variables: true, // Includes the operation variables values as part of the metadata collected
          result: true, // Includes execution result object as part of the metadata collected
        },
        // BasicTracerProvider satisfies the TracerProvider interface; the cast
        // bridges duplicate @opentelemetry/api copies across packages by
        // targeting the exact parameter type useOpenTelemetry expects.
        provider as unknown as Parameters<typeof useOpenTelemetry>[1]
      )
    );
  }

  if (!process.env.ENABLE_INTROSPECTION) {
    plugins.push(useDisableIntrospection());
  }

  plugins.push(
    useLogger({
      logFn: (eventName, args) => {
        if (args?.result?.errors) {
          console.debug(
            eventName,
            inspect(args.args.contextValue.params, {
              showHidden: false,
              depth: null,
              colors: true,
            }),
            inspect(args.result.errors, {
              showHidden: false,
              depth: null,
              colors: true,
            })
          );
        }
      },
    })
  );
  return { plugins, provider };
}
