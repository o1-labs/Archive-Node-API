import { describe, test } from 'node:test';
import assert from 'node:assert';
import {
  partitionBlocks,
  getElementIdFieldValues,
  removeRedundantEmittedFields,
  mapActionOrEvent,
  sortAndFilterBlocks,
} from '../src/services/data-adapters/database-row-adapters.js';
import { Action, Event } from '../src/blockchain/types.js';
import type { BlockInfo } from '../src/blockchain/types.js';
import { ArchiveNodeDatabaseRow } from '../src/db/sql/events-actions/types.js';

describe('utils', () => {
  describe('partitionBlocks', () => {
    test('should partition rows by block hash and transaction hash', () => {
      const rows: Partial<ArchiveNodeDatabaseRow>[] = [
        { state_hash: 'state_hash_1', hash: 'hash_1' },
        { state_hash: 'state_hash_1', hash: 'hash_2' },
        { state_hash: 'state_hash_2', hash: 'hash_3' },
        { state_hash: 'state_hash_2', hash: 'hash_4' },
      ];

      const result = partitionBlocks(rows as ArchiveNodeDatabaseRow[]);

      const stateHash1 = result.get('state_hash_1');
      const stateHash2 = result.get('state_hash_2');

      assert(stateHash1);
      assert(stateHash2);

      assert.strictEqual(stateHash1.size, 2);
      assert.strictEqual(stateHash2.size, 2);
    });

    test('should return empty array if no rows', () => {
      const rows: ArchiveNodeDatabaseRow[] = [];
      const result = partitionBlocks(rows);
      assert.strictEqual(result.size, 0);
    });

    test('should accumulate multiple rows for the same transaction', () => {
      const rows: Partial<ArchiveNodeDatabaseRow>[] = [
        { state_hash: 'b1', hash: 'tx1', field_id: 1 },
        { state_hash: 'b1', hash: 'tx1', field_id: 2 },
      ];
      const result = partitionBlocks(rows as ArchiveNodeDatabaseRow[]);

      assert.strictEqual(result.size, 1);
      assert.strictEqual(result.get('b1')!.get('tx1')!.length, 2);
    });
  });

  describe('getElementIdFieldValues', () => {
    test('should map id to field for each row', () => {
      const rows: Partial<ArchiveNodeDatabaseRow>[] = [
        { field_id: 1, field_value: 'field_1' },
        { field_id: 2, field_value: 'field_2' },
        { field_id: 3, field_value: 'field_3' },
      ];

      const result = getElementIdFieldValues(rows as ArchiveNodeDatabaseRow[]);

      assert.equal(result.get('1'), 'field_1');
      assert.equal(result.get('2'), 'field_2');
      assert.equal(result.get('3'), 'field_3');
    });

    test('should handle empty rows', () => {
      const rows: ArchiveNodeDatabaseRow[] = [];
      const result = getElementIdFieldValues(rows);
      assert(result.size === 0);
    });

    test('later row should overwrite earlier for same field_id', () => {
      const rows: Partial<ArchiveNodeDatabaseRow>[] = [
        { field_id: 1, field_value: 'first' },
        { field_id: 1, field_value: 'second' },
      ];
      const result = getElementIdFieldValues(rows as ArchiveNodeDatabaseRow[]);

      assert.strictEqual(result.size, 1);
      assert.strictEqual(result.get('1'), 'second');
    });
  });

  describe('removeRedundantEmittedFields', () => {
    test('should remove duplicate rows based on unique event ID', () => {
      const rows: Partial<ArchiveNodeDatabaseRow>[] = [
        {
          event_field_elements_id: 1,
          event_element_ids: [1, 2],
          zkapp_account_update_id: 10,
          zkapp_account_updates_ids: [10, 12],
        },
        {
          // Duplicate row (refers to the same event/action)
          event_field_elements_id: 1,
          event_element_ids: [1, 2],
          zkapp_account_update_id: 10,
          zkapp_account_updates_ids: [10, 12],
        },
        {
          event_field_elements_id: 2,
          event_element_ids: [1, 2],
          zkapp_account_update_id: 12,
          zkapp_account_updates_ids: [10, 12],
        },
      ];

      const result = removeRedundantEmittedFields(
        rows as ArchiveNodeDatabaseRow[]
      );
      assert.strictEqual(result.length, 2); // Since one of the rows is a duplicate
    });

    test('should throw an error for a missing matching account update', () => {
      const rows: Partial<ArchiveNodeDatabaseRow>[] = [
        {
          event_field_elements_id: 1,
          event_field_element_ids: [1, 2],
          zkapp_account_update_id: 99, // No matching account update id in the list
          zkapp_account_updates_ids: [10, 11],
        },
      ];

      assert.throws(() =>
        removeRedundantEmittedFields(rows as ArchiveNodeDatabaseRow[])
      ),
        /No matching account update found/;
    });

    test('should keep rows for different events in same account update', () => {
      const rows: Partial<ArchiveNodeDatabaseRow>[] = [
        {
          event_field_elements_id: 100,
          event_element_ids: [100, 101],
          zkapp_account_update_id: 10,
          zkapp_account_updates_ids: [10],
        },
        {
          event_field_elements_id: 101,
          event_element_ids: [100, 101],
          zkapp_account_update_id: 10,
          zkapp_account_updates_ids: [10],
        },
      ];
      const result = removeRedundantEmittedFields(
        rows as ArchiveNodeDatabaseRow[]
      );
      assert.strictEqual(result.length, 2);
    });

    test('should preserve ordering by account update index', () => {
      // account_update_ids order: [20, 10] — so update 20 should come first
      const rows: Partial<ArchiveNodeDatabaseRow>[] = [
        {
          event_field_elements_id: 200,
          event_element_ids: [200],
          zkapp_account_update_id: 10,
          zkapp_account_updates_ids: [20, 10],
        },
        {
          event_field_elements_id: 100,
          event_element_ids: [100],
          zkapp_account_update_id: 20,
          zkapp_account_updates_ids: [20, 10],
        },
      ];
      const result = removeRedundantEmittedFields(
        rows as ArchiveNodeDatabaseRow[]
      );
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].zkapp_account_update_id, 20);
      assert.strictEqual(result[1].zkapp_account_update_id, 10);
    });

    test('should handle multiple events per account update with correct ordering', () => {
      const rows: Partial<ArchiveNodeDatabaseRow>[] = [
        {
          event_field_elements_id: 102,
          event_element_ids: [100, 101, 102],
          zkapp_account_update_id: 10,
          zkapp_account_updates_ids: [10],
        },
        {
          event_field_elements_id: 100,
          event_element_ids: [100, 101, 102],
          zkapp_account_update_id: 10,
          zkapp_account_updates_ids: [10],
        },
        {
          event_field_elements_id: 101,
          event_element_ids: [100, 101, 102],
          zkapp_account_update_id: 10,
          zkapp_account_updates_ids: [10],
        },
      ];
      const result = removeRedundantEmittedFields(
        rows as ArchiveNodeDatabaseRow[]
      );
      assert.strictEqual(result.length, 3);
      assert.strictEqual(result[0].event_field_elements_id, 100);
      assert.strictEqual(result[1].event_field_elements_id, 101);
      assert.strictEqual(result[2].event_field_elements_id, 102);
    });

    describe('mapActionOrEvent', () => {
      const mockElementIdFieldValues = new Map<string, string>();
      mockElementIdFieldValues.set('1', 'value1');
      mockElementIdFieldValues.set('2', 'value2');

      describe('when kind is "event"', () => {
        test('map rows to an array of events', () => {
          const rows: Partial<ArchiveNodeDatabaseRow>[] = [
            {
              zkapp_account_update_id: 1,
              event_field_element_ids: [1, 2],
            },
          ];

          const result: Event[] = mapActionOrEvent(
            'event',
            rows as ArchiveNodeDatabaseRow[],
            mockElementIdFieldValues
          );

          assert(result[0].data);
          assert(result[0].transactionInfo);
        });

        test('should map rows with correct data values', () => {
          const rows: Partial<ArchiveNodeDatabaseRow>[] = [
            {
              zkapp_account_update_id: 5,
              event_field_element_ids: [1, 2],
              status: 'applied',
              hash: 'tx_abc',
              memo: 'test memo',
              authorization_kind: 'Proof',
              sequence_number: 3,
              zkapp_account_updates_ids: [5, 6],
            },
          ];

          const result = mapActionOrEvent(
            'event',
            rows as ArchiveNodeDatabaseRow[],
            mockElementIdFieldValues
          );

          assert.deepStrictEqual(result[0].data, ['value1', 'value2']);
          assert.strictEqual(result[0].transactionInfo.hash, 'tx_abc');
          assert.strictEqual(result[0].transactionInfo.status, 'applied');
          assert.strictEqual(result[0].transactionInfo.authorizationKind, 'Proof');
          assert.strictEqual(result[0].transactionInfo.sequenceNumber, 3);
        });
      });

      describe('when kind is "action"', () => {
        test('should map rows to an array of actions', () => {
          const rows: Partial<ArchiveNodeDatabaseRow>[] = [
            {
              event_field_element_ids: [1, 2],
              zkapp_account_update_id: 123,
              account_update_event_id: 456,
            },
          ];

          const result = mapActionOrEvent(
            'action',
            rows as ArchiveNodeDatabaseRow[],
            mockElementIdFieldValues
          ) as Action[];

          assert(result[0].data);
          assert(result[0].transactionInfo);
          assert(result[0].accountUpdateId);
        });
      });

      test('should skip field ids not found in the map', () => {
        const fieldValues = new Map<string, string>([
          ['1', 'value1'],
          ['2', 'value2'],
        ]);
        const rows: Partial<ArchiveNodeDatabaseRow>[] = [
          { zkapp_account_update_id: 1, event_field_element_ids: [1, 999, 2] },
        ];
        const result = mapActionOrEvent(
          'event',
          rows as ArchiveNodeDatabaseRow[],
          fieldValues
        );
        assert.deepStrictEqual(result[0].data, ['value1', 'value2']);
      });

      test('should handle empty element ids', () => {
        const rows: Partial<ArchiveNodeDatabaseRow>[] = [
          { zkapp_account_update_id: 1, event_field_element_ids: [] },
        ];
        const result = mapActionOrEvent(
          'event',
          rows as ArchiveNodeDatabaseRow[],
          mockElementIdFieldValues
        );
        assert.deepStrictEqual(result[0].data, []);
      });

      test('should map multiple rows', () => {
        const rows: Partial<ArchiveNodeDatabaseRow>[] = [
          { zkapp_account_update_id: 1, event_field_element_ids: [1], hash: 'tx1' },
          { zkapp_account_update_id: 2, event_field_element_ids: [1, 2], hash: 'tx2' },
        ];
        const result = mapActionOrEvent(
          'event',
          rows as ArchiveNodeDatabaseRow[],
          mockElementIdFieldValues
        );
        assert.strictEqual(result.length, 2);
        assert.deepStrictEqual(result[0].data, ['value1']);
        assert.deepStrictEqual(result[1].data, ['value1', 'value2']);
      });
    });
  });

  describe('sortAndFilterBlocks', () => {
    function makeBlockEntry(
      height: number,
      timestamp: string,
      distanceFromMax: number,
      stateHash = 'sh' + height,
      lastVrfOutput = 'AA'
    ) {
      return {
        blockInfo: {
          height,
          stateHash,
          parentHash: 'ph',
          ledgerHash: 'lh',
          chainStatus: 'canonical',
          timestamp,
          globalSlotSinceHardfork: height,
          globalSlotSinceGenesis: height,
          distanceFromMaxBlockHeight: distanceFromMax,
          lastVrfOutput,
        } satisfies BlockInfo,
        eventData: [],
      };
    }

    test('should sort blocks by height ascending', () => {
      const data = [
        makeBlockEntry(300, '1000', 1),
        makeBlockEntry(100, '1000', 3),
        makeBlockEntry(200, '1000', 2),
      ];
      sortAndFilterBlocks(data);
      assert.strictEqual(data[0].blockInfo.height, 100);
      assert.strictEqual(data[1].blockInfo.height, 200);
      assert.strictEqual(data[2].blockInfo.height, 300);
    });

    test('should use timestamp as tiebreaker for equal heights', () => {
      const data = [
        makeBlockEntry(100, '3000', 1),
        makeBlockEntry(100, '1000', 1),
        makeBlockEntry(100, '2000', 1),
      ];
      sortAndFilterBlocks(data);
      assert.strictEqual(data[0].blockInfo.timestamp, '1000');
      assert.strictEqual(data[1].blockInfo.timestamp, '2000');
      assert.strictEqual(data[2].blockInfo.timestamp, '3000');
    });

    test('should filter best tip when multiple blocks at distance 0', () => {
      const data = [
        makeBlockEntry(100, '1000', 5),
        makeBlockEntry(200, '2000', 0, 'hash_a', 'AA'),
        makeBlockEntry(200, '2000', 0, 'hash_b', 'BB'),
      ];
      sortAndFilterBlocks(data);
      assert.strictEqual(data.length, 2);
      assert.strictEqual(data[0].blockInfo.height, 100);
      assert.strictEqual(data[1].blockInfo.distanceFromMaxBlockHeight, 0);
    });

    test('should not filter when only one block at distance 0', () => {
      const data = [
        makeBlockEntry(100, '1000', 5),
        makeBlockEntry(200, '2000', 0),
      ];
      sortAndFilterBlocks(data);
      assert.strictEqual(data.length, 2);
    });

    test('should handle empty array', () => {
      const data: { blockInfo: BlockInfo; eventData: never[] }[] = [];
      sortAndFilterBlocks(data);
      assert.strictEqual(data.length, 0);
    });
  });
});
