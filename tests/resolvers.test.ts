import { expect, test, describe, beforeAll } from 'vitest';

import { createYoga, createSchema } from 'graphql-yoga';
import { loadSchemaSync } from '@graphql-tools/load';
import { GraphQLFileLoader } from '@graphql-tools/graphql-file-loader';
import { buildHTTPExecutor } from '@graphql-tools/executor-http';
import { parse } from 'graphql';

import { resolvers } from '../src/resolvers';
import { buildContext, GraphQLContext } from '../src/context';

const eventsQuery = `
query getEvents($input: EventFilterOptionsInput!) {
  events(input: $input) {
    blockInfo {
      stateHash
      timestamp
      height
      parentHash
      chainStatus
      distanceFromMaxBlockHeight
    }
    transactionInfo {
      status
      hash
      memo
    }
    eventData {
      index
      data
    }
  }
}
`;

const actionsQuery = `
query getEvents($input: EventFilterOptionsInput!) {
  actions(input: $input) {
    blockInfo {
      stateHash
      timestamp
      height
      parentHash
      chainStatus
      distanceFromMaxBlockHeight
    }
    actionState
    transactionInfo {
      status
      hash
      memo
    }
    actionData {
      data
    }
  }
}
`;

const address = 'B62qrfn5xxChtPGJne9HuDJZ4ziWVgWxeL3hntGBqMmf45p4hudo3tw';

const PG_CONN = process.env.GITHUB_ACTIONS
  ? 'postgres://postgres:password@postgres:5432/archive'
  : 'postgres://postgres:password@localhost:5432/archive';

describe('Query Resolvers', async () => {
  let executor;

  beforeAll(async () => {
    const schema = createSchema({
      typeDefs: loadSchemaSync('./schema.graphql', {
        loaders: [new GraphQLFileLoader()],
      }),
      resolvers,
    });
    const context = await buildContext(PG_CONN);
    const yoga = createYoga<GraphQLContext>({ schema, context });
    executor = buildHTTPExecutor({
      fetch: yoga.fetch,
    });
  });

  describe('Events', () => {
    test('Fetching events with a valid address should not throw', async () => {
      expect(async () => {
        await executor({
          variables: {
            input: {
              address,
            },
          },
          document: parse(`${eventsQuery}`),
        });
      }).not.toThrowError();
    });

    test('Fetching events with a empty address should return empty list', async () => {
      const results = await executor({
        variables: {
          input: {
            address: '',
          },
        },
        document: parse(`${eventsQuery}`),
      });
      expect(results.data.events).toStrictEqual([]);
    });
  });

  describe('Actions', () => {
    test('Fetching actions with a valid address should not throw', async () => {
      expect(async () => {
        await executor({
          variables: {
            input: {
              address,
            },
          },
          document: parse(`${actionsQuery}`),
        });
      }).not.toThrowError();
    });

    test('Fetching actions with a empty address should return empty list', async () => {
      const results = await executor({
        variables: {
          input: {
            address: '',
          },
        },
        document: parse(`${actionsQuery}`),
      });
      expect(results.data.actions).toStrictEqual([]);
    });
  });
});
