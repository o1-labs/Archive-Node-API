/**
 * Integration tests for the `userCommands` query.
 *
 * `fixtures/user_commands.sql` adds three accounts and seven user commands on
 * top of the base dump; its header lists each command, its block and its role.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert';
import postgres from 'postgres';
import { UserCommandsService } from '../../src/services/user-commands-service/user-commands-service.js';
import {
  getMissingUserCommandIndexesQuery,
  getUserCommandsQuery,
  USER_COMMAND_ACCOUNT_INDEXES,
} from '../../src/db/sql/user-commands/queries.js';
import { BlockStatusFilter } from '../../src/blockchain/types.js';
import { TracingState } from '../../src/tracing/tracer.js';
import {
  setupTestDatabase,
  teardownTestDatabase,
  createTestClient,
} from './user-commands-setup.js';

const ALICE = 'B62qUserCommandsFixtureAlice000000000000000000000000000';
const BOB = 'B62qUserCommandsFixtureBob00000000000000000000000000000';
const CAROL = 'B62qUserCommandsFixtureCarol000000000000000000000000000';
const DAVE = 'B62qUserCommandsFixtureDaveHasNoCommands00000000000000';
const UNKNOWN = 'B62qUserCommandsFixtureNotInPublicKeys000000000000000';
const ALICE_ID = 920001;

const EVERYTHING = { from: 0, to: 100 };
const nullOptions = { tracingState: new TracingState(undefined as never) };

let client: postgres.Sql;
let service: UserCommandsService;

before(
  async () => {
    await setupTestDatabase();
    client = createTestClient();
    service = new UserCommandsService(client);
  },
  { timeout: 60000 }
);

after(async () => {
  await client?.end();
  await teardownTestDatabase();
});

const hashes = (rows: { hash: string }[]) => rows.map((row) => row.hash);
const id = (n: number) => `5JuUserCommandsFixture${n}`;

async function query(
  address: string,
  { from, to }: { from: number; to: number },
  status?: BlockStatusFilter
) {
  return service.getUserCommandData({ address, from, to, status }, nullOptions);
}

describe('userCommands: account roles', () => {
  test('fee payer, source and receiver all count, in chain order', async () => {
    // 920001 alice pays, 920003 carol delegates TO alice, 920004 alice's failed
    // payment, 920006 and 920007 on the pending chain. 920005 is orphaned.
    assert.deepStrictEqual(hashes(await query(ALICE, EVERYTHING)), [
      id(920001),
      id(920003),
      id(920004),
      id(920006),
      id(920007),
    ]);
  });

  test('a command where the account has several roles appears once', async () => {
    const rows = await query(ALICE, { from: 27, to: 28 });
    assert.deepStrictEqual(hashes(rows), [id(920007)]);
    assert.strictEqual(rows[0].feePayer, ALICE);
    assert.strictEqual(rows[0].from, ALICE);
    assert.strictEqual(rows[0].to, ALICE);
  });

  test('a receiver-only account sees the commands sent to it', async () => {
    assert.deepStrictEqual(hashes(await query(CAROL, EVERYTHING)), [
      id(920002),
      id(920003),
      id(920004),
    ]);
  });

  test('an orphaned block is never returned', async () => {
    // 920005 (bob -> alice) is only in orphaned block 37.
    assert.deepStrictEqual(hashes(await query(BOB, EVERYTHING)), [
      id(920001),
      id(920002),
      id(920006),
    ]);
  });

  test('a known key with no commands, and an unknown key, give []', async () => {
    assert.deepStrictEqual(await query(DAVE, EVERYTHING), []);
    assert.deepStrictEqual(await query(UNKNOWN, EVERYTHING), []);
  });
});

describe('userCommands: filters', () => {
  test('the block range is from-inclusive, to-exclusive', async () => {
    assert.deepStrictEqual(hashes(await query(ALICE, { from: 21, to: 26 })), [
      id(920003),
      id(920004),
    ]);
  });

  test('CANONICAL and PENDING split the result', async () => {
    assert.deepStrictEqual(
      hashes(await query(ALICE, EVERYTHING, BlockStatusFilter.canonical)),
      [id(920001), id(920003), id(920004)]
    );
    assert.deepStrictEqual(
      hashes(await query(ALICE, EVERYTHING, BlockStatusFilter.pending)),
      [id(920006), id(920007)]
    );
  });

  test('an invalid range is rejected', async () => {
    await assert.rejects(query(ALICE, { from: 10, to: 10 }), /greater than/);
    await assert.rejects(
      query(ALICE, { from: 0, to: 1_000_000 }),
      /block range is too large/
    );
  });

  test('the SQL applies the row limit it is given', async () => {
    const rows = await getUserCommandsQuery(
      client,
      ALICE_ID,
      EVERYTHING.from,
      EVERYTHING.to,
      BlockStatusFilter.all,
      2
    );
    assert.deepStrictEqual(
      rows.map((row) => row.hash),
      [id(920001), id(920003)]
    );
  });
});

describe('userCommands: fields', () => {
  test('a failed payment carries its status and reason', async () => {
    const [failed] = await query(ALICE, { from: 21, to: 22 }).then((rows) =>
      rows.filter((row) => row.hash === id(920004))
    );
    assert.deepStrictEqual(
      {
        kind: failed.kind,
        feePayer: failed.feePayer,
        from: failed.from,
        to: failed.to,
        amount: failed.amount,
        fee: failed.fee,
        nonce: failed.nonce,
        status: failed.status,
        failureReason: failed.failureReason,
        sequenceNumber: failed.sequenceNumber,
        height: failed.blockInfo.height,
        chainStatus: failed.blockInfo.chainStatus,
      },
      {
        kind: 'payment',
        feePayer: ALICE,
        from: ALICE,
        to: CAROL,
        amount: '3000000000',
        fee: '10000000',
        nonce: 1,
        status: 'failed',
        failureReason: 'Amount_insufficient_to_create_account',
        sequenceNumber: 1,
        height: 21,
        chainStatus: 'canonical',
      }
    );
  });

  test('a delegation has amount 0', async () => {
    const rows = await query(CAROL, { from: 21, to: 22 });
    const delegation = rows.find((row) => row.hash === id(920003));
    assert.strictEqual(delegation?.kind, 'delegation');
    assert.strictEqual(delegation?.amount, '0');
    assert.strictEqual(delegation?.to, ALICE);
  });
});

describe('userCommands: account indexes', () => {
  test('the startup check reports the indexes the archive lacks', async () => {
    const missing = await getMissingUserCommandIndexesQuery(client);
    assert.deepStrictEqual(
      missing.map((row) => row.name),
      [...USER_COMMAND_ACCOUNT_INDEXES]
    );
  });

  // Which index the planner takes depends on the archive's size: on this
  // 39-block fixture it starts from the block-height index, on a mainnet archive
  // from the account indexes (see getUserCommandsQuery). What must hold on any
  // archive is that the indexes are found and leave the result unchanged.
  test('with the indexes, the check passes and the result is the same', async () => {
    const before = hashes(await query(ALICE, EVERYTHING));
    await client.unsafe(`
      CREATE INDEX idx_user_commands_fee_payer_id ON user_commands(fee_payer_id);
      CREATE INDEX idx_user_commands_source_id ON user_commands(source_id);
      CREATE INDEX idx_user_commands_receiver_id ON user_commands(receiver_id);
      ANALYZE user_commands;
    `);
    const missing = await getMissingUserCommandIndexesQuery(client);
    assert.deepStrictEqual(
      missing.map((row) => row.name),
      []
    );
    assert.deepStrictEqual(hashes(await query(ALICE, EVERYTHING)), before);
  });
});
