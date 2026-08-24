/**
 * Integration coverage for the Postgres statement timeout (#165).
 *
 * The unit tests assert the shape of the options object; these assert the
 * behaviour that actually matters — that Postgres really does cancel a query
 * exceeding `statement_timeout`, and that the cancellation surfaces as a normal
 * error rather than a hang or a crash. That contract lives in the server's
 * startup parameters, so only a real connection can prove it.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert';
import postgres from 'postgres';
import { buildPostgresOptions } from '../../src/db/archive-node-adapter/postgres-options.js';
import {
  setupTestDatabase,
  teardownTestDatabase,
  connectionString,
} from './setup.js';

/** Postgres SQLSTATE for "canceling statement due to statement timeout". */
const QUERY_CANCELED = '57014';
const TEST_DATABASE = decodeURIComponent(
  new URL(connectionString).pathname.slice(1)
);

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function setDatabaseStatementTimeout(value: string): Promise<void> {
  const sql = postgres(connectionString, { max: 1 });
  try {
    await sql.unsafe(
      `ALTER DATABASE ${quoteIdentifier(
        TEST_DATABASE
      )} SET statement_timeout = ${quoteLiteral(value)}`
    );
  } finally {
    await sql.end();
  }
}

async function resetDatabaseStatementTimeout(): Promise<void> {
  const sql = postgres(connectionString, { max: 1 });
  try {
    await sql.unsafe(
      `ALTER DATABASE ${quoteIdentifier(TEST_DATABASE)} RESET statement_timeout`
    );
  } finally {
    await sql.end();
  }
}

describe('Postgres statement timeout', () => {
  before(async () => {
    await setupTestDatabase();
  });

  after(async () => {
    await teardownTestDatabase();
  });

  test('cancels a query that exceeds the timeout', async () => {
    // Built exactly as the adapter builds it, so the startup parameter path is
    // the one under test rather than a hand-rolled option.
    const sql = postgres(
      connectionString,
      buildPostgresOptions({ PG_STATEMENT_TIMEOUT: '200' })
    );
    try {
      await assert.rejects(
        () => sql`SELECT pg_sleep(1)`,
        (error: { code?: string }) => error.code === QUERY_CANCELED,
        'a query past statement_timeout should be cancelled by Postgres'
      );
    } finally {
      await sql.end();
    }
  });

  test('the connection stays usable after a cancellation', async () => {
    // The pool must survive a timeout: if a cancelled query poisoned its
    // connection, one slow client would degrade every later request.
    const sql = postgres(
      connectionString,
      buildPostgresOptions({ PG_STATEMENT_TIMEOUT: '200' })
    );
    try {
      await assert.rejects(() => sql`SELECT pg_sleep(1)`);
      const [row] = await sql<{ ok: number }[]>`SELECT 1 AS ok`;
      assert.strictEqual(row.ok, 1);
    } finally {
      await sql.end();
    }
  });

  test('a query inside the timeout is unaffected', async () => {
    const sql = postgres(
      connectionString,
      buildPostgresOptions({ PG_STATEMENT_TIMEOUT: '5000' })
    );
    try {
      const [row] = await sql<{ ok: number }[]>`SELECT 1 AS ok`;
      assert.strictEqual(row.ok, 1);
    } finally {
      await sql.end();
    }
  });

  test('PG_STATEMENT_TIMEOUT=0 disables the timeout', async () => {
    // The documented escape hatch for deployments with legitimately long
    // analytics queries — worth pinning, since it rests on Postgres treating 0
    // as "no limit" rather than "cancel immediately".
    const sql = postgres(
      connectionString,
      buildPostgresOptions({ PG_STATEMENT_TIMEOUT: '0' })
    );
    try {
      const [row] = await sql<{ ok: number }[]>`SELECT pg_sleep(0.3), 1 AS ok`;
      assert.strictEqual(row.ok, 1);
    } finally {
      await sql.end();
    }
  });

  test('PG_STATEMENT_TIMEOUT=0 sends an explicit session-level disable', async () => {
    await setDatabaseStatementTimeout('1s');
    const sql = postgres(
      connectionString,
      buildPostgresOptions({ PG_STATEMENT_TIMEOUT: '0' })
    );
    try {
      const [row] = await sql<
        { t: string }[]
      >`SELECT current_setting('statement_timeout') AS t`;
      assert.strictEqual(row.t, '0');
    } finally {
      await sql.end();
      await resetDatabaseStatementTimeout();
    }
  });
});
