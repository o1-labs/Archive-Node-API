import { test, before, describe } from 'node:test';
import assert from 'node:assert';
import {
  BlocksService,
  type UserCommandRow,
  type ZkAppCommandRow,
  type FeeTransferRow,
} from '../../../src/services/blocks-service/blocks-service.js';
import {
  UserCommand,
  ZkAppCommand,
  FeeTransfer,
} from '../../../src/blockchain/types.js';
import { makeClient } from '../../test-helpers.js';

describe('BlocksService', () => {
  let service: BlocksService;

  before(() => {
    service = new BlocksService(makeClient());
  });

  describe('rowsToBlocks', () => {
    const baseRow = {
      id: 1,
      height: 100,
      creator: 'B62qtest1',
      state_hash: '3NKtest1',
      parent_hash: '3NKparent1',
      timestamp: '1700000000000',
      coinbase_amount: '720000000000',
    };

    test('maps basic block fields correctly', () => {
      const blocks = service.rowsToBlocks([baseRow]);
      assert.strictEqual(blocks.length, 1);
      assert.strictEqual(blocks[0].blockHeight, 100);
      assert.strictEqual(blocks[0].creator, 'B62qtest1');
      assert.strictEqual(blocks[0].stateHash, '3NKtest1');
      assert.strictEqual(blocks[0].parentHash, '3NKparent1');
      assert.strictEqual(
        blocks[0].dateTime,
        new Date(1700000000000).toISOString()
      );
      assert.strictEqual(blocks[0].transactions.coinbase, '720000000000');
    });

    test('returns empty arrays when no transaction maps provided', () => {
      const blocks = service.rowsToBlocks([baseRow]);
      assert.deepStrictEqual(blocks[0].transactions.userCommands, []);
      assert.deepStrictEqual(blocks[0].transactions.zkappCommands, []);
      assert.deepStrictEqual(blocks[0].transactions.feeTransfer, []);
    });

    test('defaults coinbase to "0" when coinbase_amount is missing', () => {
      const row = { ...baseRow, coinbase_amount: undefined };
      const blocks = service.rowsToBlocks([row]);
      assert.strictEqual(blocks[0].transactions.coinbase, '0');
    });

    test('attaches user commands to correct block by id', () => {
      const uc: UserCommand = {
        hash: 'CkpTest1',
        kind: 'PAYMENT',
        from: 'B62qFrom',
        to: 'B62qTo',
        amount: '1000000000',
        fee: '10000000',
        memo: 'E4YM2',
        nonce: 5,
        status: 'applied',
        failureReason: null,
      };
      const ucMap = new Map<number, UserCommand[]>([[1, [uc]]]);

      const blocks = service.rowsToBlocks([baseRow], ucMap);
      assert.strictEqual(blocks[0].transactions.userCommands.length, 1);
      assert.deepStrictEqual(blocks[0].transactions.userCommands[0], uc);
    });

    test('attaches zkapp commands to correct block by id', () => {
      const zk: ZkAppCommand = {
        hash: 'CkpZkTest1',
        feePayer: 'B62qFeePayer',
        fee: '20000000',
        memo: 'E4YM2',
        status: 'applied',
        failureReason: null,
      };
      const zkMap = new Map<number, ZkAppCommand[]>([[1, [zk]]]);

      const blocks = service.rowsToBlocks([baseRow], new Map(), zkMap);
      assert.strictEqual(blocks[0].transactions.zkappCommands.length, 1);
      assert.deepStrictEqual(blocks[0].transactions.zkappCommands[0], zk);
    });

    test('attaches fee transfers to correct block by id', () => {
      const ft: FeeTransfer = {
        recipient: 'B62qRecipient',
        fee: '5000000',
        type: 'fee_transfer',
      };
      const ftMap = new Map<number, FeeTransfer[]>([[1, [ft]]]);

      const blocks = service.rowsToBlocks(
        [baseRow],
        new Map(),
        new Map(),
        ftMap
      );
      assert.strictEqual(blocks[0].transactions.feeTransfer.length, 1);
      assert.deepStrictEqual(blocks[0].transactions.feeTransfer[0], ft);
    });

    test('returns empty arrays for blocks with no matching transaction data', () => {
      const ucMap = new Map<number, UserCommand[]>([[999, []]]);

      const blocks = service.rowsToBlocks([baseRow], ucMap);
      assert.deepStrictEqual(blocks[0].transactions.userCommands, []);
      assert.deepStrictEqual(blocks[0].transactions.zkappCommands, []);
      assert.deepStrictEqual(blocks[0].transactions.feeTransfer, []);
    });

    test('correctly distributes transactions across multiple blocks', () => {
      const row1 = { ...baseRow, id: 1, height: 100 };
      const row2 = { ...baseRow, id: 2, height: 101, state_hash: '3NKtest2' };

      const uc1: UserCommand = {
        hash: 'CkpUc1',
        kind: 'PAYMENT',
        from: 'B62qA',
        to: 'B62qB',
        amount: '100',
        fee: '10',
        memo: '',
        nonce: 1,
        status: 'applied',
        failureReason: null,
      };
      const uc2: UserCommand = {
        hash: 'CkpUc2',
        kind: 'STAKE_DELEGATION',
        from: 'B62qC',
        to: 'B62qD',
        amount: '0',
        fee: '20',
        memo: '',
        nonce: 2,
        status: 'applied',
        failureReason: null,
      };

      const ucMap = new Map<number, UserCommand[]>([
        [1, [uc1]],
        [2, [uc2]],
      ]);

      const blocks = service.rowsToBlocks([row1, row2], ucMap);

      assert.strictEqual(blocks[0].transactions.userCommands.length, 1);
      assert.strictEqual(blocks[0].transactions.userCommands[0].hash, 'CkpUc1');
      assert.strictEqual(blocks[1].transactions.userCommands.length, 1);
      assert.strictEqual(blocks[1].transactions.userCommands[0].hash, 'CkpUc2');
    });

    test('handles empty rows array', () => {
      const blocks = service.rowsToBlocks([]);
      assert.strictEqual(blocks.length, 0);
    });

    test('handles multiple transactions per block', () => {
      const uc1: UserCommand = {
        hash: 'CkpA',
        kind: 'PAYMENT',
        from: 'B62qA',
        to: 'B62qB',
        amount: '100',
        fee: '10',
        memo: '',
        nonce: 1,
        status: 'applied',
        failureReason: null,
      };
      const uc2: UserCommand = {
        hash: 'CkpB',
        kind: 'PAYMENT',
        from: 'B62qC',
        to: 'B62qD',
        amount: '200',
        fee: '20',
        memo: '',
        nonce: 2,
        status: 'applied',
        failureReason: null,
      };
      const ucMap = new Map<number, UserCommand[]>([[1, [uc1, uc2]]]);

      const blocks = service.rowsToBlocks([baseRow], ucMap);
      assert.strictEqual(blocks[0].transactions.userCommands.length, 2);
      assert.strictEqual(blocks[0].transactions.userCommands[0].hash, 'CkpA');
      assert.strictEqual(blocks[0].transactions.userCommands[1].hash, 'CkpB');
    });
  });

  describe('mapUserCommandRow', () => {
    test('maps all fields from DB row to domain type', () => {
      const row: UserCommandRow = {
        block_id: 1,
        hash: '5JvC8BFT69YF5WWb4J2r9kCJRLXTUq8rk5XDahtaTYEC817FGEZU',
        kind: 'payment',
        from: 'B62qrmRJosdwWKwFXjfLEA7fNaPDkAiSkGmGDLiPQkphCcnC7agyYEZ',
        to: 'B62qrmRJosdwWKwFXjfLEA7fNaPDkAiSkGmGDLiPQkphCcnC7agyYEZ',
        amount: '10000000',
        fee: '10000000',
        memo: 'E4YxxEftXeg4FRz1Y93u8Ja2Zd5mcw6CZmmVn5m3HJgkFEt2LPcf5',
        nonce: 99693,
        status: 'applied',
        failure_reason: null,
      };
      const result = service.mapUserCommandRow(row);
      assert.strictEqual(result.hash, row.hash);
      assert.strictEqual(result.kind, 'payment');
      assert.strictEqual(result.from, row.from);
      assert.strictEqual(result.to, row.to);
      assert.strictEqual(result.amount, '10000000');
      assert.strictEqual(result.fee, '10000000');
      assert.strictEqual(result.memo, row.memo);
      assert.strictEqual(result.nonce, 99693);
      assert.strictEqual(result.status, 'applied');
      assert.strictEqual(result.failureReason, null);
    });

    test('maps failure_reason to failureReason when present', () => {
      const row: UserCommandRow = {
        block_id: 1,
        hash: 'CkpTest',
        kind: 'payment',
        from: 'B62qA',
        to: 'B62qB',
        amount: '0',
        fee: '10000000',
        memo: '',
        nonce: 1,
        status: 'failed',
        failure_reason: 'Amount_insufficient_to_create_account',
      };
      const result = service.mapUserCommandRow(row);
      assert.strictEqual(result.failureReason, 'Amount_insufficient_to_create_account');
    });
  });

  describe('mapZkAppCommandRow', () => {
    test('maps all fields from DB row to domain type', () => {
      const row: ZkAppCommandRow = {
        block_id: 1,
        hash: '5Ju4L33n8e9LgYYtUfynLwpK4cL8m3gnKAS1yYctjSbcqS3KtYRe',
        fee_payer: 'B62qnnpLG75StiXuw8qTJmsPYSzFx6eWQQFjiqe7JEP7hYCeYJphdcP',
        fee: '26100000',
        memo: 'E4YM2vTHhWEg66xpj52JErHUBU4pZ1yageL4TVDDpTTSsv8mK6YaH',
        status: 'applied',
        failure_reasons_ids: null,
      };
      const result = service.mapZkAppCommandRow(row);
      assert.strictEqual(result.hash, row.hash);
      assert.strictEqual(result.feePayer, row.fee_payer);
      assert.strictEqual(result.fee, '26100000');
      assert.strictEqual(result.memo, row.memo);
      assert.strictEqual(result.status, 'applied');
      assert.strictEqual(result.failureReason, null);
    });

    test('maps failure_reasons_ids to failureReason when present as string', () => {
      const row: ZkAppCommandRow = {
        block_id: 1,
        hash: 'CkpTest',
        fee_payer: 'B62qA',
        fee: '10000000',
        memo: '',
        status: 'failed',
        failure_reasons_ids: '{1,2}',
      };
      const result = service.mapZkAppCommandRow(row);
      assert.strictEqual(result.failureReason, '{1,2}');
    });

    test('maps failure_reasons_ids to failureReason when present as array', () => {
      const row: ZkAppCommandRow = {
        block_id: 1,
        hash: 'CkpTest',
        fee_payer: 'B62qA',
        fee: '10000000',
        memo: '',
        status: 'failed',
        failure_reasons_ids: [6, 165],
      };
      const result = service.mapZkAppCommandRow(row);
      assert.strictEqual(result.failureReason, '6,165');
    });
  });

  describe('mapFeeTransferRow', () => {
    test('maps all fields from DB row to domain type', () => {
      const row: FeeTransferRow = {
        block_id: 1,
        recipient: 'B62qra5hPy6K9mSRYHDUjvyAmXVKvz7ywa1cqqjpdGwB1u4wzG4Uyb1',
        fee: '10000000',
        type: 'fee_transfer',
      };
      const result = service.mapFeeTransferRow(row);
      assert.strictEqual(result.recipient, row.recipient);
      assert.strictEqual(result.fee, '10000000');
      assert.strictEqual(result.type, 'fee_transfer');
    });
  });

  describe('groupBy', () => {
    test('groups rows by key and applies mapper', () => {
      const rows = [
        { block_id: 1, val: 'a' },
        { block_id: 2, val: 'b' },
        { block_id: 1, val: 'c' },
      ];
      const result = service.groupBy(
        rows,
        (r) => r.block_id,
        (r) => r.val
      );
      assert.deepStrictEqual(result.get(1), ['a', 'c']);
      assert.deepStrictEqual(result.get(2), ['b']);
      assert.strictEqual(result.size, 2);
    });

    test('returns empty map for empty input', () => {
      const result = service.groupBy(
        [],
        () => 0,
        (r) => r
      );
      assert.strictEqual(result.size, 0);
    });
  });

  describe('groupBy + mapper pipeline (raw DB rows to block transactions)', () => {
    test('raw user command rows are grouped and mapped correctly for rowsToBlocks', () => {
      const rawRows: UserCommandRow[] = [
        {
          block_id: 10,
          hash: 'CkpTx1',
          kind: 'payment',
          from: 'B62qA',
          to: 'B62qB',
          amount: '5000',
          fee: '100',
          memo: 'E4Ymemo1',
          nonce: 1,
          status: 'applied',
          failure_reason: null,
        },
        {
          block_id: 20,
          hash: 'CkpTx2',
          kind: 'delegation',
          from: 'B62qC',
          to: 'B62qD',
          amount: '0',
          fee: '200',
          memo: 'E4Ymemo2',
          nonce: 3,
          status: 'applied',
          failure_reason: null,
        },
        {
          block_id: 10,
          hash: 'CkpTx3',
          kind: 'payment',
          from: 'B62qE',
          to: 'B62qF',
          amount: '9000',
          fee: '300',
          memo: '',
          nonce: 7,
          status: 'failed',
          failure_reason: 'Amount_insufficient_to_create_account',
        },
      ];

      const ucMap = service.groupBy(
        rawRows,
        (r) => r.block_id,
        (r) => service.mapUserCommandRow(r)
      );

      const blockRows = [
        { id: 10, height: 500, creator: 'B62qCreator1', state_hash: '3NK1', parent_hash: '3NKp1', timestamp: '1700000000000', coinbase_amount: '720000000000' },
        { id: 20, height: 501, creator: 'B62qCreator2', state_hash: '3NK2', parent_hash: '3NKp2', timestamp: '1700000060000', coinbase_amount: '720000000000' },
      ];

      const blocks = service.rowsToBlocks(blockRows, ucMap);

      // Block 10 should have 2 user commands
      assert.strictEqual(blocks[0].transactions.userCommands.length, 2);
      assert.strictEqual(blocks[0].transactions.userCommands[0].hash, 'CkpTx1');
      assert.strictEqual(blocks[0].transactions.userCommands[0].kind, 'payment');
      assert.strictEqual(blocks[0].transactions.userCommands[1].hash, 'CkpTx3');
      assert.strictEqual(blocks[0].transactions.userCommands[1].failureReason, 'Amount_insufficient_to_create_account');

      // Block 20 should have 1 user command
      assert.strictEqual(blocks[1].transactions.userCommands.length, 1);
      assert.strictEqual(blocks[1].transactions.userCommands[0].hash, 'CkpTx2');
      assert.strictEqual(blocks[1].transactions.userCommands[0].kind, 'delegation');

      // Both blocks should have empty zkapp and fee transfer arrays
      assert.deepStrictEqual(blocks[0].transactions.zkappCommands, []);
      assert.deepStrictEqual(blocks[1].transactions.feeTransfer, []);
    });
  });
});
