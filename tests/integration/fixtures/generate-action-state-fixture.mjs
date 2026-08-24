/**
 * Generates `action_state_order_inversion.sql`.
 *
 * WHY THIS FIXTURE EXISTS
 * -----------------------
 * `getActionsQuery` filters `fromActionState` / `endActionState` with
 *
 *     AND zkf0.id >= (SELECT id FROM zkapp_field WHERE field = <state>)
 *
 * `zkapp_field` is the interning table for every field value in the archive.
 * Its `id` records the order in which a value was FIRST WRITTEN, not the
 * position of that value on the chain. The filter above assumes the two orders
 * are the same. They are not: a bulk import (`mina-archive-blocks`, a hard-fork
 * archive migration, or a bootstrap) writes a de-duplicated set of new field
 * values and loses their block order.
 *
 * On the mesa-rc-1 archive (dump of 2026-08-11) this was measured: 1 271
 * inversions across 1 003 of 2 778 zkApp accounts. One of them silently removed
 * a real action from an `actions(fromActionState: …)` answer and made every
 * transaction of the affected zkApp fail with
 * `Account_action_state_precondition_unsatisfied`.
 *
 * A network that writes blocks in chain order CANNOT reproduce this. That is
 * why the fixture inverts the interning order on purpose, and why the fixture —
 * not a local-network end-to-end test — is the regression test for this defect.
 *
 * WHAT THE FIXTURE CONTAINS
 * -------------------------
 * Six new canonical blocks (heights 26…31) on top of the base `archive_db.sql`
 * fixture, and three zkApp accounts. Each account dispatches one action in each
 * of the blocks 27, 28, 29 and 30, so each account has four action states
 * S1→S2→S3→S4. The accounts differ ONLY in the interning order of those four
 * values:
 *
 *   inverted  id(S3) < id(S2) < id(S4) < id(S1)   strong inversion
 *   control   id(S1) < id(S2) < id(S3) < id(S4)   natural order, must always pass
 *   adjacent  id(S1) < id(S3) < id(S2) < id(S4)   S2/S3 swapped — the exact shape
 *                                                 measured on mesa-rc-1, where the
 *                                                 two ids were 491052 and 491051
 *
 * The `control` account is not decoration. It proves that the tests fail because
 * of the interning order and not because of a general change of behaviour.
 *
 * Blocks 26 and 31 hold no action. Block 31 keeps every action block away from
 * `distanceFromMaxBlockHeight === 0`, so `filterBestTip` never rewrites the
 * result and the tests stay deterministic.
 *
 * Run: node tests/integration/fixtures/generate-action-state-fixture.mjs
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

// ── Identifiers ──────────────────────────────────────────────────────────
// Everything this fixture inserts uses ids at or above 900000, so it can never
// collide with the base `archive_db.sql` fixture.
const ZERO_FIELD_ID = 1; // '0' already exists in the base fixture; zkapp_field.field is UNIQUE.
const SHARED_APP_STATE_ID = 900001;
const SHARED_ZKAPP_URI_ID = 900001;
const EMPTY_EVENTS_ID = 1; // zkapp_events row with element_ids = '{}', from the base fixture.

const ACTION_BLOCK_HEIGHTS = [27, 28, 29, 30];
const ANCHOR_HEIGHT = 26;
const SPACER_HEIGHT = 31;
const BLOCK_ID = (height) => 900000 + height;

/**
 * The interning ids of the four action states, per account. THIS IS THE POINT
 * OF THE FIXTURE — every other id in this file is arbitrary.
 */
const ACCOUNTS = [
  {
    key: 'inverted',
    address: 'B62qActionStateInvertedAccount00000000000000000000000',
    publicKeyId: 900001,
    accountIdentifierId: 900001,
    // id(S3) < id(S2) < id(S4) < id(S1)
    stateFieldIds: [900014, 900012, 900011, 900013],
  },
  {
    key: 'control',
    address: 'B62qActionStateControlAccount000000000000000000000000',
    publicKeyId: 900002,
    accountIdentifierId: 900002,
    // natural order
    stateFieldIds: [900021, 900022, 900023, 900024],
  },
  {
    key: 'adjacent',
    address: 'B62qActionStateAdjacentPairAccount0000000000000000000',
    publicKeyId: 900003,
    accountIdentifierId: 900003,
    // id(S1) < id(S3) < id(S2) < id(S4) — only the S2/S3 pair is swapped
    stateFieldIds: [900031, 900033, 900032, 900034],
  },
];

// Distinct decimal strings. `<account><state>` followed by zeros keeps them
// readable in test output and unique across the fixture.
const stateValue = (a, s) => `${a + 1}${s + 1}${'0'.repeat(62)}`;
const actionDataValue = (a, s) => `9${a + 1}${s + 1}${'0'.repeat(61)}`;
const actionDataFieldId = (a, s) => 900041 + a * 4 + s;
// One row per (account, action block) in each per-action table.
const rowId = (a, s) => 900100 + a * 4 + s;

// ── Emit ─────────────────────────────────────────────────────────────────
const out = [];
const say = (...lines) => out.push(...lines);

say(
  '-- GENERATED FILE — DO NOT EDIT BY HAND.',
  '-- Regenerate with: node tests/integration/fixtures/generate-action-state-fixture.mjs',
  '--',
  '-- Applied on top of archive_db.sql. See the generator for why this fixture',
  '-- inverts the zkapp_field interning order on purpose.',
  ''
);

say('-- Shared rows -------------------------------------------------------');
say(
  `INSERT INTO zkapp_states (id, ${Array.from({ length: 32 }, (_, i) => `element${i}`).join(', ')})`,
  `  VALUES (${SHARED_APP_STATE_ID}, ${Array(32).fill(ZERO_FIELD_ID).join(', ')});`,
  `INSERT INTO zkapp_uris (id, value) VALUES (${SHARED_ZKAPP_URI_ID}, '');`,
  ''
);

say('-- Accounts ----------------------------------------------------------');
for (const acct of ACCOUNTS) {
  say(
    `INSERT INTO public_keys (id, value) VALUES (${acct.publicKeyId}, '${acct.address}');`,
    `INSERT INTO account_identifiers (id, public_key_id, token_id)`,
    `  VALUES (${acct.accountIdentifierId}, ${acct.publicKeyId}, 1);`
  );
}
say('');

say('-- Action-state and action-data field values -------------------------');
say('-- The ids below are deliberately NOT in chain order for the `inverted`');
say('-- and `adjacent` accounts. That is what this fixture tests.');
for (const [a, acct] of ACCOUNTS.entries()) {
  for (let s = 0; s < 4; s++) {
    say(
      `INSERT INTO zkapp_field (id, field) VALUES (${acct.stateFieldIds[s]}, '${stateValue(a, s)}');` +
        `  -- ${acct.key} S${s + 1}, block ${ACTION_BLOCK_HEIGHTS[s]}`
    );
  }
}
for (const [a] of ACCOUNTS.entries()) {
  for (let s = 0; s < 4; s++) {
    say(
      `INSERT INTO zkapp_field (id, field) VALUES (${actionDataFieldId(a, s)}, '${actionDataValue(a, s)}');`
    );
  }
}
say('');

say('-- Blocks 26…31, canonical, chained onto the tip of the base fixture --');
const heights = [ANCHOR_HEIGHT, ...ACTION_BLOCK_HEIGHTS, SPACER_HEIGHT];
for (const [i, height] of heights.entries()) {
  const parent =
    i === 0
      ? `(SELECT id FROM blocks WHERE height = 25 AND chain_status = 'canonical' ORDER BY id LIMIT 1)`
      : `${BLOCK_ID(heights[i - 1])}`;
  say(
    `INSERT INTO blocks (id, state_hash, parent_id, parent_hash, creator_id, block_winner_id, last_vrf_output,`,
    `    snarked_ledger_hash_id, staking_epoch_data_id, next_epoch_data_id, min_window_density,`,
    `    sub_window_densities, total_currency, ledger_hash, height, global_slot_since_hard_fork,`,
    `    global_slot_since_genesis, protocol_version_id, proposed_protocol_version_id, timestamp, chain_status)`,
    `  SELECT ${BLOCK_ID(height)}, '3NActionStateFixtureBlock${height}', p.id, p.state_hash, p.creator_id,`,
    `    p.block_winner_id, p.last_vrf_output, p.snarked_ledger_hash_id, p.staking_epoch_data_id,`,
    `    p.next_epoch_data_id, p.min_window_density, p.sub_window_densities, p.total_currency, p.ledger_hash,`,
    `    ${height}, p.global_slot_since_hard_fork + 1, p.global_slot_since_genesis + 1, p.protocol_version_id,`,
    `    p.proposed_protocol_version_id, (p.timestamp::bigint + 180000)::text, 'canonical'`,
    `  FROM blocks p WHERE p.id = ${parent};`
  );
}
say('');

say('-- One action per account per block 27…30 ----------------------------');
for (const [a, acct] of ACCOUNTS.entries()) {
  for (const [s, height] of ACTION_BLOCK_HEIGHTS.entries()) {
    const id = rowId(a, s);
    const blockId = BLOCK_ID(height);
    // element1 of the action-state ring buffer is the PREVIOUS action state.
    // Keeping it correct is what makes the chain-link invariant
    // (actionStateOne[i] === actionStateTwo[i+1]) meaningful in the tests.
    const previousStateFieldId = s === 0 ? ZERO_FIELD_ID : acct.stateFieldIds[s - 1];
    say(
      `-- ${acct.key}: action ${s + 1} in block ${height} (state S${s + 1})`,
      `INSERT INTO zkapp_field_array (id, element_ids) VALUES (${id}, '{${actionDataFieldId(a, s)}}');`,
      `INSERT INTO zkapp_events (id, element_ids) VALUES (${id}, '{${id}}');`,
      `INSERT INTO zkapp_account_update_body (id, account_identifier_id, update_id, balance_change,`,
      `    increment_nonce, events_id, actions_id, call_data_id, call_depth, zkapp_network_precondition_id,`,
      `    zkapp_account_precondition_id, use_full_commitment, implicit_account_creation_fee, may_use_token,`,
      `    authorization_kind)`,
      `  VALUES (${id}, ${acct.accountIdentifierId}, 1, '0', false, ${EMPTY_EVENTS_ID}, ${id}, ${ZERO_FIELD_ID},`,
      `    0, 1, 1, false, false, 'No', 'Proof');`,
      `INSERT INTO zkapp_account_update (id, body_id) VALUES (${id}, ${id});`,
      `INSERT INTO zkapp_commands (id, zkapp_fee_payer_body_id, zkapp_account_updates_ids, memo, hash)`,
      `  VALUES (${id}, 1, '{${id}}', 'action-state-fixture', 'CkpZActionStateFixtureTx${id}');`,
      `INSERT INTO blocks_zkapp_commands (block_id, zkapp_command_id, sequence_no, status)`,
      `  VALUES (${blockId}, ${id}, ${a}, 'applied');`,
      `INSERT INTO zkapp_action_states (id, element0, element1, element2, element3, element4)`,
      `  VALUES (${id}, ${acct.stateFieldIds[s]}, ${previousStateFieldId}, ${ZERO_FIELD_ID}, ${ZERO_FIELD_ID}, ${ZERO_FIELD_ID});`,
      `INSERT INTO zkapp_accounts (id, app_state_id, verification_key_id, zkapp_version, action_state_id,`,
      `    last_action_slot, proved_state, zkapp_uri_id)`,
      `  VALUES (${id}, ${SHARED_APP_STATE_ID}, NULL, 1, ${id}, ${height}, true, ${SHARED_ZKAPP_URI_ID});`,
      `INSERT INTO accounts_accessed (ledger_index, block_id, account_identifier_id, token_symbol_id, balance,`,
      `    nonce, receipt_chain_hash, delegate_id, voting_for_id, timing_id, permissions_id, zkapp_id)`,
      `  VALUES (${id}, ${blockId}, ${acct.accountIdentifierId}, 1, '1000000000', 0,`,
      `    '2mzbV7WevxLuchs2dAMY4vQBS6XttnCUF8Hvks4XNBQ5qiSGGBQe', NULL, 1, 1, 1, ${id});`,
      ''
    );
  }
}

const target = join(here, 'action_state_order_inversion.sql');
writeFileSync(target, out.join('\n') + '\n');
console.log(`wrote ${target} (${out.length} lines)`);

// Also emit the machine-readable description the tests import, so the expected
// values can never drift from the fixture.
const meta = {
  accounts: Object.fromEntries(
    ACCOUNTS.map((acct, a) => [
      acct.key,
      {
        address: acct.address,
        interningIds: acct.stateFieldIds,
        states: acct.stateFieldIds.map((_, s) => ({
          label: `S${s + 1}`,
          value: stateValue(a, s),
          height: ACTION_BLOCK_HEIGHTS[s],
          actionData: actionDataValue(a, s),
        })),
      },
    ])
  ),
  actionBlockHeights: ACTION_BLOCK_HEIGHTS,
  anchorHeight: ANCHOR_HEIGHT,
  spacerHeight: SPACER_HEIGHT,
};
const metaTarget = join(here, 'action_state_order_inversion.json');
writeFileSync(metaTarget, JSON.stringify(meta, null, 2) + '\n');
console.log(`wrote ${metaTarget}`);
