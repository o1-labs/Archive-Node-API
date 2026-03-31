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

      const row = makeRow();
      // Build the map manually to simulate what partitionBlocks would produce
      const blocksMap = new Map();
      const txMap = new Map();
      txMap.set('tx_hash_1', [row]);
      blocksMap.set('state_hash_1', txMap);

      const fieldValues = new Map([['100', 'field_val_1']]);

      const result = service.blocksToEvents(blocksMap, fieldValues);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].blockInfo.height, 100);
      assert.strictEqual(result[0].blockInfo.stateHash, 'state_hash_1');
      assert.strictEqual(result[0].eventData.length, 1);
      assert.deepStrictEqual(result[0].eventData[0].data, ['field_val_1']);
    });

    test('transforms block with multiple transactions', () => {
      service = new EventsService(makeClient());

      const row1 = makeRow({
        hash: 'tx1',
        zkapp_account_update_id: 1,
        zkapp_account_updates_ids: [1],
        event_field_elements_id: 10,
        event_element_ids: [10],
        event_field_element_ids: [100],
        field_id: 100,
        field_value: 'val1',
      });
      const row2 = makeRow({
        hash: 'tx2',
        zkapp_account_update_id: 2,
        zkapp_account_updates_ids: [2],
        event_field_elements_id: 20,
        event_element_ids: [20],
        event_field_element_ids: [200],
        field_id: 200,
        field_value: 'val2',
      });

      const blocksMap = new Map();
      const txMap = new Map();
      txMap.set('tx1', [row1]);
      txMap.set('tx2', [row2]);
      blocksMap.set('state_hash_1', txMap);

      const fieldValues = new Map([
        ['100', 'val1'],
        ['200', 'val2'],
      ]);

      const result = service.blocksToEvents(blocksMap, fieldValues);

      assert.strictEqual(result.length, 1); // one block
      assert.strictEqual(result[0].eventData.length, 2); // two events
    });

    test('transforms multiple blocks', () => {
      service = new EventsService(makeClient());

      const row1 = makeRow({
        state_hash: 'block1',
        hash: 'tx1',
        height: '100',
      });
      const row2 = makeRow({
        state_hash: 'block2',
        hash: 'tx2',
        height: '101',
      });

      const blocksMap = new Map();

      const txMap1 = new Map();
      txMap1.set('tx1', [row1]);
      blocksMap.set('block1', txMap1);

      const txMap2 = new Map();
      txMap2.set('tx2', [row2]);
      blocksMap.set('block2', txMap2);

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

      // Event has two fields: 100 and 101
      const row1 = makeRow({
        event_field_elements_id: 10,
        event_element_ids: [10],
        event_field_element_ids: [100, 101],
        field_id: 100,
        field_value: 'field_a',
      });
      const row2 = makeRow({
        // Duplicate row for second field — same event
        event_field_elements_id: 10,
        event_element_ids: [10],
        event_field_element_ids: [100, 101],
        field_id: 101,
        field_value: 'field_b',
      });

      const blocksMap = new Map();
      const txMap = new Map();
      txMap.set('tx_hash_1', [row1, row2]);
      blocksMap.set('state_hash_1', txMap);

      const fieldValues = new Map([
        ['100', 'field_a'],
        ['101', 'field_b'],
      ]);

      const result = service.blocksToEvents(blocksMap, fieldValues);

      assert.strictEqual(result.length, 1);
      // After deduplication, there should be one event with two field values
      assert.strictEqual(result[0].eventData.length, 1);
      assert.deepStrictEqual(result[0].eventData[0].data, [
        'field_a',
        'field_b',
      ]);
    });
  });
});
