/**
 * Usage: npx ts-node ./tests/consensus/select-consensus-precomputed.ts
 */

import fs from 'fs';
import path from 'path';

import { select } from '../../src/consensus/mina-consensus';
import type { BlockInfo } from '../../src/blockchain/types';
import { type BlockFileOutput, type PrecomputedBlock, GetSlot } from './types';

const inputDir = process.argv[2];
const outputDir = process.argv[3];

function readPrecomputedBlocks() {
  const files = fs.readdirSync(inputDir);
  const blocks: BlockInfo[] = [];
  for (const file of files) {
    const data = fs.readFileSync(path.join(inputDir, file));
    const block = mapPrecomputedToBlockInfo(data.toString());
    blocks.push(block);
  }

  blocks.sort((a, b) => {
    if (a.height < b.height) return -1;
    if (a.height > b.height) return 1;
    if (a.timestamp < b.timestamp) return -1;
    if (a.timestamp > b.timestamp) return 1;
    return 0;
  });
  return blocks;
}

function mapPrecomputedToBlockInfo(block: string): BlockInfo {
  const json: PrecomputedBlock = JSON.parse(block);

  return {
    height: parseInt(
      json.data.protocol_state.body.consensus_state.blockchain_length
    ),
    parentHash: json.data.protocol_state.previous_state_hash,
    ledgerHash:
      json.data.protocol_state.body.blockchain_state.staged_ledger_hash
        .non_snark.ledger_hash,
    chainStatus: '', // not provided in PrecomputedBlock
    timestamp: json.data.protocol_state.body.constants.genesis_state_timestamp,
    globalSlotSinceHardfork: GetSlot(
      json.data.protocol_state.body.consensus_state.curr_global_slot.slot_number
    ),
    globalSlotSinceGenesis: GetSlot(
      json.data.protocol_state.body.consensus_state.global_slot_since_genesis
    ),
    lastVrfOutput:
      json.data.protocol_state.body.consensus_state.last_vrf_output,
    stateHash: '', // not provided in PrecomputedBlock
    distanceFromMaxBlockHeight: 0, // not provided in PrecomputedBlock
  };
}

function runSelect(candidate: BlockInfo, currentChain: BlockInfo[]) {
  const existing = currentChain[currentChain.length - 1];
  const newBlock = select({ blockInfo: existing }, { blockInfo: candidate });

  if (newBlock.blockInfo.height > existing.height) {
    currentChain.push(newBlock.blockInfo);
    return;
  }
  if (newBlock.blockInfo.height === existing.height) {
    currentChain[currentChain.length - 1] = newBlock.blockInfo;
    return;
  }
}

function writeBlocksOutput(blocks: BlockInfo[]) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const json: BlockFileOutput = {
      height: block.height,
      previous_state_hash: block.parentHash,
    };

    fs.writeFileSync(
      path.join(process.cwd(), outputDir, `block_${i}.json`),
      JSON.stringify(json)
    );
  }
}

function main() {
  const precomputed_blocks = readPrecomputedBlocks();
  const [firstBlock, ...restOfPrecomputedBlocks] = precomputed_blocks;

  const currentChain: BlockInfo[] = [];
  currentChain.push(firstBlock);

  for (const precomputed_block of restOfPrecomputedBlocks) {
    runSelect(precomputed_block, currentChain);
  }
  writeBlocksOutput(currentChain);
}

main();
