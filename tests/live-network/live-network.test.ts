/**
 * Live network integration tests.
 *
 * These tests start a real Mina lightnet container with archive node,
 * wait for blocks to be produced, and then query the Archive Node API
 * services against the live database.
 *
 * Requirements:
 * - Docker installed and running
 * - o1labs/mina-local-network:compatible-latest-lightnet image available
 * - Ports 3085, 5432, 8080, 8181, 8282 free
 *
 * These tests are slow (~3-5 min startup + block production time).
 * Run with: npm run test:live-network
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
  startLightnet,
  stopLightnet,
  acquireKeyPair,
  importAndUnlockWhaleAccount,
  sendPayment,
  waitForBlockHeight,
  PG_CONN,
} from './setup.js';

const nullOptions = { tracingState: new TracingState(undefined as any) };
const MIN_BLOCKS = 3;

let client: postgres.Sql;
let blocksService: BlocksService;
let networkService: NetworkService;
let eventsService: EventsService;
let actionsService: ActionsService;

before(async () => {
  await startLightnet();

  client = postgres(PG_CONN, { max: 5 });
  blocksService = new BlocksService(client);
  networkService = new NetworkService(client);
  eventsService = new EventsService(client);
  actionsService = new ActionsService(client);

  // Wait for at least a few blocks to be produced
  console.log(`Waiting for at least ${MIN_BLOCKS} blocks...`);
  await waitForBlockHeight(MIN_BLOCKS, PG_CONN, 180000);
  console.log('Blocks are being produced. Running tests.');
}, { timeout: 600000 }); // 10 min total timeout for setup

after(async () => {
  if (client) await client.end();
  await stopLightnet();
});

// ─── Blocks ──────────────────────────────────────────────────────────

describe('Blocks (live network)', () => {
  test('returns produced blocks', async () => {
    const blocks = await blocksService.getBlocks(null, 10, null, nullOptions);
    assert.ok(blocks.length > 0, 'should have produced blocks');

    for (const block of blocks) {
      assert.ok(block.stateHash, 'block should have stateHash');
      assert.ok(block.creator.startsWith('B62q'), 'creator should be a B62 public key');
      assert.ok(block.dateTime, 'block should have dateTime');
      assert.ok(block.transactions, 'block should have transactions');
    }
  });

  test('blocks have incrementing heights', async () => {
    const blocks = await blocksService.getBlocks(
      { canonical: true },
      10,
      'BLOCKHEIGHT_ASC' as any,
      nullOptions
    );
    assert.ok(blocks.length >= 2, 'need at least 2 blocks');
    for (let i = 1; i < blocks.length; i++) {
      assert.ok(
        Number(blocks[i].blockHeight) >= Number(blocks[i - 1].blockHeight),
        'heights should be non-decreasing'
      );
    }
  });

  test('blocks can be filtered by height', async () => {
    const blocks = await blocksService.getBlocks(
      { blockHeight_gte: 1, blockHeight_lt: 3 },
      null,
      null,
      nullOptions
    );
    for (const block of blocks) {
      const h = Number(block.blockHeight);
      assert.ok(h >= 1 && h < 3, `height ${h} should be in [1, 3)`);
    }
  });

  test('blocks DESC sort works', async () => {
    const blocks = await blocksService.getBlocks(
      null,
      5,
      'BLOCKHEIGHT_DESC' as any,
      nullOptions
    );
    assert.ok(blocks.length > 0);
    for (let i = 1; i < blocks.length; i++) {
      assert.ok(
        Number(blocks[i].blockHeight) <= Number(blocks[i - 1].blockHeight)
      );
    }
  });
});

// ─── Network State ───────────────────────────────────────────────────

describe('NetworkState (live network)', () => {
  test('returns valid max block heights', async () => {
    const state = await networkService.getNetworkState(nullOptions);
    assert.ok(state.maxBlockHeight, 'should have maxBlockHeight');
    assert.ok(
      state.maxBlockHeight.canonicalMaxBlockHeight >= 0 ||
      state.maxBlockHeight.pendingMaxBlockHeight >= 0,
      'should have at least one height > 0'
    );
  });

  test('pending height >= canonical height', async () => {
    const state = await networkService.getNetworkState(nullOptions);
    assert.ok(
      state.maxBlockHeight.pendingMaxBlockHeight >=
        state.maxBlockHeight.canonicalMaxBlockHeight,
      'pending should be >= canonical'
    );
  });
});

// ─── Events/Actions (empty since no zkApps deployed) ─────────────────

describe('Events (live network)', () => {
  test('returns empty for random address', async () => {
    const events = await eventsService.getEvents(
      { address: 'B62qiy32p8kAKnny8ZFwoMhYpBppM1DWVCqAPBYNcXnsAHhnfAAuXgg' },
      nullOptions
    );
    assert.deepStrictEqual(events, []);
  });
});

describe('Actions (live network)', () => {
  test('returns empty for random address', async () => {
    const actions = await actionsService.getActions(
      { address: 'B62qiy32p8kAKnny8ZFwoMhYpBppM1DWVCqAPBYNcXnsAHhnfAAuXgg' },
      nullOptions
    );
    assert.deepStrictEqual(actions, []);
  });
});

// ─── Transactions ────────────────────────────────────────────────────

describe('Transactions (live network)', () => {
  test('send payment and verify it appears in archive', async () => {
    // Import and unlock a whale account (pre-funded genesis key inside the container)
    console.log('  Importing and unlocking whale account...');
    const senderPk = await importAndUnlockWhaleAccount();
    console.log(`  Sender: ${senderPk.slice(0, 20)}...`);

    // Get a receiver address from the accounts manager
    const receiver = await acquireKeyPair();
    console.log(`  Receiver: ${receiver.publicKey.slice(0, 20)}...`);

    // Send payment
    const txHash = await sendPayment(
      senderPk,
      receiver.publicKey,
      '1000000000', // 1 MINA
      '100000000'   // 0.1 MINA fee
    );
    assert.ok(txHash, 'should get a transaction hash');
    console.log(`  Payment sent: ${txHash.slice(0, 25)}...`);

    // Wait for the transaction to appear in the archive database
    console.log('  Waiting for transaction to appear in archive...');
    const maxWait = 120000;
    const start = Date.now();
    let found = false;

    while (Date.now() - start < maxWait) {
      const rows = await client`
        SELECT hash FROM user_commands WHERE hash = ${txHash}
      `;
      if (rows.length > 0) {
        found = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 5000));
    }

    assert.ok(found, `transaction ${txHash} should appear in the archive database`);
    console.log('  Transaction confirmed in archive.');
  });
});

// ─── Schema Validation ──────────────────────────────────────────────

describe('Schema validation (live network)', () => {
  test('all required tables exist in live archive', async () => {
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
