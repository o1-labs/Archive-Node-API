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

/**
 * Database the tests read from. A `pg_dump --create` dump names its own, so
 * this is resolved from the dump at load time rather than fixed here.
 */
let targetDb = PG_TEST_DB;

export function getConnectionString(): string {
  return `postgres://${PG_TEST_USER}:${PG_TEST_PASSWORD}@${PG_TEST_HOST}:${PG_TEST_PORT}/${targetDb}`;
}

function adminConnectionString(db = 'postgres') {
  return `postgres://${PG_TEST_USER}:${PG_TEST_PASSWORD}@${PG_TEST_HOST}:${PG_TEST_PORT}/${db}`;
}

/**
 * Return the database a `pg_dump --create` dump creates and switches to, or
 * undefined for a plain dump.
 *
 * This matters because psql obeys the dump, not the `-d` flag: a `--create`
 * dump opens with `CREATE DATABASE archive` and `\connect archive`, so every
 * table lands in `archive` no matter which database psql was pointed at. psql
 * still exits 0, so the load looks fine and every later query fails with
 * `relation "blocks" does not exist`. The devnet dumps are of that shape.
 *
 * Only the header is read — these dumps are over a gigabyte.
 */
function databaseCreatedByDump(dumpPath: string): string | undefined {
  const fd = fs.openSync(dumpPath, 'r');
  try {
    const buffer = Buffer.alloc(64 * 1024);
    const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
    const header = buffer.subarray(0, bytesRead).toString('utf8');
    const connect = header.match(/^\\connect (\S+)/m);
    if (!connect) return undefined;

    const name = connect[1].replace(/^"(.*)"$/, '$1');
    // The dump is downloaded, so never interpolate a name we have not vetted
    // into DROP DATABASE.
    if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(name)) {
      throw new Error(
        `Dump header names a database this harness will not interpolate: ${connect[1]}`
      );
    }
    return name;
  } finally {
    fs.closeSync(fd);
  }
}

async function dropDatabase(db: string): Promise<void> {
  const admin = postgres(adminConnectionString(), { max: 1 });
  try {
    await admin.unsafe(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${db}' AND pid <> pg_backend_pid()`
    );
    await admin.unsafe(`DROP DATABASE IF EXISTS ${db}`);
  } finally {
    await admin.end();
  }
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

  // A `--create` dump brings its own database and ignores psql's `-d`; a plain
  // dump needs one made for it. Load into `postgres` in the first case so the
  // dump's own CREATE DATABASE runs against a connection it is not replacing.
  const dumpDb = databaseCreatedByDump(dumpPath);
  targetDb = dumpDb ?? PG_TEST_DB;
  const loadDb = dumpDb ? 'postgres' : PG_TEST_DB;

  await dropDatabase(targetDb);
  if (!dumpDb) {
    const admin = postgres(adminConnectionString(), { max: 1 });
    try {
      await admin.unsafe(`CREATE DATABASE ${PG_TEST_DB}`);
    } finally {
      await admin.end();
    }
  }

  const named = dumpDb ? ' (named by the dump)' : '';
  console.log(
    `Loading devnet dump into ${targetDb}${named}... (a few minutes)`
  );
  try {
    execSync(
      `PGPASSWORD=${PG_TEST_PASSWORD} psql -v ON_ERROR_STOP=1 -h ${PG_TEST_HOST} -p ${PG_TEST_PORT} -U ${PG_TEST_USER} -d ${loadDb} -f ${dumpPath}`,
      { stdio: 'pipe', timeout: 600000 }
    );
  } catch (error) {
    // Without this the loader swallowed psql's stderr and reported success,
    // which turned a failed load into a confusing `relation "blocks" does not
    // exist` in every test.
    const stderr = (error as { stderr?: Buffer }).stderr?.toString() ?? '';
    throw new Error(`Loading the devnet dump failed:\n${stderr.trim()}`);
  }

  // Prove the load landed where the tests will look, rather than trusting a
  // zero exit code.
  const check = postgres(getConnectionString(), { max: 1 });
  try {
    const [row] = await check`SELECT count(*)::int AS blocks FROM blocks`;
    if (!row || row.blocks === 0) {
      throw new Error(
        `Dump loaded into ${targetDb} but it holds no blocks — the dump may be truncated.`
      );
    }
    console.log(`Dump loaded: ${row.blocks} blocks in ${targetDb}.`);
  } finally {
    await check.end();
  }
}

export async function teardownTestDatabase(): Promise<void> {
  await dropDatabase(targetDb);
}

export function createTestClient(): postgres.Sql {
  return postgres(getConnectionString(), { max: 5 });
}
