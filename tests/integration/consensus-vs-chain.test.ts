/**
 * Validates the TypeScript consensus `select` against real chain decisions.
 *
 * The Mina archive DB records every block the node saw, marking the chosen
 * head as `canonical` and the rejected forks as `orphaned`. Those labels are
 * the OCaml consensus rules' answer key.
 *
 * `select` decides between two competing chain heads. The cleanest mapping
 * to a recorded chain decision is a TRUE SHORT-RANGE FORK: two blocks at
 * the same height that share a parent — i.e., direct siblings spawned from
 * the same point in the chain. For these, OCaml's labelling tells us which
 * sibling won and which was orphaned, so we can ask the TS `select` the
 * same question and assert it agrees.
 *
 * Same-height blocks with DIFFERENT parents are excluded — those are tips
 * of different forks that converged at the same height, and the chain
 * decision was driven by a later length-based comparison rather than by
 * `select` at that height.
 *
 * Heights ≤ 2 are also excluded. The fixture comes from a small bootstrap
 * network where every node started simultaneously, so blocks immediately
 * after genesis race in ways that don't reflect steady-state consensus.
 * Validating from height 3 onward sticks to the regime `select` actually
 * runs in.
 *
 * Replaces the manual port-validation harness that used to live under
 * tests/consensus/. Same intent (prove TS `select` matches OCaml's chain
 * decisions); now runs in CI against the same dump used by the rest of
 * the integration suite.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert';
import postgres from 'postgres';
import { select } from '../../src/consensus/mina-consensus.js';
import type { BlockInfo } from '../../src/blockchain/types.js';
import {
  setupTestDatabase,
  teardownTestDatabase,
  createTestClient,
} from './setup.js';

type CompetingBlockRow = {
  height: number | string;
  state_hash: string;
  parent_hash: string;
  ledger_hash: string;
  chain_status: string;
  timestamp: string;
  global_slot_since_hard_fork: number | string;
  global_slot_since_genesis: number | string;
  last_vrf_output: string;
};

function rowToBlockInfo(row: CompetingBlockRow): BlockInfo {
  return {
    height: Number(row.height),
    stateHash: row.state_hash,
    parentHash: row.parent_hash,
    ledgerHash: row.ledger_hash,
    chainStatus: row.chain_status,
    timestamp: row.timestamp,
    globalSlotSinceHardfork: Number(row.global_slot_since_hard_fork),
    globalSlotSinceGenesis: Number(row.global_slot_since_genesis),
    distanceFromMaxBlockHeight: 0,
    lastVrfOutput: row.last_vrf_output,
  };
}

let client: postgres.Sql;

before(async () => {
  await setupTestDatabase();
  client = createTestClient();
}, { timeout: 60000 });

after(async () => {
  if (client) await client.end();
  await teardownTestDatabase();
});

describe('Consensus select agrees with chain canonicality', () => {
  test('canonical sibling wins against every orphaned sibling sharing the same parent', async () => {
    // Pull every canonical/orphan block at a height where there is exactly
    // one canonical and at least one orphan sharing the same parent_hash —
    // i.e., direct short-range-fork siblings.
    const rows = await client<CompetingBlockRow[]>`
      SELECT
        b.height,
        b.state_hash,
        b.parent_hash,
        b.ledger_hash,
        b.chain_status,
        b.timestamp,
        b.global_slot_since_hard_fork,
        b.global_slot_since_genesis,
        b.last_vrf_output
      FROM blocks b
      WHERE b.chain_status IN ('canonical', 'orphaned')
        AND b.height > 2
        AND EXISTS (
          SELECT 1 FROM blocks sib
          WHERE sib.height       = b.height
            AND sib.parent_hash  = b.parent_hash
            AND sib.chain_status <> b.chain_status
            AND sib.chain_status IN ('canonical', 'orphaned')
        )
      ORDER BY b.height, b.parent_hash, b.chain_status
    `;

    // Group by (height, parent_hash) — the unique sibling-set key.
    const groups = new Map<string, CompetingBlockRow[]>();
    for (const row of rows) {
      const key = `${row.height}:${row.parent_hash}`;
      const bucket = groups.get(key) ?? [];
      bucket.push(row);
      groups.set(key, bucket);
    }

    assert.ok(
      groups.size >= 3,
      `fixture should expose at least 3 sibling-fork groups for meaningful coverage; found ${groups.size}`
    );

    let pairs = 0;
    for (const [key, blocks] of groups) {
      const canonical = blocks.find((b) => b.chain_status === 'canonical');
      const orphans = blocks.filter((b) => b.chain_status === 'orphaned');
      assert.ok(canonical, `${key}: missing canonical sibling`);
      assert.ok(orphans.length >= 1, `${key}: missing orphan sibling`);

      const canonicalEntry = { blockInfo: rowToBlockInfo(canonical) };

      for (const orphan of orphans) {
        const orphanEntry = { blockInfo: rowToBlockInfo(orphan) };

        const a = select(canonicalEntry, orphanEntry);
        assert.equal(
          a.blockInfo.stateHash,
          canonical.state_hash,
          `${key}: select(canonical, orphan) must pick canonical (got ${a.blockInfo.stateHash}, want ${canonical.state_hash})`
        );

        const b = select(orphanEntry, canonicalEntry);
        assert.equal(
          b.blockInfo.stateHash,
          canonical.state_hash,
          `${key}: select(orphan, canonical) must pick canonical (got ${b.blockInfo.stateHash}, want ${canonical.state_hash})`
        );

        pairs++;
      }
    }

    console.log(
      `Validated ${pairs} canonical-vs-orphan sibling pair(s) across ${groups.size} fork point(s)`
    );
  });
});
