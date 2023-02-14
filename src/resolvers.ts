import { makeExecutableSchema } from '@graphql-tools/schema';
import { typeDefinitions } from './schema';
import { Resolvers } from './resolvers-types';

const resolvers: Resolvers = {
  Query: {
    events: async (_, { input }, { db_client }) => {
      const start = process.hrtime();
      let fetchedEvents = await db_client.getEvents(input);
      const end = process.hrtime(start);

      console.info(
        'Events Resolver Execution Time: %ds %dms',
        end[0],
        end[1] / 1000000
      );
      return fetchedEvents;
    },
    actions: async (_, { input }, { db_client }) => {
      const start = process.hrtime();
      let fetchedActions = await db_client.getActions(input);
      const end = process.hrtime(start);

      console.info(
        'Actions Resolver Execution Time: %ds %dms',
        end[0],
        end[1] / 1000000
      );
      return fetchedActions;
    },
  },
};

export const schema = makeExecutableSchema({
  resolvers: [resolvers],
  typeDefs: [typeDefinitions],
});
