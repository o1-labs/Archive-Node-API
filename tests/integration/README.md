# Integration Tests

These tests run actual SQL queries against a real PostgreSQL database loaded with a static archive node dump.

## Prerequisites

- PostgreSQL running locally (default: `localhost:5432`, user `postgres`, password `postgres`)
- The dump fixture at `tests/integration/fixtures/archive_db.sql`

## Running

```bash
# Using defaults (localhost:5432, postgres/postgres)
npm run test:integration

# Custom postgres connection
PG_TEST_HOST=localhost PG_TEST_PORT=5433 PG_TEST_USER=postgres PG_TEST_PASSWORD=postgres npm run test:integration

# Custom dump path
ARCHIVE_DUMP_PATH=/path/to/archive_db.sql npm run test:integration
```

The test setup automatically:
1. Creates a fresh `archive_node_api_test` database
2. Loads the dump
3. Inserts a synthetic pending block (the dump only has canonical + orphaned)
4. Runs all tests
5. Drops the database on teardown

## Updating the dump

The fixture at `tests/integration/fixtures/archive_db.sql` comes from the mina repo's sample archive database. To regenerate it with fresh data:

### Option A: Copy from mina repo

```bash
cp ~/work/minaprotocol/mina/src/test/archive/sample_db/archive_db.sql tests/integration/fixtures/
```

### Option B: Generate from a local network

1. Start a local mina network with archive and zkapp transactions:
   ```bash
   cd /path/to/mina
   ./scripts/mina-local-network/mina-local-network.sh -a -r -pu postgres -ppw postgres -zt -vt
   ```
   Flags: `-a` archive, `-r` clean start, `-zt` zkapp txs, `-vt` value transfers

2. Wait for at least 10 canonical blocks (or use the canonical conversion script):
   ```bash
   ./src/test/archive/sample_db/convert_chain_to_canonical.sh \
     postgres://postgres:postgres@localhost:5432/archive \
     '<target_state_hash>'
   ```

3. Dump the database:
   ```bash
   pg_dump -U postgres -d archive > tests/integration/fixtures/archive_db.sql
   ```

### After updating the dump

A regenerated dump does not contain the **SDK integration coverage** block. That
block is appended by hand at the end of the old `archive_db.sql`, after the
`PostgreSQL database dump complete` line. It adds one applied zkApp command with
events, actions and a verification-key update, which this suite and the SDK
integration suites read. Copy the block from the old file to the end of the new
one before you commit. Without it, the `Base fixture zkApp coverage` tests in
`integration.test.ts` fail, and the SDK suites skip their events, actions and
verification-key tests.

Then run the tests to verify everything still works. The suites load the
checked-in dump with `ON_ERROR_STOP=1`, so a statement in the appended block
that does not apply to the new schema fails the setup. You may need to update expected values in `integration.test.ts` (e.g., block counts, max heights) if the data shape changed.

## What's tested

| Service | Tests | Notes |
|---|---|---|
| BlocksService | 13 | Sorting, filtering (height, date, canonical, inBestChain), limit, shape validation, coinbase |
| NetworkService | 2 | Max block heights for canonical and pending |
| EventsService | 5 | Empty results for addresses without events, block range validation |
| ActionsService | 4 | Empty results, block range validation, action state validation |
| Base fixture zkApp coverage | 4 | Events `[0,1]`, actions `[2,3]` and a verification-key update at height 25 for the SDK fixture address, and the applied command in `blocks` |
| Schema | 1 | All required tables exist |

The dump from the mina repo has no successful zkapp transactions. Its 227 zkapp commands all have status `failed`, so events/actions queries for those addresses return empty arrays. The **SDK integration coverage** block at the end of the dump adds one applied command at height 25, for `B62qiaEMrWiYdK7LcJ2ScdMyG8LzUxi7yaw17XvBD34on7UKfhAkRML`. It carries one event (`[0,1]`), one action (`[2,3]`) and a verification-key update. The `Base fixture zkApp coverage` tests assert on that data, so a broken or missing block fails this suite, not only the SDK suites.

## Action-state ordering tests

`action-state-ordering.test.ts` is a separate suite with its own database
(`archive_node_api_action_state_test`) and its own setup module
(`action-state-setup.ts`). It loads the base dump plus a generated fixture,
`fixtures/action_state_order_inversion.sql`. The database is separate because
the fixture adds six blocks, which would change the block counts and maximum
heights that `integration.test.ts` asserts on.

It exists because `getActionsQuery` filters `fromActionState` and
`endActionState` on `zkapp_field.id` — the *interning* key of the value, which
records when the value was first written, not where it sits on the chain. When
an archive is filled out of chain order (bulk import, hard-fork migration,
bootstrap), the two orders disagree, and the filter then silently drops real
actions or returns actions from before the checkpoint.

**A local network writes blocks in chain order and cannot reproduce this.** The
fixture therefore inverts the interning order on purpose. It holds three
accounts that dispatch identical actions in identical blocks and differ only in
that order:

| Account | Interning order | Purpose |
|---|---|---|
| `inverted` | id(S3) < id(S2) < id(S4) < id(S1) | strong inversion |
| `control` | id(S1) < id(S2) < id(S3) < id(S4) | natural order — **must pass before and after any fix** |
| `adjacent` | id(S1) < id(S3) < id(S2) < id(S4) | the exact shape measured on mesa-rc-1 |

The `control` account is what makes the suite trustworthy. If a change makes the
other two accounts pass by weakening the expectations, `control` fails as well.

The suite uses `assertActionChainIsLinked` from `tests/test-helpers.ts`. That
helper checks `actionStateOne[i] === actionStateTwo[i+1]` over the returned
list. Prefer it over fixed entry counts: it keeps working when the fixture
changes, and it finds drops, duplicates, and out-of-range entries alike.

### Regenerating the fixture

```bash
node tests/integration/fixtures/generate-action-state-fixture.mjs
```

This writes both `action_state_order_inversion.sql` and
`action_state_order_inversion.json`. The tests read the `.json` for their
expected values, so the fixture and the expectations cannot drift apart. Do not
edit either generated file by hand.
