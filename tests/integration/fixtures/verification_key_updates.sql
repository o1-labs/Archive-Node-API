-- GENERATED FILE — DO NOT EDIT BY HAND.
-- Regenerate with: node tests/integration/fixtures/generate-verification-key-fixture.mjs
--
-- Applied on top of archive_db.sql. See the generator for what each account
-- in here is meant to prove.

-- Tokens ------------------------------------------------------------
INSERT INTO tokens (id, value) VALUES (910001, 'wZZZVkFixtureCustomToken00000000000000000000000000');

-- Verification keys -------------------------------------------------
INSERT INTO zkapp_verification_key_hashes (id, value) VALUES (910001, '910000000000000000000000000000000000000000000000000000000000000001');
INSERT INTO zkapp_verification_keys (id, verification_key, hash_id)
  VALUES (910001, 'AAVkFixtureTargetVerificationKeyBlob', 910001);
INSERT INTO zkapp_verification_key_hashes (id, value) VALUES (910002, '910000000000000000000000000000000000000000000000000000000000000002');
INSERT INTO zkapp_verification_keys (id, verification_key, hash_id)
  VALUES (910002, 'AAVkFixtureOtherVerificationKeyBlob', 910002);

-- Update rows: what an account update SETS --------------------------
-- zkapp_updates row 1 of the base fixture has verification_key_id IS NULL
-- and is reused for the account update that only has a precondition.
INSERT INTO zkapp_updates (id, app_state_id, verification_key_id)
  VALUES (910001, 1, 910001);
INSERT INTO zkapp_updates (id, app_state_id, verification_key_id)
  VALUES (910002, 1, 910002);

-- Accounts ----------------------------------------------------------
INSERT INTO public_keys (id, value) VALUES (910001, 'B62qVkFixtureAlphaSetsTargetCanonical00000000000000000');
INSERT INTO account_identifiers (id, public_key_id, token_id)
  VALUES (910001, 910001, 1);
INSERT INTO public_keys (id, value) VALUES (910002, 'B62qVkFixtureBetaSetsOtherHash000000000000000000000000');
INSERT INTO account_identifiers (id, public_key_id, token_id)
  VALUES (910002, 910002, 1);
INSERT INTO public_keys (id, value) VALUES (910003, 'B62qVkFixtureGammaSetsTargetCustomToken0000000000000');
INSERT INTO account_identifiers (id, public_key_id, token_id)
  VALUES (910003, 910003, 910001);
INSERT INTO public_keys (id, value) VALUES (910004, 'B62qVkFixtureDeltaSetsTargetSequenceZero0000000000000');
INSERT INTO account_identifiers (id, public_key_id, token_id)
  VALUES (910004, 910004, 1);
INSERT INTO public_keys (id, value) VALUES (910005, 'B62qVkFixtureEpsilonSetsTargetSequenceOne000000000000');
INSERT INTO account_identifiers (id, public_key_id, token_id)
  VALUES (910005, 910005, 1);
INSERT INTO public_keys (id, value) VALUES (910006, 'B62qVkFixtureZetaSetsTargetInFailedCommand00000000000');
INSERT INTO account_identifiers (id, public_key_id, token_id)
  VALUES (910006, 910006, 1);
INSERT INTO public_keys (id, value) VALUES (910007, 'B62qVkFixtureEtaTargetAsPreconditionOnly00000000000000');
INSERT INTO account_identifiers (id, public_key_id, token_id)
  VALUES (910007, 910007, 1);
INSERT INTO public_keys (id, value) VALUES (910008, 'B62qVkFixtureThetaSetsTargetInOrphanedBlock0000000000');
INSERT INTO account_identifiers (id, public_key_id, token_id)
  VALUES (910008, 910008, 1);
INSERT INTO public_keys (id, value) VALUES (910009, 'B62qVkFixtureIotaSetsTargetInPendingBlock000000000000');
INSERT INTO account_identifiers (id, public_key_id, token_id)
  VALUES (910009, 910009, 1);
INSERT INTO public_keys (id, value) VALUES (910010, 'B62qVkFixtureKappaSetsTargetPendingForkA000000000000');
INSERT INTO account_identifiers (id, public_key_id, token_id)
  VALUES (910010, 910010, 1);
INSERT INTO public_keys (id, value) VALUES (910011, 'B62qVkFixtureLambdaSetsTargetPendingForkB00000000000');
INSERT INTO account_identifiers (id, public_key_id, token_id)
  VALUES (910011, 910011, 1);

-- Blocks 26…32 on top of the base fixture canonical tip -------------
INSERT INTO blocks (id, state_hash, parent_id, parent_hash, creator_id, block_winner_id, last_vrf_output,
    snarked_ledger_hash_id, staking_epoch_data_id, next_epoch_data_id, min_window_density,
    sub_window_densities, total_currency, ledger_hash, height, global_slot_since_hard_fork,
    global_slot_since_genesis, protocol_version_id, proposed_protocol_version_id, timestamp, chain_status)
  SELECT 910026, '3NVkFixtureBlock26', p.id, p.state_hash, p.creator_id,
    p.block_winner_id, p.last_vrf_output, p.snarked_ledger_hash_id, p.staking_epoch_data_id,
    p.next_epoch_data_id, p.min_window_density, p.sub_window_densities, p.total_currency, p.ledger_hash,
    26, p.global_slot_since_hard_fork + 1, p.global_slot_since_genesis + 1, p.protocol_version_id,
    p.proposed_protocol_version_id, (p.timestamp::bigint + 180000)::text, 'canonical'
  FROM blocks p WHERE p.id = (SELECT id FROM blocks WHERE height = 25 AND chain_status = 'canonical' ORDER BY id LIMIT 1);
INSERT INTO blocks (id, state_hash, parent_id, parent_hash, creator_id, block_winner_id, last_vrf_output,
    snarked_ledger_hash_id, staking_epoch_data_id, next_epoch_data_id, min_window_density,
    sub_window_densities, total_currency, ledger_hash, height, global_slot_since_hard_fork,
    global_slot_since_genesis, protocol_version_id, proposed_protocol_version_id, timestamp, chain_status)
  SELECT 910027, '3NVkFixtureBlock27', p.id, p.state_hash, p.creator_id,
    p.block_winner_id, p.last_vrf_output, p.snarked_ledger_hash_id, p.staking_epoch_data_id,
    p.next_epoch_data_id, p.min_window_density, p.sub_window_densities, p.total_currency, p.ledger_hash,
    27, p.global_slot_since_hard_fork + 1, p.global_slot_since_genesis + 1, p.protocol_version_id,
    p.proposed_protocol_version_id, (p.timestamp::bigint + 180000)::text, 'canonical'
  FROM blocks p WHERE p.id = 910026;
INSERT INTO blocks (id, state_hash, parent_id, parent_hash, creator_id, block_winner_id, last_vrf_output,
    snarked_ledger_hash_id, staking_epoch_data_id, next_epoch_data_id, min_window_density,
    sub_window_densities, total_currency, ledger_hash, height, global_slot_since_hard_fork,
    global_slot_since_genesis, protocol_version_id, proposed_protocol_version_id, timestamp, chain_status)
  SELECT 910028, '3NVkFixtureBlock28', p.id, p.state_hash, p.creator_id,
    p.block_winner_id, p.last_vrf_output, p.snarked_ledger_hash_id, p.staking_epoch_data_id,
    p.next_epoch_data_id, p.min_window_density, p.sub_window_densities, p.total_currency, p.ledger_hash,
    28, p.global_slot_since_hard_fork + 1, p.global_slot_since_genesis + 1, p.protocol_version_id,
    p.proposed_protocol_version_id, (p.timestamp::bigint + 180000)::text, 'canonical'
  FROM blocks p WHERE p.id = 910027;
INSERT INTO blocks (id, state_hash, parent_id, parent_hash, creator_id, block_winner_id, last_vrf_output,
    snarked_ledger_hash_id, staking_epoch_data_id, next_epoch_data_id, min_window_density,
    sub_window_densities, total_currency, ledger_hash, height, global_slot_since_hard_fork,
    global_slot_since_genesis, protocol_version_id, proposed_protocol_version_id, timestamp, chain_status)
  SELECT 910029, '3NVkFixtureBlock29', p.id, p.state_hash, p.creator_id,
    p.block_winner_id, p.last_vrf_output, p.snarked_ledger_hash_id, p.staking_epoch_data_id,
    p.next_epoch_data_id, p.min_window_density, p.sub_window_densities, p.total_currency, p.ledger_hash,
    29, p.global_slot_since_hard_fork + 1, p.global_slot_since_genesis + 1, p.protocol_version_id,
    p.proposed_protocol_version_id, (p.timestamp::bigint + 180000)::text, 'canonical'
  FROM blocks p WHERE p.id = 910028;
INSERT INTO blocks (id, state_hash, parent_id, parent_hash, creator_id, block_winner_id, last_vrf_output,
    snarked_ledger_hash_id, staking_epoch_data_id, next_epoch_data_id, min_window_density,
    sub_window_densities, total_currency, ledger_hash, height, global_slot_since_hard_fork,
    global_slot_since_genesis, protocol_version_id, proposed_protocol_version_id, timestamp, chain_status)
  SELECT 910030, '3NVkFixtureBlock30', p.id, p.state_hash, p.creator_id,
    p.block_winner_id, p.last_vrf_output, p.snarked_ledger_hash_id, p.staking_epoch_data_id,
    p.next_epoch_data_id, p.min_window_density, p.sub_window_densities, p.total_currency, p.ledger_hash,
    30, p.global_slot_since_hard_fork + 1, p.global_slot_since_genesis + 1, p.protocol_version_id,
    p.proposed_protocol_version_id, (p.timestamp::bigint + 180000)::text, 'canonical'
  FROM blocks p WHERE p.id = 910029;
INSERT INTO blocks (id, state_hash, parent_id, parent_hash, creator_id, block_winner_id, last_vrf_output,
    snarked_ledger_hash_id, staking_epoch_data_id, next_epoch_data_id, min_window_density,
    sub_window_densities, total_currency, ledger_hash, height, global_slot_since_hard_fork,
    global_slot_since_genesis, protocol_version_id, proposed_protocol_version_id, timestamp, chain_status)
  SELECT 910130, '3NVkFixtureBlock30Orphaned', p.id, p.state_hash, p.creator_id,
    p.block_winner_id, p.last_vrf_output, p.snarked_ledger_hash_id, p.staking_epoch_data_id,
    p.next_epoch_data_id, p.min_window_density, p.sub_window_densities, p.total_currency, p.ledger_hash,
    30, p.global_slot_since_hard_fork + 1, p.global_slot_since_genesis + 1, p.protocol_version_id,
    p.proposed_protocol_version_id, (p.timestamp::bigint + 180000)::text, 'orphaned'
  FROM blocks p WHERE p.id = 910029;
INSERT INTO blocks (id, state_hash, parent_id, parent_hash, creator_id, block_winner_id, last_vrf_output,
    snarked_ledger_hash_id, staking_epoch_data_id, next_epoch_data_id, min_window_density,
    sub_window_densities, total_currency, ledger_hash, height, global_slot_since_hard_fork,
    global_slot_since_genesis, protocol_version_id, proposed_protocol_version_id, timestamp, chain_status)
  SELECT 910031, '3NVkFixtureBlock31Pending', p.id, p.state_hash, p.creator_id,
    p.block_winner_id, p.last_vrf_output, p.snarked_ledger_hash_id, p.staking_epoch_data_id,
    p.next_epoch_data_id, p.min_window_density, p.sub_window_densities, p.total_currency, p.ledger_hash,
    31, p.global_slot_since_hard_fork + 1, p.global_slot_since_genesis + 1, p.protocol_version_id,
    p.proposed_protocol_version_id, (p.timestamp::bigint + 180000)::text, 'pending'
  FROM blocks p WHERE p.id = 910030;
INSERT INTO blocks (id, state_hash, parent_id, parent_hash, creator_id, block_winner_id, last_vrf_output,
    snarked_ledger_hash_id, staking_epoch_data_id, next_epoch_data_id, min_window_density,
    sub_window_densities, total_currency, ledger_hash, height, global_slot_since_hard_fork,
    global_slot_since_genesis, protocol_version_id, proposed_protocol_version_id, timestamp, chain_status)
  SELECT 910032, '3NVkFixtureBlock32ForkA', p.id, p.state_hash, p.creator_id,
    p.block_winner_id, p.last_vrf_output, p.snarked_ledger_hash_id, p.staking_epoch_data_id,
    p.next_epoch_data_id, p.min_window_density, p.sub_window_densities, p.total_currency, p.ledger_hash,
    32, p.global_slot_since_hard_fork + 1, p.global_slot_since_genesis + 1, p.protocol_version_id,
    p.proposed_protocol_version_id, (p.timestamp::bigint + 180000)::text, 'pending'
  FROM blocks p WHERE p.id = 910031;
INSERT INTO blocks (id, state_hash, parent_id, parent_hash, creator_id, block_winner_id, last_vrf_output,
    snarked_ledger_hash_id, staking_epoch_data_id, next_epoch_data_id, min_window_density,
    sub_window_densities, total_currency, ledger_hash, height, global_slot_since_hard_fork,
    global_slot_since_genesis, protocol_version_id, proposed_protocol_version_id, timestamp, chain_status)
  SELECT 910132, '3NVkFixtureBlock32ForkB', p.id, p.state_hash, p.creator_id,
    p.block_winner_id, p.last_vrf_output, p.snarked_ledger_hash_id, p.staking_epoch_data_id,
    p.next_epoch_data_id, p.min_window_density, p.sub_window_densities, p.total_currency, p.ledger_hash,
    32, p.global_slot_since_hard_fork + 1, p.global_slot_since_genesis + 1, p.protocol_version_id,
    p.proposed_protocol_version_id, (p.timestamp::bigint + 180000)::text, 'pending'
  FROM blocks p WHERE p.id = 910031;

-- Account updates ---------------------------------------------------
-- alpha
INSERT INTO zkapp_account_update_body (id, account_identifier_id, update_id, balance_change,
    increment_nonce, events_id, actions_id, call_data_id, call_depth, zkapp_network_precondition_id,
    zkapp_account_precondition_id, use_full_commitment, implicit_account_creation_fee, may_use_token,
    authorization_kind, verification_key_hash_id)
  VALUES (910001, 910001, 910001, '0', false, 1, 1,
    1, 0, 1, 1, false, false, 'No', 'Proof', NULL);
INSERT INTO zkapp_account_update (id, body_id) VALUES (910001, 910001);
-- beta
INSERT INTO zkapp_account_update_body (id, account_identifier_id, update_id, balance_change,
    increment_nonce, events_id, actions_id, call_data_id, call_depth, zkapp_network_precondition_id,
    zkapp_account_precondition_id, use_full_commitment, implicit_account_creation_fee, may_use_token,
    authorization_kind, verification_key_hash_id)
  VALUES (910002, 910002, 910002, '0', false, 1, 1,
    1, 0, 1, 1, false, false, 'No', 'Proof', NULL);
INSERT INTO zkapp_account_update (id, body_id) VALUES (910002, 910002);
-- gamma
INSERT INTO zkapp_account_update_body (id, account_identifier_id, update_id, balance_change,
    increment_nonce, events_id, actions_id, call_data_id, call_depth, zkapp_network_precondition_id,
    zkapp_account_precondition_id, use_full_commitment, implicit_account_creation_fee, may_use_token,
    authorization_kind, verification_key_hash_id)
  VALUES (910003, 910003, 910001, '0', false, 1, 1,
    1, 0, 1, 1, false, false, 'No', 'Proof', NULL);
INSERT INTO zkapp_account_update (id, body_id) VALUES (910003, 910003);
-- delta
INSERT INTO zkapp_account_update_body (id, account_identifier_id, update_id, balance_change,
    increment_nonce, events_id, actions_id, call_data_id, call_depth, zkapp_network_precondition_id,
    zkapp_account_precondition_id, use_full_commitment, implicit_account_creation_fee, may_use_token,
    authorization_kind, verification_key_hash_id)
  VALUES (910004, 910004, 910001, '0', false, 1, 1,
    1, 0, 1, 1, false, false, 'No', 'Proof', NULL);
INSERT INTO zkapp_account_update (id, body_id) VALUES (910004, 910004);
-- epsilon
INSERT INTO zkapp_account_update_body (id, account_identifier_id, update_id, balance_change,
    increment_nonce, events_id, actions_id, call_data_id, call_depth, zkapp_network_precondition_id,
    zkapp_account_precondition_id, use_full_commitment, implicit_account_creation_fee, may_use_token,
    authorization_kind, verification_key_hash_id)
  VALUES (910005, 910005, 910001, '0', false, 1, 1,
    1, 0, 1, 1, false, false, 'No', 'Signature', NULL);
INSERT INTO zkapp_account_update (id, body_id) VALUES (910005, 910005);
-- zeta
INSERT INTO zkapp_account_update_body (id, account_identifier_id, update_id, balance_change,
    increment_nonce, events_id, actions_id, call_data_id, call_depth, zkapp_network_precondition_id,
    zkapp_account_precondition_id, use_full_commitment, implicit_account_creation_fee, may_use_token,
    authorization_kind, verification_key_hash_id)
  VALUES (910006, 910006, 910001, '0', false, 1, 1,
    1, 0, 1, 1, false, false, 'No', 'Proof', NULL);
INSERT INTO zkapp_account_update (id, body_id) VALUES (910006, 910006);
-- eta  -- sets NOTHING; target hash sits in the precondition column only
INSERT INTO zkapp_account_update_body (id, account_identifier_id, update_id, balance_change,
    increment_nonce, events_id, actions_id, call_data_id, call_depth, zkapp_network_precondition_id,
    zkapp_account_precondition_id, use_full_commitment, implicit_account_creation_fee, may_use_token,
    authorization_kind, verification_key_hash_id)
  VALUES (910007, 910007, 1, '0', false, 1, 1,
    1, 0, 1, 1, false, false, 'No', 'Proof', 910001);
INSERT INTO zkapp_account_update (id, body_id) VALUES (910007, 910007);
-- theta
INSERT INTO zkapp_account_update_body (id, account_identifier_id, update_id, balance_change,
    increment_nonce, events_id, actions_id, call_data_id, call_depth, zkapp_network_precondition_id,
    zkapp_account_precondition_id, use_full_commitment, implicit_account_creation_fee, may_use_token,
    authorization_kind, verification_key_hash_id)
  VALUES (910008, 910008, 910001, '0', false, 1, 1,
    1, 0, 1, 1, false, false, 'No', 'Proof', NULL);
INSERT INTO zkapp_account_update (id, body_id) VALUES (910008, 910008);
-- iota
INSERT INTO zkapp_account_update_body (id, account_identifier_id, update_id, balance_change,
    increment_nonce, events_id, actions_id, call_data_id, call_depth, zkapp_network_precondition_id,
    zkapp_account_precondition_id, use_full_commitment, implicit_account_creation_fee, may_use_token,
    authorization_kind, verification_key_hash_id)
  VALUES (910009, 910009, 910001, '0', false, 1, 1,
    1, 0, 1, 1, false, false, 'No', 'Proof', NULL);
INSERT INTO zkapp_account_update (id, body_id) VALUES (910009, 910009);
-- kappa
INSERT INTO zkapp_account_update_body (id, account_identifier_id, update_id, balance_change,
    increment_nonce, events_id, actions_id, call_data_id, call_depth, zkapp_network_precondition_id,
    zkapp_account_precondition_id, use_full_commitment, implicit_account_creation_fee, may_use_token,
    authorization_kind, verification_key_hash_id)
  VALUES (910010, 910010, 910001, '0', false, 1, 1,
    1, 0, 1, 1, false, false, 'No', 'Proof', NULL);
INSERT INTO zkapp_account_update (id, body_id) VALUES (910010, 910010);
-- lambda
INSERT INTO zkapp_account_update_body (id, account_identifier_id, update_id, balance_change,
    increment_nonce, events_id, actions_id, call_data_id, call_depth, zkapp_network_precondition_id,
    zkapp_account_precondition_id, use_full_commitment, implicit_account_creation_fee, may_use_token,
    authorization_kind, verification_key_hash_id)
  VALUES (910011, 910011, 910001, '0', false, 1, 1,
    1, 0, 1, 1, false, false, 'No', 'Proof', NULL);
INSERT INTO zkapp_account_update (id, body_id) VALUES (910011, 910011);

-- Commands ----------------------------------------------------------
-- block 27 (canonical), sequence_no 0, applied: alpha -> beta -> gamma
INSERT INTO zkapp_commands (id, zkapp_fee_payer_body_id, zkapp_account_updates_ids, memo, hash)
  VALUES (910001, 1, '{910001, 910002, 910003}', 'vk-fixture-three-updates', 'CkpZVkFixtureTx910001');
INSERT INTO blocks_zkapp_commands (block_id, zkapp_command_id, sequence_no, status)
  VALUES (910027, 910001, 0, 'applied');

-- block 28 (canonical), sequence_no 0, applied: delta
INSERT INTO zkapp_commands (id, zkapp_fee_payer_body_id, zkapp_account_updates_ids, memo, hash)
  VALUES (910002, 1, '{910004}', 'vk-fixture-seq-zero', 'CkpZVkFixtureTx910002');
INSERT INTO blocks_zkapp_commands (block_id, zkapp_command_id, sequence_no, status)
  VALUES (910028, 910002, 0, 'applied');

-- block 28 (canonical), sequence_no 1, applied: epsilon
INSERT INTO zkapp_commands (id, zkapp_fee_payer_body_id, zkapp_account_updates_ids, memo, hash)
  VALUES (910003, 1, '{910005}', 'vk-fixture-seq-one', 'CkpZVkFixtureTx910003');
INSERT INTO blocks_zkapp_commands (block_id, zkapp_command_id, sequence_no, status)
  VALUES (910028, 910003, 1, 'applied');

-- block 29 (canonical), sequence_no 0, failed: zeta
INSERT INTO zkapp_commands (id, zkapp_fee_payer_body_id, zkapp_account_updates_ids, memo, hash)
  VALUES (910004, 1, '{910006}', 'vk-fixture-failed', 'CkpZVkFixtureTx910004');
INSERT INTO blocks_zkapp_commands (block_id, zkapp_command_id, sequence_no, status)
  VALUES (910029, 910004, 0, 'failed');

-- block 29 (canonical), sequence_no 1, applied: eta
INSERT INTO zkapp_commands (id, zkapp_fee_payer_body_id, zkapp_account_updates_ids, memo, hash)
  VALUES (910005, 1, '{910007}', 'vk-fixture-precondition', 'CkpZVkFixtureTx910005');
INSERT INTO blocks_zkapp_commands (block_id, zkapp_command_id, sequence_no, status)
  VALUES (910029, 910005, 1, 'applied');

-- block 30 (orphaned), sequence_no 0, applied: theta
INSERT INTO zkapp_commands (id, zkapp_fee_payer_body_id, zkapp_account_updates_ids, memo, hash)
  VALUES (910006, 1, '{910008}', 'vk-fixture-orphaned', 'CkpZVkFixtureTx910006');
INSERT INTO blocks_zkapp_commands (block_id, zkapp_command_id, sequence_no, status)
  VALUES (910130, 910006, 0, 'applied');

-- block 31 (pending), sequence_no 0, applied: iota
INSERT INTO zkapp_commands (id, zkapp_fee_payer_body_id, zkapp_account_updates_ids, memo, hash)
  VALUES (910007, 1, '{910009}', 'vk-fixture-pending', 'CkpZVkFixtureTx910007');
INSERT INTO blocks_zkapp_commands (block_id, zkapp_command_id, sequence_no, status)
  VALUES (910031, 910007, 0, 'applied');

-- block 32 (pending) and block 32 (pending), sequence_no 0, applied: kappa
INSERT INTO zkapp_commands (id, zkapp_fee_payer_body_id, zkapp_account_updates_ids, memo, hash)
  VALUES (910008, 1, '{910010}', 'vk-fixture-both-forks', 'CkpZVkFixtureTx910008');
INSERT INTO blocks_zkapp_commands (block_id, zkapp_command_id, sequence_no, status)
  VALUES (910032, 910008, 0, 'applied');
INSERT INTO blocks_zkapp_commands (block_id, zkapp_command_id, sequence_no, status)
  VALUES (910132, 910008, 0, 'applied');

-- block 32 (pending), sequence_no 1, applied: lambda
INSERT INTO zkapp_commands (id, zkapp_fee_payer_body_id, zkapp_account_updates_ids, memo, hash)
  VALUES (910009, 1, '{910011}', 'vk-fixture-fork-b-only', 'CkpZVkFixtureTx910009');
INSERT INTO blocks_zkapp_commands (block_id, zkapp_command_id, sequence_no, status)
  VALUES (910132, 910009, 1, 'applied');

