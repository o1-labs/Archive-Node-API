import { makeExecutableSchema } from '@graphql-tools/schema';
import { Resolvers } from './resolvers-types.js';
import { visit, print, parse } from 'graphql';
import fs from 'fs';
import {
  TracingState,
  setSpanNameFromGraphQLContext,
} from './tracing/tracer.js';

const fullResolvers: Resolvers = {
  Query: {
    events: async (_, { input }, context) => {
      const graphQLSpan = setSpanNameFromGraphQLContext(context, 'events.graphql');
      return context.db_client.getEvents(input, {
        tracingState: new TracingState(graphQLSpan),
      });
    },
    actions: async (_, { input }, context) => {
      const graphQLSpan = setSpanNameFromGraphQLContext(context, 'actions.graphql');
      return context.db_client.getActions(input, {
        tracingState: new TracingState(graphQLSpan),
      });
    },
    networkState: async (_, __, context) => {
      const graphQLSpan = setSpanNameFromGraphQLContext(context, 'networkState.graphql');
      return context.db_client.getNetworkState({
        tracingState: new TracingState(graphQLSpan),
      });
    },
    blocks: async (_, { query, limit, sortBy }, context) => {
      const graphQLSpan = setSpanNameFromGraphQLContext(context, 'blocks.graphql');
      return context.db_client.getBlocks(query, limit, sortBy, {
        tracingState: new TracingState(graphQLSpan),
      });
    },
  },
};

let resolvers: Resolvers = fullResolvers;
let typeDefs: string | undefined = undefined;

// If the ENABLED_QUERIES environment variable is set, filter the schema and resolvers.
if (process.env.ENABLED_QUERIES !== undefined) {
  const enabledQueries = process.env.ENABLED_QUERIES.split(',').map((q) => q.trim());

  // If the list is not empty, filter the resolvers.
  if (enabledQueries.length > 0) {
    resolvers = {
      Query: Object.fromEntries(
        Object.entries(fullResolvers.Query || {}).filter(([queryName]) =>
          enabledQueries.includes(queryName)
        )
      ),
    };

    // Filter the schema AST.
    const typeDefsString = fs.readFileSync('./schema.graphql', 'utf-8');
    const typeDefsAst = parse(typeDefsString);
    const modifiedAst = visit(typeDefsAst, {
      ObjectTypeDefinition(node) {
        if (node.name.value === 'Query') {
          return {
            ...node,
            fields: node.fields?.filter((field) =>
              enabledQueries.includes(field.name.value)
            ),
          };
        }
        return node;
      },
    });
    typeDefs = print(modifiedAst);
  }
}

// Create the executable schema.
const schema = makeExecutableSchema({
  resolvers: [resolvers],
  typeDefs: typeDefs || fs.readFileSync('./schema.graphql', 'utf-8'),
});

export { resolvers, schema };
