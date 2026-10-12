/**
 * Setup for the userCommands tests.
 *
 * These tests use their OWN database, separate from `setup.ts`: the fixture
 * adds two pending blocks above the canonical tip, which changes the maximum
 * block height and the pending chain that the other suites assert on. This
 * mirrors `verification-key-setup.ts`.
 *
 * The base dump has no user_commands account indexes (archive schema before
 * 5.0.0). The tests create them where they need them.
 */
import { execSync } from 'child_process';
import postgres from 'postgres';
import path from 'path';

const PG_TEST_HOST = process.env.PG_TEST_HOST ?? 'localhost';
const PG_TEST_PORT = process.env.PG_TEST_PORT ?? '5432';
const PG_TEST_USER = process.env.PG_TEST_USER ?? 'postgres';
const PG_TEST_PASSWORD = process.env.PG_TEST_PASSWORD ?? 'postgres';
const PG_TEST_DB =
  process.env.PG_USER_COMMANDS_TEST_DB ?? 'archive_node_api_user_commands_test';

const FIXTURE_DIR = path.resolve(process.cwd(), 'tests/integration/fixtures');
const BASE_DUMP =
  process.env.ARCHIVE_DUMP_PATH ?? path.join(FIXTURE_DIR, 'archive_db.sql');
const USER_COMMANDS_FIXTURE = path.join(FIXTURE_DIR, 'user_commands.sql');

export const connectionString = `postgres://${PG_TEST_USER}:${PG_TEST_PASSWORD}@${PG_TEST_HOST}:${PG_TEST_PORT}/${PG_TEST_DB}`;

function adminConnectionString(db = 'postgres') {
  return `postgres://${PG_TEST_USER}:${PG_TEST_PASSWORD}@${PG_TEST_HOST}:${PG_TEST_PORT}/${db}`;
}

function applySqlFile(file: string, { stopOnError }: { stopOnError: boolean }) {
  execSync(
    `PGPASSWORD=${PG_TEST_PASSWORD} psql ${
      stopOnError ? '-v ON_ERROR_STOP=1' : ''
    } ` +
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

  // The checked-in base dump and the generated fixture must both apply
  // cleanly. A dump given through ARCHIVE_DUMP_PATH can come from another
  // Postgres version, so it is loaded leniently.
  applySqlFile(BASE_DUMP, {
    stopOnError: process.env.ARCHIVE_DUMP_PATH === undefined,
  });
  applySqlFile(USER_COMMANDS_FIXTURE, { stopOnError: true });
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
