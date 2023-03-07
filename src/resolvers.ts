import { makeExecutableSchema } from '@graphql-tools/schema';
import { typeDefinitions } from './schema';
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

      const eventsData = context.db_client.getEvents(input, {
        traceInfo,
      });
      return eventsData;
    },
    actions: async (_, { input }, context) => {
      const contextSymbols = Object.getOwnPropertySymbols(context);
      const traceInfo = getTracingInfo(context[contextSymbols?.[0]]);

      if (!traceInfo) {
        return context.db_client.getEvents(input);
      }

      const actionsData = context.db_client.getActions(input, {
        traceInfo,
      });
      return actionsData ?? [];
    },
  },
};

export const schema = makeExecutableSchema({
  resolvers: [resolvers],
  typeDefs: [typeDefinitions],
});
