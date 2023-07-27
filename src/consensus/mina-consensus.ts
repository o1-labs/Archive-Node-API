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

function select<T extends { blockInfo: BlockInfo }>(
  existing: T,
  candidate: T
): T {
  const candidateHashIsBigger = compareWithCondition(
    existing.blockInfo,
    candidate.blockInfo,
    compareHash,
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

  const candidateWindowDensityIsBigger = compareWithCondition(
    existing.blockInfo,
    candidate.blockInfo,
    longForkChainQualityIsBetter,
    candidateLengthIsBigger
  );

  return candidateWindowDensityIsBigger ? candidate : existing;
}

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

function compareHash(existing: BlockInfo, candidate: BlockInfo): number {
  return compareStrings(existing.stateHash, candidate.stateHash);
}

function compareBlockChainLength(existing: BlockInfo, candidate: BlockInfo) {
  return (
    existing.distanceFromMaxBlockHeight - candidate.distanceFromMaxBlockHeight
  );
}

function longForkChainQualityIsBetter(
  existing: BlockInfo,
  candidate: BlockInfo
): number {
  const maxSlot = Math.max(
    existing.globalSlotSinceGenesis,
    candidate.globalSlotSinceGenesis
  );

  const existingWindowDensity = getVirtualMinWindowDensity(existing, maxSlot);
  const candidateWindowDensity = getVirtualMinWindowDensity(existing, maxSlot);

  return candidateWindowDensity - existingWindowDensity;
}

function getVirtualMinWindowDensity(b: BlockInfo, maxSlot: number) {
  if (b.globalSlotSinceGenesis === maxSlot) {
    return b.minWindowDensity;
  } else {
    return getMinWindowDensity(b, maxSlot);
  }
}

const subWindowsPerWindow = 8;

function getMinWindowDensity(b: BlockInfo, maxSlot: number): number {
  const prevGlobalSubWindow = b.globalSlotSinceGenesis;
  const prevSubWindowDensities = b.subWindowDensities;
  const prevMinWindowDensity = b.minWindowDensity;
  const nextGlobalSubWindow = maxSlot;

  const isSameSubWindow = prevGlobalSubWindow === nextGlobalSubWindow;

  const prevRelativeSubWindow = subWindow(prevGlobalSubWindow);
  const nextRelativeSubWindow = subWindow(nextGlobalSubWindow);

  const overlappingWindow =
    prevGlobalSubWindow + subWindowsPerWindow >= nextGlobalSubWindow;

  const currentSubWindowDensities = prevSubWindowDensities.map((density, i) => {
    const gtPrevSubWindow = i > prevRelativeSubWindow;
    const ltNextSubWindow = i < nextRelativeSubWindow;
    const withinRange =
      prevRelativeSubWindow < nextRelativeSubWindow
        ? gtPrevSubWindow && ltNextSubWindow
        : gtPrevSubWindow || ltNextSubWindow;

    if (isSameSubWindow) {
      return density;
    } else if (overlappingWindow && !withinRange) {
      return density;
    } else {
      return 0;
    }
  });

  const currentWindowDensity = currentSubWindowDensities.reduce(
    (acc, curr) => acc + curr,
    0
  );

  const minWindowDensity =
    isSameSubWindow || b.globalSlotSinceGenesis
      ? prevMinWindowDensity
      : Math.min(currentWindowDensity, prevMinWindowDensity);

  return minWindowDensity;
}

function subWindow(t: number): number {
  return t % subWindowsPerWindow;
}
