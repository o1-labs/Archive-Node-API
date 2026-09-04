/**
 * Every recursive "walk back from the tip" CTE must anchor on the best chain's tip,
 * never on the table's global MAX(height).
 *
 * The distinction only matters after a hard fork, when the abandoned chain's blocks
 * sit above the new tip marked `orphaned` — which is exactly when nothing in the
 * integration fixture would notice. So this test renders each query through a
 * recording stand-in for the postgres client and inspects the SQL text itself.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert';
import type postgres from 'postgres';
import {
  BEST_CHAIN_TIP_HEIGHT_SQL,
  bestChainTipHeight,
} from '../../src/db/sql/best-chain.js';
import {
  getEventsQuery,
  getActionsQuery,
  getZkappsWithPendingEventsQuery,
  resolveActionStateBoundary,
} from '../../src/db/sql/events-actions/queries.js';
import { BlockStatusFilter } from '../../src/blockchain/types.js';

type Fragment = { strings: readonly string[]; values: unknown[] };

function isFragment(value: unknown): value is Fragment {
  return (
    typeof value === 'object' &&
    value !== null &&
    'strings' in value &&
    'values' in value
  );
}

/** Flatten a recorded tagged-template tree back into one SQL string. */
function render(fragment: Fragment): string {
  let out = '';
  fragment.strings.forEach((chunk, i) => {
    out += chunk;
    if (i < fragment.values.length) {
      const value = fragment.values[i];
      out += isFragment(value) ? render(value) : '$param';
    }
  });
  return out;
}

/** A postgres.Sql stand-in that records instead of executing. */
function recordingClient(): postgres.Sql {
  const tag = (strings: readonly string[], ...values: unknown[]): Fragment => ({
    strings,
    values,
  });
  (tag as unknown as { unsafe: (sql: string) => Fragment }).unsafe = (
    sql: string
  ) => ({ strings: [sql], values: [] });
  return tag as unknown as postgres.Sql;
}

const normalise = (sql: string) => sql.replace(/\s+/g, ' ').toLowerCase();
const GLOBAL_MAX = normalise('(SELECT MAX(height) FROM blocks)');
const BEST_TIP = normalise(BEST_CHAIN_TIP_HEIGHT_SQL);

describe('best-chain tip anchor', () => {
  test('the anchor excludes orphaned blocks', () => {
    assert.ok(BEST_TIP.includes("chain_status <> 'orphaned'"));
    const rendered = render(
      bestChainTipHeight(recordingClient()) as unknown as Fragment
    );
    assert.strictEqual(rendered, BEST_CHAIN_TIP_HEIGHT_SQL);
  });

  const cases: [string, (db: postgres.Sql) => unknown][] = [
    [
      'getEventsQuery',
      (db) => getEventsQuery(db, 'B62qaddr', '1', BlockStatusFilter.all),
    ],
    [
      'getEventsQuery with a block range',
      (db) =>
        getEventsQuery(db, 'B62qaddr', '1', BlockStatusFilter.all, '20', '10'),
    ],
    [
      'getActionsQuery',
      (db) => getActionsQuery(db, 'B62qaddr', '1', BlockStatusFilter.all),
    ],
    [
      'resolveActionStateBoundary',
      (db) => resolveActionStateBoundary(db, 'B62qaddr', '1', 'state'),
    ],
    [
      'getZkappsWithPendingEventsQuery',
      (db) => getZkappsWithPendingEventsQuery(db),
    ],
  ];

  for (const [name, build] of cases) {
    test(`${name} walks back from the best-chain tip, not the global max height`, () => {
      const sql = normalise(render(build(recordingClient()) as Fragment));
      assert.ok(
        sql.includes(BEST_TIP),
        `${name} must anchor on ${BEST_CHAIN_TIP_HEIGHT_SQL}`
      );
      assert.ok(
        !sql.includes(GLOBAL_MAX),
        `${name} still anchors on the global MAX(height), which is a dead block after a hard fork`
      );
    });
  }
});
