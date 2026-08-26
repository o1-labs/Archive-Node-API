import { useLogger } from '@envelop/core';
import { useGraphQlJit } from '@envelop/graphql-jit';
import { useDisableIntrospection } from '@envelop/disable-introspection';
import { useOpenTelemetry } from '@envelop/opentelemetry';
import { inspect } from 'node:util';

import { initJaegerProvider } from '../tracing/jaeger-tracing.js';
import { useMetrics } from './metrics.js';

export { buildPlugins };

async function buildPlugins() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plugins: any[] = [];

  if (process.env.ENABLE_METRICS === 'true') {
    // Prometheus /metrics endpoint + RED metrics for every request.
    plugins.push(useMetrics());
  }

  plugins.push(useGraphQlJit());

  if (process.env.ENABLE_LOGGING) {
    const provider = await initJaegerProvider();
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
  return plugins;
}
