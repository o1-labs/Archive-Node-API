import { makeExecutableSchema } from '@graphql-tools/schema';
import { typeDefinitions } from './schema';
import { Resolvers } from './resolvers-types';

export const resolvers: Resolvers = {
  Query: {
    events: async (_, { input }, { db_client }) => {
      const fetchedEvents = await db_client.getEvents(input);
      return fetchedEvents;
    },
    actions: async (_, { input }, { db_client }) => {
      const fetchedActions = await db_client.getActions(input);
      return fetchedActions;
    },
  },
};

export const schema = makeExecutableSchema({
  resolvers: [resolvers],
  typeDefs: [typeDefinitions],
});
