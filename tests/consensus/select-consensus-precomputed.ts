/**
 * Usage: npx ts-node ./tests/consensus/run/run-consensus-precomputed.ts
 */

import fs from 'fs';
import path from 'path';
import { BlockInfo } from '../../src/models/types';
import { BlockFileOutput, GetSlot, PrecomputedBlock } from './types';
import { select } from '../../src/consensus/mina-consensus';

const outputDir = process.env.OUTPUT_DIR || 'ts_blocks';

function readPrecomputedBlocks() {
  const directoryPath = path.join(process.cwd(), 'precomputed_blocks');
  const files = fs.readdirSync(directoryPath);

  const blocks: BlockInfo[] = [];
  for (const file of files) {
    const data = fs.readFileSync(path.join(directoryPath, file));
    const block = mapPrecomputedToBlockInfo(data.toString());
    blocks.push(block);
  }
  blocks.sort((a, b) => a.height - b.height);
  return blocks;
}

function mapPrecomputedToBlockInfo(block: string): BlockInfo {
  const json: PrecomputedBlock = JSON.parse(block);

  return {
    height: parseInt(
      json.data.protocol_state.body.consensus_state.blockchain_length
    ),
    stateHash: '', // not provided in PrecomputedBlock
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
    distanceFromMaxBlockHeight: 0, // not provided in PrecomputedBlock
    lastVrfOutput:
      json.data.protocol_state.body.consensus_state.last_vrf_output,
    minWindowDensity: parseInt(
      json.data.protocol_state.body.consensus_state.min_window_density
    ),
    subWindowDensities:
      json.data.protocol_state.body.consensus_state.sub_window_densities.map(
        Number
      ), // assumes this is an array of strings that represent numbers
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
      curr_global_slot: block.globalSlotSinceHardfork,
      global_slot_since_genesis: block.globalSlotSinceGenesis,
      timestamp: block.timestamp,
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
