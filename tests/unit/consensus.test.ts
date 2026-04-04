import { describe, test } from 'node:test';
import assert from 'node:assert';
import {
  select,
  getAllPredicate,
  filterBestTip,
} from '../../src/consensus/mina-consensus.js';
import type { BlockInfo } from '../../src/blockchain/types.js';

function makeBlockInfo(
  overrides: Partial<BlockInfo> = {}
): BlockInfo {
  return {
    height: 100,
    stateHash: 'default_state_hash',
    parentHash: 'default_parent_hash',
    ledgerHash: 'default_ledger_hash',
    chainStatus: 'canonical',
    timestamp: '1700000000000',
    globalSlotSinceHardfork: 100,
    globalSlotSinceGenesis: 100,
    distanceFromMaxBlockHeight: 0,
    lastVrfOutput: 'AABBCCDD',
    ...overrides,
  };
}

function makeEntry(blockInfo: BlockInfo) {
  return { blockInfo, data: [] };
}

describe('Mina Consensus', () => {
  describe('getAllPredicate', () => {
    test('returns all elements matching predicate', () => {
      const arr = [1, 2, 3, 4, 5];
      const result = getAllPredicate(arr, (x) => x > 3);
      assert.deepStrictEqual(result, [4, 5]);
    });

    test('returns empty array when nothing matches', () => {
      const arr = [1, 2, 3];
      const result = getAllPredicate(arr, (x) => x > 10);
      assert.deepStrictEqual(result, []);
    });

    test('returns all elements when everything matches', () => {
      const arr = [1, 2, 3];
      const result = getAllPredicate(arr, () => true);
      assert.deepStrictEqual(result, [1, 2, 3]);
    });

    test('handles empty array', () => {
      const result = getAllPredicate([], () => true);
      assert.deepStrictEqual(result, []);
    });
  });

  describe('select', () => {
    test('selects candidate when existing state hash is smaller', () => {
      // compareStrings('aaa', 'zzz') → -1 → candidateHashIsBigger = true
      // Equal VRF and height carry the condition through → returns candidate
      const existing = makeEntry(
        makeBlockInfo({ stateHash: 'aaa', lastVrfOutput: 'AA', height: 100 })
      );
      const candidate = makeEntry(
        makeBlockInfo({ stateHash: 'zzz', lastVrfOutput: 'AA', height: 100 })
      );
      const result = select(existing, candidate);
      assert.strictEqual(result, candidate);
    });

    test('deterministically selects one of two blocks', () => {
      const a = makeEntry(
        makeBlockInfo({
          stateHash: '3NKabc',
          lastVrfOutput: '1122334455',
          height: 100,
        })
      );
      const b = makeEntry(
        makeBlockInfo({
          stateHash: '3NKxyz',
          lastVrfOutput: '5566778899',
          height: 100,
        })
      );
      const result1 = select(a, b);
      const result2 = select(a, b);
      assert.strictEqual(result1, result2); // deterministic
    });

    test('prefers longer chain when VRF and hash are equal', () => {
      const shorter = makeEntry(
        makeBlockInfo({
          stateHash: 'same_hash',
          lastVrfOutput: 'AABB',
          height: 100,
        })
      );
      const longer = makeEntry(
        makeBlockInfo({
          stateHash: 'same_hash',
          lastVrfOutput: 'AABB',
          height: 200,
        })
      );
      const result = select(shorter, longer);
      // existing.height - candidate.height = 100 - 200 = -100 < 0
      // → candidateLengthIsBigger = true → returns candidate (longer)
      assert.strictEqual(result.blockInfo.height, 200);
    });
  });

  describe('filterBestTip', () => {
    test('does nothing when no blocks at distance 0', () => {
      const data = [
        makeEntry(makeBlockInfo({ distanceFromMaxBlockHeight: 1 })),
        makeEntry(makeBlockInfo({ distanceFromMaxBlockHeight: 2 })),
      ];
      filterBestTip(data);
      assert.strictEqual(data.length, 2);
    });

    test('does nothing when exactly one block at distance 0', () => {
      const data = [
        makeEntry(makeBlockInfo({ distanceFromMaxBlockHeight: 1 })),
        makeEntry(makeBlockInfo({ distanceFromMaxBlockHeight: 0 })),
      ];
      filterBestTip(data);
      assert.strictEqual(data.length, 2);
    });

    test('reduces multiple blocks at distance 0 to one', () => {
      const data = [
        makeEntry(
          makeBlockInfo({
            distanceFromMaxBlockHeight: 5,
            height: 95,
            stateHash: 'older',
          })
        ),
        makeEntry(
          makeBlockInfo({
            distanceFromMaxBlockHeight: 0,
            height: 100,
            stateHash: 'tip_a',
            lastVrfOutput: 'AA11',
          })
        ),
        makeEntry(
          makeBlockInfo({
            distanceFromMaxBlockHeight: 0,
            height: 100,
            stateHash: 'tip_b',
            lastVrfOutput: 'BB22',
          })
        ),
      ];
      filterBestTip(data);
      assert.strictEqual(data.length, 2);
      // First entry unchanged
      assert.strictEqual(data[0].blockInfo.height, 95);
      // Second entry is the selected best tip
      assert.strictEqual(data[1].blockInfo.distanceFromMaxBlockHeight, 0);
    });

    test('reduces three blocks at distance 0 to one', () => {
      const data = [
        makeEntry(
          makeBlockInfo({
            distanceFromMaxBlockHeight: 0,
            stateHash: 'a',
            lastVrfOutput: 'AA',
            height: 100,
          })
        ),
        makeEntry(
          makeBlockInfo({
            distanceFromMaxBlockHeight: 0,
            stateHash: 'b',
            lastVrfOutput: 'BB',
            height: 100,
          })
        ),
        makeEntry(
          makeBlockInfo({
            distanceFromMaxBlockHeight: 0,
            stateHash: 'c',
            lastVrfOutput: 'CC',
            height: 100,
          })
        ),
      ];
      filterBestTip(data);
      assert.strictEqual(data.length, 1);
    });

    test('handles empty array', () => {
      const data: { blockInfo: BlockInfo; data: never[] }[] = [];
      filterBestTip(data);
      assert.strictEqual(data.length, 0);
    });
  });
});
