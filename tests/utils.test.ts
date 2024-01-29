import { describe, test, expect } from 'vitest';
import {
  partitionBlocks,
  getElementIdFieldValues,
  removeRedundantEmittedFields,
  mapActionOrEvent,
} from '../src/services/data-adapters/database-row-adapters';
import { Action, Event } from '../src/blockchain/types.js';
import { ArchiveNodeDatabaseRow } from '../src/db/sql/events-actions/types.js';

describe('utils', () => {
  describe('partitionBlocks', () => {
    test('should partition rows by block hash and transaction hash', () => {
      const rows = [
        { state_hash: 'state_hash_1', hash: 'hash_1' },
        { state_hash: 'state_hash_1', hash: 'hash_2' },
        { state_hash: 'state_hash_2', hash: 'hash_3' },
        { state_hash: 'state_hash_2', hash: 'hash_4' },
      ];

      const result = partitionBlocks(rows as ArchiveNodeDatabaseRow[]);

      const stateHash1 = result.get('state_hash_1');
      const stateHash2 = result.get('state_hash_2');

      expect(stateHash1).toBeDefined();
      expect(stateHash2).toBeDefined();

      expect(stateHash1).toHaveLength(2);
      expect(stateHash2).toHaveLength(2);
    });

    test('should return empty array if no rows', () => {
      const rows = [];
      const result = partitionBlocks(rows);
      expect(result).toEqual(new Map());
    });
  });

  describe('getElementIdFieldValues', () => {
    test('should map id to field for each row', () => {
      const rows = [
        { id: 1, field: 'field_1' },
        { id: 2, field: 'field_2' },
        { id: 3, field: 'field_3' },
      ];

      const result = getElementIdFieldValues(rows as ArchiveNodeDatabaseRow[]);

      expect(result.get('1')).toBe('field_1');
      expect(result.get('2')).toBe('field_2');
      expect(result.get('3')).toBe('field_3');
    });

    test('should handle empty rows', () => {
      const rows = [];
      const result = getElementIdFieldValues(rows);
      expect(result).toEqual(new Map());
    });
  });

  describe('removeRedundantEmittedFields', () => {
    test('should remove duplicate rows based on unique event ID', () => {
      const rows = [
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
      expect(result.length).toBe(2); // Since one of the rows is a duplicate
    });

    test('should throw an error for a missing matching account update', () => {
      const rows = [
        {
          zkapp_event_array_id: 1,
          zkapp_event_element_ids: [1, 2],
          zkapp_account_update_id: 99, // No matching account update id in the list
          zkapp_account_updates_ids: [10, 11],
        },
      ];

      expect(() =>
        removeRedundantEmittedFields(rows as ArchiveNodeDatabaseRow[])
      ).toThrowError(/No matching account update found/);
    });

    describe('mapActionOrEvent', () => {
      const mockElementIdFieldValues = new Map<string, string>();
      mockElementIdFieldValues.set('1', 'value1');
      mockElementIdFieldValues.set('2', 'value2');

      describe('when kind is "event"', () => {
        test('map rows to an array of events', () => {
          const rows = [
            {
              element_ids: [1, 2],
            },
          ];

          const result: Event[] = mapActionOrEvent(
            'event',
            rows as ArchiveNodeDatabaseRow[],
            mockElementIdFieldValues
          );

          expect(result[0].data).toBeDefined();
          expect(result[0].transactionInfo).toBeDefined();
        });
      });

      describe('when kind is "action"', () => {
        test('should map rows to an array of actions', () => {
          const rows = [
            {
              element_ids: [1, 2],
              zkapp_account_update_id: 123,
            },
          ];

          const result = mapActionOrEvent(
            'action',
            rows as ArchiveNodeDatabaseRow[],
            mockElementIdFieldValues
          ) as Action[];

          expect(result[0].data).toBeDefined();
          expect(result[0].transactionInfo).toBeDefined();
          expect(result[0].accountUpdateId).toBeDefined();
        });
      });
    });
  });
});
