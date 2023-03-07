import { makeExecutableSchema } from '@graphql-tools/schema';
import { loadSchemaSync } from '@graphql-tools/load';
import { GraphQLFileLoader } from '@graphql-tools/graphql-file-loader';
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
  typeDefs: loadSchemaSync('./schema.graphql', {
    loaders: [new GraphQLFileLoader()],
  }),
});
