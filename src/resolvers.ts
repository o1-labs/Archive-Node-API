import { makeExecutableSchema } from '@graphql-tools/schema';
import { Resolvers } from './resolvers-types.js';
import { visit, print, parse } from 'graphql';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  TracingState,
  setSpanNameFromGraphQLContext,
} from './tracing/tracer.js';
import { parseBoolean } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.resolve(__dirname, '../../schema.graphql');
// Dedicated switch, not ENABLE_BLOCK_TRANSACTION_DETAILS. This query walks a
// block range and expands account updates, so it is much heavier than block
// transaction detail; an operator must be able to take one without the other.
// Default off.
//
// parseBoolean, not `=== 'true'`: ad-hoc truthiness is the bug #74 fixed, where
// the string "false" read as true.
const ENABLE_ZKAPP_COMMANDS_QUERY = parseBoolean(
  process.env.ENABLE_ZKAPP_COMMANDS_QUERY
);

const fullResolvers: Resolvers = {
  Query: {
    events: async (_, { input }, context) => {
      const graphQLSpan = setSpanNameFromGraphQLContext(
        context,
        'events.graphql'
      );
      return context.db_client.getEvents(input, {
        tracingState: new TracingState(graphQLSpan),
      });
    },
    actions: async (_, { input }, context) => {
      const graphQLSpan = setSpanNameFromGraphQLContext(
        context,
        'actions.graphql'
      );
      return context.db_client.getActions(input, {
        tracingState: new TracingState(graphQLSpan),
      });
    },
    verificationKeyUpdates: async (_, { input }, context) => {
      const graphQLSpan = setSpanNameFromGraphQLContext(
        context,
        'verificationKeyUpdates.graphql'
      );
      return context.db_client.getVerificationKeyUpdates(input, {
        tracingState: new TracingState(graphQLSpan),
      });
    },
    zkappCommands: async (_, { input }, context) => {
      const graphQLSpan = setSpanNameFromGraphQLContext(
        context,
        'zkappCommands.graphql'
      );
      return context.db_client.getZkappCommands(input, {
        tracingState: new TracingState(graphQLSpan),
      });
    },
    networkState: async (_, __, context) => {
      const graphQLSpan = setSpanNameFromGraphQLContext(
        context,
        'networkState.graphql'
      );
      return context.db_client.getNetworkState({
        tracingState: new TracingState(graphQLSpan),
      });
    },
    blocks: async (_, { query, limit, sortBy }, context) => {
      const graphQLSpan = setSpanNameFromGraphQLContext(
        context,
        'blocks.graphql'
      );
      return context.db_client.getBlocks(query, limit, sortBy, {
        tracingState: new TracingState(graphQLSpan),
      });
    },
  },
};

let enabledQueries = Object.keys(fullResolvers.Query || {});

if (process.env.ENABLED_QUERIES !== undefined) {
  enabledQueries = process.env.ENABLED_QUERIES.split(',').map((q) => q.trim());
}

if (!ENABLE_ZKAPP_COMMANDS_QUERY) {
  enabledQueries = enabledQueries.filter(
    (queryName) => queryName !== 'zkappCommands'
  );
}

const resolvers: Resolvers = {
  Query: Object.fromEntries(
    Object.entries(fullResolvers.Query || {}).filter(([queryName]) =>
      enabledQueries.includes(queryName)
    )
  ),
};

const typeDefsString = fs.readFileSync(schemaPath, 'utf-8');
const typeDefsAst = parse(typeDefsString);
const modifiedAst = visit(typeDefsAst, {
  ObjectTypeDefinition(node) {
    if (node.name.value === 'Query') {
      return {
        ...node,
        fields: node.fields?.filter((field) =>
          enabledQueries.includes(field.name.value)
        ),
      };
    }
    return node;
  },
});

// Create the executable schema.
const schema = makeExecutableSchema({
  resolvers: [resolvers],
  typeDefs: print(modifiedAst),
});

export { resolvers, schema };
