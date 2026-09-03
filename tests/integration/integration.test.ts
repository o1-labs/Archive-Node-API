/**
 * Integration tests for Archive Node API services against a real PostgreSQL database.
 *
 * These tests load the sample archive DB dump and run actual SQL queries through
 * the service layer, validating the full query pipeline end-to-end.
 *
 * The sample dump contains:
 * - 24 canonical blocks (heights 1-25), 15 orphaned blocks
 * - 1 pending block (inserted by test setup at height 26)
 * - 227 failed zkapp commands (no successful ones, so events/actions return empty)
 * - Coinbase internal commands
 * - 240 public keys, default token only
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert';
import postgres from 'postgres';
import { EventsService } from '../../src/services/events-service/events-service.js';
import { ActionsService } from '../../src/services/actions-service/actions-service.js';
import { NetworkService } from '../../src/services/network-service/network-service.js';
import { BlocksService } from '../../src/services/blocks-service/blocks-service.js';
import { BlockStatusFilter } from '../../src/blockchain/types.js';
import { BlockSortByInput } from '../../src/resolvers-types.js';
import { DEFAULT_TOKEN_ID } from '../../src/blockchain/constants.js';
import { TracingState } from '../../src/tracing/tracer.js';
import {
  setupTestDatabase,
  teardownTestDatabase,
  createTestClient,
} from './setup.js';

// Null tracing for tests
const nullOptions = { tracingState: new TracingState(undefined as any) };

let client: postgres.Sql;

before(
  async () => {
    await setupTestDatabase();
    client = createTestClient();
  },
  { timeout: 30000 }
);

after(async () => {
  await client.end();
  await teardownTestDatabase();
});

// ─── Blocks Service ──────────────────────────────────────────────────

describe('BlocksService (integration)', () => {
  let blocksService: BlocksService;

  before(() => {
    blocksService = new BlocksService(client);
  });

  test('returns blocks with default parameters', async () => {
    const blocks = await blocksService.getBlocks(null, null, null, nullOptions);
    assert.ok(blocks.length > 0, 'should return at least one block');
    // Verify each block has the expected shape
    for (const block of blocks) {
      assert.ok(block.stateHash, 'stateHash should be present');
      assert.ok(block.creator, 'creator should be present');
      assert.ok(block.dateTime, 'dateTime should be present');
      assert.ok(block.transactions, 'transactions should be present');
    }
  });

  test('returns blocks sorted DESC', async () => {
    const blocks = await blocksService.getBlocks(
      { canonical: true },
      10,
      'BLOCKHEIGHT_DESC' as any,
      nullOptions
    );
    assert.ok(blocks.length > 0);
    for (let i = 1; i < blocks.length; i++) {
      assert.ok(
        Number(blocks[i].blockHeight) <= Number(blocks[i - 1].blockHeight),
        `block ${i} height should be <= previous in DESC`
      );
    }
  });

  test('respects limit parameter', async () => {
    const blocks = await blocksService.getBlocks(null, 3, null, nullOptions);
    assert.strictEqual(blocks.length, 3);
  });

  test('filters by blockHeight_gte', async () => {
    const blocks = await blocksService.getBlocks(
      { blockHeight_gte: 20 },
      null,
      null,
      nullOptions
    );
    assert.ok(blocks.length > 0);
    for (const block of blocks) {
      assert.ok(
        block.blockHeight >= 20,
        `block height ${block.blockHeight} should be >= 20`
      );
    }
  });

  test('filters by blockHeight_lt', async () => {
    const blocks = await blocksService.getBlocks(
      { blockHeight_lt: 5 },
      null,
      null,
      nullOptions
    );
    assert.ok(blocks.length > 0);
    for (const block of blocks) {
      assert.ok(
        block.blockHeight < 5,
        `block height ${block.blockHeight} should be < 5`
      );
    }
  });

  test('filters by height range', async () => {
    const blocks = await blocksService.getBlocks(
      { blockHeight_gte: 10, blockHeight_lt: 15 },
      null,
      null,
      nullOptions
    );
    for (const block of blocks) {
      assert.ok(block.blockHeight >= 10 && block.blockHeight < 15);
    }
  });

  test('filters canonical blocks only', async () => {
    const blocks = await blocksService.getBlocks(
      { canonical: true },
      null,
      null,
      nullOptions
    );
    assert.ok(blocks.length > 0);
    // 24 canonical blocks in the dump — verify we get them all within default limit
    assert.strictEqual(
      blocks.length,
      24,
      'should return all 24 canonical blocks'
    );
  });

  test('filters non-canonical blocks', async () => {
    const blocks = await blocksService.getBlocks(
      { canonical: false },
      null,
      null,
      nullOptions
    );
    assert.ok(blocks.length > 0, 'should have orphaned/pending blocks');
  });

  test('filters inBestChain=true', async () => {
    const blocks = await blocksService.getBlocks(
      { inBestChain: true },
      null,
      null,
      nullOptions
    );
    assert.ok(blocks.length > 0);
    // Should include canonical blocks plus pending best chain
    // At minimum 24 canonical + 1 pending = 25 blocks
    assert.ok(
      blocks.length >= 24,
      'should include at least all canonical blocks'
    );
  });

  test('block data has correct shape', async () => {
    const blocks = await blocksService.getBlocks(
      { canonical: true, blockHeight_gte: 2, blockHeight_lt: 3 },
      1,
      null,
      nullOptions
    );
    assert.strictEqual(blocks.length, 1);
    const block = blocks[0];

    // blockHeight may be number or string depending on query method
    assert.strictEqual(Number(block.blockHeight), 2);
    assert.ok(block.stateHash.length > 0, 'stateHash should be non-empty');
    assert.ok(block.creator.startsWith('B62q'), 'creator should be a B62 key');
    assert.ok(block.dateTime, 'dateTime should be present');
    assert.ok(block.transactions, 'transactions should be present');

    // Verify dateTime is valid ISO
    const date = new Date(block.dateTime);
    assert.ok(!isNaN(date.getTime()), 'dateTime should be valid ISO date');
  });

  test('block coinbase is populated for canonical blocks', async () => {
    const blocks = await blocksService.getBlocks(
      { canonical: true, blockHeight_gte: 2, blockHeight_lt: 4 },
      null,
      null,
      nullOptions
    );
    // At least one block at height 2-3 should have a coinbase
    const withCoinbase = blocks.filter((b) => b.transactions.coinbase !== '0');
    assert.ok(
      withCoinbase.length > 0,
      'at least one block should have coinbase'
    );
  });

  test('returns empty for impossible height range', async () => {
    const blocks = await blocksService.getBlocks(
      { blockHeight_gte: 99999 },
      null,
      null,
      nullOptions
    );
    assert.strictEqual(blocks.length, 0);
  });

  test('filters by dateTime range', async () => {
    // Get a known block timestamp first
    const allBlocks = await blocksService.getBlocks(
      { canonical: true },
      1,
      'BLOCKHEIGHT_DESC' as any,
      nullOptions
    );
    const latestTime = new Date(allBlocks[0].dateTime);
    const oneHourBefore = new Date(latestTime.getTime() - 3600000);

    const blocks = await blocksService.getBlocks(
      {
        dateTime_gte: oneHourBefore.toISOString(),
        dateTime_lt: latestTime.toISOString(),
      },
      null,
      null,
      nullOptions
    );
    for (const block of blocks) {
      const blockTime = new Date(block.dateTime);
      assert.ok(blockTime >= oneHourBefore && blockTime < latestTime);
    }
  });
});

// ─── Network Service ─────────────────────────────────────────────────

describe('NetworkService (integration)', () => {
  let networkService: NetworkService;

  before(() => {
    networkService = new NetworkService(client);
  });

  test('returns max block heights for canonical and pending', async () => {
    const state = await networkService.getNetworkState(nullOptions);

    assert.ok(state.maxBlockHeight, 'maxBlockHeight should be present');
    assert.strictEqual(
      state.maxBlockHeight.canonicalMaxBlockHeight,
      25,
      'canonical max should be 25 (from dump)'
    );
    assert.strictEqual(
      state.maxBlockHeight.pendingMaxBlockHeight,
      26,
      'pending max should be 26 (inserted by test setup)'
    );
  });

  test('pending height > canonical height', async () => {
    const state = await networkService.getNetworkState(nullOptions);
    assert.ok(
      state.maxBlockHeight,
      'fixture seeds both canonical and pending rows'
    );
    assert.ok(
      state.maxBlockHeight.pendingMaxBlockHeight >
        state.maxBlockHeight.canonicalMaxBlockHeight
    );
  });
});

// ─── Hard-fork shape: an abandoned chain above the tip ──────────────

/**
 * After a hard fork the archive still holds the OLD chain's blocks above the new
 * chain's tip, marked `orphaned` (mainnet, Mesa upgrade 2026-09-03: old chain to
 * 548187, fork block 548147, new tip 548164). Every "walk back from the tip" CTE
 * used to anchor on the global MAX(height) — a dead block — so `inBestChain: true`
 * returned nothing above the fork block for as long as the old chain outranked the
 * new one. These tests plant that shape on top of the fixture: one orphaned block
 * one height ABOVE the synthetic pending tip.
 */
describe('Hard-fork shape (integration)', () => {
  const ORPHAN_ABOVE_TIP = '3NKorphan_above_the_pending_tip_hard_fork_shape';
  let blocksService: BlocksService;
  let networkService: NetworkService;
  let tipHeight: number;

  before(async () => {
    blocksService = new BlocksService(client);
    networkService = new NetworkService(client);
    const [tip] = await client.unsafe(
      `SELECT height FROM blocks WHERE chain_status = 'pending' ORDER BY height DESC LIMIT 1`
    );
    tipHeight = Number(tip.height);
    await client.unsafe(`
      INSERT INTO blocks (
        id, state_hash, parent_id, parent_hash, creator_id, block_winner_id,
        last_vrf_output,
        snarked_ledger_hash_id, staking_epoch_data_id, next_epoch_data_id,
        min_window_density, sub_window_densities, total_currency,
        ledger_hash, height, global_slot_since_hard_fork, global_slot_since_genesis,
        protocol_version_id, proposed_protocol_version_id,
        timestamp, chain_status
      )
      SELECT
        (SELECT max(id) + 1 FROM blocks),
        '${ORPHAN_ABOVE_TIP}',
        id,
        state_hash,
        creator_id,
        block_winner_id,
        last_vrf_output,
        snarked_ledger_hash_id,
        staking_epoch_data_id,
        next_epoch_data_id,
        min_window_density,
        sub_window_densities,
        total_currency,
        ledger_hash,
        height + 1,
        global_slot_since_hard_fork + 1,
        global_slot_since_genesis + 1,
        protocol_version_id,
        proposed_protocol_version_id,
        (timestamp::bigint + 60000)::text,
        'orphaned'
      FROM blocks
      WHERE chain_status = 'pending'
      ORDER BY height DESC
      LIMIT 1
    `);
  });

  after(async () => {
    await client.unsafe(
      `DELETE FROM blocks WHERE state_hash = '${ORPHAN_ABOVE_TIP}'`
    );
  });

  test('networkState ignores the abandoned block above the tip', async () => {
    const state = await networkService.getNetworkState(nullOptions);
    assert.ok(state.maxBlockHeight);
    assert.strictEqual(state.maxBlockHeight.pendingMaxBlockHeight, tipHeight);
  });

  test('inBestChain=true still reaches the pending tip', async () => {
    const blocks = await blocksService.getBlocks(
      { inBestChain: true, blockHeight_gte: tipHeight },
      null,
      null,
      nullOptions
    );
    assert.deepStrictEqual(
      blocks.map((b) => Number(b.blockHeight)),
      [tipHeight],
      'the pending tip must be in the best chain even with an orphan above it'
    );
    assert.notStrictEqual(blocks[0].stateHash, ORPHAN_ABOVE_TIP);
  });

  test('the best chain and networkState agree on the tip', async () => {
    const state = await networkService.getNetworkState(nullOptions);
    const blocks = await blocksService.getBlocks(
      { inBestChain: true },
      null,
      BlockSortByInput.BlockheightDesc,
      nullOptions
    );
    assert.ok(state.maxBlockHeight);
    assert.strictEqual(
      Number(blocks[0].blockHeight),
      state.maxBlockHeight.pendingMaxBlockHeight
    );
  });

  test('inBestChain=false reports the abandoned block', async () => {
    const blocks = await blocksService.getBlocks(
      { inBestChain: false, blockHeight_gte: tipHeight },
      null,
      null,
      nullOptions
    );
    assert.deepStrictEqual(
      blocks.map((b) => b.stateHash),
      [ORPHAN_ABOVE_TIP]
    );
  });
});

// ─── Events Service ──────────────────────────────────────────────────

describe('EventsService (integration)', () => {
  let eventsService: EventsService;

  before(() => {
    eventsService = new EventsService(client);
  });

  test('returns empty for address with no events', async () => {
    const events = await eventsService.getEvents(
      {
        address: 'B62qiy32p8kAKnny8ZFwoMhYpBppM1DWVCqAPBYNcXnsAHhnfAAuXgg',
      },
      nullOptions
    );
    assert.deepStrictEqual(events, []);
  });

  test('returns empty for nonexistent address', async () => {
    const events = await eventsService.getEvents(
      {
        address: 'B62qnonexistentAddressThatDoesNotExistInTheDatabase1234567',
      },
      nullOptions
    );
    assert.deepStrictEqual(events, []);
  });

  test('returns empty with block range filter', async () => {
    const events = await eventsService.getEvents(
      {
        address: 'B62qiy32p8kAKnny8ZFwoMhYpBppM1DWVCqAPBYNcXnsAHhnfAAuXgg',
        from: 1,
        to: 10,
      },
      nullOptions
    );
    assert.deepStrictEqual(events, []);
  });

  test('returns empty with canonical status filter', async () => {
    const events = await eventsService.getEvents(
      {
        address: 'B62qiy32p8kAKnny8ZFwoMhYpBppM1DWVCqAPBYNcXnsAHhnfAAuXgg',
        status: BlockStatusFilter.canonical,
      },
      nullOptions
    );
    assert.deepStrictEqual(events, []);
  });

  test('throws block range error when to < from', async () => {
    await assert.rejects(
      () =>
        eventsService.getEvents(
          { address: 'B62qtest', from: 100, to: 50 },
          nullOptions
        ),
      (err: any) => {
        assert.strictEqual(err.extensions?.code, 'BLOCK_RANGE_ERROR');
        return true;
      }
    );
  });
});

// ─── Actions Service ─────────────────────────────────────────────────

describe('ActionsService (integration)', () => {
  let actionsService: ActionsService;

  before(() => {
    actionsService = new ActionsService(client);
  });

  test('returns empty for address with no actions', async () => {
    const actions = await actionsService.getActions(
      {
        address: 'B62qiy32p8kAKnny8ZFwoMhYpBppM1DWVCqAPBYNcXnsAHhnfAAuXgg',
      },
      nullOptions
    );
    assert.deepStrictEqual(actions, []);
  });

  test('returns empty for nonexistent address', async () => {
    const actions = await actionsService.getActions(
      {
        address: 'B62qnonexistentAddressThatDoesNotExistInTheDatabase1234567',
      },
      nullOptions
    );
    assert.deepStrictEqual(actions, []);
  });

  test('throws block range error when to < from', async () => {
    await assert.rejects(
      () =>
        actionsService.getActions(
          { address: 'B62qtest', from: 100, to: 50 },
          nullOptions
        ),
      (err: any) => {
        assert.strictEqual(err.extensions?.code, 'BLOCK_RANGE_ERROR');
        return true;
      }
    );
  });

  test('throws action state error for nonexistent fromActionState', async () => {
    await assert.rejects(
      () =>
        actionsService.getActions(
          {
            address: 'B62qiy32p8kAKnny8ZFwoMhYpBppM1DWVCqAPBYNcXnsAHhnfAAuXgg',
            fromActionState: 'nonexistent_action_state_hash_value',
          },
          nullOptions
        ),
      (err: any) => {
        assert.strictEqual(err.extensions?.code, 'ACTION_STATE_NOT_FOUND');
        return true;
      }
    );
  });
});

// The verification-key update tests live in `verification-key-updates.test.ts`.
// They need applied zkApp commands, and every zkApp command in this fixture
// failed, so they run against their own database and their own fixture.

// ─── SQL Schema Validation ───────────────────────────────────────────

describe('Schema validation (integration)', () => {
  test('all required tables exist', async () => {
    const tables = await client`
      SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public'
    `;
    const tableNames = tables.map((t: any) => t.tablename);

    const required = [
      'blocks',
      'account_identifiers',
      'accounts_accessed',
      'blocks_zkapp_commands',
      'zkapp_commands',
      'zkapp_account_update',
      'zkapp_account_update_body',
      'zkapp_events',
      'zkapp_field_array',
      'zkapp_field',
      'zkapp_updates',
      'zkapp_accounts',
      'zkapp_action_states',
    ];
    for (const table of required) {
      assert.ok(tableNames.includes(table), `table ${table} should exist`);
    }
  });
});
