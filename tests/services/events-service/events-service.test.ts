import { describe, test } from 'node:test';
import assert from 'node:assert';
import { EventsService } from '../../../src/services/events-service/events-service.js';
import type { ArchiveNodeDatabaseRow } from '../../../src/db/sql/events-actions/types.js';
import { makeClient } from '../../test-helpers.js';

function makeRow(
  overrides: Partial<ArchiveNodeDatabaseRow> = {}
): ArchiveNodeDatabaseRow {
  return {
    block_id: 1,
    zkapp_id: 1,
    state_hash: 'state_hash_1',
    parent_hash: 'parent_hash_1',
    height: '100',
    global_slot_since_genesis: '200',
    global_slot_since_hard_fork: '200',
    authorization_kind: 'Proof',
    timestamp: '1700000000000',
    chain_status: 'canonical',
    sequence_number: 0,
    ledger_hash: 'ledger_hash_1',
    distance_from_max_block_height: '5',
    zkapp_account_update_id: 1,
    zkapp_account_updates_ids: [1],
    status: 'applied',
    memo: '',
    hash: 'tx_hash_1',
    account_update_event_id: 1,
    event_element_ids: [10],
    event_field_elements_id: 10,
    event_field_element_ids: [100],
    field_id: 100,
    field_value: 'value_a',
    last_vrf_output: 'AABB',
    ...overrides,
  };
}

describe('EventsService', () => {
  describe('blocksToEvents', () => {
    let service: EventsService;

    test('transforms single block with single event', () => {
      service = new EventsService(makeClient());

      const stateHash = 'block_abc';
      const txHash = 'tx_001';
      const fieldId = 42;
      const expectedFieldValue = 'my_field_val';
      const expectedHeight = '150';

      const row = makeRow({
        state_hash: stateHash,
        hash: txHash,
        height: expectedHeight,
        field_id: fieldId,
        field_value: expectedFieldValue,
        event_field_element_ids: [fieldId],
      });

      const blocksMap = new Map();
      const txMap = new Map();
      txMap.set(txHash, [row]);
      blocksMap.set(stateHash, txMap);

      const fieldValues = new Map([[String(fieldId), expectedFieldValue]]);

      const result = service.blocksToEvents(blocksMap, fieldValues);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].blockInfo.height, Number(expectedHeight));
      assert.strictEqual(result[0].blockInfo.stateHash, stateHash);
      assert.strictEqual(result[0].eventData.length, 1);
      assert.deepStrictEqual(result[0].eventData[0].data, [expectedFieldValue]);
    });

    test('transforms block with multiple transactions', () => {
      service = new EventsService(makeClient());

      const stateHash = 'block_xyz';
      const txHash1 = 'tx_a';
      const txHash2 = 'tx_b';
      const fieldId1 = 100;
      const fieldId2 = 200;
      const fieldVal1 = 'val_alpha';
      const fieldVal2 = 'val_beta';

      const row1 = makeRow({
        state_hash: stateHash,
        hash: txHash1,
        zkapp_account_update_id: 1,
        zkapp_account_updates_ids: [1],
        event_field_elements_id: 10,
        event_element_ids: [10],
        event_field_element_ids: [fieldId1],
        field_id: fieldId1,
        field_value: fieldVal1,
      });
      const row2 = makeRow({
        state_hash: stateHash,
        hash: txHash2,
        zkapp_account_update_id: 2,
        zkapp_account_updates_ids: [2],
        event_field_elements_id: 20,
        event_element_ids: [20],
        event_field_element_ids: [fieldId2],
        field_id: fieldId2,
        field_value: fieldVal2,
      });

      const blocksMap = new Map();
      const txMap = new Map();
      txMap.set(txHash1, [row1]);
      txMap.set(txHash2, [row2]);
      blocksMap.set(stateHash, txMap);

      const fieldValues = new Map([
        [String(fieldId1), fieldVal1],
        [String(fieldId2), fieldVal2],
      ]);

      const result = service.blocksToEvents(blocksMap, fieldValues);

      assert.strictEqual(result.length, 1); // one block
      assert.strictEqual(result[0].eventData.length, 2); // two events
    });

    test('transforms multiple blocks', () => {
      service = new EventsService(makeClient());

      const stateHash1 = 'block_1';
      const stateHash2 = 'block_2';
      const txHash1 = 'tx_1';
      const txHash2 = 'tx_2';

      const row1 = makeRow({
        state_hash: stateHash1,
        hash: txHash1,
        height: '100',
      });
      const row2 = makeRow({
        state_hash: stateHash2,
        hash: txHash2,
        height: '101',
      });

      const blocksMap = new Map();

      const txMap1 = new Map();
      txMap1.set(txHash1, [row1]);
      blocksMap.set(stateHash1, txMap1);

      const txMap2 = new Map();
      txMap2.set(txHash2, [row2]);
      blocksMap.set(stateHash2, txMap2);

      const fieldValues = new Map([['100', 'val']]);

      const result = service.blocksToEvents(blocksMap, fieldValues);

      assert.strictEqual(result.length, 2);
    });

    test('returns empty array for empty input', () => {
      service = new EventsService(makeClient());
      const result = service.blocksToEvents(new Map(), new Map());
      assert.strictEqual(result.length, 0);
    });

    test('handles multi-field events correctly', () => {
      service = new EventsService(makeClient());

      const stateHash = 'block_multi';
      const txHash = 'tx_multi';
      const fieldIdA = 100;
      const fieldIdB = 101;
      const fieldValA = 'field_a';
      const fieldValB = 'field_b';

      const row1 = makeRow({
        state_hash: stateHash,
        hash: txHash,
        event_field_elements_id: 10,
        event_element_ids: [10],
        event_field_element_ids: [fieldIdA, fieldIdB],
        field_id: fieldIdA,
        field_value: fieldValA,
      });
      const row2 = makeRow({
        state_hash: stateHash,
        hash: txHash,
        event_field_elements_id: 10,
        event_element_ids: [10],
        event_field_element_ids: [fieldIdA, fieldIdB],
        field_id: fieldIdB,
        field_value: fieldValB,
      });

      const blocksMap = new Map();
      const txMap = new Map();
      txMap.set(txHash, [row1, row2]);
      blocksMap.set(stateHash, txMap);

      const fieldValues = new Map([
        [String(fieldIdA), fieldValA],
        [String(fieldIdB), fieldValB],
      ]);

      const result = service.blocksToEvents(blocksMap, fieldValues);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].eventData.length, 1);
      assert.deepStrictEqual(result[0].eventData[0].data, [
        fieldValA,
        fieldValB,
      ]);
    });
  });
});
