/**
 * Integration tests against a real devnet archive database dump.
 *
 * These tests download the second-newest hourly devnet dump from GCS,
 * load it into a local PostgreSQL instance, and exercise the API services
 * against real production data — including very old blocks that have
 * historically caused issues when querying details.
 *
 * Run with: npm run test:devnet-dump
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert';
import postgres from 'postgres';
import { BlocksService } from '../../src/services/blocks-service/blocks-service.js';
import { NetworkService } from '../../src/services/network-service/network-service.js';
import { EventsService } from '../../src/services/events-service/events-service.js';
import { ActionsService } from '../../src/services/actions-service/actions-service.js';
import { TracingState } from '../../src/tracing/tracer.js';
import {
  setupTestDatabase,
  teardownTestDatabase,
  createTestClient,
} from './setup.js';

const nullOptions = { tracingState: new TracingState(undefined as any) };

let client: postgres.Sql;
let blocksService: BlocksService;
let networkService: NetworkService;
let eventsService: EventsService;
let actionsService: ActionsService;

// Track chain boundaries for dynamic test logic
let maxCanonicalHeight: number;
let minHeight: number;

before(async () => {
  await setupTestDatabase();
  client = createTestClient();
  blocksService = new BlocksService(client);
  networkService = new NetworkService(client);
  eventsService = new EventsService(client);
  actionsService = new ActionsService(client);

  // Discover chain boundaries
  const state = await networkService.getNetworkState(nullOptions);
  maxCanonicalHeight = state.maxBlockHeight.canonicalMaxBlockHeight;
  const minRow = await client`SELECT MIN(height) as min_height FROM blocks WHERE chain_status = 'canonical'`;
  minHeight = Number(minRow[0].min_height);
  console.log(`Devnet chain: canonical heights ${minHeight} to ${maxCanonicalHeight}`);
}, { timeout: 900000 }); // 15 min for download + import

after(async () => {
  if (client) await client.end();
  await teardownTestDatabase();
});

// ─── Network State ─────────────────────────────────────────────────

describe('NetworkState (devnet dump)', () => {
  test('returns valid max block heights', async () => {
    const state = await networkService.getNetworkState(nullOptions);
    assert.ok(state.maxBlockHeight, 'should have maxBlockHeight');
    assert.ok(
      state.maxBlockHeight.canonicalMaxBlockHeight > 0,
      `canonical max height should be positive, got ${state.maxBlockHeight.canonicalMaxBlockHeight}`
    );
    // Devnet should have many thousands of blocks
    assert.ok(
      state.maxBlockHeight.canonicalMaxBlockHeight > 1000,
      `devnet should have >1000 blocks, got ${state.maxBlockHeight.canonicalMaxBlockHeight}`
    );
  });
});

// ─── Oldest Blocks ─────────────────────────────────────────────────

describe('Oldest blocks (devnet dump)', () => {
  test('can query the very first blocks', async () => {
    const blocks = await blocksService.getBlocks(
      { blockHeight_gte: minHeight, blockHeight_lt: minHeight + 5, canonical: true },
      null,
      'BLOCKHEIGHT_ASC' as any,
      nullOptions
    );
    assert.ok(blocks.length > 0, `should return blocks near genesis (height ${minHeight})`);

    for (const block of blocks) {
      assert.ok(block.stateHash, 'stateHash should be present');
      assert.ok(block.creator.startsWith('B62q'), `creator should be a B62 key, got ${block.creator}`);
      assert.ok(block.dateTime, 'dateTime should be present');
      const date = new Date(block.dateTime);
      assert.ok(!isNaN(date.getTime()), `dateTime should be valid ISO, got ${block.dateTime}`);
      assert.ok(block.transactions, 'transactions should be present');
    }
  });

  test('first block has valid timestamp', async () => {
    const blocks = await blocksService.getBlocks(
      { blockHeight_gte: minHeight, blockHeight_lt: minHeight + 1, canonical: true },
      1,
      null,
      nullOptions
    );
    assert.strictEqual(blocks.length, 1);
    const date = new Date(blocks[0].dateTime);
    // Genesis should be a real date, not epoch 0
    assert.ok(date.getFullYear() >= 2023, `genesis date should be >= 2023, got ${date}`);
  });

  test('block details for very old block (height ~10)', async () => {
    const targetHeight = minHeight + 10;
    const blocks = await blocksService.getBlocks(
      { blockHeight_gte: targetHeight, blockHeight_lt: targetHeight + 1, canonical: true },
      1,
      null,
      nullOptions
    );
    assert.strictEqual(blocks.length, 1, `should find exactly one canonical block at height ${targetHeight}`);
    const block = blocks[0];
    assert.strictEqual(Number(block.blockHeight), targetHeight);
    assert.ok(block.stateHash.length > 10, 'stateHash should be a real hash');
    assert.ok(block.creator.startsWith('B62q'), 'creator should be valid');
    assert.ok(block.transactions, 'transactions object should exist');
  });
});

// ─── Newest Blocks ─────────────────────────────────────────────────

describe('Newest blocks (devnet dump)', () => {
  test('can query the most recent canonical blocks', async () => {
    const blocks = await blocksService.getBlocks(
      { blockHeight_gte: maxCanonicalHeight - 5, canonical: true },
      null,
      'BLOCKHEIGHT_DESC' as any,
      nullOptions
    );
    assert.ok(blocks.length > 0, 'should return recent blocks');
    assert.strictEqual(
      Number(blocks[0].blockHeight),
      maxCanonicalHeight,
      'first result in DESC should be the max height'
    );
  });

  test('newest block has recent timestamp', async () => {
    const blocks = await blocksService.getBlocks(
      { blockHeight_gte: maxCanonicalHeight, canonical: true },
      1,
      null,
      nullOptions
    );
    assert.strictEqual(blocks.length, 1);
    const date = new Date(blocks[0].dateTime);
    const now = new Date();
    const daysDiff = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
    // The dump is at most ~2 days old
    assert.ok(daysDiff < 5, `newest block should be recent, but is ${daysDiff.toFixed(1)} days old`);
  });

  test('newest block details are complete', async () => {
    const blocks = await blocksService.getBlocks(
      { blockHeight_gte: maxCanonicalHeight, blockHeight_lt: maxCanonicalHeight + 1, canonical: true },
      1,
      null,
      nullOptions
    );
    assert.strictEqual(blocks.length, 1);
    const block = blocks[0];
    assert.ok(block.stateHash, 'stateHash present');
    assert.ok(block.creator.startsWith('B62q'), 'creator valid');
    assert.ok(block.dateTime, 'dateTime present');
    assert.ok(block.transactions, 'transactions present');
  });
});

// ─── Block Details & Edge Cases ────────────────────────────────────

describe('Block details across height ranges (devnet dump)', () => {
  test('query blocks at 10% height mark', async () => {
    const targetHeight = Math.floor(maxCanonicalHeight * 0.1);
    const blocks = await blocksService.getBlocks(
      { blockHeight_gte: targetHeight, blockHeight_lt: targetHeight + 3, canonical: true },
      null,
      null,
      nullOptions
    );
    assert.ok(blocks.length > 0, `should have blocks around height ${targetHeight}`);
    for (const block of blocks) {
      assert.ok(block.stateHash, 'stateHash should be present');
      assert.ok(block.creator, 'creator should be present');
      assert.ok(block.dateTime, 'dateTime should be present');
      assert.ok(block.transactions, 'transactions should be present');
    }
  });

  test('query blocks at 50% height mark', async () => {
    const targetHeight = Math.floor(maxCanonicalHeight * 0.5);
    const blocks = await blocksService.getBlocks(
      { blockHeight_gte: targetHeight, blockHeight_lt: targetHeight + 3, canonical: true },
      null,
      null,
      nullOptions
    );
    assert.ok(blocks.length > 0, `should have blocks around height ${targetHeight}`);
    for (const block of blocks) {
      assert.ok(block.stateHash, 'stateHash should be present');
      assert.ok(block.creator, 'creator should be present');
    }
  });

  test('large range query returns blocks with limit', async () => {
    const blocks = await blocksService.getBlocks(
      { canonical: true },
      50,
      'BLOCKHEIGHT_DESC' as any,
      nullOptions
    );
    assert.strictEqual(blocks.length, 50, 'should respect limit=50');
    // Verify DESC ordering
    for (let i = 1; i < blocks.length; i++) {
      assert.ok(
        Number(blocks[i].blockHeight) <= Number(blocks[i - 1].blockHeight),
        'blocks should be in descending height order'
      );
    }
  });

  test('ASC ordering works across full chain', async () => {
    const blocks = await blocksService.getBlocks(
      { canonical: true },
      50,
      'BLOCKHEIGHT_ASC' as any,
      nullOptions
    );
    assert.strictEqual(blocks.length, 50);
    for (let i = 1; i < blocks.length; i++) {
      assert.ok(
        Number(blocks[i].blockHeight) >= Number(blocks[i - 1].blockHeight),
        'blocks should be in ascending height order'
      );
    }
  });

  test('dateTime filtering works on real data', async () => {
    // Get a block from the middle of the chain
    const midHeight = Math.floor(maxCanonicalHeight * 0.5);
    const midBlocks = await blocksService.getBlocks(
      { blockHeight_gte: midHeight, blockHeight_lt: midHeight + 1, canonical: true },
      1,
      null,
      nullOptions
    );
    assert.ok(midBlocks.length === 1, 'should find the mid-chain block');

    const midTime = new Date(midBlocks[0].dateTime);
    const windowStart = new Date(midTime.getTime() - 3600000); // 1hr before
    const windowEnd = new Date(midTime.getTime() + 3600000);   // 1hr after

    const blocks = await blocksService.getBlocks(
      {
        dateTime_gte: windowStart.toISOString(),
        dateTime_lt: windowEnd.toISOString(),
        canonical: true,
      },
      null,
      null,
      nullOptions
    );
    assert.ok(blocks.length > 0, 'should find blocks in the time window');
    for (const block of blocks) {
      const blockTime = new Date(block.dateTime);
      assert.ok(blockTime >= windowStart && blockTime < windowEnd,
        `block time ${block.dateTime} should be within window`);
    }
  });

  test('coinbase is present on canonical blocks', async () => {
    // Check a range of blocks for coinbase
    const blocks = await blocksService.getBlocks(
      { canonical: true, blockHeight_gte: 100, blockHeight_lt: 120 },
      null,
      null,
      nullOptions
    );
    assert.ok(blocks.length > 0, 'should have blocks in range 100-120');
    const withCoinbase = blocks.filter(b => b.transactions.coinbase !== '0');
    assert.ok(
      withCoinbase.length > 0,
      'at least some blocks in range should have a coinbase reward'
    );
  });
});

// ─── Events & Actions on Real Data ──────────────────────────────────

describe('Events and Actions (devnet dump)', () => {
  test('events query works with real addresses from the chain', async () => {
    // Find an address that exists in the chain
    const rows = await client`
      SELECT pk.value as address
      FROM account_identifiers ai
      JOIN public_keys pk ON ai.public_key_id = pk.id
      JOIN zkapp_accounts za ON ai.id = za.account_identifier_id
      LIMIT 1
    `;

    if (rows.length === 0) {
      console.log('  No zkApp accounts in dump, skipping events test');
      return;
    }

    const address = rows[0].address;
    console.log(`  Testing events for zkApp: ${address.slice(0, 20)}...`);
    const events = await eventsService.getEvents({ address }, nullOptions);
    // May or may not have events, but shouldn't throw
    assert.ok(Array.isArray(events), 'events should be an array');
  });

  test('actions query works with real addresses from the chain', async () => {
    const rows = await client`
      SELECT pk.value as address
      FROM account_identifiers ai
      JOIN public_keys pk ON ai.public_key_id = pk.id
      JOIN zkapp_accounts za ON ai.id = za.account_identifier_id
      LIMIT 1
    `;

    if (rows.length === 0) {
      console.log('  No zkApp accounts in dump, skipping actions test');
      return;
    }

    const address = rows[0].address;
    console.log(`  Testing actions for zkApp: ${address.slice(0, 20)}...`);
    const actions = await actionsService.getActions({ address }, nullOptions);
    assert.ok(Array.isArray(actions), 'actions should be an array');
  });
});

// ─── Schema Validation ─────────────────────────────────────────────

describe('Schema validation (devnet dump)', () => {
  test('all required tables exist in devnet dump', async () => {
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

  test('blocks table has substantial data', async () => {
    const countResult = await client`SELECT COUNT(*) as cnt FROM blocks`;
    const count = Number(countResult[0].cnt);
    assert.ok(count > 1000, `devnet should have >1000 blocks, got ${count}`);
    console.log(`  Total blocks in dump: ${count}`);
  });
});
