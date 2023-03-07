import { makeExecutableSchema } from '@graphql-tools/schema';
import { loadSchemaSync } from '@graphql-tools/load';
import { GraphQLFileLoader } from '@graphql-tools/graphql-file-loader';
import { Resolvers } from './resolvers-types';
import { getTracingInfo } from './tracing';

export const resolvers: Resolvers = {
  Query: {
    events: async (_, { input }, context) => {
      const contextSymbols = Object.getOwnPropertySymbols(context);
      const traceInfo = getTracingInfo(context[contextSymbols?.[0]]);

      if (!traceInfo) {
        return context.db_client.getEvents(input);
      }

      return context.db_client.getEvents(input, {
        traceInfo,
      });
    },
    actions: async (_, { input }, context) => {
      const contextSymbols = Object.getOwnPropertySymbols(context);
      const traceInfo = getTracingInfo(context[contextSymbols?.[0]]);

      if (!traceInfo) {
        return context.db_client.getActions(input);
      }

      return context.db_client.getActions(input, {
        traceInfo,
      });
    },
  },
};

export const schema = makeExecutableSchema({
  resolvers: [resolvers],
  typeDefs: loadSchemaSync('./schema.graphql', {
    loaders: [new GraphQLFileLoader()],
  }),
});
