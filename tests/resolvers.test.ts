import { test, before, describe, after } from 'node:test';
import assert from 'node:assert';
import { createYoga, createSchema } from 'graphql-yoga';
import { loadSchemaSync } from '@graphql-tools/load';
import { GraphQLFileLoader } from '@graphql-tools/graphql-file-loader';
import {
  buildHTTPExecutor,
  HTTPExecutorOptions,
} from '@graphql-tools/executor-http';
import { AsyncExecutor } from '@graphql-tools/utils';
import { parse } from 'graphql';
import { PrivateKey, Lightnet } from 'o1js';
import { resolvers } from '../src/resolvers.js';
import { buildContext, GraphQLContext } from '../src/context.js';
import {
  deployContract,
  emitAction,
  emitMultipleFieldsEvent,
  emitSingleEvent,
  setNetworkConfig,
  Keypair,
} from '../zkapp/utils.js';
import { HelloWorld } from '../zkapp/contract.js';
import {
  ActionData,
  ActionOutput,
  EventData,
  EventOutput,
  Maybe,
} from 'src/resolvers-types.js';

interface ExecutorResult {
  data:
    | {
        events: Array<EventOutput>;
      }
    | {
        actions: Array<ActionOutput>;
      };
}

interface EventQueryResult extends ExecutorResult {
  data: {
    events: Array<EventOutput>;
  };
}

interface ActionQueryResult extends ExecutorResult {
  data: {
    actions: Array<ActionOutput>;
  };
}

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
      globalSlotSinceHardfork
      globalSlotSinceGenesis
    }
    eventData {
      data
      transactionInfo {
        status
        hash
        memo
      }
    }
  }
}
`;

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
      }
    }
  }
}
`;

// This is the default connection string provided by the lightnet postgres container
const PG_CONN = 'postgresql://postgres:postgres@localhost:5432/archive ';

describe('Query Resolvers', async () => {
  let executor: AsyncExecutor<GraphQLContext, HTTPExecutorOptions>;
  let senderKeypair: Keypair;
  let zkAppKeypair: Keypair;
  let zkApp: HelloWorld;

  async function executeActionsQuery(variableInput: {
    address: string;
  }): Promise<ActionQueryResult> {
    return (await executor({
      variables: {
        input: variableInput,
      },
      document: parse(`${actionsQuery}`),
    })) as ActionQueryResult;
  }

  async function executeEventsQuery(variableInput: {
    address: string;
  }): Promise<EventQueryResult> {
    return (await executor({
      variables: {
        input: variableInput,
      },
      document: parse(`${eventsQuery}`),
    })) as EventQueryResult;
  }

  before(async () => {
    try {
      setNetworkConfig();

      const schema = createSchema<GraphQLContext>({
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

      zkAppKeypair = await Lightnet.acquireKeyPair();
      senderKeypair = await Lightnet.acquireKeyPair();
      zkApp = await deployContract(
        zkAppKeypair,
        senderKeypair,
        /* fundNewAccount = */ false
      );
    } catch (error) {
      console.error(error);
    }
  });

  after(async () => {
    process.on('uncaughtException', (err) => {
      console.error('Uncaught exception:', err);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });

    process.exit(0);
  });

  describe('Events', async () => {
    let eventsResponse: EventOutput[];
    let lastBlockEvents: Maybe<EventData>[];
    let results: EventQueryResult;

    test('Fetching events with a valid address but no emitted events should not throw', async () => {
      assert.doesNotThrow(async () => {
        await executeEventsQuery({
          address: zkAppKeypair.publicKey.toBase58(),
        });
      });
    });

    test('Fetching events with a empty address should return empty list', async () => {
      results = await executeEventsQuery({
        address: '',
      });
      assert.strictEqual(results.data.events.length, 0);
    });

    describe('After emitting an event with a single field once', async () => {
      before(async () => {
        await emitSingleEvent(zkApp, senderKeypair);
        results = await executeEventsQuery({
          address: zkApp.address.toBase58(),
        });
        eventsResponse = results.data.events;
        lastBlockEvents = eventsResponse[eventsResponse.length - 1].eventData!;
      });
      test('GQL response contains one event in the latest block', async () => {
        assert.strictEqual(lastBlockEvents.length, 1);
      });
      test('The event has the correct data', async () => {
        const eventData = lastBlockEvents[0]!;
        assert.deepStrictEqual(eventData.data, ['0', '2']); // event type enum = 0 and event data = 2
      });
    });

    describe('After emitting an event with a single field multiple times', async () => {
      let results: EventQueryResult;
      const numberOfEmits = 3;
      before(async () => {
        await emitSingleEvent(zkApp, senderKeypair, { numberOfEmits });
        results = await executeEventsQuery({
          address: zkApp.address.toBase58(),
        });
        eventsResponse = results.data.events;
        lastBlockEvents = eventsResponse[eventsResponse.length - 1].eventData!;
      });
      test('GQL response contains multiple events in the latest block', async () => {
        assert.strictEqual(lastBlockEvents.length, numberOfEmits);
      });
      test('the events have the correct data', async () => {
        for (let i = 0; i < numberOfEmits; i++) {
          const eventData = lastBlockEvents[i]!;
          assert.deepStrictEqual(eventData.data, ['0', '2']); // event type enum = 0 and event data = 2
        }
      });
    });

    describe('After emitting an event with multiple fields once', async () => {
      let results: EventQueryResult;
      before(async () => {
        await emitMultipleFieldsEvent(zkApp, senderKeypair);
        results = await executeEventsQuery({
          address: zkApp.address.toBase58(),
        });
        eventsResponse = results.data.events;
        lastBlockEvents = eventsResponse[eventsResponse.length - 1].eventData!;
      });

      test('GQL response contains one event in the latest block', async () => {
        assert.strictEqual(lastBlockEvents.length, 1);
      });

      test('The event has the correct data', async () => {
        const eventData = lastBlockEvents[0]!;
        // The event type is 1 and the event data is 2, 1 (Bool(true)), 1 and the zkapp address
        assert.deepStrictEqual(eventData.data, [
          '1',
          '2',
          '1',
          '1',
          ...zkApp.address.toFields().map((f) => f.toString()),
        ]);
      });
    });

    describe('After emitting an event with multiple fields multiple times', async () => {
      let results: EventQueryResult;
      const numberOfEmits = 3;
      before(async () => {
        await emitMultipleFieldsEvent(zkApp, senderKeypair, { numberOfEmits });
        results = await executeEventsQuery({
          address: zkApp.address.toBase58(),
        });
        eventsResponse = results.data.events;
        lastBlockEvents = eventsResponse[eventsResponse.length - 1].eventData!;
      });
      test('GQL response contains multiple events in the latest block', async () => {
        assert.strictEqual(lastBlockEvents.length, numberOfEmits);
      });
      test('the events have the correct data', async () => {
        for (let i = 0; i < numberOfEmits; i++) {
          const eventData = lastBlockEvents[i]!;
          // The event type is 1 and the event data is 2, 1 (Bool(true)), and the zkapp address
          assert.deepStrictEqual(eventData.data, [
            '1',
            '2',
            '1',
            '1',
            ...zkApp.address.toFields().map((f) => f.toString()),
          ]);
        }
      });
    });
  });

  describe('Actions', async () => {
    let actionsResponse: ActionOutput[];
    let lastBlockActions: Maybe<ActionData>[];
    let results: ActionQueryResult;

    test('Fetching actions with a valid address should not throw', async () => {
      assert.doesNotThrow(async () => {
        await executeActionsQuery({
          address: zkAppKeypair.publicKey.toBase58(),
        });
      });
    });

    test('Fetching actions with a empty address should return empty list', async () => {
      results = await executeActionsQuery({
        address: '',
      });
      assert.strictEqual(results.data.actions.length, 0);
    });

    describe('After emitting an action', async () => {
      before(async () => {
        await emitAction(zkApp, senderKeypair);
        results = await executeActionsQuery({
          address: zkApp.address.toBase58(),
        });
        actionsResponse = results.data.actions;
        lastBlockActions =
          actionsResponse[actionsResponse.length - 1].actionData!;
      });
      test('GQL response contains one action', async () => {
        assert.strictEqual(lastBlockActions.length, 1);
      });
      test('The action has the correct data', async () => {
        const actionData = lastBlockActions[0]!;
        assert.deepStrictEqual(actionData.data, [
          '2',
          '1',
          '1',
          ...zkApp.address.toFields().map((f) => f.toString()),
        ]);
      });
    });

    describe('After emitting multiple actions', async () => {
      const numberOfEmits = 3;
      before(async () => {
        await emitAction(zkApp, senderKeypair, { numberOfEmits });
        results = await executeActionsQuery({
          address: zkApp.address.toBase58(),
        });
        actionsResponse = results.data.actions;
        lastBlockActions =
          actionsResponse[actionsResponse.length - 1].actionData!;
      });

      test('GQL response contains multiple actions', async () => {
        assert.strictEqual(lastBlockActions.length, numberOfEmits);
      });
      test('The actions have the correct data', async () => {
        for (let i = 0; i < numberOfEmits; i++) {
          const actionData = lastBlockActions[i]!;
          assert.deepStrictEqual(actionData.data, [
            '2',
            '1',
            '1',
            ...zkApp.address.toFields().map((f) => f.toString()),
          ]);
        }
      });
    });
  });
});
