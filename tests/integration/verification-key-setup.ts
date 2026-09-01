/**
 * Setup for the verification-key update tests.
 *
 * These tests use their OWN database, separate from `setup.ts`. The fixture adds
 * seven blocks on top of the base dump, and two of them are competing pending
 * tips at the same height. That changes the maximum block height, the canonical
 * block count and the pending chain — values the other integration tests assert
 * on. Keeping the databases separate lets each suite keep exact expectations.
 * This mirrors `action-state-setup.ts`.
 *
 * Requirements are the same as `setup.ts`: a local PostgreSQL and the two
 * fixtures under `tests/integration/fixtures/`.
 */
import { execSync } from 'child_process';
import postgres from 'postgres';
import path from 'path';

const PG_TEST_HOST = process.env.PG_TEST_HOST ?? 'localhost';
const PG_TEST_PORT = process.env.PG_TEST_PORT ?? '5432';
const PG_TEST_USER = process.env.PG_TEST_USER ?? 'postgres';
const PG_TEST_PASSWORD = process.env.PG_TEST_PASSWORD ?? 'postgres';
const PG_TEST_DB =
  process.env.PG_VERIFICATION_KEY_TEST_DB ??
  'archive_node_api_verification_key_test';

const FIXTURE_DIR = path.resolve(process.cwd(), 'tests/integration/fixtures');
const BASE_DUMP =
  process.env.ARCHIVE_DUMP_PATH ?? path.join(FIXTURE_DIR, 'archive_db.sql');
const VERIFICATION_KEY_FIXTURE = path.join(
  FIXTURE_DIR,
  'verification_key_updates.sql'
);

export const connectionString = `postgres://${PG_TEST_USER}:${PG_TEST_PASSWORD}@${PG_TEST_HOST}:${PG_TEST_PORT}/${PG_TEST_DB}`;

function adminConnectionString(db = 'postgres') {
  return `postgres://${PG_TEST_USER}:${PG_TEST_PASSWORD}@${PG_TEST_HOST}:${PG_TEST_PORT}/${db}`;
}

function applySqlFile(file: string, { stopOnError }: { stopOnError: boolean }) {
  execSync(
    `PGPASSWORD=${PG_TEST_PASSWORD} psql ${stopOnError ? '-v ON_ERROR_STOP=1' : ''} ` +
      `-h ${PG_TEST_HOST} -p ${PG_TEST_PORT} -U ${PG_TEST_USER} -d ${PG_TEST_DB} -f ${file}`,
    { stdio: 'pipe' }
  );
}

export async function setupTestDatabase(): Promise<void> {
  const admin = postgres(adminConnectionString(), { max: 1 });
  try {
    await admin.unsafe(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${PG_TEST_DB}' AND pid <> pg_backend_pid()`
    );
    await admin.unsafe(`DROP DATABASE IF EXISTS ${PG_TEST_DB}`);
    await admin.unsafe(`CREATE DATABASE ${PG_TEST_DB}`);
  } finally {
    await admin.end();
  }

  // The base dump emits a few benign notices, so it is not run with
  // ON_ERROR_STOP. The generated fixture must apply cleanly.
  applySqlFile(BASE_DUMP, { stopOnError: false });
  applySqlFile(VERIFICATION_KEY_FIXTURE, { stopOnError: true });
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
