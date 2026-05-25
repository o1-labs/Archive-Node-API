import { describe, test } from 'node:test';
import assert from 'node:assert';
import {
  ZkappCommandsService,
  assertZkappCommandAccountUpdateLimit,
  normalizeZkappCommandRange,
} from '../../../src/services/zkapp-commands-service/zkapp-commands-service.js';
import type { ZkappCommandDatabaseRow } from '../../../src/db/sql/zkapp-commands/types.js';
import {
  ZKAPP_COMMAND_ACCOUNT_UPDATE_LIMIT,
  ZKAPP_COMMAND_RANGE_SIZE,
} from '../../../src/server/server.js';
import { makeClient } from '../../test-helpers.js';

function makeRow(
  overrides: Partial<ZkappCommandDatabaseRow> = {}
): ZkappCommandDatabaseRow {
  return {
    block_id: 1,
    state_hash: 'state_hash_1',
    parent_hash: 'parent_hash_1',
    height: '100',
    global_slot_since_genesis: '200',
    global_slot_since_hard_fork: '200',
    timestamp: '1700000000000',
    chain_status: 'canonical',
    ledger_hash: 'ledger_hash_1',
    distance_from_max_block_height: '5',
    last_vrf_output: 'vrf_1',
    hash: 'tx_hash_1',
    memo: 'memo_1',
    sequence_number: 0,
    fee_payer: 'B62feePayer',
    fee: '100000000',
    account_update_id: 10,
    account_update_order: '1',
    public_key: 'B62accountUpdate',
    token_id: '1',
    authorization_kind: 'Proof',
    balance_change: '0',
    increment_nonce: false,
    call_depth: 0,
    actions: [{ fields: ['1', '2'] }],
    events: [{ fields: ['3', '4'] }],
    app_state: { fields: ['5', null] },
    account_precondition_state: { fields: ['6', null] },
    account_precondition_action_state: { fields: ['7', '8'] },
    account_precondition_proved_state: true,
    account_precondition_is_new: false,
    network_precondition_global_slot_lower_bound: 200,
    network_precondition_global_slot_upper_bound: 300,
    ...overrides,
  };
}

describe('ZkappCommandsService', () => {
  describe('normalizeZkappCommandRange', () => {
    test('keeps explicit bounded ranges unchanged', () => {
      assert.deepStrictEqual(normalizeZkappCommandRange({ from: 0, to: 10 }), {
        from: 0,
        to: 10,
      });
    });

    test('rejects ranges over the configured maximum', () => {
      assert.throws(() =>
        normalizeZkappCommandRange({
          from: 0,
          to: ZKAPP_COMMAND_RANGE_SIZE + 1,
        })
      );
    });

    test('rejects empty ranges', () => {
      assert.throws(() => normalizeZkappCommandRange({ from: 10, to: 10 }));
    });

    test('allows a range exactly at the configured maximum', () => {
      assert.deepStrictEqual(
        normalizeZkappCommandRange({ from: 0, to: ZKAPP_COMMAND_RANGE_SIZE }),
        {
          from: 0,
          to: ZKAPP_COMMAND_RANGE_SIZE,
        }
      );
    });
  });

  describe('assertZkappCommandAccountUpdateLimit', () => {
    test('allows account update counts at the configured maximum', () => {
      assert.doesNotThrow(() =>
        assertZkappCommandAccountUpdateLimit(ZKAPP_COMMAND_ACCOUNT_UPDATE_LIMIT)
      );
    });

    test('rejects account update counts over the configured maximum', () => {
      assert.throws(() =>
        assertZkappCommandAccountUpdateLimit(
          ZKAPP_COMMAND_ACCOUNT_UPDATE_LIMIT + 1
        )
      );
    });
  });

  describe('rowsToZkappCommands', () => {
    test('groups ordered account updates under their zkApp command', () => {
      const service = new ZkappCommandsService(makeClient());
      const rows = [
        makeRow({ account_update_id: 10, public_key: 'B62first' }),
        makeRow({
          account_update_id: 11,
          account_update_order: '2',
          public_key: 'B62second',
        }),
      ];

      const result = service.rowsToZkappCommands(rows);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].hash, 'tx_hash_1');
      assert.strictEqual(result[0].blockInfo.height, 100);
      assert.strictEqual(result[0].accountUpdates.length, 2);
      assert.strictEqual(result[0].accountUpdates[0].id, '10');
      assert.strictEqual(result[0].accountUpdates[1].id, '11');
      assert.deepStrictEqual(result[0].accountUpdates[0].actions, [
        { fields: ['1', '2'] },
      ]);
      assert.deepStrictEqual(result[0].accountUpdates[0].events, [
        { fields: ['3', '4'] },
      ]);
      assert.deepStrictEqual(result[0].accountUpdates[0].appState, {
        fields: ['5', null],
      });
      assert.deepStrictEqual(
        result[0].accountUpdates[0].networkPrecondition.globalSlotSinceGenesis,
        {
          lowerBound: 200,
          upperBound: 300,
        }
      );
    });

    test('keeps separate commands in block and sequence order', () => {
      const service = new ZkappCommandsService(makeClient());
      const rows = [
        makeRow({ height: '100', sequence_number: 0, hash: 'tx_1' }),
        makeRow({ height: '100', sequence_number: 1, hash: 'tx_2' }),
      ];

      const result = service.rowsToZkappCommands(rows);

      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].hash, 'tx_1');
      assert.strictEqual(result[1].hash, 'tx_2');
    });

    test('does not collapse identical transaction hashes across blocks', () => {
      const service = new ZkappCommandsService(makeClient());
      const rows = [
        makeRow({ state_hash: 'block_1', height: '100', hash: 'tx_hash' }),
        makeRow({ state_hash: 'block_2', height: '101', hash: 'tx_hash' }),
      ];

      const result = service.rowsToZkappCommands(rows);

      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].blockInfo.stateHash, 'block_1');
      assert.strictEqual(result[1].blockInfo.stateHash, 'block_2');
    });
  });
});
