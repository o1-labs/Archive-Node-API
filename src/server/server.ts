import { createYoga } from 'graphql-yoga';
import { createServer } from 'http';
import { Plugin } from '@envelop/core';
import { schema } from '../resolvers.js';
import type { GraphQLContext } from '../context.js';
import { parseBoolean } from '../config.js';
import { useReadiness } from './readiness.js';
import { resolveCorsOptions, warnIfCorsDisabled } from './cors.js';
import { resolveYogaLogLevel } from './logger.js';

export {
  BLOCK_RANGE_SIZE,
  ENABLE_BLOCK_TRANSACTION_DETAILS,
  buildYoga,
  buildServer,
};

const LOG_LEVEL = resolveYogaLogLevel();
const BLOCK_RANGE_SIZE = Number(process.env.BLOCK_RANGE_SIZE) || 10000;
const ENABLE_BLOCK_TRANSACTION_DETAILS = parseBoolean(
  process.env.ENABLE_BLOCK_TRANSACTION_DETAILS
);

function buildYoga(context: GraphQLContext, plugins: Plugin[]) {
  const cors = resolveCorsOptions();

  return createYoga<GraphQLContext>({
    schema,
    logging: LOG_LEVEL,
    graphqlEndpoint: '/',
    landingPage: false,
    // Liveness — the process is up and serving HTTP.
    healthCheckEndpoint: '/healthcheck',
    graphiql: parseBoolean(process.env.ENABLE_GRAPHIQL),
    // Mask unexpected (non-GraphQLError) errors so internal details — SQL,
    // connection strings, stack traces — never reach clients. `isDev: false`
    // keeps Envelop from attaching original errors when NODE_ENV=development.
    maskedErrors: { isDev: false },
    // Readiness (DB reachable) is prepended so probes short-circuit before any
    // other request hook (e.g. rate limiting) can interfere with them.
    plugins: [useReadiness(context.db_client), ...plugins],
    cors,
    context,
  });
}

function buildServer(context: GraphQLContext, plugins: Plugin[]) {
  warnIfCorsDisabled(resolveCorsOptions());
  return createServer(buildYoga(context, plugins));
}
