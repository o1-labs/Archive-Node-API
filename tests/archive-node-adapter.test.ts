import { expect, test, describe } from 'vitest';
import postgres from 'postgres';

import database_mock from './mocked_sql/database_mock.json';

import { ArchiveNodeAdapter } from '../src/db';
import { createBlockInfo, createTransactionInfo } from '../src/models/utils';

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
});
