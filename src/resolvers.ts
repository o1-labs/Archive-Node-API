import { makeExecutableSchema } from '@graphql-tools/schema';
import { loadSchemaSync } from '@graphql-tools/load';
import { GraphQLFileLoader } from '@graphql-tools/graphql-file-loader';
import { Resolvers } from './resolvers-types';
import { getCurrentSpanFromGraphQLContext } from './context';
import { createTraceInfo, getGlobalTracer } from './tracing';

export const resolvers: Resolvers = {
  Query: {
    events: async (_, { input }, context) => {
      const graphQLSpan = getCurrentSpanFromGraphQLContext(context);
      const parentSpan = graphQLSpan || getGlobalTracer().startSpan('graphql');

      return context.db_client.getEvents(input, {
        traceInfo: createTraceInfo(parentSpan),
      });
    },

    actions: async (_, { input }, context) => {
      const graphQLSpan = getCurrentSpanFromGraphQLContext(context);
      const parentSpan = graphQLSpan || getGlobalTracer().startSpan('graphql');

      return context.db_client.getActions(input, {
        traceInfo: createTraceInfo(parentSpan),
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
