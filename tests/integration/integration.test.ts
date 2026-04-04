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

before(async () => {
  await setupTestDatabase();
  client = createTestClient();
}, { timeout: 30000 });

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
    assert.strictEqual(blocks.length, 24, 'should return all 24 canonical blocks');
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
    assert.ok(blocks.length >= 24, 'should include at least all canonical blocks');
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
    const withCoinbase = blocks.filter(
      (b) => b.transactions.coinbase !== '0'
    );
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
      { dateTime_gte: oneHourBefore.toISOString(), dateTime_lt: latestTime.toISOString() },
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
      state.maxBlockHeight.pendingMaxBlockHeight >
        state.maxBlockHeight.canonicalMaxBlockHeight
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
      'zkapp_accounts',
      'zkapp_action_states',
    ];
    for (const table of required) {
      assert.ok(tableNames.includes(table), `table ${table} should exist`);
    }
  });
});
