import { createYoga, createSchema } from 'graphql-yoga';
import { loadSchemaSync } from '@graphql-tools/load';
import { GraphQLFileLoader } from '@graphql-tools/graphql-file-loader';
import { buildHTTPExecutor } from '@graphql-tools/executor-http';
import { parse } from 'graphql';
import { resolvers } from '../src/resolvers.js';
import { buildContext, GraphQLContext } from '../src/context.js';

const PG_CONN = 'postgresql://postgres:postgres@localhost:5432/archive ';
const zkappAccount = 'B62qrndmDoSMeRr4nyLi4JoRgKoJgXtToo3rRfoWTiUpDpb8nvxc8C5';

const actionsQuery = `
query getActions($input: ActionFilterOptionsInput!) {
  actions(input: $input) {
    blockInfo {
      stateHash
      timestamp
      height
      parentHash
      chainStatus
      distanceFromMaxBlockHeight
      globalSlotSinceGenesis
    }
    actionState {
      actionStateOne
      actionStateTwo
      actionStateThree
      actionStateFour
      actionStateFive
    }
    actionData {
      data
      accountUpdateId
      transactionInfo {
        status
        hash
        memo
        sequenceNumber
        zkappAccountUpdateIds
        zkappEventElementIds
      }
    }
  }
}
`;

const schema = createSchema<GraphQLContext>({
  typeDefs: loadSchemaSync('./schema.graphql', {
    loaders: [new GraphQLFileLoader()],
  }),
  resolvers,
});
const context = await buildContext(PG_CONN);
const yoga = createYoga<GraphQLContext>({ schema, context });
const executor = buildHTTPExecutor({
  fetch: yoga.fetch,
});

const results = await executor({
  variables: {
    input: { address: zkappAccount },
  },
  document: parse(`${actionsQuery}`),
});

console.log(JSON.stringify(results));
