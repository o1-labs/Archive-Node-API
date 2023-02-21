import { makeExecutableSchema } from '@graphql-tools/schema';
import { typeDefinitions } from './schema';
import { Resolvers } from './resolvers-types';

const resolvers: Resolvers = {
  Query: {
    events: async (_, { input }, { db_client }) => {
      let fetchedEvents = await db_client.getEvents(input);
      return fetchedEvents;
    },
    actions: async (_, { input }, { db_client }) => {
      let fetchedActions = await db_client.getActions(input);
      return fetchedActions;
    },
  },
};

export const schema = makeExecutableSchema({
  resolvers: [resolvers],
  typeDefs: [typeDefinitions],
});
