/*
	Steps this program needs to accomplish:

  1. Read in all block data in a list ordered by timestamp

  2. For each block, check if the block is valid

  3. If the block is valid, convert it into an OCaml block type

  4. Initialize any PoS data structures

  5. Run the PoS selection algorithm on the blocks

  6. Print out the results
*/

import { blake2bHex } from 'blakejs';
import { type BlockInfo } from 'src/models/types';
export { select, findAllIndexes, getAllPredicate, filterBestTip };
/**
 * This function is used to select the best chain based on the tie breaker rules that the Mina Protocol uses.
 *
 * The tie breaker rules are as follows:
 * 1. Take the block with the highest VRF output, denoted by comparing the VRF Blake2B hashes.
 *  - https://github.com/MinaProtocol/mina/blob/bff1e117ae4740fa51d12b32736c6c63d7909bd1/src/lib/consensus/proof_of_stake.ml#L3004
 * 2. If the VRF outputs are equal, take the block with the highest state hash.
 *  - https://github.com/MinaProtocol/mina/blob/bff1e117ae4740fa51d12b32736c6c63d7909bd1/src/lib/consensus/proof_of_stake.ml#L3001
 *
 * The tie breaker rules are also more formally documented here: https://github.com/MinaProtocol/mina/blob/36d39cd0b2e3ba6c5e687770a5c683984ca587fc/docs/specs/consensus/README.md?plain=1#L1134
 */

function select<T extends { blockInfo: BlockInfo }>(existing: T, candidate: T) {
  const existingVRFHash = blake2bHex(existing.blockInfo.lastVrfOutput);
  const candidateVRFHash = blake2bHex(candidate.blockInfo.lastVrfOutput);
  if (existingVRFHash > candidateVRFHash) {
    return existing;
  } else if (existingVRFHash < candidateVRFHash) {
    return candidate;
  }

  const existingHash = existing.blockInfo.stateHash;
  const candidateHash = candidate.blockInfo.stateHash;
  if (existingHash > candidateHash) {
    return existing;
  } else if (existingHash < candidateHash) {
    return candidate;
  }

  return existing;
}

function findAllIndexes<T>(arr: T[], target: T): number[] {
  const indexes: number[] = [];
  arr.forEach((element, index) => {
    if (element === target) {
      indexes.push(index);
    }
  });
  return indexes;
}

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
