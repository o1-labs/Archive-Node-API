import { createYoga, LogLevel, YogaInitialContext } from 'graphql-yoga';
import { createServer } from 'http';
import { useGraphQlJit } from '@envelop/graphql-jit';
import { useDisableIntrospection } from '@envelop/disable-introspection';
import { useOpenTelemetry } from '@envelop/opentelemetry';

import { buildProvider } from './tracing';
import { schema } from './resolvers';
import { GraphQLContext, buildContext } from './context';

let LOG_LEVEL = (process.env.LOG_LEVEL as LogLevel) || 'info';

export function buildServer() {
  let plugins = [];
  plugins.push(useGraphQlJit());
  plugins.push(
    useOpenTelemetry(
      {
        resolvers: false, // Tracks resolvers calls, and tracks resolvers thrown errors
        variables: true, // Includes the operation variables values as part of the metadata collected
        result: true, // Includes execution result object as part of the metadata collected
      },
      process.env.ENABLE_JAEGER ? buildProvider() : undefined
    )
  );
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
      methods: ['GET'],
    },
    context: () => {
      return buildContext();
    },
  });
  return createServer(yoga);
}
