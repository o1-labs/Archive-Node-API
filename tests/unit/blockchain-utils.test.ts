import { describe, test } from 'node:test';
import assert from 'node:assert';
import {
  createBlockInfo,
  createTransactionInfo,
  createEvent,
  createAction,
} from '../../src/blockchain/utils.js';
import type { ArchiveNodeDatabaseRow } from '../../src/db/sql/events-actions/types.js';

const baseRow: Partial<ArchiveNodeDatabaseRow> = {
  state_hash: 'state_hash_abc',
  parent_hash: 'parent_hash_xyz',
  height: '42',
  global_slot_since_genesis: '100',
  global_slot_since_hard_fork: '50',
  authorization_kind: 'Proof',
  timestamp: '1700000000000',
  chain_status: 'canonical',
  sequence_number: 3,
  ledger_hash: 'ledger_hash_def',
  distance_from_max_block_height: '10',
  zkapp_account_updates_ids: [7, 8, 9],
  status: 'applied',
  memo: 'E4YM2vTHhWEg66xpj52JErHUBU4pZ1yageL4TVDDpTTSsv8mK6YaH',
  hash: 'CkpZZMFyrBAnKidFoHxLiGbfeKKTFVFNJRhS3y3UUc5rVaoEMi8sZ',
  last_vrf_output: 'AABBCCDD',
};

describe('Blockchain Utils', () => {
  describe('createBlockInfo', () => {
    test('maps all database row fields to BlockInfo', () => {
      const result = createBlockInfo(baseRow as ArchiveNodeDatabaseRow);

      assert.strictEqual(result.height, 42);
      assert.strictEqual(result.stateHash, 'state_hash_abc');
      assert.strictEqual(result.parentHash, 'parent_hash_xyz');
      assert.strictEqual(result.ledgerHash, 'ledger_hash_def');
      assert.strictEqual(result.chainStatus, 'canonical');
      assert.strictEqual(result.timestamp, '1700000000000');
      assert.strictEqual(result.globalSlotSinceHardfork, 50);
      assert.strictEqual(result.globalSlotSinceGenesis, 100);
      assert.strictEqual(result.distanceFromMaxBlockHeight, 10);
      assert.strictEqual(result.lastVrfOutput, 'AABBCCDD');
    });

    test('converts string height to number', () => {
      const row = { ...baseRow, height: '99999' } as ArchiveNodeDatabaseRow;
      assert.strictEqual(createBlockInfo(row).height, 99999);
    });

    test('handles zero height', () => {
      const row = { ...baseRow, height: '0' } as ArchiveNodeDatabaseRow;
      assert.strictEqual(createBlockInfo(row).height, 0);
    });
  });

  describe('createTransactionInfo', () => {
    test('maps all database row fields to TransactionInfo', () => {
      const result = createTransactionInfo(baseRow as ArchiveNodeDatabaseRow);

      assert.strictEqual(result.status, 'applied');
      assert.strictEqual(
        result.hash,
        'CkpZZMFyrBAnKidFoHxLiGbfeKKTFVFNJRhS3y3UUc5rVaoEMi8sZ'
      );
      assert.strictEqual(
        result.memo,
        'E4YM2vTHhWEg66xpj52JErHUBU4pZ1yageL4TVDDpTTSsv8mK6YaH'
      );
      assert.strictEqual(result.authorizationKind, 'Proof');
      assert.strictEqual(result.sequenceNumber, 3);
      assert.deepStrictEqual(result.zkappAccountUpdateIds, [7, 8, 9]);
    });

    test('preserves sequence_number as number', () => {
      const row = { ...baseRow, sequence_number: 0 } as ArchiveNodeDatabaseRow;
      assert.strictEqual(createTransactionInfo(row).sequenceNumber, 0);
    });
  });

  describe('createEvent', () => {
    test('creates event with all properties', () => {
      const txInfo = {
        status: 'applied',
        hash: 'tx_hash',
        memo: 'memo',
        authorizationKind: 'Proof',
        sequenceNumber: 1,
        zkappAccountUpdateIds: [1],
      };
      const event = createEvent('42', ['field1', 'field2'], txInfo);

      assert.strictEqual(event.accountUpdateId, '42');
      assert.deepStrictEqual(event.data, ['field1', 'field2']);
      assert.strictEqual(event.transactionInfo, txInfo);
    });

    test('creates event with empty data', () => {
      const txInfo = {
        status: 'applied',
        hash: 'h',
        memo: '',
        authorizationKind: 'None_given',
        sequenceNumber: 0,
        zkappAccountUpdateIds: [],
      };
      const event = createEvent('1', [], txInfo);
      assert.deepStrictEqual(event.data, []);
    });
  });

  describe('createAction', () => {
    test('creates action with all properties', () => {
      const txInfo = {
        status: 'applied',
        hash: 'tx_hash',
        memo: 'memo',
        authorizationKind: 'Signature',
        sequenceNumber: 2,
        zkappAccountUpdateIds: [10, 11],
      };
      const action = createAction('99', ['val1'], txInfo);

      assert.strictEqual(action.accountUpdateId, '99');
      assert.deepStrictEqual(action.data, ['val1']);
      assert.strictEqual(action.transactionInfo, txInfo);
    });
  });
});
