import { describe, test } from 'node:test';
import assert from 'node:assert';
import type { Sql } from 'postgres';
import {
  UserCommandsService,
  validateUserCommandRange,
} from '../../../src/services/user-commands-service/user-commands-service.js';
import type { UserCommandDatabaseRow } from '../../../src/db/sql/user-commands/queries.js';
import { TracingState } from '../../../src/tracing/tracer.js';
import {
  BLOCK_RANGE_SIZE,
  USER_COMMAND_LIMIT,
} from '../../../src/server/server.js';

const nullOptions = { tracingState: new TracingState(undefined as any) };
const input = { address: 'B62account', from: 0, to: 10 };

function makeRow(sequenceNo: number): UserCommandDatabaseRow {
  return {
    state_hash: 'state_hash_1',
    parent_hash: 'parent_hash_1',
    height: '5',
    global_slot_since_genesis: '10',
    global_slot_since_hard_fork: '10',
    timestamp: '1700000000000',
    chain_status: 'canonical',
    ledger_hash: 'ledger_hash_1',
    distance_from_max_block_height: '1',
    last_vrf_output: 'vrf_1',
    sequence_no: sequenceNo,
    status: 'applied',
    failure_reason: null,
    hash: `tx_${sequenceNo}`,
    command_type: 'payment',
    fee_payer: 'B62account',
    source: 'B62account',
    receiver: 'B62receiver',
    amount: '1000',
    fee: '10',
    nonce: String(sequenceNo),
    memo: 'memo',
  };
}

/**
 * A client that answers the public key lookup with `accountIds` and the user
 * command query with `rows`. It records the parameters of the second query.
 */
function makeStubClient(accountIds: { id: number }[], rows: unknown[]) {
  const calls: { params: unknown[] }[] = [];
  const client = Object.assign(async () => accountIds, {
    unsafe: async (_sql: string, params: unknown[]) => {
      calls.push({ params });
      return rows;
    },
  }) as unknown as Sql<{}>;
  return { client, calls };
}

describe('UserCommandsService', () => {
  describe('validateUserCommandRange', () => {
    test('rejects an empty range (to == from)', () => {
      assert.throws(() => validateUserCommandRange(10, 10));
    });

    test('rejects a reversed range', () => {
      assert.throws(() => validateUserCommandRange(10, 9));
    });

    test('accepts a range exactly at BLOCK_RANGE_SIZE', () => {
      assert.doesNotThrow(() => validateUserCommandRange(0, BLOCK_RANGE_SIZE));
    });

    test('rejects a range one over BLOCK_RANGE_SIZE', () => {
      assert.throws(() => validateUserCommandRange(0, BLOCK_RANGE_SIZE + 1));
    });
  });

  describe('getUserCommands', () => {
    test('returns no commands for an unknown public key', async () => {
      const { client, calls } = makeStubClient([], []);
      const service = new UserCommandsService(client);
      const result = await service.getUserCommands(input, nullOptions);
      assert.deepStrictEqual(result, []);
      assert.strictEqual(calls.length, 0);
    });

    test('asks for one row more than USER_COMMAND_LIMIT', async () => {
      const { client, calls } = makeStubClient([{ id: 7 }], []);
      const service = new UserCommandsService(client);
      await service.getUserCommands(input, nullOptions);
      assert.deepStrictEqual(calls[0].params, [
        7,
        input.from,
        input.to,
        USER_COMMAND_LIMIT + 1,
      ]);
    });

    test('resolves when the range holds exactly USER_COMMAND_LIMIT rows', async () => {
      const rows = Array.from({ length: USER_COMMAND_LIMIT }, (_, i) =>
        makeRow(i)
      );
      const { client } = makeStubClient([{ id: 7 }], rows);
      const service = new UserCommandsService(client);
      const result = await service.getUserCommands(input, nullOptions);
      assert.strictEqual(result.length, USER_COMMAND_LIMIT);
      assert.strictEqual(result[0].hash, 'tx_0');
      assert.strictEqual(result[0].nonce, 0);
      assert.strictEqual(result[0].from, 'B62account');
      assert.strictEqual(result[0].to, 'B62receiver');
    });

    test('rejects a range that holds more than USER_COMMAND_LIMIT rows', async () => {
      const rows = Array.from({ length: USER_COMMAND_LIMIT + 1 }, (_, i) =>
        makeRow(i)
      );
      const { client } = makeStubClient([{ id: 7 }], rows);
      const service = new UserCommandsService(client);
      await assert.rejects(service.getUserCommands(input, nullOptions), {
        message: new RegExp(
          `more than ${USER_COMMAND_LIMIT} user commands for this account`
        ),
      });
    });

    test('rejects an over-size range before it queries the database', async () => {
      const { client, calls } = makeStubClient([{ id: 7 }], []);
      const service = new UserCommandsService(client);
      await assert.rejects(
        service.getUserCommands(
          { ...input, to: input.from + BLOCK_RANGE_SIZE + 1 },
          nullOptions
        )
      );
      assert.strictEqual(calls.length, 0);
    });
  });
});
