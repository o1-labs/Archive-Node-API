import { makeExecutableSchema } from '@graphql-tools/schema';
import { typeDefinitions } from './schema';
import { Resolvers } from './resolvers-types';

export const resolvers: Resolvers = {
  Query: {
    events: async (_, { input }, { db_client }) => {
      return db_client.getEvents(input);
    },
    actions: async (_, { input }, { db_client }) => {
      return db_client.getActions(input);
    },
  },
};

export const schema = makeExecutableSchema({
  resolvers: [resolvers],
  typeDefs: [typeDefinitions],
});
