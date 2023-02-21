import { createYoga, LogLevel } from 'graphql-yoga';
import { createServer } from 'http';
import { useGraphQlJit } from '@envelop/graphql-jit';
import { useDisableIntrospection } from '@envelop/disable-introspection';
import { useOpenTelemetry } from '@envelop/opentelemetry';

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
        'Jaeger endpoint not found. Please ensure that the Jaeger endpoint is properly configured and available.'
      );
    }
    if (!process.env.JAEGER_SERVICE_NAME) {
      throw new Error(
        'Jaeger service name not found. Please ensure that the Jaeger service name is properly configured and available.'
      );
    }
  }
  return provider;
}

export function buildServer(context: GraphQLContext) {
  const plugins = [];
  plugins.push(useGraphQlJit());
  if (process.env.ENABLE_LOGGING === 'true') {
    let provider = initJaegerProvider();
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
  if (process.env.ENABLE_INTROSPECTION !== 'true')
    plugins.push(useDisableIntrospection());

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
