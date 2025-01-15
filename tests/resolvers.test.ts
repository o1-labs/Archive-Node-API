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
  fetchNetworkState,
  randomStruct,
} from '../zkapp/utils.js';
import { HelloWorld, TestStruct } from '../zkapp/contract.js';
import {
  ActionData,
  ActionOutput,
  EventData,
  EventOutput,
  NetworkStateOutput,
  MaxBlockHeightInfo,
  Maybe,
} from 'src/resolvers-types.js';

interface ExecutorResult {
  data:
  | {
    events: Array<EventOutput>;
  }
  | {
    actions: Array<ActionOutput>;
  }
  | {
    networkState: NetworkStateOutput;
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

interface NetworkQueryResult extends ExecutorResult {
  data: {
    networkState: NetworkStateOutput;
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
        sequenceNumber
        zkappAccountUpdateIds
      }
    }
  }
}
`;

const networkQuery = `
query maxBlockHeightInfo {
  networkState {
    maxBlockHeight {
      canonicalMaxBlockHeight
      pendingMaxBlockHeight
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
  }
  | {
    networkState: NetworkStateOutput;
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

interface NetworkQueryResult extends ExecutorResult {
  data: {
    networkState: NetworkStateOutput;
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

  async function executeNetworkStateQuery(): Promise<NetworkQueryResult> {
    return (await executor({
      document: parse(`${networkQuery}`),
    })) as NetworkQueryResult;
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

  describe("NetworkState", async () => {
    let blockResponse: NetworkStateOutput;
    let results: NetworkQueryResult;
    let fetchedBlockchainLength: number;

    before(async () => {
      results = await executeNetworkStateQuery();
      blockResponse = results.data.networkState;
      fetchedBlockchainLength = await fetchNetworkState(zkApp, senderKeypair);
    });

    test("Fetching the max block height should not throw", async () => {
      assert.doesNotThrow(async () => {
        await executeNetworkStateQuery();
      });
    });

    test("Fetching the max block height should return the max block height", async () => {
      blockResponse = results.data.networkState;
      assert.ok(blockResponse.maxBlockHeight.canonicalMaxBlockHeight > 0);
      assert.ok(blockResponse.maxBlockHeight.pendingMaxBlockHeight > 0);
      assert.ok(blockResponse.maxBlockHeight.pendingMaxBlockHeight > blockResponse.maxBlockHeight.canonicalMaxBlockHeight);
    });

    test("Fetched max block height from archive node should match with the one from mina node", async () => {
      assert.deepStrictEqual(blockResponse.maxBlockHeight.pendingMaxBlockHeight, fetchedBlockchainLength);
    });
    
    describe("Advance a block", async () => {
      before(async () => {
        await new Promise((resolve) => setTimeout(resolve, 25000)); // wait for new lightnet block
        results = await executeNetworkStateQuery();
        blockResponse = results.data.networkState;
        fetchedBlockchainLength = await fetchNetworkState(zkApp, senderKeypair);
      });
      test("Fetched max block height from archive node should match the one from mina node after one block", () => {
        assert.deepStrictEqual(blockResponse.maxBlockHeight.pendingMaxBlockHeight, fetchedBlockchainLength);
      });
    });

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
      const baseStruct = randomStruct();
      before(async () => {
        await emitMultipleFieldsEvent(
          zkApp,
          senderKeypair,
          undefined,
          baseStruct
        );
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
        const expectedStructData = structToAction(baseStruct);
        // The event type is 1 and the event data comes from the base struct
        assert.deepStrictEqual(eventData.data, ['1', ...expectedStructData]);
      });
    });

    describe('After emitting an event with multiple fields multiple times', async () => {
      let results: EventQueryResult;
      const numberOfEmits = 3;
      const baseStruct = randomStruct();
      before(async () => {
        await emitMultipleFieldsEvent(
          zkApp,
          senderKeypair,
          { numberOfEmits },
          baseStruct
        );
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
          const expectedStruct = new TestStruct(baseStruct);
          expectedStruct.x = expectedStruct.x.add(Field(i));
          const expectedStructData = structToAction(expectedStruct);
          const eventData = lastBlockEvents[i]!;
          // The event type is 1 and the event data comes from the base struct
          assert.deepStrictEqual(eventData.data, ['1', ...expectedStructData]);
        }
      });
    });

    describe('After emitting multiple events with multiple fields', async () => {
      let results: EventQueryResult;
      const numberOfEmits = 3;
      const baseStruct = randomStruct();
      before(async () => {
        await emitMultipleFieldsEvents(
          zkApp,
          senderKeypair,
          { numberOfEmits },
          baseStruct
        );
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
          const expectedStruct = new TestStruct(baseStruct);
          expectedStruct.x = expectedStruct.x.add(Field(i));
          const expectedS1 = new TestStruct(expectedStruct);
          const expectedS2 = new TestStruct(expectedStruct);
          const expectedS3 = new TestStruct(expectedStruct);
          expectedS1.z = expectedS1.z.add(UInt64.from(i));
          expectedS2.z = expectedS2.z.add(UInt64.from(i + 1));
          expectedS3.z = expectedS3.z.add(UInt64.from(i + 2));
          const eventData = lastBlockEvents[i]!;
          const structData = eventData.data;
          assert.strictEqual(structData.length, 16);
          assert.strictEqual(structData[0], '2');
          assert.deepStrictEqual(
            structData.slice(1, 6),
            structToAction(expectedS1)
          );
          assert.deepStrictEqual(
            structData.slice(6, 11),
            structToAction(expectedS2)
          );
          assert.deepStrictEqual(
            structData.slice(11, 16),
            structToAction(expectedS3)
          );
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
      const [s1, s2, s3] = [randomStruct(), randomStruct(), randomStruct()];
      const testStructArray = {
        structs: [s1, s2, s3],
      };
      before(async () => {
        await emitAction(zkApp, senderKeypair, undefined, testStructArray);
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
        const actionFieldData = lastBlockActions[0]!.data;
        assert.strictEqual(actionFieldData.length, 15);
        assert.deepStrictEqual(actionFieldData.slice(0, 5), structToAction(s1));
        assert.deepStrictEqual(
          actionFieldData.slice(5, 10),
          structToAction(s2)
        );
        assert.deepStrictEqual(
          actionFieldData.slice(10, 15),
          structToAction(s3)
        );
      });
    });
    describe('After emitting multiple actions', () => {
      const numberOfEmits = 3;
      let results: ActionQueryResult;
      const s1 = randomStruct();
      const s2 = randomStruct();
      const s3 = randomStruct();
      const testStructs = {
        structs: [s1, s2, s3],
      };
      before(async () => {
        await emitAction(zkApp, senderKeypair, { numberOfEmits }, testStructs);
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
      test('Fetched actions have correct data', async () => {
        const lastAction = lastBlockActions[lastBlockActions.length - 1]!;
        const actionFieldData = lastAction.data;
        assert.strictEqual(actionFieldData.length, 15);
        assert.deepStrictEqual(actionFieldData.slice(0, 5), structToAction(s1));
        assert.deepStrictEqual(
          actionFieldData.slice(5, 10),
          structToAction(s2)
        );
        assert.deepStrictEqual(
          actionFieldData.slice(10, 15),
          structToAction(s3)
        );
      });
      test('Fetched actions have order metadata', async () => {
        for (const block of actionsResponse) {
          const actionData = block.actionData;
          for (const action of actionData!) {
            assert(typeof action!.transactionInfo!.sequenceNumber === 'number');
            assert(action!.transactionInfo!.zkappAccountUpdateIds.length > 0);
          }
        }
      });
      test('Fetched actions have correct order', async () => {
        let testedAccountUpdateOrder = false;
        for (const block of actionsResponse) {
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


function structToAction(s: TestStruct) {
  return [
    s.x.toString(),
    s.y.toField().toString(),
    s.z.toString(),
    ...s.address.toFields().map((f) => f.toString()),
  ];
}
