/**
 * Usage: npx ts-node ./src/consensus/run-consensus-precomputed.ts
 *
 * Steps this program needs to accomplish:
 *
 * 1. Read in all block data in a list ordered by timestamp
 * 2. For each block, check if the block is valid
 * 3. If the block is valid, convert it into an OCaml block type
 * 4. Initialize any PoS data structures
 * 5. Run the PoS selection algorithm on the blocks
 * 6. Print out the results
 */

import fs from 'fs';
import path from 'path';
import { BlockInfo } from 'src/models/types';
import { BlockFileOutput, GetSlot, PrecomputedBlock } from './types';
import { select } from './mina-consensus';

const outputDir = process.env.OUTPUT_DIR || 'compare';

const currentChain: BlockInfo[] = [];

function readBlocks() {
  const directoryPath = path.join(process.cwd(), 'block_data');
  const files = fs.readdirSync(directoryPath);

  const blocks = [];
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

function runSelect(candidate: BlockInfo) {
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

function main() {
  const blocks = readBlocks();
  const [firstBlock, ...precomputedBlocks] = blocks;
  currentChain.push(firstBlock);

  for (const block of precomputedBlocks) {
    runSelect(block);
  }

  for (let i = 0; i < currentChain.length; i++) {
    const block = currentChain[i];
    const json: { blocks: BlockFileOutput } = {
      blocks: {
        height: block.height,
        parent_state_hash: block.parentHash,
        previous_state_hash: block.parentHash,
        curr_global_slot: block.globalSlotSinceHardfork,
        global_slot_since_genesis: block.globalSlotSinceGenesis,
      },
    };

    fs.writeFileSync(
      path.join(process.cwd(), outputDir, `block_${i}.json`),
      JSON.stringify(json)
    );
  }
}

main();
