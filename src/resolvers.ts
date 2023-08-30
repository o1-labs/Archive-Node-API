import { makeExecutableSchema } from '@graphql-tools/schema';
import { loadSchemaSync } from '@graphql-tools/load';
import { GraphQLFileLoader } from '@graphql-tools/graphql-file-loader';
import { Resolvers } from './resolvers-types';
import { getCurrentSpanFromGraphQLContext } from './context';
import { createTraceInfo, getGlobalTracer } from './tracing/jaeger-tracing';

export const resolvers: Resolvers = {
  Query: {
    events: async (_, { input }, context) => {
      const graphQLSpan = getCurrentSpanFromGraphQLContext(context);
      const parentSpan =
        graphQLSpan || getGlobalTracer().startSpan('events.graphql');
      try {
        const events = await context.db_client.getEvents(input, {
          traceInfo: createTraceInfo(parentSpan),
        });
        return events;
      } finally {
        parentSpan.end();
      }
    },

    actions: async (_, { input }, context) => {
      const graphQLSpan = getCurrentSpanFromGraphQLContext(context);
      const parentSpan =
        graphQLSpan || getGlobalTracer().startSpan('actions.graphql');
      try {
        const actions = await context.db_client.getActions(input, {
          traceInfo: createTraceInfo(parentSpan),
        });
        return actions;
      } finally {
        parentSpan.end();
      }
    },
  },
};
export const schema = makeExecutableSchema({
  resolvers: [resolvers],
  typeDefs: loadSchemaSync('./schema.graphql', {
    loaders: [new GraphQLFileLoader()],
  }),
});
