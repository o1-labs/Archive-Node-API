import assert from 'node:assert';
import type { Sql } from 'postgres';
import type { Actions } from '../src/blockchain/types.js';

/**
 * Asserts the action-state chain-link invariant on a list of actions returned
 * in block-height order:
 *
 *     actions[i].actionState.actionStateOne === actions[i + 1].actionState.actionStateTwo
 *
 * `actionStateTwo` is the account's action state BEFORE the action and
 * `actionStateOne` is the state AFTER it, so consecutive entries must link. If
 * the server drops an entry, duplicates one, or returns entries from before the
 * requested checkpoint, the link breaks.
 *
 * This is the general detector for the `fromActionState` interning-order defect
 * (see tests/integration/fixtures/generate-action-state-fixture.mjs). Prefer it
 * over hard-coded entry counts: it stays correct when a fixture changes and it
 * catches faults that a count cannot see.
 */
export function assertActionChainIsLinked(actions: Actions, context = 'actions') {
  const breaks: string[] = [];
  for (let i = 0; i + 1 < actions.length; i++) {
    if (
      actions[i].actionState.actionStateOne !==
      actions[i + 1].actionState.actionStateTwo
    ) {
      breaks.push(
        `between height ${actions[i].blockInfo.height} and ${actions[i + 1].blockInfo.height}`
      );
    }
  }
  assert.deepStrictEqual(
    breaks,
    [],
    `${context}: the action-state chain is broken ${breaks.join(', ')}. ` +
      `Heights returned: [${actions.map((a) => a.blockInfo.height).join(', ')}]`
  );
}

/** The block heights of a returned action list, in the order returned. */
export function heightsOf(actions: Actions): number[] {
  return actions.map((a) => a.blockInfo.height);
}

export function makeClient(): Sql<{}> {
  return {
    query: () => {},
    CLOSE: () => {},
    END: () => {},
    PostgresError: class {},
    options: {},
  } as unknown as Sql<{}>;
}
