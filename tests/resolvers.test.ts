import { test, before, describe, after } from 'node:test';
import assert from 'node:assert';
import { createYoga, createSchema } from 'graphql-yoga';
import { loadSchemaSync } from '@graphql-tools/load';
import { GraphQLFileLoader } from '@graphql-tools/graphql-file-loader';
import {
  buildHTTPExecutor,
  HTTPExecutorOptions,
} from '@graphql-tools/executor-http';
import { parse } from 'graphql';
import {
  Bool,
  Field,
  Lightnet,
  Mina,
  Poseidon,
  PrivateKey,
  UInt64,
} from 'o1js';
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
  emitMultipleFieldsEvents,
} from '../zkapp/utils.js';
import { HelloWorld, TestStruct } from '../zkapp/contract.js';
import { Actions } from 'src/blockchain/types.js';
import { AsyncExecutor } from '@graphql-tools/utils';
import { ActionOutput, EventOutput } from 'src/resolvers-types.js';

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

  after(() => {
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
      const results = (await executor({
        variables: {
          input: {
            address: '',
          },
        },
        document: parse(`${eventsQuery}`),
      })) as EventQueryResult;
      assert.strictEqual(results.data.events.length, 0);
    });

    describe('After emitting a single event', async () => {
      let results: EventQueryResult;
      before(async () => {
        await emitSingleEvent(zkApp, senderKeypair);
        results = await executeEventsQuery({
          address: zkApp.address.toBase58(),
        });
      });

      test('Emitting an event should return a single event with the correct data', async () => {
        const events = results.data.events;
        const lastEvent = events[events.length - 1];
        assert.strictEqual(lastEvent.eventData!.length, 1);
      });
    });

    describe('After emitting multiple events', async () => {
      const numberOfEmits = 3;
      let results: EventQueryResult;
      before(async () => {
        await emitSingleEvent(zkApp, senderKeypair, { numberOfEmits });
        results = await executeEventsQuery({
          address: zkApp.address.toBase58(),
        });
      });

      test('Most recent block with events on this account has the correct number of events', async () => {
        const eventOutput = results.data.events;
        const lastBlockEvents = eventOutput[eventOutput.length - 1].eventData!;
        assert.strictEqual(lastBlockEvents.length, numberOfEmits);
      });
    });

    describe('Events with multiple fields', async () => {
      let results: EventQueryResult;
      before(async () => {
        await emitMultipleFieldsEvent(zkApp, senderKeypair);
        results = await executeEventsQuery({
          address: zkApp.address.toBase58(),
        });
      });

      test('Emitting an event with multiple fields should return an event with multiple values', async () => {
        const events = results.data.events;
        const lastEvent = events[events.length - 1];
        assert.strictEqual(lastEvent.eventData!.length, 1);
      });
    });

    describe('Events with multiple field arrays', async () => {
      let results: EventQueryResult;
      const numberOfEmits = 3;
      before(async () => {
        await emitMultipleFieldsEvents(zkApp, senderKeypair, { numberOfEmits });
        results = await executeEventsQuery({
          address: zkApp.address.toBase58(),
        });
      });

      test('Last block contains the correct number of events', async () => {
        const events = results.data.events;
        const lastEvent = events[events.length - 1];
        assert.strictEqual(lastEvent.eventData!.length, numberOfEmits);
      });

      test('Events have the correct number of fields', async () => {
        const events = results.data.events;
        const lastEvent = events[events.length - 1];
        const expectedLength = 16; // 1 (event type) + 3 (event field arrays) * (1 (x: Field) + 1 (y: Bool) + 1 (z: UInt64) + 2 (publicKey: PublicKey))
        assert.strictEqual(
          lastEvent.eventData![0]!.data.length,
          expectedLength
        );
      });
    });
  });

  describe('Actions', async () => {
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
      const results = (await executor({
        variables: {
          input: {
            address: '',
          },
        },
        document: parse(`${actionsQuery}`),
      })) as ActionQueryResult;
      assert.strictEqual(results.data.actions.length, 0);
    });
    describe('After emitting a single action', async () => {
      let results: ActionQueryResult;
      before(async () => {
        await emitAction(zkApp, senderKeypair);
        results = await executeActionsQuery({
          address: zkApp.address.toBase58(),
        });
      });
      test('Emitting an action should return a single action with the correct data', async () => {
        const actions = results.data.actions;
        const lastAction = actions[actions.length - 1];
        assert.strictEqual(lastAction.actionData!.length, 1);
      });
    });
    describe('After emitting multiple actions', () => {
      const numberOfEmits = 3;
      let results: ActionQueryResult;
      const s1 = new TestStruct({
        x: Field(3),
        y: Bool(true),
        z: UInt64.from(1),
        address: PrivateKey.random().toPublicKey(),
      });
      const s2 = new TestStruct({
        x: Field(2),
        y: Bool(true),
        z: UInt64.from(1),
        address: PrivateKey.random().toPublicKey(),
      });
      const s3 = new TestStruct({
        x: Field(1),
        y: Bool(true),
        z: UInt64.from(1),
        address: PrivateKey.random().toPublicKey(),
      });
      const testStructs = {
        structs: [s1, s2, s3],
      };
      before(async () => {
        await emitAction(zkApp, senderKeypair, { numberOfEmits }, testStructs);
        results = await executeActionsQuery({
          address: zkApp.address.toBase58(),
        });
      });
      test('Emitting actions from many accounts should be fetchable in o1js', async () => {
        await Mina.fetchActions(zkApp.address); // This line will throw if actions do not reproduce the correct action hash
        assert(true);
      });
      test('Most recent block with actions on this account has the correct number of actions', async () => {
        const actionOutput = results.data.actions;
        const lastBlockActions =
          actionOutput[actionOutput.length - 1].actionData!;
        assert.strictEqual(lastBlockActions.length, numberOfEmits);
      });
      test('Fetched actions have correct data', async () => {
        const actionOutput = results.data.actions;
        const lastBlockActions =
          actionOutput[actionOutput.length - 1].actionData!;
        const lastAction = lastBlockActions[lastBlockActions.length - 1]!;
        const actionFieldData = lastAction.data;
        assert.strictEqual(actionFieldData.length, 15);
        assert.equal(actionFieldData.slice(0, 5), [
          s1.x.toString(),
          s1.y.toField().toString(),
          s1.z.toString(),
          s1.address.toFields()[0].toString(),
          s1.address.toFields()[1].toString(),
        ]);
        assert.equal(actionFieldData.slice(5, 10), [
          s2.x.toString(),
          s2.y.toField().toString(),
          s2.z.toString(),
          s2.address.toFields()[0].toString(),
          s2.address.toFields()[1].toString(),
        ]);
        assert.equal(actionFieldData.slice(10, 15), [
          s3.x.toString(),
          s3.y.toField().toString(),
          s3.z.toString(),
          s3.address.toFields()[0].toString(),
          s3.address.toFields()[1].toString(),
        ]);
      });
    });
    describe('Actions from different accounts', async () => {
      const sendersCount = 5;
      const actionsCount = 3;
      const senders: Keypair[] = [];
      let results: ActionQueryResult;

      before(async () => {
        for (let i = 0; i < sendersCount; i++) {
          senders.push(await Lightnet.acquireKeyPair());
        }
        await emitActionsFromMultipleSenders(zkApp, senders, {
          numberOfEmits: actionsCount,
        });

        results = await executeActionsQuery({
          address: zkApp.address.toBase58(),
        });
      });
      test('Emitting actions from many accounts should be fetchable in o1js', async () => {
        await Mina.fetchActions(zkApp.address); // This line will throw if actions do not reproduce the correct action hash
        assert(true);
      });
      test('Fetched actions have order metadata', async () => {
        const actionOutput = results.data.actions;
        for (const block of actionOutput) {
          const actionData = block.actionData;
          for (const action of actionData!) {
            assert(typeof action!.transactionInfo!.sequenceNumber === 'number');
            assert(action!.transactionInfo!.zkappAccountUpdateIds.length > 0);
          }
        }
      });
      test('Fetched actions have correct order', async () => {
        const actionOutput = results.data.actions;
        let testedAccountUpdateOrder = false;
        for (const block of actionOutput) {
          const actionData = block.actionData;
          for (let i = 1; i < actionData!.length; i++) {
            const previousAction = actionData![i - 1]!;
            const currentAction = actionData![i]!;
            assert.ok(
              previousAction.transactionInfo!.sequenceNumber <=
                currentAction.transactionInfo!.sequenceNumber
            );
            if (
              previousAction.transactionInfo!.sequenceNumber ===
              currentAction.transactionInfo!.sequenceNumber
            ) {
              testedAccountUpdateOrder = true;
              assert.ok(
                previousAction.accountUpdateId < currentAction.accountUpdateId
              );
            }
          }
        }
        assert.ok(testedAccountUpdateOrder);
      });
    });
  });
});
