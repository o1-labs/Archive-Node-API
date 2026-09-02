/**
 * Integration tests for the `verificationKeyUpdates` query.
 *
 * WHY THESE EXIST
 * ---------------
 * The base `archive_db.sql` fixture has 227 `blocks_zkapp_commands` rows and
 * every one of them has status `failed`. No input can make this query return a
 * row against it, so a test written on the base fixture can only assert the
 * empty list — and a query replaced by one that returns nothing at all leaves
 * the whole integration suite green.
 *
 * `fixtures/verification_key_updates.sql` adds blocks 26…32 with applied zkApp
 * commands that set verification keys, so these tests can tell a working query
 * from a broken one. See `generate-verification-key-fixture.mjs` for what each
 * account in the fixture proves.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import { VerificationKeyUpdatesService } from '../../src/services/verification-key-updates-service/verification-key-updates-service.js';
import { BlockStatusFilter } from '../../src/blockchain/types.js';
import { TracingState } from '../../src/tracing/tracer.js';
import {
  setupTestDatabase,
  teardownTestDatabase,
  createTestClient,
} from './verification-key-setup.js';

type Occurrence = {
  account: string;
  accountUpdateId: string;
  address: string;
  tokenId: string;
  height: number;
  stateHash: string;
  chainStatus: string;
  sequenceNumber: number;
  position: number;
  transactionHash: string;
  memo: string;
  authorizationKind: string;
};
type Fixture = {
  targetVerificationKeyHash: string;
  otherVerificationKeyHash: string;
  defaultTokenId: string;
  customTokenId: string;
  heights: {
    anchor: number;
    firstCommand: number;
    lastPending: number;
    afterAll: number;
  };
  expected: { canonical: Occurrence[]; pending: Occurrence[] };
  excluded: Record<string, string>;
  excludedAddresses: Record<string, string>;
};

// Read at run time so the expected values can never drift from the generated
// fixture: both come from the same generator.
const fixture: Fixture = JSON.parse(
  readFileSync(
    path.resolve(
      process.cwd(),
      'tests/integration/fixtures/verification_key_updates.json'
    ),
    'utf8'
  )
);

const nullOptions = { tracingState: new TracingState(undefined as never) };
const WHOLE_FIXTURE = {
  from: fixture.heights.anchor,
  to: fixture.heights.afterAll,
};

let client: postgres.Sql;
let service: VerificationKeyUpdatesService;

before(async () => {
  await setupTestDatabase();
  client = createTestClient();
  service = new VerificationKeyUpdatesService(client);
}, { timeout: 30000 });

after(async () => {
  await client?.end();
  await teardownTestDatabase();
});

/** The shape the tests compare on: everything the query claims to answer. */
function shapeOf(update: {
  accountUpdateId: string;
  address: string;
  tokenId: string;
  blockInfo: { height: number; stateHash: string; chainStatus: string };
  transactionInfo: {
    sequenceNumber: number;
    hash: string;
    memo: string;
    authorizationKind: string;
  };
}) {
  return {
    accountUpdateId: update.accountUpdateId,
    address: update.address,
    tokenId: update.tokenId,
    height: update.blockInfo.height,
    stateHash: update.blockInfo.stateHash,
    chainStatus: update.blockInfo.chainStatus,
    sequenceNumber: update.transactionInfo.sequenceNumber,
    transactionHash: update.transactionInfo.hash,
    memo: update.transactionInfo.memo,
    authorizationKind: update.transactionInfo.authorizationKind,
  };
}

function expectedShape(o: Occurrence) {
  return {
    accountUpdateId: o.accountUpdateId,
    address: o.address,
    tokenId: o.tokenId,
    height: o.height,
    stateHash: o.stateHash,
    chainStatus: o.chainStatus,
    sequenceNumber: o.sequenceNumber,
    transactionHash: o.transactionHash,
    memo: o.memo,
    authorizationKind: o.authorizationKind,
  };
}

const query = (input: Partial<Parameters<VerificationKeyUpdatesService['getVerificationKeyUpdates']>[0]> = {}) =>
  service.getVerificationKeyUpdates(
    {
      verificationKeyHash: fixture.targetVerificationKeyHash,
      ...WHOLE_FIXTURE,
      ...input,
    },
    nullOptions
  );

describe('verificationKeyUpdates (integration)', () => {
  test('returns every applied occurrence of the requested key', async () => {
    const updates = await query();

    assert.deepStrictEqual(
      updates.map(shapeOf),
      [...fixture.expected.canonical, ...fixture.expected.pending].map(
        expectedShape
      )
    );
  });

  test('carries the full block metadata for each occurrence', async () => {
    const [first] = await query({ status: BlockStatusFilter.canonical });

    assert.strictEqual(
      first.verificationKeyHash,
      fixture.targetVerificationKeyHash
    );
    // Everything BlockInfo promises must be present and of the right type, not
    // just the fields the ordering happens to depend on.
    assert.strictEqual(typeof first.blockInfo.parentHash, 'string');
    assert.strictEqual(typeof first.blockInfo.ledgerHash, 'string');
    assert.strictEqual(typeof first.blockInfo.timestamp, 'string');
    assert.strictEqual(typeof first.blockInfo.globalSlotSinceGenesis, 'number');
    assert.strictEqual(typeof first.blockInfo.globalSlotSinceHardfork, 'number');
    assert.strictEqual(typeof first.blockInfo.lastVrfOutput, 'string');
    assert.ok(
      first.blockInfo.distanceFromMaxBlockHeight > 0,
      'distanceFromMaxBlockHeight should be measured from the chain tip'
    );
    assert.strictEqual(first.transactionInfo.status, 'applied');
    assert.ok(Array.isArray(first.transactionInfo.zkappAccountUpdateIds));
  });

  test('reads the token of the account, not the default token', async () => {
    const updates = await query({ status: BlockStatusFilter.canonical });
    const tokens = updates.map((u) => u.tokenId);

    assert.ok(
      tokens.includes(fixture.customTokenId),
      'an account on a custom token must report that token'
    );
    assert.ok(tokens.includes(fixture.defaultTokenId));
  });

  // ─── What must NOT come back ───────────────────────────────────────

  test('excludes a different verification key, a failed command, a precondition-only update, and an orphaned block', async () => {
    const addresses = new Set((await query()).map((u) => u.address));

    for (const [account, reason] of Object.entries(fixture.excluded)) {
      assert.ok(
        !addresses.has(fixture.excludedAddresses[account]),
        `${account} must be excluded: ${reason}`
      );
    }
  });

  test('a verification-key precondition is not a verification-key update', async () => {
    // The archive names a verification key in two places on an account update:
    // update_id -> zkapp_updates.verification_key_id is the key the update SETS,
    // and verification_key_hash_id is the key it REQUIRES. `eta` has the target
    // hash only in the second, so a query that reads the wrong column returns it.
    const addresses = (await query()).map((u) => u.address);

    assert.ok(!addresses.includes(fixture.excludedAddresses.eta));
  });

  test('the hash filter selects, it does not just exclude', async () => {
    // `beta` sets the other key in the same command as `alpha` and `gamma`.
    // Asking for the other key must return beta and nothing else — a query that
    // ignored the hash would return all three.
    const updates = await query({
      verificationKeyHash: fixture.otherVerificationKeyHash,
      status: BlockStatusFilter.canonical,
    });

    assert.deepStrictEqual(
      updates.map((u) => u.address),
      [fixture.excludedAddresses.beta]
    );
    assert.strictEqual(
      updates[0].verificationKeyHash,
      fixture.otherVerificationKeyHash
    );
  });

  test('returns nothing for a hash no account update ever set', async () => {
    const updates = await query({
      verificationKeyHash: 'not-a-verification-key-hash',
    });

    assert.deepStrictEqual(updates, []);
  });

  // ─── Chain status ──────────────────────────────────────────────────

  test('CANONICAL returns only canonical occurrences', async () => {
    const updates = await query({ status: BlockStatusFilter.canonical });

    assert.deepStrictEqual(
      updates.map(shapeOf),
      fixture.expected.canonical.map(expectedShape)
    );
    assert.ok(updates.every((u) => u.blockInfo.chainStatus === 'canonical'));
  });

  test('PENDING returns only occurrences on the best pending chain', async () => {
    const updates = await query({ status: BlockStatusFilter.pending });

    assert.deepStrictEqual(
      updates.map(shapeOf),
      fixture.expected.pending.map(expectedShape)
    );
    assert.ok(updates.every((u) => u.blockInfo.chainStatus === 'pending'));
  });

  test('ALL is the concatenation of canonical and pending, and is the default', async () => {
    const explicit = await query({ status: BlockStatusFilter.all });
    const defaulted = await query();

    assert.deepStrictEqual(defaulted.map(shapeOf), explicit.map(shapeOf));
    assert.strictEqual(
      explicit.length,
      fixture.expected.canonical.length + fixture.expected.pending.length
    );
  });

  // ─── Ordering ──────────────────────────────────────────────────────

  test('orders competing tips at the same height deterministically', async () => {
    // Both pending tips at the maximum height carry the SAME command, so their
    // rows agree on height, sequence_no, account-update position and
    // zkapp_account_update.id. Only the block separates them. Without a total
    // order the two rows come back in whatever order the plan produced.
    const atTip = (await query({ status: BlockStatusFilter.pending })).filter(
      (u) => u.blockInfo.height === fixture.heights.lastPending
    );

    assert.ok(atTip.length >= 2, 'fixture must have two competing tips');
    const hashes = atTip.map((u) => u.blockInfo.stateHash);
    assert.deepStrictEqual(
      hashes,
      [...hashes].sort(),
      'occurrences at one height must be ordered by state hash'
    );
  });

  test('repeats the same order on every run', async () => {
    const runs = await Promise.all([query(), query(), query(), query()]);
    const first = JSON.stringify(runs[0].map(shapeOf));

    for (const run of runs.slice(1)) {
      assert.strictEqual(JSON.stringify(run.map(shapeOf)), first);
    }
  });

  test('orders account updates inside one command by their position', async () => {
    // alpha is at position 1 and gamma at position 3 of the same command, with
    // beta between them setting a different key. The gap must not reorder them.
    const inFirstBlock = (
      await query({ status: BlockStatusFilter.canonical })
    ).filter((u) => u.blockInfo.height === fixture.heights.firstCommand);

    assert.deepStrictEqual(
      inFirstBlock.map((u) => u.address),
      fixture.expected.canonical
        .filter((o) => o.height === fixture.heights.firstCommand)
        .map((o) => o.address)
    );
  });

  // ─── Block range ───────────────────────────────────────────────────

  test('from is inclusive and to is exclusive', async () => {
    const height = fixture.heights.firstCommand;
    const inRange = await query({ from: height, to: height + 1 });
    assert.ok(inRange.length > 0);
    assert.ok(inRange.every((u) => u.blockInfo.height === height));

    const next = await query({ from: height + 1, to: height + 2 });
    assert.ok(next.every((u) => u.blockInfo.height === height + 1));
    assert.ok(
      !next.some((u) => u.blockInfo.height === height),
      'the from bound must exclude everything below it'
    );
  });

  test('rejects an empty range before it reaches the database', async () => {
    const height = fixture.heights.firstCommand;

    await assert.rejects(query({ from: height, to: height }), (error: Error) => {
      assert.match(error.message, /to must be greater than from/);
      return true;
    });
  });
});
