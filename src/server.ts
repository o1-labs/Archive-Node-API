import { createYoga, LogLevel } from 'graphql-yoga';
import { createServer } from 'http';
import { useLogger } from '@envelop/core';
import { useGraphQlJit } from '@envelop/graphql-jit';
import { useDisableIntrospection } from '@envelop/disable-introspection';
import { useOpenTelemetry } from '@envelop/opentelemetry';

import { request } from 'node:http';
import { inspect } from 'node:util';

import { buildProvider } from './tracing';
import { schema } from './resolvers';
import type { GraphQLContext } from './context';

const LOG_LEVEL = (process.env.LOG_LEVEL as LogLevel) || 'info';

function initJaegerProvider() {
  let provider = undefined;
  if (process.env.ENABLE_JAEGER) {
    provider = buildProvider();
    if (!process.env.JAEGER_ENDPOINT) {
      throw new Error(
        'Jaeger was enabled but no endpoint was specified. Please ensure that the Jaeger endpoint is properly configured and available.'
      );
    }
    if (!process.env.JAEGER_SERVICE_NAME) {
      throw new Error(
        'Jaeger was enabled but no service name was specified. Please ensure that the Jaeger service name is properly configured.'
      );
    }

    // Check if Jaeger endpoint is available.
    const endpoint = process.env.JAEGER_ENDPOINT.replace(/(^\w+:|^)\/\//, '');
    // eslint-disable-next-line prefer-const
    let [hostname, port] = endpoint.split(':');
    port = port?.split('/')[0];
    const req = request({
      hostname,
      method: 'GET',
      port,
      path: '/',
      timeout: 2000,
    });
    req.on('error', () => {
      throw new Error(
        'Jaeger endpoint not available. Please ensure that the Jaeger endpoint is properly configured and available.'
      );
    });
    req.on('timeout', () => {
      throw new Error(
        'Jaeger endpoint timed out. Please ensure that the Jaeger endpoint is properly configured and available.'
      );
    });
    req.end();
    req.socket?.end?.();
  }
  return provider;
}

function buildPlugins() {
  const plugins = [];

  plugins.push(useGraphQlJit());
  if (process.env.ENABLE_LOGGING) {
    const provider = initJaegerProvider();
    plugins.push(
      useOpenTelemetry(
        {
          resolvers: false, // Tracks resolvers calls, and tracks resolvers thrown errors
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

export function buildServer(context: GraphQLContext) {
  const plugins = buildPlugins();
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
