import { blake2bHex } from 'blakejs';
import { type BlockInfo } from '../blockchain/types';
import { CONFIG } from './config';

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

  if (isShortRange(existing.blockInfo, candidate.blockInfo)) {
    return candidateLengthIsBigger ? candidate : existing;
  }

  const candidateWindowDensityIsBigger = compareWithCondition(
    existing.blockInfo,
    candidate.blockInfo,
    longForkChainQualityIsBetter,
    candidateLengthIsBigger
  );
  return candidateWindowDensityIsBigger ? candidate : existing;
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

function longForkChainQualityIsBetter(
  existing: BlockInfo,
  candidate: BlockInfo
): number {
  const maxSlot = Math.max(
    existing.globalSlotSinceGenesis,
    candidate.globalSlotSinceGenesis
  );
  const existingWindowDensity = getVirtualMinWindowDensity(existing, maxSlot);
  const candidateWindowDensity = getVirtualMinWindowDensity(candidate, maxSlot);
  return candidateWindowDensity - existingWindowDensity;
}

function getVirtualMinWindowDensity(b: BlockInfo, maxSlot: number) {
  if (b.globalSlotSinceGenesis === maxSlot) {
    return b.minWindowDensity;
  } else {
    return getMinWindowDensity(b, maxSlot);
  }
}

function getMinWindowDensity(b: BlockInfo, maxSlot: number): number {
  const prevGlobalSubWindow = ofGlobalSlot(b.globalSlotSinceGenesis);
  const nextGlobalSubWindow = ofGlobalSlot(maxSlot);
  const isSameSubWindow = prevGlobalSubWindow === nextGlobalSubWindow;

  const prevSubWindowDensities = b.subWindowDensities;
  const prevMinWindowDensity = b.minWindowDensity;

  const prevRelativeSubWindow = subWindow(prevGlobalSubWindow);
  const nextRelativeSubWindow = subWindow(nextGlobalSubWindow);

  const overlappingWindow =
    prevGlobalSubWindow + CONFIG.subWindowsPerWindow >= nextGlobalSubWindow;

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
    isSameSubWindow || b.globalSlotSinceHardfork < CONFIG.gracePeriodEnd
      ? prevMinWindowDensity
      : Math.min(currentWindowDensity, prevMinWindowDensity);

  return minWindowDensity;
}

function isShortRange(existing: BlockInfo, candidate: BlockInfo) {
  const existingEpoch = epoch(existing.globalSlotSinceGenesis);
  const candidateEpoch = epoch(candidate.globalSlotSinceGenesis);

  if (existingEpoch === candidateEpoch) {
    return existing.stakingLockCheckpoint === candidate.stakingLockCheckpoint;
  } else {
    return (
      isEpochTransitionValid(existing, candidate) ||
      isEpochTransitionValid(candidate, existing)
    );
  }
}

function isEpochTransitionValid(existing: BlockInfo, candidate: BlockInfo) {
  const existingEpoch = epoch(existing.globalSlotSinceGenesis);
  const candidateEpoch = epoch(candidate.globalSlotSinceGenesis);

  const c1NextIsFinalized = !inSeedUpdateRange(
    slot(existing.globalSlotSinceGenesis) + 1
  );

  const lockPointMatches =
    existing.nextEpochLockCheckpoint === candidate.stakingLockCheckpoint;

  return (
    existingEpoch + 1 === candidateEpoch &&
    c1NextIsFinalized &&
    lockPointMatches
  );
}

function ofGlobalSlot(slotSinceHardfork: number): number {
  return Math.floor(slotSinceHardfork / CONFIG.slotsPerSubWindow);
}

function slot(t: number) {
  return t % CONFIG.slotsPerEpoch;
}

function subWindow(t: number) {
  return t % CONFIG.subWindowsPerWindow;
}

function epoch(slot: number) {
  return Math.floor(slot / CONFIG.slotsPerEpoch);
}

function inSeedUpdateRange(slot: number) {
  const thirdEpoch = CONFIG.slotsPerEpoch / 3;
  if (!(CONFIG.slotsPerEpoch === 3 * thirdEpoch))
    throw new Error('inSeedUpdateRange: slotsPerEpoch must be 3 * thirdEpoch');
  return slot < thirdEpoch * 2;
}
