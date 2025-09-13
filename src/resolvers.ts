import { makeExecutableSchema } from '@graphql-tools/schema';
import { loadSchemaSync } from '@graphql-tools/load';
import { GraphQLFileLoader } from '@graphql-tools/graphql-file-loader';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { Resolvers } from './resolvers-types.js';
import {
  TracingState,
  setSpanNameFromGraphQLContext,
} from './tracing/tracer.js';

export { resolvers, schema };

const resolvers: Resolvers = {
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

    networkState: async (_, __, context) => {
      const graphQLSpan = setSpanNameFromGraphQLContext(
        context,
        'networkState.graphql'
      );
      return context.db_client.getNetworkState({
        tracingState: new TracingState(graphQLSpan),
      });
    },
  },
};

// Get the directory containing this module file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve schema.graphql relative to the package root (two levels up from build/src/)
const schemaPath = join(__dirname, '..', '..', 'schema.graphql');

const schema = makeExecutableSchema({
  resolvers: [resolvers],
  typeDefs: loadSchemaSync(schemaPath, {
    loaders: [new GraphQLFileLoader()],
  }),
});
