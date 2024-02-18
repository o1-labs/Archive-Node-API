import { createYoga, LogLevel } from 'graphql-yoga';
import { createServer } from 'http';
import { Plugin } from '@envelop/core';
import { schema } from '../resolvers.js';
import type { GraphQLContext } from '../context.js';

export { buildServer };

const LOG_LEVEL = (process.env.LOG_LEVEL as LogLevel) || 'info';

function buildServer(context: GraphQLContext, plugins: Plugin[]) {
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
