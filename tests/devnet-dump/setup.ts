/**
 * Devnet dump test setup: downloads and loads a real devnet archive dump.
 *
 * Requirements:
 * - PostgreSQL running on PG_TEST_HOST:PG_TEST_PORT (defaults: localhost:5432)
 * - A superuser PG_TEST_USER/PG_TEST_PASSWORD (defaults: postgres/postgres)
 * - Internet access to download from GCS (or pre-downloaded dump at DEVNET_DUMP_PATH)
 *
 * The download script picks the second-newest hourly dump to avoid incomplete files.
 */
import { execSync } from 'child_process';
import postgres from 'postgres';
import path from 'path';
import fs from 'fs';

const PG_TEST_HOST = process.env.PG_TEST_HOST ?? 'localhost';
const PG_TEST_PORT = process.env.PG_TEST_PORT ?? '5432';
const PG_TEST_USER = process.env.PG_TEST_USER ?? 'postgres';
const PG_TEST_PASSWORD = process.env.PG_TEST_PASSWORD ?? 'postgres';
const PG_TEST_DB = process.env.PG_TEST_DB ?? 'devnet_dump_test';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DEFAULT_DUMP_PATH = path.join(DATA_DIR, 'devnet-archive.sql');
const DEVNET_DUMP_PATH = process.env.DEVNET_DUMP_PATH ?? DEFAULT_DUMP_PATH;

export const connectionString = `postgres://${PG_TEST_USER}:${PG_TEST_PASSWORD}@${PG_TEST_HOST}:${PG_TEST_PORT}/${PG_TEST_DB}`;

function adminConnectionString(db = 'postgres') {
  return `postgres://${PG_TEST_USER}:${PG_TEST_PASSWORD}@${PG_TEST_HOST}:${PG_TEST_PORT}/${db}`;
}

export async function downloadDump(): Promise<string> {
  if (fs.existsSync(DEVNET_DUMP_PATH)) {
    console.log(`Using existing dump at ${DEVNET_DUMP_PATH}`);
    return DEVNET_DUMP_PATH;
  }

  console.log('Downloading devnet archive dump (second-newest to avoid incomplete)...');
  const script = path.resolve(process.cwd(), 'scripts/download_devnet_dump.sh');
  execSync(`bash ${script} ${DATA_DIR}`, { stdio: 'inherit' });

  if (!fs.existsSync(DEVNET_DUMP_PATH)) {
    throw new Error(`Dump not found at ${DEVNET_DUMP_PATH} after download`);
  }
  return DEVNET_DUMP_PATH;
}

export async function setupTestDatabase(): Promise<void> {
  const dumpPath = await downloadDump();

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

  console.log(`Loading devnet dump into ${PG_TEST_DB}... (this may take a few minutes)`);
  execSync(
    `PGPASSWORD=${PG_TEST_PASSWORD} psql -h ${PG_TEST_HOST} -p ${PG_TEST_PORT} -U ${PG_TEST_USER} -d ${PG_TEST_DB} -f ${dumpPath}`,
    { stdio: 'pipe', timeout: 600000 }
  );
  console.log('Dump loaded successfully.');
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
