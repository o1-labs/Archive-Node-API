import { makeExecutableSchema } from '@graphql-tools/schema';
import { loadSchemaSync } from '@graphql-tools/load';
import { GraphQLFileLoader } from '@graphql-tools/graphql-file-loader';

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
  },
};

const schema = makeExecutableSchema({
  resolvers: [resolvers],
  typeDefs: loadSchemaSync('./schema.graphql', {
    loaders: [new GraphQLFileLoader()],
  }),
});
