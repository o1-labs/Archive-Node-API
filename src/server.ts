import { createYoga, LogLevel } from 'graphql-yoga';
import { createServer } from 'http';
import { useLogger } from '@envelop/core';
import { useGraphQlJit } from '@envelop/graphql-jit';
import { useDisableIntrospection } from '@envelop/disable-introspection';
import { useOpenTelemetry } from '@envelop/opentelemetry';

import { inspect } from 'node:util';

import { schema } from './resolvers';
import { initJaegerProvider } from './tracing/jaeger-tracing';
import type { GraphQLContext } from './context';

export { buildServer };

const LOG_LEVEL = (process.env.LOG_LEVEL as LogLevel) || 'info';

async function buildPlugins() {
  const plugins = [];

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
        provider
      )
    );
  }

  if (!process.env.ENABLE_INTROSPECTION)
    plugins.push(useDisableIntrospection());

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

async function buildServer(context: GraphQLContext) {
  const plugins = await buildPlugins();
  const yoga = createYoga<GraphQLContext>({
    schema,
    logging: LOG_LEVEL,
    graphqlEndpoint: '/',
    landingPage: false,
    healthCheckEndpoint: '/healthcheck',
    graphiql: process.env.ENABLE_GRAPHIQL === 'true' ? true : false,
    plugins,
    cors: {
      origin: process.env.CORS_ORIGIN ?? '*',
      methods: ['GET', 'POST'],
    },
    context,
  });
  return createServer(yoga);
}
