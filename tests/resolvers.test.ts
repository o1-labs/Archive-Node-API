import { test, before, describe, after } from 'node:test';
import assert from 'node:assert';
import { createYoga, createSchema } from 'graphql-yoga';
import { loadSchemaSync } from '@graphql-tools/load';
import { GraphQLFileLoader } from '@graphql-tools/graphql-file-loader';
import { buildHTTPExecutor } from '@graphql-tools/executor-http';
import { parse } from 'graphql';
import { PrivateKey, Lightnet, Mina } from 'o1js';
import { resolvers } from '../src/resolvers.js';
import { buildContext, GraphQLContext } from '../src/context.js';
import {
  deployContract,
  emitAction,
  emitMultipleFieldsEvent,
  emitSingleEvent,
  setNetworkConfig,
  Keypair,
  emitActionsFromMultipleSenders,
} from '../zkapp/utils.js';
import { HelloWorld } from '../zkapp/contract.js';
import { Actions } from 'src/blockchain/types.js';

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
        sequenceNumber
        zkappAccountUpdateIds
      }
    }
  }
}
`;

// This is the default connection string provided by the lightnet postgres container
const PG_CONN = 'postgresql://postgres:postgres@localhost:5432/archive ';

describe('Query Resolvers', async () => {
  let executor: any;
  let senderKeypair: Keypair;
  let zkAppKeypair: Keypair;
  let zkApp: HelloWorld;

  before(async () => {
    try {
      setNetworkConfig();

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
    process.exit(0);
  });

  describe('Events', async () => {
    test('Fetching events with a valid address but no emitted events should not throw', async () => {
      assert.doesNotThrow(async () => {
        await executor({
          variables: {
            input: { address: zkAppKeypair.publicKey.toBase58() },
          },
          document: parse(`${eventsQuery}`),
        });
      });
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
      assert.strictEqual(results.data.events.length, 0);
    });

    test('Emitting an event with single field should return a single event with the correct data', async () => {
      await emitSingleEvent(zkApp, senderKeypair);
      const results = await executor({
        variables: {
          input: {
            address: zkAppKeypair.publicKey.toBase58(),
          },
        },
        document: parse(`${eventsQuery}`),
      });

      const events = results.data.events;
      const lastEvent = events[events.length - 1];
      assert.strictEqual(lastEvent.eventData.length, 1);
    });

    test('Emitting multiple events with a single field should return multiple events with the correct data', async () => {
      await emitSingleEvent(zkApp, senderKeypair, { numberOfEmits: 3 });
      const results = await executor({
        variables: {
          input: {
            address: zkAppKeypair.publicKey.toBase58(),
          },
        },
        document: parse(`${eventsQuery}`),
      });
      const events = results.data.events;
      const lastEvent = events[events.length - 1];
      assert.strictEqual(lastEvent.eventData.length, 3);
    });

    test('Emitting an event with multiple fields should return an event with multiple values', async () => {
      await emitMultipleFieldsEvent(zkApp, senderKeypair);
      const results = await executor({
        variables: {
          input: {
            address: zkAppKeypair.publicKey.toBase58(),
          },
        },
        document: parse(`${eventsQuery}`),
      });
      const events = results.data.events;
      const lastEvent = events[events.length - 1];
      assert.strictEqual(lastEvent.eventData.length, 1);
    });

    test('Emitting multiple events with multiple fields should return multiple events with the correct data', async () => {
      await emitMultipleFieldsEvent(zkApp, senderKeypair, { numberOfEmits: 3 });
      const results = await executor({
        variables: {
          input: {
            address: zkAppKeypair.publicKey.toBase58(),
          },
        },
        document: parse(`${eventsQuery}`),
      });
      const events = results.data.events;
      const lastEvent = events[events.length - 1];
      assert.strictEqual(lastEvent.eventData.length, 3);
    });
  });

  describe.only('Actions', async () => {
    test('Fetching actions with a valid address should not throw', async () => {
      assert.doesNotThrow(async () => {
        await executor({
          variables: {
            input: {
              address: zkAppKeypair.publicKey.toBase58(),
            },
          },
          document: parse(`${actionsQuery}`),
        });
      });
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
      assert.strictEqual(results.data.actions.length, 0);
    });

    test('Emitting an action should return a single action with the correct data', async () => {
      await emitAction(zkApp, senderKeypair);
      const results = await executor({
        variables: {
          input: {
            address: zkAppKeypair.publicKey.toBase58(),
          },
        },
        document: parse(`${actionsQuery}`),
      });
      const actions = results.data.actions;
      const lastAction = actions[actions.length - 1];
      assert.strictEqual(lastAction.actionData.length, 1);
    });

    test('Emitting multiple actions should return multiple actions with the correct data', async () => {
      await emitAction(zkApp, senderKeypair, { numberOfEmits: 3 });
      const results = await executor({
        variables: {
          input: {
            address: zkAppKeypair.publicKey.toBase58(),
          },
        },
        document: parse(`${actionsQuery}`),
      });
      const actions = results.data.actions;
      const lastAction = actions[actions.length - 1];
      assert.strictEqual(lastAction.actionData.length, 3);
    });

    describe('Actions from different accounts', async () => {
      const sendersCount = 5;
      const actionsCount = 3;
      const senders: Keypair[] = [];

      before(async () => {
        for (let i = 0; i < sendersCount; i++) {
          senders.push(await Lightnet.acquireKeyPair());
        }
      });

      test('Emitting actions from many accounts should be fetchable in o1js', async () => {
        await emitActionsFromMultipleSenders(zkApp, senders, {
          numberOfEmits: actionsCount,
        });

        await Mina.fetchActions(zkApp.address); // This line will throw if actions do not reproduce the correct action hash
        assert(true);
      });

      test('Fetched actions have order metadata', async () => {
        const results = await executor({
          variables: {
            input: {
              address: zkApp.address,
            },
          },
          document: parse(`${actionsQuery}`),
        });
        const actions: Actions = results.data.actions;
        for (const block of actions) {
          const actionData = block.actionData;
          for (const action of actionData) {
            assert.ok(action.transactionInfo.sequenceNumber);
            assert(action.transactionInfo.zkappAccountUpdateIds.length > 0);
          }
        }
      });
    });
  });
});
