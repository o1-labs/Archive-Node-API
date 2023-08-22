import { blake2bHex } from 'blakejs';
import { type BlockInfo } from '../blockchain/types';

export { select, getAllPredicate, filterBestTip };

function getAllPredicate<T>(array: T[], predicate: (arg: T) => boolean) {
  const data: T[] = [];
  for (let i = 0; i < array.length; i++) {
    if (predicate(array[i])) {
      data.push(array[i]);
    } else {
      break;
    }
  }
  return data;
}

function filterBestTip<T extends { blockInfo: BlockInfo }>(
  eventOrActionData: T[]
) {
  const highestTipBlocks = getAllPredicate(
    eventOrActionData,
    (e) => e.blockInfo.distanceFromMaxBlockHeight === 0
  );
  if (highestTipBlocks.length > 1) {
    const selectedBlock = chainSelect(highestTipBlocks);
    eventOrActionData.splice(0, highestTipBlocks.length + 1, selectedBlock);
  }
}

function chainSelect<T extends { blockInfo: BlockInfo }>(blocks: T[]) {
  if (blocks.length === 1) return blocks[0];
  let existing = blocks[0];
  for (let i = 1; i < blocks.length; i++) {
    existing = select(existing, blocks[i]);
  }
  return existing;
}

/**
 * This function is used to select the best chain based on the tie breaker rules that the Mina Protocol uses. The implementation aims to be an port of the OCaml implementation.
 *
 * When choosing between two chains, the following rules are used:
 * - Determine if the two chains fork at a short range or a long range.
 * - If the two chains fork at a short range, use short range tie breaker rules - https://github.com/MinaProtocol/mina/tree/develop/docs/specs/consensus#521-short-range-fork-rule
 * - If the two chains fork at a long range, use long range tie breaker rules. - https://github.com/MinaProtocol/mina/tree/develop/docs/specs/consensus#522-long-range-fork-rule
 *
 * The tie breaker rules are also more formally documented here: https://github.com/MinaProtocol/mina/tree/develop/docs/specs/consensus
 */
function select<T extends { blockInfo: BlockInfo }>(
  existing: T,
  candidate: T
): T {
  const candidateHashIsBigger = compareWithCondition(
    existing.blockInfo.stateHash,
    candidate.blockInfo.stateHash,
    compareStrings,
    true
  );

  const candidateVRFIsBigger = compareWithCondition(
    existing.blockInfo,
    candidate.blockInfo,
    compareVRF,
    candidateHashIsBigger
  );

  const candidateLengthIsBigger = compareWithCondition(
    existing.blockInfo,
    candidate.blockInfo,
    compareBlockChainLength,
    candidateVRFIsBigger
  );

  return candidateLengthIsBigger ? candidate : existing;
}

/**
 * Takes two values and compares them using the provided compare function.
 *
 * In our compare function, the following semantics should apply:
 *  - If `a` is less than `b`, then a negative number should be returned.
 *  - If `a` is greater than `b`, then a positive number should be returned.
 *  - If `a` is equal to `b`, then 0 should be returned.
 *
 * When we call `compare`, if the result is negative, then `a` is returned.A positive result means `b` is returned.
 * If the result is 0, then the `condition` is used to determine which value is returned.
 * Meaning, if the `condition` is true, then `b` is returned. Otherwise, `a` is returned.
 *
 * @param a - The first value to compare
 * @param b - The second value to compare
 * @param compare - The function used to compare the two values
 * @param condition - The condition used to determine which value is returned if the two values are equal
 * @returns
 */
function compareWithCondition<T>(
  a: T,
  b: T,
  compare: (a: T, b: T) => number,
  condition: boolean
): boolean {
  const c = compare(a, b);
  return c < 0 || (c === 0 && condition);
}

function compareStrings(a: string, b: string): number {
  if (a > b) return 1;
  if (a < b) return -1;
  return 0;
}

function getHashOfVRF(vrfOutput: string): string {
  /* last_vrf_output is a sequence of hex-digit pairs derived from a bitstring */
  const vrfBuf = Buffer.from(vrfOutput, 'hex');
  return blake2bHex(vrfBuf);
}

function compareVRF(existing: BlockInfo, candidate: BlockInfo): number {
  const existingVRFHash = getHashOfVRF(existing.lastVrfOutput);
  const candidateVRFHash = getHashOfVRF(candidate.lastVrfOutput);
  return compareStrings(existingVRFHash, candidateVRFHash);
}

function compareBlockChainLength(existing: BlockInfo, candidate: BlockInfo) {
  return existing.height - candidate.height;
}
