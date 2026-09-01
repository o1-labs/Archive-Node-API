/**
 * Generates `verification_key_updates.sql`.
 *
 * WHY THIS FIXTURE EXISTS
 * -----------------------
 * The base `archive_db.sql` fixture has 227 `blocks_zkapp_commands` rows and
 * every one of them has status `failed`. It also holds exactly one
 * verification-key hash and one account update that sets a verification key.
 * No input can therefore make `getVerificationKeyUpdatesQuery` return a row
 * against the base fixture, and a test written on it can only ever assert the
 * empty list.
 *
 * That is not a theoretical gap. Replacing the query body with one that returns
 * nothing at all (`AND 1=0`) leaves the whole integration suite green. The base
 * fixture cannot tell a working query from a broken one.
 *
 * WHAT THE FIXTURE CONTAINS
 * -------------------------
 * Blocks 26…32 on top of the base fixture's canonical tip at height 25, and
 * eleven zkApp accounts. Each account exists to make exactly one distinction
 * observable:
 *
 *   height 27  canonical  one applied command, three account updates
 *     pos 1  ALPHA    sets TARGET                      -> returned
 *     pos 2  BETA     sets OTHER (a different hash)    -> filtered by hash
 *     pos 3  GAMMA    sets TARGET, on a CUSTOM token   -> returned, proves the
 *                                                         token join is real
 *
 *   height 28  canonical  two applied commands, to fix the sequence_no order
 *     seq 0  DELTA    sets TARGET                      -> returned
 *     seq 1  EPSILON  sets TARGET                      -> returned
 *
 *   height 29  canonical
 *     seq 0  ZETA     sets TARGET, command FAILED      -> excluded
 *     seq 1  ETA      TARGET as a verification-key
 *                     PRECONDITION only                -> excluded
 *
 *   height 30  canonical  spacer, no commands
 *   height 30  ORPHANED   THETA sets TARGET            -> excluded
 *   height 31  pending     IOTA sets TARGET            -> pending only
 *   height 32  pending fork A  KAPPA  sets TARGET      -> pending only
 *   height 32  pending fork B  LAMBDA sets TARGET      -> pending only
 *
 * ETA IS THE IMPORTANT ONE. The archive records a verification key that an
 * account update SETS in `zkapp_updates.verification_key_id`, reached through
 * `zkapp_account_update_body.update_id`. It records a verification key that an
 * account update merely REQUIRES in `zkapp_account_update_body.verification_key_hash_id`.
 * A query that reads the second column answers "who called this contract"
 * instead of "who deployed it" — for a widely used zkApp that is every caller,
 * not every deployment. ETA has the target hash in the precondition column and
 * a `zkapp_updates` row with `verification_key_id IS NULL`, so it is returned
 * only by the wrong query.
 *
 * THE TWO FORKS AT HEIGHT 32 are not decoration either. `pending_chain` seeds
 * from every block at the maximum pending height, so two competing tips are both
 * in the answer. Their rows share height, sequence_no and account-update
 * position, so they tie on every key the query originally ordered by, and the
 * order of the two rows was whatever the plan happened to produce.
 *
 * Run: node tests/integration/fixtures/generate-verification-key-fixture.mjs
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

// ── Identifiers ──────────────────────────────────────────────────────────
// Everything this fixture inserts uses ids at or above 910000, so it can never
// collide with the base `archive_db.sql` fixture (max id 243) nor with
// `action_state_order_inversion.sql` (900000…900999).
const BASE_CANONICAL_TIP_HEIGHT = 25;

const DEFAULT_TOKEN_ID = 1; // wSHV2S4… , from the base fixture.
const CUSTOM_TOKEN_ID = 910001;
const CUSTOM_TOKEN_VALUE = 'wZZZVkFixtureCustomToken00000000000000000000000000';

const ZERO_FIELD_ID = 1; // zkapp_field '0', from the base fixture.
const EMPTY_EVENTS_ID = 1; // zkapp_events with element_ids '{}', from the base fixture.
const NO_UPDATE_ID = 1; // zkapp_updates row with verification_key_id IS NULL.
const FEE_PAYER_BODY_ID = 1; // zkapp_fee_payer_body, from the base fixture.

// The two verification keys this fixture can set.
const TARGET = {
  hashId: 910001,
  keyId: 910001,
  hash: '910000000000000000000000000000000000000000000000000000000000000001',
  key: 'AAVkFixtureTargetVerificationKeyBlob',
};
const OTHER = {
  hashId: 910002,
  keyId: 910002,
  hash: '910000000000000000000000000000000000000000000000000000000000000002',
  key: 'AAVkFixtureOtherVerificationKeyBlob',
};

// `zkapp_updates` rows: one per verification key this fixture sets.
const SET_TARGET_UPDATE_ID = 910001;
const SET_OTHER_UPDATE_ID = 910002;

const BLOCK = {
  anchor26: { id: 910026, height: 26, status: 'canonical', hash: '3NVkFixtureBlock26' },
  h27: { id: 910027, height: 27, status: 'canonical', hash: '3NVkFixtureBlock27' },
  h28: { id: 910028, height: 28, status: 'canonical', hash: '3NVkFixtureBlock28' },
  h29: { id: 910029, height: 29, status: 'canonical', hash: '3NVkFixtureBlock29' },
  h30: { id: 910030, height: 30, status: 'canonical', hash: '3NVkFixtureBlock30' },
  h30orphan: { id: 910130, height: 30, status: 'orphaned', hash: '3NVkFixtureBlock30Orphaned' },
  h31pending: { id: 910031, height: 31, status: 'pending', hash: '3NVkFixtureBlock31Pending' },
  h32forkA: { id: 910032, height: 32, status: 'pending', hash: '3NVkFixtureBlock32ForkA' },
  h32forkB: { id: 910132, height: 32, status: 'pending', hash: '3NVkFixtureBlock32ForkB' },
};

/**
 * Every account this fixture creates. `sets` names the verification key the
 * account update writes, or `null` when the update writes none — the case that
 * separates a real deployment from a verification-key precondition.
 */
const ACCOUNTS = [
  { key: 'alpha', id: 910001, address: 'B62qVkFixtureAlphaSetsTargetCanonical00000000000000000', token: DEFAULT_TOKEN_ID },
  { key: 'beta', id: 910002, address: 'B62qVkFixtureBetaSetsOtherHash000000000000000000000000', token: DEFAULT_TOKEN_ID },
  { key: 'gamma', id: 910003, address: 'B62qVkFixtureGammaSetsTargetCustomToken0000000000000', token: CUSTOM_TOKEN_ID },
  { key: 'delta', id: 910004, address: 'B62qVkFixtureDeltaSetsTargetSequenceZero0000000000000', token: DEFAULT_TOKEN_ID },
  { key: 'epsilon', id: 910005, address: 'B62qVkFixtureEpsilonSetsTargetSequenceOne000000000000', token: DEFAULT_TOKEN_ID },
  { key: 'zeta', id: 910006, address: 'B62qVkFixtureZetaSetsTargetInFailedCommand00000000000', token: DEFAULT_TOKEN_ID },
  { key: 'eta', id: 910007, address: 'B62qVkFixtureEtaTargetAsPreconditionOnly00000000000000', token: DEFAULT_TOKEN_ID },
  { key: 'theta', id: 910008, address: 'B62qVkFixtureThetaSetsTargetInOrphanedBlock0000000000', token: DEFAULT_TOKEN_ID },
  { key: 'iota', id: 910009, address: 'B62qVkFixtureIotaSetsTargetInPendingBlock000000000000', token: DEFAULT_TOKEN_ID },
  { key: 'kappa', id: 910010, address: 'B62qVkFixtureKappaSetsTargetPendingForkA000000000000', token: DEFAULT_TOKEN_ID },
  { key: 'lambda', id: 910011, address: 'B62qVkFixtureLambdaSetsTargetPendingForkB00000000000', token: DEFAULT_TOKEN_ID },
];
const account = (key) => ACCOUNTS.find((a) => a.key === key);

/**
 * One account update per entry. `updateId` decides what the update SETS;
 * `preconditionHashId` decides what it merely REQUIRES.
 */
const ACCOUNT_UPDATES = [
  { key: 'alpha', id: 910001, updateId: SET_TARGET_UPDATE_ID, preconditionHashId: null, authorizationKind: 'Proof' },
  { key: 'beta', id: 910002, updateId: SET_OTHER_UPDATE_ID, preconditionHashId: null, authorizationKind: 'Proof' },
  { key: 'gamma', id: 910003, updateId: SET_TARGET_UPDATE_ID, preconditionHashId: null, authorizationKind: 'Proof' },
  { key: 'delta', id: 910004, updateId: SET_TARGET_UPDATE_ID, preconditionHashId: null, authorizationKind: 'Proof' },
  { key: 'epsilon', id: 910005, updateId: SET_TARGET_UPDATE_ID, preconditionHashId: null, authorizationKind: 'Signature' },
  { key: 'zeta', id: 910006, updateId: SET_TARGET_UPDATE_ID, preconditionHashId: null, authorizationKind: 'Proof' },
  // Sets nothing; only requires the target key. Must never be returned.
  { key: 'eta', id: 910007, updateId: NO_UPDATE_ID, preconditionHashId: TARGET.hashId, authorizationKind: 'Proof' },
  { key: 'theta', id: 910008, updateId: SET_TARGET_UPDATE_ID, preconditionHashId: null, authorizationKind: 'Proof' },
  { key: 'iota', id: 910009, updateId: SET_TARGET_UPDATE_ID, preconditionHashId: null, authorizationKind: 'Proof' },
  { key: 'kappa', id: 910010, updateId: SET_TARGET_UPDATE_ID, preconditionHashId: null, authorizationKind: 'Proof' },
  { key: 'lambda', id: 910011, updateId: SET_TARGET_UPDATE_ID, preconditionHashId: null, authorizationKind: 'Proof' },
];
const accountUpdate = (key) => ACCOUNT_UPDATES.find((u) => u.key === key);

/** A command names one block, or several when competing tips carry it. */
const blocksOf = (cmd) => (Array.isArray(cmd.block) ? cmd.block : [cmd.block]);

/**
 * The commands, in the blocks that hold them. `updates` is the account-update
 * array in its on-chain order — `zkapp_account_updates_ids` — which is what
 * `UNNEST … WITH ORDINALITY` turns into the account-update position.
 */
const COMMANDS = [
  {
    id: 910001, block: BLOCK.h27, sequenceNo: 0, status: 'applied',
    memo: 'vk-fixture-three-updates', hash: 'CkpZVkFixtureTx910001',
    updates: ['alpha', 'beta', 'gamma'],
  },
  {
    id: 910002, block: BLOCK.h28, sequenceNo: 0, status: 'applied',
    memo: 'vk-fixture-seq-zero', hash: 'CkpZVkFixtureTx910002',
    updates: ['delta'],
  },
  {
    id: 910003, block: BLOCK.h28, sequenceNo: 1, status: 'applied',
    memo: 'vk-fixture-seq-one', hash: 'CkpZVkFixtureTx910003',
    updates: ['epsilon'],
  },
  {
    id: 910004, block: BLOCK.h29, sequenceNo: 0, status: 'failed',
    memo: 'vk-fixture-failed', hash: 'CkpZVkFixtureTx910004',
    updates: ['zeta'],
  },
  {
    id: 910005, block: BLOCK.h29, sequenceNo: 1, status: 'applied',
    memo: 'vk-fixture-precondition', hash: 'CkpZVkFixtureTx910005',
    updates: ['eta'],
  },
  {
    id: 910006, block: BLOCK.h30orphan, sequenceNo: 0, status: 'applied',
    memo: 'vk-fixture-orphaned', hash: 'CkpZVkFixtureTx910006',
    updates: ['theta'],
  },
  {
    id: 910007, block: BLOCK.h31pending, sequenceNo: 0, status: 'applied',
    memo: 'vk-fixture-pending', hash: 'CkpZVkFixtureTx910007',
    updates: ['iota'],
  },
  // ONE command, carried by BOTH competing tips at height 32. This is what a
  // real fork looks like: on the devnet archive a single zkApp command was
  // measured in as many as 8 blocks at the same height. The two rows it
  // produces agree on height, sequence_no, account-update position AND
  // zkapp_account_update.id, so nothing in the original ORDER BY separated them.
  {
    id: 910008, block: [BLOCK.h32forkA, BLOCK.h32forkB], sequenceNo: 0, status: 'applied',
    memo: 'vk-fixture-both-forks', hash: 'CkpZVkFixtureTx910008',
    updates: ['kappa'],
  },
  // Carried by fork B only, so the two tips are not identical.
  {
    id: 910009, block: BLOCK.h32forkB, sequenceNo: 1, status: 'applied',
    memo: 'vk-fixture-fork-b-only', hash: 'CkpZVkFixtureTx910009',
    updates: ['lambda'],
  },
];

// The chain shape: each block and the parent it is built on.
const CHAIN = [
  { block: BLOCK.anchor26, parent: null },
  { block: BLOCK.h27, parent: BLOCK.anchor26 },
  { block: BLOCK.h28, parent: BLOCK.h27 },
  { block: BLOCK.h29, parent: BLOCK.h28 },
  { block: BLOCK.h30, parent: BLOCK.h29 },
  { block: BLOCK.h30orphan, parent: BLOCK.h29 },
  { block: BLOCK.h31pending, parent: BLOCK.h30 },
  { block: BLOCK.h32forkA, parent: BLOCK.h31pending },
  { block: BLOCK.h32forkB, parent: BLOCK.h31pending },
];

// ── Emit ─────────────────────────────────────────────────────────────────
const out = [];
const say = (...lines) => out.push(...lines);

say(
  '-- GENERATED FILE — DO NOT EDIT BY HAND.',
  '-- Regenerate with: node tests/integration/fixtures/generate-verification-key-fixture.mjs',
  '--',
  '-- Applied on top of archive_db.sql. See the generator for what each account',
  '-- in here is meant to prove.',
  ''
);

say('-- Tokens ------------------------------------------------------------');
say(
  `INSERT INTO tokens (id, value) VALUES (${CUSTOM_TOKEN_ID}, '${CUSTOM_TOKEN_VALUE}');`,
  ''
);

say('-- Verification keys -------------------------------------------------');
for (const vk of [TARGET, OTHER]) {
  say(
    `INSERT INTO zkapp_verification_key_hashes (id, value) VALUES (${vk.hashId}, '${vk.hash}');`,
    `INSERT INTO zkapp_verification_keys (id, verification_key, hash_id)`,
    `  VALUES (${vk.keyId}, '${vk.key}', ${vk.hashId});`
  );
}
say('');

say('-- Update rows: what an account update SETS --------------------------');
say('-- zkapp_updates row 1 of the base fixture has verification_key_id IS NULL');
say('-- and is reused for the account update that only has a precondition.');
say(
  `INSERT INTO zkapp_updates (id, app_state_id, verification_key_id)`,
  `  VALUES (${SET_TARGET_UPDATE_ID}, 1, ${TARGET.keyId});`,
  `INSERT INTO zkapp_updates (id, app_state_id, verification_key_id)`,
  `  VALUES (${SET_OTHER_UPDATE_ID}, 1, ${OTHER.keyId});`,
  ''
);

say('-- Accounts ----------------------------------------------------------');
for (const acct of ACCOUNTS) {
  say(
    `INSERT INTO public_keys (id, value) VALUES (${acct.id}, '${acct.address}');`,
    `INSERT INTO account_identifiers (id, public_key_id, token_id)`,
    `  VALUES (${acct.id}, ${acct.id}, ${acct.token});`
  );
}
say('');

say('-- Blocks 26…32 on top of the base fixture canonical tip -------------');
for (const { block, parent } of CHAIN) {
  const parentRef =
    parent === null
      ? `(SELECT id FROM blocks WHERE height = ${BASE_CANONICAL_TIP_HEIGHT}` +
        ` AND chain_status = 'canonical' ORDER BY id LIMIT 1)`
      : `${parent.id}`;
  say(
    `INSERT INTO blocks (id, state_hash, parent_id, parent_hash, creator_id, block_winner_id, last_vrf_output,`,
    `    snarked_ledger_hash_id, staking_epoch_data_id, next_epoch_data_id, min_window_density,`,
    `    sub_window_densities, total_currency, ledger_hash, height, global_slot_since_hard_fork,`,
    `    global_slot_since_genesis, protocol_version_id, proposed_protocol_version_id, timestamp, chain_status)`,
    `  SELECT ${block.id}, '${block.hash}', p.id, p.state_hash, p.creator_id,`,
    `    p.block_winner_id, p.last_vrf_output, p.snarked_ledger_hash_id, p.staking_epoch_data_id,`,
    `    p.next_epoch_data_id, p.min_window_density, p.sub_window_densities, p.total_currency, p.ledger_hash,`,
    `    ${block.height}, p.global_slot_since_hard_fork + 1, p.global_slot_since_genesis + 1, p.protocol_version_id,`,
    `    p.proposed_protocol_version_id, (p.timestamp::bigint + 180000)::text, '${block.status}'`,
    `  FROM blocks p WHERE p.id = ${parentRef};`
  );
}
say('');

say('-- Account updates ---------------------------------------------------');
for (const upd of ACCOUNT_UPDATES) {
  const acct = account(upd.key);
  const precondition = upd.preconditionHashId === null ? 'NULL' : `${upd.preconditionHashId}`;
  const note =
    upd.updateId === NO_UPDATE_ID
      ? '  -- sets NOTHING; target hash sits in the precondition column only'
      : '';
  say(
    `-- ${upd.key}${note}`,
    `INSERT INTO zkapp_account_update_body (id, account_identifier_id, update_id, balance_change,`,
    `    increment_nonce, events_id, actions_id, call_data_id, call_depth, zkapp_network_precondition_id,`,
    `    zkapp_account_precondition_id, use_full_commitment, implicit_account_creation_fee, may_use_token,`,
    `    authorization_kind, verification_key_hash_id)`,
    `  VALUES (${upd.id}, ${acct.id}, ${upd.updateId}, '0', false, ${EMPTY_EVENTS_ID}, ${EMPTY_EVENTS_ID},`,
    `    ${ZERO_FIELD_ID}, 0, 1, 1, false, false, 'No', '${upd.authorizationKind}', ${precondition});`,
    `INSERT INTO zkapp_account_update (id, body_id) VALUES (${upd.id}, ${upd.id});`
  );
}
say('');

say('-- Commands ----------------------------------------------------------');
for (const cmd of COMMANDS) {
  const ids = cmd.updates.map((k) => accountUpdate(k).id).join(', ');
  const blocks = blocksOf(cmd);
  say(
    `-- ${blocks.map((b) => `block ${b.height} (${b.status})`).join(' and ')},` +
      ` sequence_no ${cmd.sequenceNo}, ${cmd.status}: ${cmd.updates.join(' -> ')}`,
    `INSERT INTO zkapp_commands (id, zkapp_fee_payer_body_id, zkapp_account_updates_ids, memo, hash)`,
    `  VALUES (${cmd.id}, ${FEE_PAYER_BODY_ID}, '{${ids}}', '${cmd.memo}', '${cmd.hash}');`
  );
  for (const block of blocks) {
    say(
      `INSERT INTO blocks_zkapp_commands (block_id, zkapp_command_id, sequence_no, status)`,
      `  VALUES (${block.id}, ${cmd.id}, ${cmd.sequenceNo}, '${cmd.status}');`
    );
  }
  say('');
}

const target = join(here, 'verification_key_updates.sql');
writeFileSync(target, out.join('\n') + '\n');
console.log(`wrote ${target} (${out.length} lines)`);

// ── Machine-readable description ─────────────────────────────────────────
// The tests import this so the expected values can never drift from the SQL:
// both come from the constants above.
const DEFAULT_TOKEN_VALUE = 'wSHV2S4qX9jFsLjQo8r1BsMLH2ZRKsZx6EJd1sbozGPieEC4Jf';
const positionOf = (cmd, key) => cmd.updates.indexOf(key) + 1;
const commandOf = (key) => COMMANDS.find((c) => c.updates.includes(key));

/**
 * Every occurrence the query should return for one account. A command carried by
 * two competing tips is TWO occurrences, one per block — the query answers with
 * account-update occurrences, not with distinct accounts.
 */
const occurrences = (key) => {
  const cmd = commandOf(key);
  const acct = account(key);
  const upd = accountUpdate(key);
  return blocksOf(cmd).map((block) => ({
    account: key,
    accountUpdateId: String(upd.id),
    address: acct.address,
    tokenId: acct.token === CUSTOM_TOKEN_ID ? CUSTOM_TOKEN_VALUE : DEFAULT_TOKEN_VALUE,
    height: block.height,
    stateHash: block.hash,
    chainStatus: block.status,
    sequenceNumber: cmd.sequenceNo,
    position: positionOf(cmd, key),
    transactionHash: cmd.hash,
    memo: cmd.memo,
    authorizationKind: upd.authorizationKind,
  }));
};

/**
 * The order the query must produce: by block height, then by state hash so two
 * competing tips at one height never tie, then by the order of the command in
 * the block and of the account update in the command.
 */
const inQueryOrder = (rows) =>
  [...rows].sort(
    (a, b) =>
      a.height - b.height ||
      a.stateHash.localeCompare(b.stateHash) ||
      a.sequenceNumber - b.sequenceNumber ||
      a.position - b.position
  );

const meta = {
  targetVerificationKeyHash: TARGET.hash,
  otherVerificationKeyHash: OTHER.hash,
  defaultTokenId: DEFAULT_TOKEN_VALUE,
  customTokenId: CUSTOM_TOKEN_VALUE,
  // The canonical blocks the fixture adds, and the pending tip heights.
  heights: {
    anchor: BLOCK.anchor26.height,
    firstCommand: BLOCK.h27.height,
    lastPending: BLOCK.h32forkA.height,
    afterAll: BLOCK.h32forkA.height + 1,
  },
  // In the order the query must return them.
  expected: {
    canonical: inQueryOrder(['alpha', 'gamma', 'delta', 'epsilon'].flatMap(occurrences)),
    pending: inQueryOrder(['iota', 'kappa', 'lambda'].flatMap(occurrences)),
  },
  // Accounts that must never appear, and the reason each one is excluded.
  excluded: {
    beta: 'sets a different verification key',
    zeta: 'the command failed',
    eta: 'the target hash is a precondition, not a key this update sets',
    theta: 'the block is orphaned',
  },
  excludedAddresses: Object.fromEntries(
    ['beta', 'zeta', 'eta', 'theta'].map((k) => [k, account(k).address])
  ),
};
const metaTarget = join(here, 'verification_key_updates.json');
writeFileSync(metaTarget, JSON.stringify(meta, null, 2) + '\n');
console.log(`wrote ${metaTarget}`);
