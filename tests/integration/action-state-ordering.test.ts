/**
 * Regression tests for the `fromActionState` / `endActionState` filters.
 *
 * THE DEFECT
 * ----------
 * `getActionsQuery` filters on `zkapp_field.id`, the interning key of the
 * action-state value. That key records the order in which a value was first
 * written to the archive, NOT its position on the chain. When an archive is
 * filled out of chain order — a bulk import, a hard-fork migration, a bootstrap
 * — the two orders disagree, and the filter then silently removes real actions
 * from the answer, or returns actions from before the requested checkpoint.
 *
 * A client that folds an action state from the checkpoint (for example
 * `Reducer.getActions({ fromActionState })` in o1js) then computes a value that
 * can never match the chain, and every transaction it builds fails with
 * `Account_action_state_precondition_unsatisfied`.
 *
 * Measured on the mesa-rc-1 archive (dump of 2026-08-11): 1 271 damaged
 * checkpoints across 1 003 of 2 778 zkApp accounts.
 *
 * THE FIXTURE
 * -----------
 * `fixtures/action_state_order_inversion.sql` holds three zkApp accounts that
 * dispatch the same four actions in the same four blocks, and differ only in the
 * interning order of their action states:
 *
 *   inverted  id(S3) < id(S2) < id(S4) < id(S1)
 *   control   id(S1) < id(S2) < id(S3) < id(S4)   natural order
 *   adjacent  id(S1) < id(S3) < id(S2) < id(S4)   the shape seen in production
 *
 * `control` must pass both before and after the fix. It proves these tests fail
 * because of the interning order, and not because the expected behaviour of the
 * API changed.
 *
 * A local network writes blocks in chain order and therefore CANNOT reproduce
 * this defect. Do not replace this fixture with an end-to-end test.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import { ActionsService } from '../../src/services/actions-service/actions-service.js';
import { TracingState } from '../../src/tracing/tracer.js';
import { assertActionChainIsLinked, heightsOf } from '../test-helpers.js';
import {
  setupTestDatabase,
  teardownTestDatabase,
  createTestClient,
} from './action-state-setup.js';

type FixtureState = {
  label: string;
  value: string;
  height: number;
  actionData: string;
};
type FixtureAccount = {
  address: string;
  interningIds: number[];
  states: FixtureState[];
};
type Fixture = {
  accounts: Record<'inverted' | 'control' | 'adjacent', FixtureAccount>;
  actionBlockHeights: number[];
  anchorHeight: number;
  spacerHeight: number;
};

// Read at run time so the expected values can never drift from the generated
// fixture: both come from the same generator.
const fixture: Fixture = JSON.parse(
  readFileSync(
    path.resolve(process.cwd(), 'tests/integration/fixtures/action_state_order_inversion.json'),
    'utf8'
  )
);

const nullOptions = { tracingState: new TracingState(undefined as never) };
let client: postgres.Sql;
let actionsService: ActionsService;

before(async () => {
  await setupTestDatabase();
  client = createTestClient();
  actionsService = new ActionsService(client);
});

after(async () => {
  await client?.end();
  await teardownTestDatabase();
});

const ACCOUNT_KEYS = ['inverted', 'control', 'adjacent'] as const;

describe('Actions: unfiltered baseline', () => {
  for (const key of ACCOUNT_KEYS) {
    test(`${key}: returns all four actions, correctly linked`, async () => {
      const account = fixture.accounts[key];
      const actions = await actionsService.getActions(
        { address: account.address },
        nullOptions
      );
      assert.deepStrictEqual(
        heightsOf(actions),
        fixture.actionBlockHeights,
        'the unfiltered query must return every action block'
      );
      assertActionChainIsLinked(actions, `${key} unfiltered`);
    });
  }
});

describe('Actions: fromActionState must return exactly the suffix from the checkpoint', () => {
  // The differential property: for every action state X of an account, the
  // answer to `fromActionState: X` must be the tail of the unfiltered list that
  // starts at X. The checkpoint entry itself is included — clients (o1js
  // `createActionsList`) discard it by comparing `actionStateOne` with the
  // requested value, so removing it here would break them.
  for (const key of ACCOUNT_KEYS) {
    const account = fixture.accounts[key];
    for (const [index, state] of account.states.entries()) {
      const expectedHeights = fixture.actionBlockHeights.slice(index);
      test(`${key}: fromActionState = ${state.label} (block ${state.height}) returns blocks [${expectedHeights}]`, async () => {
        const actions = await actionsService.getActions(
          { address: account.address, fromActionState: state.value },
          nullOptions
        );
        assert.deepStrictEqual(
          heightsOf(actions),
          expectedHeights,
          `interning ids for ${key} are [${account.interningIds}]; ` +
            `an answer that differs here means the filter used the interning order, not the chain order`
        );
        assert.strictEqual(
          actions[0].actionState.actionStateOne,
          state.value,
          'the first entry must be the checkpoint itself, which clients strip'
        );
        assertActionChainIsLinked(actions, `${key} fromActionState=${state.label}`);
      });
    }
  }
});

describe('Actions: fromActionState must never return actions from before the checkpoint', () => {
  for (const key of ACCOUNT_KEYS) {
    const account = fixture.accounts[key];
    for (const state of account.states) {
      test(`${key}: fromActionState = ${state.label} returns nothing below height ${state.height}`, async () => {
        const actions = await actionsService.getActions(
          { address: account.address, fromActionState: state.value },
          nullOptions
        );
        const tooEarly = heightsOf(actions).filter((h) => h < state.height);
        assert.deepStrictEqual(
          tooEarly,
          [],
          `blocks ${tooEarly} are older than the checkpoint at height ${state.height}`
        );
      });
    }
  }
});

describe('Actions: the production symptom, pinned', () => {
  // This is the exact shape measured on mesa-rc-1: the checkpoint's interning id
  // is one HIGHER than the id of the action that follows it, so that one action
  // — and only that one — disappears.
  test('adjacent: the action that follows the checkpoint is not dropped', async () => {
    const account = fixture.accounts.adjacent;
    const checkpoint = account.states[1]; // S2, block 28
    const dropped = account.states[2]; // S3, block 29
    assert.ok(
      account.interningIds[2] < account.interningIds[1],
      'fixture precondition: the next action must have the LOWER interning id'
    );

    const actions = await actionsService.getActions(
      { address: account.address, fromActionState: checkpoint.value },
      nullOptions
    );
    assert.ok(
      heightsOf(actions).includes(dropped.height),
      `block ${dropped.height} is missing; returned [${heightsOf(actions)}]`
    );
    assertActionChainIsLinked(actions, 'adjacent production symptom');
  });
});

describe('Actions: endActionState', () => {
  for (const key of ACCOUNT_KEYS) {
    const account = fixture.accounts[key];
    test(`${key}: endActionState = S3 stops at block ${account.states[2].height}`, async () => {
      const actions = await actionsService.getActions(
        { address: account.address, endActionState: account.states[2].value },
        nullOptions
      );
      assert.deepStrictEqual(
        heightsOf(actions),
        fixture.actionBlockHeights.slice(0, 3),
        'endActionState must cut the list at the checkpoint, using the chain order'
      );
      assertActionChainIsLinked(actions, `${key} endActionState=S3`);
    });
  }
});

describe('Actions: the action state must belong to the requested account', () => {
  test('an action state of a different account is rejected', async () => {
    // The old `checkActionState` only asked whether the value existed anywhere
    // in `zkapp_field`. It did not check the account, so the server answered
    // with data that had no relation to the request.
    await assert.rejects(
      () =>
        actionsService.getActions(
          {
            address: fixture.accounts.inverted.address,
            fromActionState: fixture.accounts.control.states[1].value,
          },
          nullOptions
        ),
      (err: { extensions?: { code?: string } }) => {
        assert.strictEqual(err.extensions?.code, 'ACTION_STATE_NOT_FOUND');
        return true;
      }
    );
  });

  test('a field value that is not an action state is rejected', async () => {
    // Action *data*, not an action state. It exists in `zkapp_field`, so the
    // current existence check accepts it.
    await assert.rejects(
      () =>
        actionsService.getActions(
          {
            address: fixture.accounts.inverted.address,
            fromActionState: fixture.accounts.inverted.states[0].actionData,
          },
          nullOptions
        ),
      (err: { extensions?: { code?: string } }) => {
        assert.strictEqual(err.extensions?.code, 'ACTION_STATE_NOT_FOUND');
        return true;
      }
    );
  });

});

describe('Actions: a checkpoint below the queried block range', () => {
  // Being below the window does not by itself make the answer wrong. What
  // matters is whether the account emitted actions between the checkpoint and
  // the start of the window. Only then is the answer incomplete.

  test('is rejected when actions were emitted in between', async () => {
    const account = fixture.accounts.control;
    // Checkpoint S1 is at block 27, the window starts at 29, and the action in
    // block 28 falls in the gap. Any list we could return would be missing it.
    await assert.rejects(
      () =>
        actionsService.getActions(
          {
            address: account.address,
            fromActionState: account.states[0].value,
            from: 29,
            to: 31,
          },
          nullOptions
        ),
      (err: { extensions?: { code?: string }; message?: string }) => {
        assert.strictEqual(err.extensions?.code, 'ACTION_STATE_OUT_OF_RANGE');
        assert.match(
          String(err.message),
          /from: 27/,
          'the error must name the `from` value that makes the query answerable'
        );
        return true;
      }
    );
  });

  test('is answered normally when nothing was emitted in between', async () => {
    const account = fixture.accounts.control;
    // Checkpoint S1 is at block 27 and the window starts at 28. Nothing lies
    // strictly between them, so every action in the window is the complete
    // answer. Rejecting here would break the common case of a quiet zkApp
    // folding from its genesis action state — the default o1js path, since o1js
    // sends no from/to.
    const actions = await actionsService.getActions(
      {
        address: account.address,
        fromActionState: account.states[0].value,
        from: 28,
        to: 31,
      },
      nullOptions
    );
    assert.deepStrictEqual(heightsOf(actions), [28, 29, 30]);
    assertActionChainIsLinked(actions, 'checkpoint below window, nothing missed');
  });

  test('endActionState below the range is rejected, with no such exception', async () => {
    // `endActionState` bounds the request from above, so a checkpoint below the
    // window puts the whole requested span below the window. An empty answer
    // would be silently wrong.
    const account = fixture.accounts.control;
    await assert.rejects(
      () =>
        actionsService.getActions(
          {
            address: account.address,
            endActionState: account.states[0].value, // block 27
            from: 29,
            to: 31,
          },
          nullOptions
        ),
      (err: { extensions?: { code?: string } }) => {
        assert.strictEqual(err.extensions?.code, 'ACTION_STATE_OUT_OF_RANGE');
        return true;
      }
    );
  });
});
