import { describe, test } from 'node:test';
import assert from 'node:assert';
import {
  partitionBlocks,
  getElementIdFieldValues,
  removeRedundantEmittedFields,
  mapActionOrEvent,
} from '../src/services/data-adapters/database-row-adapters.js';
import { Action, Event } from '../src/blockchain/types.js';
import { ArchiveNodeDatabaseRow } from '../src/db/sql/events-actions/types.js';

describe('utils', () => {
  describe('partitionBlocks', () => {
    test('should partition rows by block hash and transaction hash', () => {
      const rows: any[] = [
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
      const rows: any[] = [];
      const result = partitionBlocks(rows);
      assert.strictEqual(result.size, 0);
    });
  });

  describe('getElementIdFieldValues', () => {
    test('should map id to field for each row', () => {
      const rows: any[] = [
        { id: 1, field: 'field_1' },
        { id: 2, field: 'field_2' },
        { id: 3, field: 'field_3' },
      ];

      const result = getElementIdFieldValues(rows as ArchiveNodeDatabaseRow[]);

      assert.equal(result.get('1'), 'field_1');
      assert.equal(result.get('2'), 'field_2');
      assert.equal(result.get('3'), 'field_3');
    });

    test('should handle empty rows', () => {
      const rows: any[] = [];
      const result = getElementIdFieldValues(rows);
      assert(result.size === 0);
    });
  });

  describe('removeRedundantEmittedFields', () => {
    test('should remove duplicate rows based on unique event ID', () => {
      const rows: any[] = [
        {
          zkapp_event_array_id: 1,
          zkapp_event_element_ids: [1, 2],
          zkapp_account_update_id: 10,
          zkapp_account_updates_ids: [10, 12],
        },
        {
          // Duplicate row (refers to the same event/action)
          zkapp_event_array_id: 1,
          zkapp_event_element_ids: [1, 2],
          zkapp_account_update_id: 10,
          zkapp_account_updates_ids: [10, 12],
        },
        {
          zkapp_event_array_id: 2,
          zkapp_event_element_ids: [1, 2],
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
      const rows: any[] = [
        {
          zkapp_event_array_id: 1,
          zkapp_event_element_ids: [1, 2],
          zkapp_account_update_id: 99, // No matching account update id in the list
          zkapp_account_updates_ids: [10, 11],
        },
      ];

      assert.throws(() =>
        removeRedundantEmittedFields(rows as ArchiveNodeDatabaseRow[])
      ),
        /No matching account update found/;
    });

    describe('mapActionOrEvent', () => {
      const mockElementIdFieldValues = new Map<string, string>();
      mockElementIdFieldValues.set('1', 'value1');
      mockElementIdFieldValues.set('2', 'value2');

      describe('when kind is "event"', () => {
        test('map rows to an array of events', () => {
          const rows: any[] = [
            {
              element_ids: [1, 2],
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
      });

      describe('when kind is "action"', () => {
        test('should map rows to an array of actions', () => {
          const rows: any[] = [
            {
              element_ids: [1, 2],
              zkapp_account_update_id: 123,
              zkapp_event_id: 456,
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
    });
  });
});
