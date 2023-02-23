import { expect, test, describe } from 'vitest';
import postgres from 'postgres';

import database_mock from './mocked_sql/database_mock.json';

import { ArchiveNodeAdapter } from '../src/db';
import { createBlockInfo, createTransactionInfo } from '../src/models/utils';
import { Action, Event } from '../src/models/types';

const PG_CONN = process.env.GITHUB_ACTIONS
  ? 'postgres://postgres:password@postgres:5432/archive'
  : 'postgres://postgres:password@localhost:5432/archive';

class ArchiveNodeAdapterExtend extends ArchiveNodeAdapter {
  constructor(connectionString: string | undefined) {
    super(connectionString);
  }

  partitionBlocksExtended(rows: postgres.RowList<postgres.Row[]>) {
    return this.partitionBlocks(rows);
  }

  getElementIdFieldValuesExtended(rows: postgres.RowList<postgres.Row[]>) {
    return this.getElementIdFieldValues(rows);
  }

  mapActionOrEventExtended(
    kind: 'action' | 'event',
    rows: postgres.Row[],
    elementIdFieldValues: Map<string, string>
  ) {
    return this.mapActionOrEvent(kind, rows, elementIdFieldValues);
  }

  deriveEventsFromBlocksExtended(
    blocksMap: Map<string, postgres.Row[]>,
    elementIdFieldValues: Map<string, string>
  ) {
    return this.deriveEventsFromBlocks(blocksMap, elementIdFieldValues);
  }

  deriveActionsFromBlocksExtended(
    blocksMap: Map<string, postgres.Row[]>,
    elementIdFieldValues: Map<string, string>
  ) {
    return this.deriveActionsFromBlocks(blocksMap, elementIdFieldValues);
  }
}

const archiveNodeAdapter = new ArchiveNodeAdapterExtend(PG_CONN);

describe('ArchiveNodeAdapter', async () => {
  describe('partitionBlocks', async () => {
    test('partitionBlocks should return a non-empty map', async () => {
      const blocksMap = archiveNodeAdapter.partitionBlocksExtended(
        database_mock as any
      );
      expect(blocksMap.size).toBeTruthy();
    });

    test('partitionBlocks values should be able to create blockInfo', async () => {
      const blocksMap = archiveNodeAdapter.partitionBlocksExtended(
        database_mock as any
      );

      const blockHash = blocksMap.keys().next().value;
      const blockRows = blocksMap.get(blockHash);
      const blockInfo = createBlockInfo(blockRows![0]);

      expect(blockInfo.height).toBeTruthy();
      expect(blockInfo.stateHash).toBeTruthy();
      expect(blockInfo.ledgerHash).toBeTruthy();
      expect(blockInfo.chainStatus).toBeTruthy();
      expect(blockInfo.timestamp).toBeTruthy();
      expect(blockInfo.globalSlotSinceGenesis).toBeTruthy();
      expect(blockInfo.globalSlotSinceHardfork).toBeTruthy();
      expect(blockInfo.distanceFromMaxBlockHeight).toBeTruthy();
    });

    test('partitionBlocks values should be able to create transactionInfo', async () => {
      const blocksMap = archiveNodeAdapter.partitionBlocksExtended(
        database_mock as any
      );

      const blockHash = blocksMap.keys().next().value;
      const blockRows = blocksMap.get(blockHash);
      const transactionInfo = createTransactionInfo(blockRows![0]);

      expect(transactionInfo.authorizationKind).toBeTruthy();
      expect(transactionInfo.hash).toBeTruthy();
      expect(transactionInfo.memo).toBeTruthy();
      expect(transactionInfo.status).toBeTruthy();
    });
  });

  describe('getElementIdFieldValues', async () => {
    test('getElementIdFieldValues should return a non-empty map', async () => {
      const elementIdFieldValues =
        archiveNodeAdapter.getElementIdFieldValuesExtended(
          database_mock as any
        );
      expect(elementIdFieldValues.size).toBeTruthy();
    });

    test('getElementIdFieldValues should return a map with correct keys', async () => {
      const elementIdFieldValues =
        archiveNodeAdapter.getElementIdFieldValuesExtended(
          database_mock as any
        );
      database_mock.forEach((row: any) => {
        expect(elementIdFieldValues.get(row.id)).toEqual(row.field);
      });
    });
  });

  describe('mapActionOrEvent', async () => {
    describe('Events', async () => {
      test('should return a non-empty list of events if "events" are specified', async () => {
        const elementIdFieldValues =
          archiveNodeAdapter.getElementIdFieldValuesExtended(
            database_mock as any
          );
        const events = archiveNodeAdapter.mapActionOrEventExtended(
          'event',
          database_mock as any,
          elementIdFieldValues
        ) as Event[];

        expect(events.length).toBeTruthy();
        events.forEach((event) => {
          expect(event).toHaveProperty('index');
          expect(event).toHaveProperty('data');
        });
      });

      test('should return a list of events with values all contained in mocked data', async () => {
        const elementIdFieldValues =
          archiveNodeAdapter.getElementIdFieldValuesExtended(
            database_mock as any
          );
        const events = archiveNodeAdapter.mapActionOrEventExtended(
          'event',
          database_mock as any,
          elementIdFieldValues
        ) as Event[];

        events.forEach((event) => {
          for (let field in event.data) {
            expect(
              database_mock.find((row) => row.field === field)
            ).toBeTruthy();
          }
        });
      });
    });

    describe('Actions', async () => {
      test('should return a non-empty list of actions if "actions" are specified', async () => {
        const elementIdFieldValues =
          archiveNodeAdapter.getElementIdFieldValuesExtended(
            database_mock as any
          );
        const actions = archiveNodeAdapter.mapActionOrEventExtended(
          'action',
          database_mock as any,
          elementIdFieldValues
        ) as Action[];

        expect(actions.length).toBeTruthy();
        actions.forEach((event) => {
          expect(event).toHaveProperty('data');
        });
      });

      test('should return a list of actions with values all contained in mocked data', async () => {
        const elementIdFieldValues =
          archiveNodeAdapter.getElementIdFieldValuesExtended(
            database_mock as any
          );
        const actions = archiveNodeAdapter.mapActionOrEventExtended(
          'action',
          database_mock as any,
          elementIdFieldValues
        ) as Event[];

        actions.forEach((event) => {
          for (let field in event.data) {
            expect(
              database_mock.find((row) => row.field === field)
            ).toBeTruthy();
          }
        });
      });
    });
  });

  describe('deriveFromBlocks', async () => {
    describe('Events', async () => {
      test('should return a non-empty list of events if are specified', async () => {
        const blocksMap = archiveNodeAdapter.partitionBlocksExtended(
          database_mock as any
        );
        const elementIdFieldValues =
          archiveNodeAdapter.getElementIdFieldValuesExtended(
            database_mock as any
          );
        const eventsData = archiveNodeAdapter.deriveEventsFromBlocksExtended(
          blocksMap,
          elementIdFieldValues
        );

        expect(eventsData.length).toBeTruthy();
      });

      test('should return a list of events with values all contained in mocked data', async () => {
        const blocksMap = archiveNodeAdapter.partitionBlocksExtended(
          database_mock as any
        );
        const elementIdFieldValues =
          archiveNodeAdapter.getElementIdFieldValuesExtended(
            database_mock as any
          );
        const eventsData = archiveNodeAdapter.deriveEventsFromBlocksExtended(
          blocksMap,
          elementIdFieldValues
        );

        eventsData.forEach((event) => {
          expect(
            database_mock.find(
              (row) => row.state_hash === event.blockInfo.stateHash
            )
          ).toBeTruthy();
          for (let field in event.eventData) {
            expect(
              database_mock.find((row) => row.field === field)
            ).toBeTruthy();
          }
        });
      });
    });

    describe('Actions', async () => {
      test('should return a non-empty list of actions if are specified', async () => {
        const blocksMap = archiveNodeAdapter.partitionBlocksExtended(
          database_mock as any
        );
        const elementIdFieldValues =
          archiveNodeAdapter.getElementIdFieldValuesExtended(
            database_mock as any
          );
        const actionsData = archiveNodeAdapter.deriveActionsFromBlocksExtended(
          blocksMap,
          elementIdFieldValues
        );

        expect(actionsData.length).toBeTruthy();
      });

      test('should return a list of actions with values all contained in mocked data', async () => {
        const blocksMap = archiveNodeAdapter.partitionBlocksExtended(
          database_mock as any
        );
        const elementIdFieldValues =
          archiveNodeAdapter.getElementIdFieldValuesExtended(
            database_mock as any
          );
        const actionsData = archiveNodeAdapter.deriveActionsFromBlocksExtended(
          blocksMap,
          elementIdFieldValues
        );

        actionsData.forEach((event) => {
          expect(
            database_mock.find(
              (row) => row.state_hash === event.blockInfo.stateHash
            )
          ).toBeTruthy();
          for (let field in event.actionData) {
            expect(
              database_mock.find((row) => row.field === field)
            ).toBeTruthy();
          }
        });
      });
    });
  });
});
