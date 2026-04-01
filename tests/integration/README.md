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

Run the tests to verify everything still works. You may need to update expected values in `integration.test.ts` (e.g., block counts, max heights) if the data shape changed.

## What's tested

| Service | Tests | Notes |
|---|---|---|
| BlocksService | 13 | Sorting, filtering (height, date, canonical, inBestChain), limit, shape validation, coinbase |
| NetworkService | 2 | Max block heights for canonical and pending |
| EventsService | 5 | Empty results (no successful zkapp txs in dump), block range validation |
| ActionsService | 4 | Empty results, block range validation, action state validation |
| Schema | 1 | All required tables exist |

The current dump has no successful zkapp transactions, so events/actions queries return empty arrays. This still validates the full SQL query pipeline runs without errors. For richer event/action testing, regenerate the dump from a network that has successful zkapp deployments.
