/**
 * Integration test setup: loads the sample archive DB dump into a test database.
 *
 * Requirements:
 * - PostgreSQL running on PG_TEST_HOST:PG_TEST_PORT (defaults: localhost:5432)
 * - A superuser PG_TEST_USER/PG_TEST_PASSWORD (defaults: postgres/postgres)
 * - The sample dump at ARCHIVE_DUMP_PATH (defaults: ~/work/minaprotocol/mina/src/test/archive/sample_db/archive_db.sql)
 *
 * The test database is created fresh for each test run and dropped afterward.
 */
import { execSync } from 'child_process';
import postgres from 'postgres';
import path from 'path';

const PG_TEST_HOST = process.env.PG_TEST_HOST ?? 'localhost';
const PG_TEST_PORT = process.env.PG_TEST_PORT ?? '5432';
const PG_TEST_USER = process.env.PG_TEST_USER ?? 'postgres';
const PG_TEST_PASSWORD = process.env.PG_TEST_PASSWORD ?? 'postgres';
const PG_TEST_DB = process.env.PG_TEST_DB ?? 'archive_node_api_test';

const DEFAULT_DUMP_PATH = path.resolve(process.cwd(), 'tests/integration/fixtures/archive_db.sql');
const ARCHIVE_DUMP_PATH = process.env.ARCHIVE_DUMP_PATH ?? DEFAULT_DUMP_PATH;

export const connectionString = `postgres://${PG_TEST_USER}:${PG_TEST_PASSWORD}@${PG_TEST_HOST}:${PG_TEST_PORT}/${PG_TEST_DB}`;

function adminConnectionString(db = 'postgres') {
  return `postgres://${PG_TEST_USER}:${PG_TEST_PASSWORD}@${PG_TEST_HOST}:${PG_TEST_PORT}/${db}`;
}

export async function setupTestDatabase(): Promise<void> {
  const admin = postgres(adminConnectionString(), { max: 1 });
  try {
    // Terminate existing connections and recreate
    await admin.unsafe(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${PG_TEST_DB}' AND pid <> pg_backend_pid()`
    );
    await admin.unsafe(`DROP DATABASE IF EXISTS ${PG_TEST_DB}`);
    await admin.unsafe(`CREATE DATABASE ${PG_TEST_DB}`);
  } finally {
    await admin.end();
  }

  // Load the dump
  execSync(
    `PGPASSWORD=${PG_TEST_PASSWORD} psql -h ${PG_TEST_HOST} -p ${PG_TEST_PORT} -U ${PG_TEST_USER} -d ${PG_TEST_DB} -f ${ARCHIVE_DUMP_PATH}`,
    { stdio: 'pipe' }
  );

  // Add a pending block so networkState query works (the dump only has canonical + orphaned)
  const db = postgres(connectionString, { max: 1 });
  try {
    await db.unsafe(`
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
        '3NKpending_test_state_hash_for_integration_tests',
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
        'pending'
      FROM blocks
      WHERE height = (SELECT max(height) FROM blocks)
      LIMIT 1
    `);
  } finally {
    await db.end();
  }
}

export async function teardownTestDatabase(): Promise<void> {
  const admin = postgres(adminConnectionString(), { max: 1 });
  try {
    await admin.unsafe(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${PG_TEST_DB}' AND pid <> pg_backend_pid()`
    );
    await admin.unsafe(`DROP DATABASE IF EXISTS ${PG_TEST_DB}`);
  } finally {
    await admin.end();
  }
}

export function createTestClient(): postgres.Sql {
  return postgres(connectionString, { max: 5 });
}
