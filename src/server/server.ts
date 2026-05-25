import { inspect } from 'node:util';
import { createYoga } from 'graphql-yoga';
import { createServer } from 'http';
import { Plugin } from '@envelop/core';
import { schema } from '../resolvers.js';
import type { GraphQLContext } from '../context.js';
import { parseBoolean } from '../config.js';
import { useReadiness } from './readiness.js';
import { resolveCorsOptions, warnIfCorsDisabled } from './cors.js';
import { logger, resolveYogaLogLevel } from './logger.js';

export {
  BLOCK_RANGE_SIZE,
  ZKAPP_COMMAND_RANGE_SIZE,
  ZKAPP_COMMAND_ACCOUNT_UPDATE_LIMIT,
  ENABLE_BLOCK_TRANSACTION_DETAILS,
  ENABLE_ZKAPP_COMMANDS_QUERY,
  buildYoga,
  buildServer,
};

const BLOCK_RANGE_SIZE = Number(process.env.BLOCK_RANGE_SIZE) || 10000;
const ENABLE_BLOCK_TRANSACTION_DETAILS = parseBoolean(
  process.env.ENABLE_BLOCK_TRANSACTION_DETAILS
);
// The zkappCommands range query is far heavier than block transaction detail —
// it expands account updates — so it gets its own switch rather than riding on
// that flag. Default off: an operator opts in deliberately.
const ENABLE_ZKAPP_COMMANDS_QUERY = parseBoolean(
  process.env.ENABLE_ZKAPP_COMMANDS_QUERY
);
const ZKAPP_COMMAND_RANGE_SIZE =
  Number(process.env.ZKAPP_COMMAND_RANGE_SIZE) || 1000;
const ZKAPP_COMMAND_ACCOUNT_UPDATE_LIMIT =
  Number(process.env.ZKAPP_COMMAND_ACCOUNT_UPDATE_LIMIT) || 5000;
const YOGA_LOG_LEVEL = resolveYogaLogLevel();

const yogaLog =
  (level: 'debug' | 'info' | 'warn' | 'error') =>
  (...args: unknown[]) => {
    const err = args.find((arg): arg is Error => arg instanceof Error);
    const msg = args
      .filter((arg) => !(arg instanceof Error))
      .map((arg) =>
        typeof arg === 'string' ? arg : inspect(arg, { depth: 3 })
      )
      .join(' ');
    logger[level](err ? { err } : {}, msg || 'yoga');
  };

function buildYoga(context: GraphQLContext, plugins: Plugin[]) {
  const cors = resolveCorsOptions();

  return createYoga<GraphQLContext>({
    schema,
    logging:
      YOGA_LOG_LEVEL === false
        ? false
        : {
            debug: yogaLog('debug'),
            info: yogaLog('info'),
            warn: yogaLog('warn'),
            error: yogaLog('error'),
          },
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
