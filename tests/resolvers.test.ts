import { expect, test, describe, beforeAll } from 'vitest';

import { createYoga, createSchema } from 'graphql-yoga';
import { buildHTTPExecutor } from '@graphql-tools/executor-http';
import { parse } from 'graphql';

import { typeDefinitions } from '../src/schema';
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

describe('Query Resolvers', () => {
  let executor;

  beforeAll(async () => {
    const schema = createSchema({
      typeDefs: typeDefinitions,
      resolvers,
    });
    let context = await buildContext(
      'postgres://postgres:password@localhost:5432/archive'
    );
    const yoga = createYoga<GraphQLContext>({ schema, context });
    executor = buildHTTPExecutor({
      fetch: yoga.fetch,
    });
  });

  describe('Events', () => {
    test('Fetching events with a valid address should not throw', async () => {
      const result = await executor({
        variables: {
          input: {
            address: 'B62qrfn5xxChtPGJne9HuDJZ4ziWVgWxeL3hntGBqMmf45p4hudo3tw',
          },
        },
        document: parse(`${eventsQuery}`),
      });
      expect(result).toBeTruthy();
    });
  });

  describe('Actions', () => {
    test('Fetching actions with a valid address should not throw', async () => {
      const result = await executor({
        variables: {
          input: {
            address: 'B62qrfn5xxChtPGJne9HuDJZ4ziWVgWxeL3hntGBqMmf45p4hudo3tw',
          },
        },
        document: parse(`${actionsQuery}`),
      });
      expect(result).toBeTruthy();
    });
  });
});
