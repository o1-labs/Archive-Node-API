/**
 * Action-state invariants, checked against a real archive dump.
 *
 * WHAT THIS IS FOR
 * ----------------
 * `tests/integration/action-state-ordering.test.ts` is the regression gate for
 * the `fromActionState` interning-order defect. It is deterministic, it runs on
 * every pull request, and it builds its own adversarial data.
 *
 * This suite has a different job: to check that the same rules hold on real
 * data, whose shapes a hand-made fixture does not model — many actions in one
 * block, many account updates in one transaction, pending and orphaned
 * branches, accounts with hundreds of action states, and archives assembled by
 * a real ingestion pipeline. It runs nightly, not per pull request.
 *
 * DESIGNED TO NEED NO MAINTENANCE
 * -------------------------------
 * The dump rotates every hour, so anything pinned to its contents would rot
 * within a day. Four rules keep this suite from needing upkeep:
 *
 * 1. No expected values. Every assertion is an invariant that the data implies
 *    about itself, so there is nothing to update when the dump changes. The
 *    unfiltered action list is the source of truth, and the filtered queries are
 *    compared against it.
 * 2. Subjects are discovered, never named. The suite asks the database which
 *    accounts are worth testing. No address, height or count is written down.
 *    Each account comes with the block window it is checked in: a query with
 *    no range covers only the last BLOCK_RANGE_SIZE blocks, and a chain can go
 *    longer than that without a single action.
 * 3. Finding nothing to test is a failure, not a pass. A suite that silently
 *    tests nothing is worse than no suite, because it reports success.
 * 4. A failure must be reproducible without the dump. Every message carries the
 *    address, the expected and actual block heights, and a GraphQL query that
 *    can be pasted into any endpoint.
 *
 * It works against any archive dump, not only devnet. Set DUMP_NETWORK=mainnet,
 * or point `ARCHIVE_DUMP_PATH` at a mainnet dump, and the same invariants apply.
 *
 * Tuning, for a slower or faster run:
 *   ACTION_STATE_SAMPLE_ACCOUNTS            accounts to check (default 25)
 *   ACTION_STATE_MAX_CHECKPOINTS_PER_ACCOUNT  checkpoints per account (default 12)
 */
import { describe, test } from 'node:test';
import assert from 'node:assert';
import type postgres from 'postgres';
import type { ActionsService } from '../../src/services/actions-service/actions-service.js';
import type { Actions } from '../../src/blockchain/types.js';
import { TracingState } from '../../src/tracing/tracer.js';
import { BLOCK_RANGE_SIZE } from '../../src/server/server.js';
import { assertActionChainIsLinked, heightsOf } from '../test-helpers.js';

const SAMPLE_ACCOUNTS = Number(process.env.ACTION_STATE_SAMPLE_ACCOUNTS ?? 25);
const MAX_CHECKPOINTS_PER_ACCOUNT = Number(
  process.env.ACTION_STATE_MAX_CHECKPOINTS_PER_ACCOUNT ?? 12
);

const nullOptions = { tracingState: new TracingState(undefined as never) };

type Context = { client: postgres.Sql; actionsService: ActionsService };

/**
 * An account to check, and the block window to check it in. Spread it into
 * every `getActions` input so that the reference list and the filtered lists
 * cover the same blocks.
 */
type Subject = { address: string; tokenId: string; from: number; to: number };

/** A GraphQL query that reproduces a failure against any endpoint. */
function reproductionQuery(
  subject: Subject,
  checkpoint?: string,
  argument: 'fromActionState' | 'endActionState' = 'fromActionState'
) {
  const filter = checkpoint ? `, ${argument}: "${checkpoint}"` : '';
  return (
    `{ actions(input: { address: "${subject.address}", tokenId: "${subject.tokenId}", ` +
    `from: ${subject.from}, to: ${subject.to}${filter} }) ` +
    `{ blockInfo { height } actionState { actionStateOne actionStateTwo } } }`
  );
}

/**
 * A compact description of how two height lists differ.
 *
 * Real accounts can have hundreds of action states, so printing both lists in
 * full makes a failure unreadable and hides the one block that matters. Report
 * the counts, the first point of divergence, and the blocks that are missing or
 * unexpected — that is what identifies the fault.
 */
function describeHeightDifference(expected: number[], actual: number[]) {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  const missing = expected.filter((h) => !actualSet.has(h));
  const extra = actual.filter((h) => !expectedSet.has(h));
  const firstDivergence = expected.findIndex((h, i) => actual[i] !== h);
  const sample = (heights: number[]) =>
    heights.length <= 8
      ? `[${heights.join(', ')}]`
      : `[${heights.slice(0, 8).join(', ')}, … +${heights.length - 8} more]`;

  return (
    `  entries    : expected ${expected.length}, got ${actual.length}\n` +
    `  diverges at: index ${firstDivergence} ` +
    `(expected block ${expected[firstDivergence]}, got ${actual[firstDivergence] ?? 'nothing'})\n` +
    `  missing    : ${missing.length ? sample(missing) : 'none'}\n` +
    `  unexpected : ${extra.length ? sample(extra) : 'none'}`
  );
}

/**
 * Accounts worth checking, most active first, each with its block window.
 *
 * Ordering is deterministic — never `ORDER BY random()` — so that a nightly
 * failure can be reproduced by re-running against the same dump. Accounts that
 * carry an interning-order inversion come first, because those are the ones the
 * old code answered incorrectly.
 *
 * Activity is counted in changes of the account's action state, not in blocks
 * that touched the account: a zkApp updated in thousands of blocks without
 * emitting an action has nothing to check.
 *
 * The window is BLOCK_RANGE_SIZE blocks, the most one query may span, starting
 * on one of the account's own action-state changes. Without it, the suite
 * checked only the last BLOCK_RANGE_SIZE blocks of the chain, and went vacuous
 * once devnet went that long without an action. An inverted account's window
 * starts on the change just before its first inversion that fits in one window
 * with it, so the inverted state is among the first checkpoints, inside
 * MAX_CHECKPOINTS_PER_ACCOUNT. Accounts are counted and ranked on the changes
 * inside their window, because that is all the suite will see of them.
 */
let discovered: Promise<Subject[]> | undefined;
function discoverAccounts(client: postgres.Sql): Promise<Subject[]> {
  // Memoised: every test in this suite wants the same sample, and the query
  // scans a large table on a real dump.
  discovered ??= runDiscovery(client);
  return discovered;
}

async function runDiscovery(client: postgres.Sql): Promise<Subject[]> {
  const rows = await client<
    { address: string; token_id: string; inverted: boolean; window_from: number }[]
  >`
    WITH account_states AS (
      SELECT
        aa.account_identifier_id AS acct,
        b.height,
        zks.element0 AS state_field_id
      FROM accounts_accessed aa
        JOIN blocks b ON b.id = aa.block_id
        JOIN zkapp_accounts za ON za.id = aa.zkapp_id
        JOIN zkapp_action_states zks ON zks.id = za.action_state_id
      WHERE b.chain_status = 'canonical'
      GROUP BY aa.account_identifier_id, b.height, zks.element0
    ),
    ordered AS (
      SELECT acct, height, state_field_id,
             lag(state_field_id) OVER (PARTITION BY acct ORDER BY height) AS prev
      FROM account_states
    ),
    changes AS (
      -- One row per block in which the account's action state changed. An
      -- inversion counts only if one window can hold it and the change before
      -- it; otherwise the window anchored there would see a single action.
      SELECT acct, height, previous_change,
             inverted AND height - coalesce(previous_change, height) < ${BLOCK_RANGE_SIZE}
               AS inverted
      FROM (
        SELECT acct, height,
               state_field_id < prev AS inverted,
               lag(height) OVER (PARTITION BY acct ORDER BY height) AS previous_change
        FROM ordered
        WHERE prev IS NOT NULL AND state_field_id <> prev
      ) AS all_changes
    ),
    anchored AS (
      SELECT acct,
             bool_or(inverted) AS inverted,
             -- previous_change grows with height, so the minimum over the
             -- inverted rows is the change before the first inversion.
             coalesce(
               min(coalesce(previous_change, height)) FILTER (WHERE inverted),
               min(height)
             ) AS window_from
      FROM changes
      GROUP BY acct
    ),
    summary AS (
      -- Count and rank on the changes inside the window, which is all the
      -- suite will see, not on the account's whole history.
      SELECT a.acct, a.inverted, a.window_from, count(*) AS changes_in_window
      FROM anchored a
        JOIN changes c ON c.acct = a.acct
          AND c.height >= a.window_from
          AND c.height < a.window_from + ${BLOCK_RANGE_SIZE}
      GROUP BY a.acct, a.inverted, a.window_from
      HAVING count(*) >= 2
    )
    -- postgres.js returns bigint as a string, and window_from + BLOCK_RANGE_SIZE
    -- must be arithmetic, not concatenation.
    SELECT pk.value AS address, t.value AS token_id, summary.inverted,
           summary.window_from::int AS window_from
    FROM summary
      JOIN account_identifiers ai ON ai.id = summary.acct
      JOIN public_keys pk ON pk.id = ai.public_key_id
      JOIN tokens t ON t.id = ai.token_id
    ORDER BY summary.inverted DESC, summary.changes_in_window DESC, pk.value ASC, t.value ASC
    LIMIT ${SAMPLE_ACCOUNTS}
  `;

  const inverted = rows.filter((r) => r.inverted).length;
  console.log(
    `  discovered ${rows.length} account(s) with >= 2 action-state changes in their window; ` +
      `${inverted} carry an interning-order inversion` +
      (inverted === 0
        ? ' (this dump cannot exercise the original defect — the fixture suite in tests/integration does)'
        : '')
  );
  const subjects = rows.map((r) => ({
    address: r.address,
    tokenId: r.token_id,
    from: r.window_from,
    to: r.window_from + BLOCK_RANGE_SIZE,
  }));
  for (const s of subjects) {
    console.log(`    ${s.address} blocks [${s.from}, ${s.to})`);
  }
  return subjects;
}

export function describeActionStateInvariants(getContext: () => Context) {
  // Shared across the suite so the last test can assert the run was not vacuous.
  const coverage = { discovered: 0, accounts: 0, checkpoints: 0, skippedCheckpoints: 0 };

  describe('Action-state invariants on real data', () => {
    test('filtering by fromActionState returns exactly the suffix from that checkpoint', async () => {
      const { client, actionsService } = getContext();
      const subjects = await discoverAccounts(client);
      coverage.discovered = subjects.length;

      for (const subject of subjects) {
        const { address } = subject;
        const started = Date.now();
        // The unfiltered list is the reference. It never sets fromActionState,
        // so it is not subject to the defect being guarded against.
        const unfiltered: Actions = await actionsService.getActions(subject, nullOptions);
        // One line per account, so that a slow or stuck run shows where it is.
        console.log(
          `    ${address}: ${unfiltered.length} action block(s) in ${Date.now() - started} ms`
        );
        if (unfiltered.length < 2) continue;
        coverage.accounts++;

        assertActionChainIsLinked(unfiltered, `${address} unfiltered`);
        const allHeights = heightsOf(unfiltered);

        const limit = Math.min(unfiltered.length, MAX_CHECKPOINTS_PER_ACCOUNT);
        coverage.skippedCheckpoints += unfiltered.length - limit;

        for (let i = 0; i < limit; i++) {
          const checkpoint = unfiltered[i].actionState.actionStateOne;
          const expected = allHeights.slice(i);
          coverage.checkpoints++;

          const filtered: Actions = await actionsService.getActions(
            { ...subject, fromActionState: checkpoint },
            nullOptions
          );

          assert.deepStrictEqual(
            heightsOf(filtered),
            expected,
            `fromActionState returned the wrong set of blocks.\n` +
              `  account    : ${address}\n` +
              `  checkpoint : ${checkpoint} (block ${expected[0]})\n` +
              describeHeightDifference(expected, heightsOf(filtered)) +
              `\n  reproduce  : ${reproductionQuery(subject, checkpoint)}`
          );
          assert.strictEqual(
            filtered[0].actionState.actionStateOne,
            checkpoint,
            `the first entry must be the checkpoint itself, which clients strip.\n` +
              `  reproduce: ${reproductionQuery(subject, checkpoint)}`
          );
          assertActionChainIsLinked(filtered, `${address} fromActionState=${checkpoint}`);
        }
        console.log(`      ${limit} checkpoint(s) checked in ${Date.now() - started} ms`);
      }

      if (coverage.skippedCheckpoints > 0) {
        // Never let a bound hide itself: a capped run must say what it did not check.
        console.log(
          `  checked ${coverage.checkpoints} checkpoint(s); skipped ${coverage.skippedCheckpoints} ` +
            `beyond the per-account cap of ${MAX_CHECKPOINTS_PER_ACCOUNT} ` +
            `(raise ACTION_STATE_MAX_CHECKPOINTS_PER_ACCOUNT to cover them)`
        );
      }
    });

    test('filtering by endActionState returns exactly the prefix up to that checkpoint', async () => {
      const { client, actionsService } = getContext();
      const subjects = await discoverAccounts(client);

      for (const subject of subjects.slice(0, Math.ceil(SAMPLE_ACCOUNTS / 2))) {
        const { address } = subject;
        const unfiltered: Actions = await actionsService.getActions(subject, nullOptions);
        if (unfiltered.length < 2) continue;
        const allHeights = heightsOf(unfiltered);

        const limit = Math.min(unfiltered.length, MAX_CHECKPOINTS_PER_ACCOUNT);
        for (let i = 0; i < limit; i++) {
          const checkpoint = unfiltered[i].actionState.actionStateOne;
          const expected = allHeights.slice(0, i + 1);

          const filtered: Actions = await actionsService.getActions(
            { ...subject, endActionState: checkpoint },
            nullOptions
          );

          assert.deepStrictEqual(
            heightsOf(filtered),
            expected,
            `endActionState returned the wrong set of blocks.\n` +
              `  account    : ${address}\n` +
              `  checkpoint : ${checkpoint} (block ${allHeights[i]})\n` +
              describeHeightDifference(expected, heightsOf(filtered)) +
              `\n  reproduce  : ${reproductionQuery(subject, checkpoint, 'endActionState')}`
          );
          assertActionChainIsLinked(filtered, `${address} endActionState=${checkpoint}`);
        }
      }
    });

    test('an action state of another account is rejected', async () => {
      const { client, actionsService } = getContext();
      const subjects = await discoverAccounts(client);

      // Find two accounts with action history, and use one's checkpoint on the
      // other. The old existence check accepted any value present anywhere in
      // zkapp_field, so it answered with unrelated data.
      const withHistory: { subject: Subject; checkpoint: string }[] = [];
      for (const subject of subjects) {
        const actions: Actions = await actionsService.getActions(subject, nullOptions);
        if (actions.length > 0) {
          withHistory.push({ subject, checkpoint: actions[0].actionState.actionStateOne });
        }
        if (withHistory.length === 2) break;
      }

      if (withHistory.length < 2) {
        console.log('  fewer than two accounts with action history; nothing to cross-check');
        return;
      }

      await assert.rejects(
        () =>
          actionsService.getActions(
            { ...withHistory[0].subject, fromActionState: withHistory[1].checkpoint },
            nullOptions
          ),
        (err: { extensions?: { code?: string } }) => {
          assert.strictEqual(
            err.extensions?.code,
            'ACTION_STATE_NOT_FOUND',
            `an action state belonging to ${withHistory[1].subject.address} must not be ` +
              `accepted for ${withHistory[0].subject.address}`
          );
          return true;
        }
      );
    });

    test('the run actually checked something', () => {
      // A suite that silently tests nothing is worse than no suite: it reports
      // success. If this fails, either the dump holds no zkApp action history or
      // discoverAccounts() no longer matches the schema. Both need a human.
      assert.ok(
        coverage.accounts > 0 && coverage.checkpoints > 0,
        `this suite proved nothing: ${coverage.accounts} account(s) and ` +
          `${coverage.checkpoints} checkpoint(s) were checked. Either the dump has no zkApp ` +
          `accounts with at least two action-state changes, or the discovery query in ` +
          `tests/archive-dump/action-state-invariants.ts no longer matches the archive schema. ` +
          `Point ARCHIVE_DUMP_PATH at a dump with zkApp activity, or fix the query.`
      );
      // Report against what was discovered, so that a drift between discovery
      // and the service shows here long before coverage reaches zero.
      console.log(
        `  covered ${coverage.accounts} of ${coverage.discovered} discovered account(s), ` +
          `${coverage.checkpoints} checkpoint(s)`
      );
    });
  });
}
