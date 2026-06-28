import { createYoga, LogLevel } from 'graphql-yoga';
import { createServer } from 'http';
import { Plugin } from '@envelop/core';
import { schema } from '../resolvers.js';
import type { GraphQLContext } from '../context.js';
import { useReadiness } from './readiness.js';
import { resolveCorsOptions } from './cors.js';

export {
  BLOCK_RANGE_SIZE,
  ENABLE_BLOCK_TRANSACTION_DETAILS,
  buildYoga,
  buildServer,
};

const LOG_LEVEL = (process.env.LOG_LEVEL as LogLevel) || 'info';
const BLOCK_RANGE_SIZE = Number(process.env.BLOCK_RANGE_SIZE) || 10000;
const ENABLE_BLOCK_TRANSACTION_DETAILS =
  process.env.ENABLE_BLOCK_TRANSACTION_DETAILS === 'true';

function buildYoga(context: GraphQLContext, plugins: Plugin[]) {
  return createYoga<GraphQLContext>({
    schema,
    logging: LOG_LEVEL,
    graphqlEndpoint: '/',
    landingPage: false,
    // Liveness — the process is up and serving HTTP.
    healthCheckEndpoint: '/healthcheck',
    graphiql: process.env.ENABLE_GRAPHIQL === 'true' ? true : false,
    // Mask unexpected (non-GraphQLError) errors so internal details — SQL,
    // connection strings, stack traces — never reach clients. `isDev: false`
    // keeps Envelop from attaching original errors when NODE_ENV=development.
    maskedErrors: { isDev: false },
    // Readiness (DB reachable) is prepended so probes short-circuit before any
    // other request hook (e.g. rate limiting) can interfere with them.
    plugins: [useReadiness(context.db_client), ...plugins],
    cors: resolveCorsOptions(),
    context,
  });
}

function buildServer(context: GraphQLContext, plugins: Plugin[]) {
  return createServer(buildYoga(context, plugins));
}
