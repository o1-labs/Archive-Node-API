-- GENERATED FILE — DO NOT EDIT BY HAND.
-- Regenerate with: node tests/integration/fixtures/generate-action-state-fixture.mjs
--
-- Applied on top of archive_db.sql. See the generator for why this fixture
-- inverts the zkapp_field interning order on purpose.

-- Shared rows -------------------------------------------------------
INSERT INTO zkapp_states (id, element0, element1, element2, element3, element4, element5, element6, element7, element8, element9, element10, element11, element12, element13, element14, element15, element16, element17, element18, element19, element20, element21, element22, element23, element24, element25, element26, element27, element28, element29, element30, element31)
  VALUES (900001, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1);
INSERT INTO zkapp_uris (id, value) VALUES (900001, '');

-- Accounts ----------------------------------------------------------
INSERT INTO public_keys (id, value) VALUES (900001, 'B62qActionStateInvertedAccount00000000000000000000000');
INSERT INTO account_identifiers (id, public_key_id, token_id)
  VALUES (900001, 900001, 1);
INSERT INTO public_keys (id, value) VALUES (900002, 'B62qActionStateControlAccount000000000000000000000000');
INSERT INTO account_identifiers (id, public_key_id, token_id)
  VALUES (900002, 900002, 1);
INSERT INTO public_keys (id, value) VALUES (900003, 'B62qActionStateAdjacentPairAccount0000000000000000000');
INSERT INTO account_identifiers (id, public_key_id, token_id)
  VALUES (900003, 900003, 1);

-- Action-state and action-data field values -------------------------
-- The ids below are deliberately NOT in chain order for the `inverted`
-- and `adjacent` accounts. That is what this fixture tests.
INSERT INTO zkapp_field (id, field) VALUES (900014, '1100000000000000000000000000000000000000000000000000000000000000');  -- inverted S1, block 27
INSERT INTO zkapp_field (id, field) VALUES (900012, '1200000000000000000000000000000000000000000000000000000000000000');  -- inverted S2, block 28
INSERT INTO zkapp_field (id, field) VALUES (900011, '1300000000000000000000000000000000000000000000000000000000000000');  -- inverted S3, block 29
INSERT INTO zkapp_field (id, field) VALUES (900013, '1400000000000000000000000000000000000000000000000000000000000000');  -- inverted S4, block 30
INSERT INTO zkapp_field (id, field) VALUES (900021, '2100000000000000000000000000000000000000000000000000000000000000');  -- control S1, block 27
INSERT INTO zkapp_field (id, field) VALUES (900022, '2200000000000000000000000000000000000000000000000000000000000000');  -- control S2, block 28
INSERT INTO zkapp_field (id, field) VALUES (900023, '2300000000000000000000000000000000000000000000000000000000000000');  -- control S3, block 29
INSERT INTO zkapp_field (id, field) VALUES (900024, '2400000000000000000000000000000000000000000000000000000000000000');  -- control S4, block 30
INSERT INTO zkapp_field (id, field) VALUES (900031, '3100000000000000000000000000000000000000000000000000000000000000');  -- adjacent S1, block 27
INSERT INTO zkapp_field (id, field) VALUES (900033, '3200000000000000000000000000000000000000000000000000000000000000');  -- adjacent S2, block 28
INSERT INTO zkapp_field (id, field) VALUES (900032, '3300000000000000000000000000000000000000000000000000000000000000');  -- adjacent S3, block 29
INSERT INTO zkapp_field (id, field) VALUES (900034, '3400000000000000000000000000000000000000000000000000000000000000');  -- adjacent S4, block 30
INSERT INTO zkapp_field (id, field) VALUES (900041, '9110000000000000000000000000000000000000000000000000000000000000');
INSERT INTO zkapp_field (id, field) VALUES (900042, '9120000000000000000000000000000000000000000000000000000000000000');
INSERT INTO zkapp_field (id, field) VALUES (900043, '9130000000000000000000000000000000000000000000000000000000000000');
INSERT INTO zkapp_field (id, field) VALUES (900044, '9140000000000000000000000000000000000000000000000000000000000000');
INSERT INTO zkapp_field (id, field) VALUES (900045, '9210000000000000000000000000000000000000000000000000000000000000');
INSERT INTO zkapp_field (id, field) VALUES (900046, '9220000000000000000000000000000000000000000000000000000000000000');
INSERT INTO zkapp_field (id, field) VALUES (900047, '9230000000000000000000000000000000000000000000000000000000000000');
INSERT INTO zkapp_field (id, field) VALUES (900048, '9240000000000000000000000000000000000000000000000000000000000000');
INSERT INTO zkapp_field (id, field) VALUES (900049, '9310000000000000000000000000000000000000000000000000000000000000');
INSERT INTO zkapp_field (id, field) VALUES (900050, '9320000000000000000000000000000000000000000000000000000000000000');
INSERT INTO zkapp_field (id, field) VALUES (900051, '9330000000000000000000000000000000000000000000000000000000000000');
INSERT INTO zkapp_field (id, field) VALUES (900052, '9340000000000000000000000000000000000000000000000000000000000000');

-- Blocks 26…31, canonical, chained onto the tip of the base fixture --
INSERT INTO blocks (id, state_hash, parent_id, parent_hash, creator_id, block_winner_id, last_vrf_output,
    snarked_ledger_hash_id, staking_epoch_data_id, next_epoch_data_id, min_window_density,
    sub_window_densities, total_currency, ledger_hash, height, global_slot_since_hard_fork,
    global_slot_since_genesis, protocol_version_id, proposed_protocol_version_id, timestamp, chain_status)
  SELECT 900026, '3NActionStateFixtureBlock26', p.id, p.state_hash, p.creator_id,
    p.block_winner_id, p.last_vrf_output, p.snarked_ledger_hash_id, p.staking_epoch_data_id,
    p.next_epoch_data_id, p.min_window_density, p.sub_window_densities, p.total_currency, p.ledger_hash,
    26, p.global_slot_since_hard_fork + 1, p.global_slot_since_genesis + 1, p.protocol_version_id,
    p.proposed_protocol_version_id, (p.timestamp::bigint + 180000)::text, 'canonical'
  FROM blocks p WHERE p.id = (SELECT id FROM blocks WHERE height = 25 AND chain_status = 'canonical' ORDER BY id LIMIT 1);
INSERT INTO blocks (id, state_hash, parent_id, parent_hash, creator_id, block_winner_id, last_vrf_output,
    snarked_ledger_hash_id, staking_epoch_data_id, next_epoch_data_id, min_window_density,
    sub_window_densities, total_currency, ledger_hash, height, global_slot_since_hard_fork,
    global_slot_since_genesis, protocol_version_id, proposed_protocol_version_id, timestamp, chain_status)
  SELECT 900027, '3NActionStateFixtureBlock27', p.id, p.state_hash, p.creator_id,
    p.block_winner_id, p.last_vrf_output, p.snarked_ledger_hash_id, p.staking_epoch_data_id,
    p.next_epoch_data_id, p.min_window_density, p.sub_window_densities, p.total_currency, p.ledger_hash,
    27, p.global_slot_since_hard_fork + 1, p.global_slot_since_genesis + 1, p.protocol_version_id,
    p.proposed_protocol_version_id, (p.timestamp::bigint + 180000)::text, 'canonical'
  FROM blocks p WHERE p.id = 900026;
INSERT INTO blocks (id, state_hash, parent_id, parent_hash, creator_id, block_winner_id, last_vrf_output,
    snarked_ledger_hash_id, staking_epoch_data_id, next_epoch_data_id, min_window_density,
    sub_window_densities, total_currency, ledger_hash, height, global_slot_since_hard_fork,
    global_slot_since_genesis, protocol_version_id, proposed_protocol_version_id, timestamp, chain_status)
  SELECT 900028, '3NActionStateFixtureBlock28', p.id, p.state_hash, p.creator_id,
    p.block_winner_id, p.last_vrf_output, p.snarked_ledger_hash_id, p.staking_epoch_data_id,
    p.next_epoch_data_id, p.min_window_density, p.sub_window_densities, p.total_currency, p.ledger_hash,
    28, p.global_slot_since_hard_fork + 1, p.global_slot_since_genesis + 1, p.protocol_version_id,
    p.proposed_protocol_version_id, (p.timestamp::bigint + 180000)::text, 'canonical'
  FROM blocks p WHERE p.id = 900027;
INSERT INTO blocks (id, state_hash, parent_id, parent_hash, creator_id, block_winner_id, last_vrf_output,
    snarked_ledger_hash_id, staking_epoch_data_id, next_epoch_data_id, min_window_density,
    sub_window_densities, total_currency, ledger_hash, height, global_slot_since_hard_fork,
    global_slot_since_genesis, protocol_version_id, proposed_protocol_version_id, timestamp, chain_status)
  SELECT 900029, '3NActionStateFixtureBlock29', p.id, p.state_hash, p.creator_id,
    p.block_winner_id, p.last_vrf_output, p.snarked_ledger_hash_id, p.staking_epoch_data_id,
    p.next_epoch_data_id, p.min_window_density, p.sub_window_densities, p.total_currency, p.ledger_hash,
    29, p.global_slot_since_hard_fork + 1, p.global_slot_since_genesis + 1, p.protocol_version_id,
    p.proposed_protocol_version_id, (p.timestamp::bigint + 180000)::text, 'canonical'
  FROM blocks p WHERE p.id = 900028;
INSERT INTO blocks (id, state_hash, parent_id, parent_hash, creator_id, block_winner_id, last_vrf_output,
    snarked_ledger_hash_id, staking_epoch_data_id, next_epoch_data_id, min_window_density,
    sub_window_densities, total_currency, ledger_hash, height, global_slot_since_hard_fork,
    global_slot_since_genesis, protocol_version_id, proposed_protocol_version_id, timestamp, chain_status)
  SELECT 900030, '3NActionStateFixtureBlock30', p.id, p.state_hash, p.creator_id,
    p.block_winner_id, p.last_vrf_output, p.snarked_ledger_hash_id, p.staking_epoch_data_id,
    p.next_epoch_data_id, p.min_window_density, p.sub_window_densities, p.total_currency, p.ledger_hash,
    30, p.global_slot_since_hard_fork + 1, p.global_slot_since_genesis + 1, p.protocol_version_id,
    p.proposed_protocol_version_id, (p.timestamp::bigint + 180000)::text, 'canonical'
  FROM blocks p WHERE p.id = 900029;
INSERT INTO blocks (id, state_hash, parent_id, parent_hash, creator_id, block_winner_id, last_vrf_output,
    snarked_ledger_hash_id, staking_epoch_data_id, next_epoch_data_id, min_window_density,
    sub_window_densities, total_currency, ledger_hash, height, global_slot_since_hard_fork,
    global_slot_since_genesis, protocol_version_id, proposed_protocol_version_id, timestamp, chain_status)
  SELECT 900031, '3NActionStateFixtureBlock31', p.id, p.state_hash, p.creator_id,
    p.block_winner_id, p.last_vrf_output, p.snarked_ledger_hash_id, p.staking_epoch_data_id,
    p.next_epoch_data_id, p.min_window_density, p.sub_window_densities, p.total_currency, p.ledger_hash,
    31, p.global_slot_since_hard_fork + 1, p.global_slot_since_genesis + 1, p.protocol_version_id,
    p.proposed_protocol_version_id, (p.timestamp::bigint + 180000)::text, 'canonical'
  FROM blocks p WHERE p.id = 900030;

-- One action per account per block 27…30 ----------------------------
-- inverted: action 1 in block 27 (state S1)
INSERT INTO zkapp_field_array (id, element_ids) VALUES (900100, '{900041}');
INSERT INTO zkapp_events (id, element_ids) VALUES (900100, '{900100}');
INSERT INTO zkapp_account_update_body (id, account_identifier_id, update_id, balance_change,
    increment_nonce, events_id, actions_id, call_data_id, call_depth, zkapp_network_precondition_id,
    zkapp_account_precondition_id, use_full_commitment, implicit_account_creation_fee, may_use_token,
    authorization_kind)
  VALUES (900100, 900001, 1, '0', false, 1, 900100, 1,
    0, 1, 1, false, false, 'No', 'Proof');
INSERT INTO zkapp_account_update (id, body_id) VALUES (900100, 900100);
INSERT INTO zkapp_commands (id, zkapp_fee_payer_body_id, zkapp_account_updates_ids, memo, hash)
  VALUES (900100, 1, '{900100}', 'action-state-fixture', 'CkpZActionStateFixtureTx900100');
INSERT INTO blocks_zkapp_commands (block_id, zkapp_command_id, sequence_no, status)
  VALUES (900027, 900100, 0, 'applied');
INSERT INTO zkapp_action_states (id, element0, element1, element2, element3, element4)
  VALUES (900100, 900014, 1, 1, 1, 1);
INSERT INTO zkapp_accounts (id, app_state_id, verification_key_id, zkapp_version, action_state_id,
    last_action_slot, proved_state, zkapp_uri_id)
  VALUES (900100, 900001, NULL, 1, 900100, 27, true, 900001);
INSERT INTO accounts_accessed (ledger_index, block_id, account_identifier_id, token_symbol_id, balance,
    nonce, receipt_chain_hash, delegate_id, voting_for_id, timing_id, permissions_id, zkapp_id)
  VALUES (900100, 900027, 900001, 1, '1000000000', 0,
    '2mzbV7WevxLuchs2dAMY4vQBS6XttnCUF8Hvks4XNBQ5qiSGGBQe', NULL, 1, 1, 1, 900100);

-- inverted: action 2 in block 28 (state S2)
INSERT INTO zkapp_field_array (id, element_ids) VALUES (900101, '{900042}');
INSERT INTO zkapp_events (id, element_ids) VALUES (900101, '{900101}');
INSERT INTO zkapp_account_update_body (id, account_identifier_id, update_id, balance_change,
    increment_nonce, events_id, actions_id, call_data_id, call_depth, zkapp_network_precondition_id,
    zkapp_account_precondition_id, use_full_commitment, implicit_account_creation_fee, may_use_token,
    authorization_kind)
  VALUES (900101, 900001, 1, '0', false, 1, 900101, 1,
    0, 1, 1, false, false, 'No', 'Proof');
INSERT INTO zkapp_account_update (id, body_id) VALUES (900101, 900101);
INSERT INTO zkapp_commands (id, zkapp_fee_payer_body_id, zkapp_account_updates_ids, memo, hash)
  VALUES (900101, 1, '{900101}', 'action-state-fixture', 'CkpZActionStateFixtureTx900101');
INSERT INTO blocks_zkapp_commands (block_id, zkapp_command_id, sequence_no, status)
  VALUES (900028, 900101, 0, 'applied');
INSERT INTO zkapp_action_states (id, element0, element1, element2, element3, element4)
  VALUES (900101, 900012, 900014, 1, 1, 1);
INSERT INTO zkapp_accounts (id, app_state_id, verification_key_id, zkapp_version, action_state_id,
    last_action_slot, proved_state, zkapp_uri_id)
  VALUES (900101, 900001, NULL, 1, 900101, 28, true, 900001);
INSERT INTO accounts_accessed (ledger_index, block_id, account_identifier_id, token_symbol_id, balance,
    nonce, receipt_chain_hash, delegate_id, voting_for_id, timing_id, permissions_id, zkapp_id)
  VALUES (900101, 900028, 900001, 1, '1000000000', 0,
    '2mzbV7WevxLuchs2dAMY4vQBS6XttnCUF8Hvks4XNBQ5qiSGGBQe', NULL, 1, 1, 1, 900101);

-- inverted: action 3 in block 29 (state S3)
INSERT INTO zkapp_field_array (id, element_ids) VALUES (900102, '{900043}');
INSERT INTO zkapp_events (id, element_ids) VALUES (900102, '{900102}');
INSERT INTO zkapp_account_update_body (id, account_identifier_id, update_id, balance_change,
    increment_nonce, events_id, actions_id, call_data_id, call_depth, zkapp_network_precondition_id,
    zkapp_account_precondition_id, use_full_commitment, implicit_account_creation_fee, may_use_token,
    authorization_kind)
  VALUES (900102, 900001, 1, '0', false, 1, 900102, 1,
    0, 1, 1, false, false, 'No', 'Proof');
INSERT INTO zkapp_account_update (id, body_id) VALUES (900102, 900102);
INSERT INTO zkapp_commands (id, zkapp_fee_payer_body_id, zkapp_account_updates_ids, memo, hash)
  VALUES (900102, 1, '{900102}', 'action-state-fixture', 'CkpZActionStateFixtureTx900102');
INSERT INTO blocks_zkapp_commands (block_id, zkapp_command_id, sequence_no, status)
  VALUES (900029, 900102, 0, 'applied');
INSERT INTO zkapp_action_states (id, element0, element1, element2, element3, element4)
  VALUES (900102, 900011, 900012, 1, 1, 1);
INSERT INTO zkapp_accounts (id, app_state_id, verification_key_id, zkapp_version, action_state_id,
    last_action_slot, proved_state, zkapp_uri_id)
  VALUES (900102, 900001, NULL, 1, 900102, 29, true, 900001);
INSERT INTO accounts_accessed (ledger_index, block_id, account_identifier_id, token_symbol_id, balance,
    nonce, receipt_chain_hash, delegate_id, voting_for_id, timing_id, permissions_id, zkapp_id)
  VALUES (900102, 900029, 900001, 1, '1000000000', 0,
    '2mzbV7WevxLuchs2dAMY4vQBS6XttnCUF8Hvks4XNBQ5qiSGGBQe', NULL, 1, 1, 1, 900102);

-- inverted: action 4 in block 30 (state S4)
INSERT INTO zkapp_field_array (id, element_ids) VALUES (900103, '{900044}');
INSERT INTO zkapp_events (id, element_ids) VALUES (900103, '{900103}');
INSERT INTO zkapp_account_update_body (id, account_identifier_id, update_id, balance_change,
    increment_nonce, events_id, actions_id, call_data_id, call_depth, zkapp_network_precondition_id,
    zkapp_account_precondition_id, use_full_commitment, implicit_account_creation_fee, may_use_token,
    authorization_kind)
  VALUES (900103, 900001, 1, '0', false, 1, 900103, 1,
    0, 1, 1, false, false, 'No', 'Proof');
INSERT INTO zkapp_account_update (id, body_id) VALUES (900103, 900103);
INSERT INTO zkapp_commands (id, zkapp_fee_payer_body_id, zkapp_account_updates_ids, memo, hash)
  VALUES (900103, 1, '{900103}', 'action-state-fixture', 'CkpZActionStateFixtureTx900103');
INSERT INTO blocks_zkapp_commands (block_id, zkapp_command_id, sequence_no, status)
  VALUES (900030, 900103, 0, 'applied');
INSERT INTO zkapp_action_states (id, element0, element1, element2, element3, element4)
  VALUES (900103, 900013, 900011, 1, 1, 1);
INSERT INTO zkapp_accounts (id, app_state_id, verification_key_id, zkapp_version, action_state_id,
    last_action_slot, proved_state, zkapp_uri_id)
  VALUES (900103, 900001, NULL, 1, 900103, 30, true, 900001);
INSERT INTO accounts_accessed (ledger_index, block_id, account_identifier_id, token_symbol_id, balance,
    nonce, receipt_chain_hash, delegate_id, voting_for_id, timing_id, permissions_id, zkapp_id)
  VALUES (900103, 900030, 900001, 1, '1000000000', 0,
    '2mzbV7WevxLuchs2dAMY4vQBS6XttnCUF8Hvks4XNBQ5qiSGGBQe', NULL, 1, 1, 1, 900103);

-- control: action 1 in block 27 (state S1)
INSERT INTO zkapp_field_array (id, element_ids) VALUES (900104, '{900045}');
INSERT INTO zkapp_events (id, element_ids) VALUES (900104, '{900104}');
INSERT INTO zkapp_account_update_body (id, account_identifier_id, update_id, balance_change,
    increment_nonce, events_id, actions_id, call_data_id, call_depth, zkapp_network_precondition_id,
    zkapp_account_precondition_id, use_full_commitment, implicit_account_creation_fee, may_use_token,
    authorization_kind)
  VALUES (900104, 900002, 1, '0', false, 1, 900104, 1,
    0, 1, 1, false, false, 'No', 'Proof');
INSERT INTO zkapp_account_update (id, body_id) VALUES (900104, 900104);
INSERT INTO zkapp_commands (id, zkapp_fee_payer_body_id, zkapp_account_updates_ids, memo, hash)
  VALUES (900104, 1, '{900104}', 'action-state-fixture', 'CkpZActionStateFixtureTx900104');
INSERT INTO blocks_zkapp_commands (block_id, zkapp_command_id, sequence_no, status)
  VALUES (900027, 900104, 1, 'applied');
INSERT INTO zkapp_action_states (id, element0, element1, element2, element3, element4)
  VALUES (900104, 900021, 1, 1, 1, 1);
INSERT INTO zkapp_accounts (id, app_state_id, verification_key_id, zkapp_version, action_state_id,
    last_action_slot, proved_state, zkapp_uri_id)
  VALUES (900104, 900001, NULL, 1, 900104, 27, true, 900001);
INSERT INTO accounts_accessed (ledger_index, block_id, account_identifier_id, token_symbol_id, balance,
    nonce, receipt_chain_hash, delegate_id, voting_for_id, timing_id, permissions_id, zkapp_id)
  VALUES (900104, 900027, 900002, 1, '1000000000', 0,
    '2mzbV7WevxLuchs2dAMY4vQBS6XttnCUF8Hvks4XNBQ5qiSGGBQe', NULL, 1, 1, 1, 900104);

-- control: action 2 in block 28 (state S2)
INSERT INTO zkapp_field_array (id, element_ids) VALUES (900105, '{900046}');
INSERT INTO zkapp_events (id, element_ids) VALUES (900105, '{900105}');
INSERT INTO zkapp_account_update_body (id, account_identifier_id, update_id, balance_change,
    increment_nonce, events_id, actions_id, call_data_id, call_depth, zkapp_network_precondition_id,
    zkapp_account_precondition_id, use_full_commitment, implicit_account_creation_fee, may_use_token,
    authorization_kind)
  VALUES (900105, 900002, 1, '0', false, 1, 900105, 1,
    0, 1, 1, false, false, 'No', 'Proof');
INSERT INTO zkapp_account_update (id, body_id) VALUES (900105, 900105);
INSERT INTO zkapp_commands (id, zkapp_fee_payer_body_id, zkapp_account_updates_ids, memo, hash)
  VALUES (900105, 1, '{900105}', 'action-state-fixture', 'CkpZActionStateFixtureTx900105');
INSERT INTO blocks_zkapp_commands (block_id, zkapp_command_id, sequence_no, status)
  VALUES (900028, 900105, 1, 'applied');
INSERT INTO zkapp_action_states (id, element0, element1, element2, element3, element4)
  VALUES (900105, 900022, 900021, 1, 1, 1);
INSERT INTO zkapp_accounts (id, app_state_id, verification_key_id, zkapp_version, action_state_id,
    last_action_slot, proved_state, zkapp_uri_id)
  VALUES (900105, 900001, NULL, 1, 900105, 28, true, 900001);
INSERT INTO accounts_accessed (ledger_index, block_id, account_identifier_id, token_symbol_id, balance,
    nonce, receipt_chain_hash, delegate_id, voting_for_id, timing_id, permissions_id, zkapp_id)
  VALUES (900105, 900028, 900002, 1, '1000000000', 0,
    '2mzbV7WevxLuchs2dAMY4vQBS6XttnCUF8Hvks4XNBQ5qiSGGBQe', NULL, 1, 1, 1, 900105);

-- control: action 3 in block 29 (state S3)
INSERT INTO zkapp_field_array (id, element_ids) VALUES (900106, '{900047}');
INSERT INTO zkapp_events (id, element_ids) VALUES (900106, '{900106}');
INSERT INTO zkapp_account_update_body (id, account_identifier_id, update_id, balance_change,
    increment_nonce, events_id, actions_id, call_data_id, call_depth, zkapp_network_precondition_id,
    zkapp_account_precondition_id, use_full_commitment, implicit_account_creation_fee, may_use_token,
    authorization_kind)
  VALUES (900106, 900002, 1, '0', false, 1, 900106, 1,
    0, 1, 1, false, false, 'No', 'Proof');
INSERT INTO zkapp_account_update (id, body_id) VALUES (900106, 900106);
INSERT INTO zkapp_commands (id, zkapp_fee_payer_body_id, zkapp_account_updates_ids, memo, hash)
  VALUES (900106, 1, '{900106}', 'action-state-fixture', 'CkpZActionStateFixtureTx900106');
INSERT INTO blocks_zkapp_commands (block_id, zkapp_command_id, sequence_no, status)
  VALUES (900029, 900106, 1, 'applied');
INSERT INTO zkapp_action_states (id, element0, element1, element2, element3, element4)
  VALUES (900106, 900023, 900022, 1, 1, 1);
INSERT INTO zkapp_accounts (id, app_state_id, verification_key_id, zkapp_version, action_state_id,
    last_action_slot, proved_state, zkapp_uri_id)
  VALUES (900106, 900001, NULL, 1, 900106, 29, true, 900001);
INSERT INTO accounts_accessed (ledger_index, block_id, account_identifier_id, token_symbol_id, balance,
    nonce, receipt_chain_hash, delegate_id, voting_for_id, timing_id, permissions_id, zkapp_id)
  VALUES (900106, 900029, 900002, 1, '1000000000', 0,
    '2mzbV7WevxLuchs2dAMY4vQBS6XttnCUF8Hvks4XNBQ5qiSGGBQe', NULL, 1, 1, 1, 900106);

-- control: action 4 in block 30 (state S4)
INSERT INTO zkapp_field_array (id, element_ids) VALUES (900107, '{900048}');
INSERT INTO zkapp_events (id, element_ids) VALUES (900107, '{900107}');
INSERT INTO zkapp_account_update_body (id, account_identifier_id, update_id, balance_change,
    increment_nonce, events_id, actions_id, call_data_id, call_depth, zkapp_network_precondition_id,
    zkapp_account_precondition_id, use_full_commitment, implicit_account_creation_fee, may_use_token,
    authorization_kind)
  VALUES (900107, 900002, 1, '0', false, 1, 900107, 1,
    0, 1, 1, false, false, 'No', 'Proof');
INSERT INTO zkapp_account_update (id, body_id) VALUES (900107, 900107);
INSERT INTO zkapp_commands (id, zkapp_fee_payer_body_id, zkapp_account_updates_ids, memo, hash)
  VALUES (900107, 1, '{900107}', 'action-state-fixture', 'CkpZActionStateFixtureTx900107');
INSERT INTO blocks_zkapp_commands (block_id, zkapp_command_id, sequence_no, status)
  VALUES (900030, 900107, 1, 'applied');
INSERT INTO zkapp_action_states (id, element0, element1, element2, element3, element4)
  VALUES (900107, 900024, 900023, 1, 1, 1);
INSERT INTO zkapp_accounts (id, app_state_id, verification_key_id, zkapp_version, action_state_id,
    last_action_slot, proved_state, zkapp_uri_id)
  VALUES (900107, 900001, NULL, 1, 900107, 30, true, 900001);
INSERT INTO accounts_accessed (ledger_index, block_id, account_identifier_id, token_symbol_id, balance,
    nonce, receipt_chain_hash, delegate_id, voting_for_id, timing_id, permissions_id, zkapp_id)
  VALUES (900107, 900030, 900002, 1, '1000000000', 0,
    '2mzbV7WevxLuchs2dAMY4vQBS6XttnCUF8Hvks4XNBQ5qiSGGBQe', NULL, 1, 1, 1, 900107);

-- adjacent: action 1 in block 27 (state S1)
INSERT INTO zkapp_field_array (id, element_ids) VALUES (900108, '{900049}');
INSERT INTO zkapp_events (id, element_ids) VALUES (900108, '{900108}');
INSERT INTO zkapp_account_update_body (id, account_identifier_id, update_id, balance_change,
    increment_nonce, events_id, actions_id, call_data_id, call_depth, zkapp_network_precondition_id,
    zkapp_account_precondition_id, use_full_commitment, implicit_account_creation_fee, may_use_token,
    authorization_kind)
  VALUES (900108, 900003, 1, '0', false, 1, 900108, 1,
    0, 1, 1, false, false, 'No', 'Proof');
INSERT INTO zkapp_account_update (id, body_id) VALUES (900108, 900108);
INSERT INTO zkapp_commands (id, zkapp_fee_payer_body_id, zkapp_account_updates_ids, memo, hash)
  VALUES (900108, 1, '{900108}', 'action-state-fixture', 'CkpZActionStateFixtureTx900108');
INSERT INTO blocks_zkapp_commands (block_id, zkapp_command_id, sequence_no, status)
  VALUES (900027, 900108, 2, 'applied');
INSERT INTO zkapp_action_states (id, element0, element1, element2, element3, element4)
  VALUES (900108, 900031, 1, 1, 1, 1);
INSERT INTO zkapp_accounts (id, app_state_id, verification_key_id, zkapp_version, action_state_id,
    last_action_slot, proved_state, zkapp_uri_id)
  VALUES (900108, 900001, NULL, 1, 900108, 27, true, 900001);
INSERT INTO accounts_accessed (ledger_index, block_id, account_identifier_id, token_symbol_id, balance,
    nonce, receipt_chain_hash, delegate_id, voting_for_id, timing_id, permissions_id, zkapp_id)
  VALUES (900108, 900027, 900003, 1, '1000000000', 0,
    '2mzbV7WevxLuchs2dAMY4vQBS6XttnCUF8Hvks4XNBQ5qiSGGBQe', NULL, 1, 1, 1, 900108);

-- adjacent: action 2 in block 28 (state S2)
INSERT INTO zkapp_field_array (id, element_ids) VALUES (900109, '{900050}');
INSERT INTO zkapp_events (id, element_ids) VALUES (900109, '{900109}');
INSERT INTO zkapp_account_update_body (id, account_identifier_id, update_id, balance_change,
    increment_nonce, events_id, actions_id, call_data_id, call_depth, zkapp_network_precondition_id,
    zkapp_account_precondition_id, use_full_commitment, implicit_account_creation_fee, may_use_token,
    authorization_kind)
  VALUES (900109, 900003, 1, '0', false, 1, 900109, 1,
    0, 1, 1, false, false, 'No', 'Proof');
INSERT INTO zkapp_account_update (id, body_id) VALUES (900109, 900109);
INSERT INTO zkapp_commands (id, zkapp_fee_payer_body_id, zkapp_account_updates_ids, memo, hash)
  VALUES (900109, 1, '{900109}', 'action-state-fixture', 'CkpZActionStateFixtureTx900109');
INSERT INTO blocks_zkapp_commands (block_id, zkapp_command_id, sequence_no, status)
  VALUES (900028, 900109, 2, 'applied');
INSERT INTO zkapp_action_states (id, element0, element1, element2, element3, element4)
  VALUES (900109, 900033, 900031, 1, 1, 1);
INSERT INTO zkapp_accounts (id, app_state_id, verification_key_id, zkapp_version, action_state_id,
    last_action_slot, proved_state, zkapp_uri_id)
  VALUES (900109, 900001, NULL, 1, 900109, 28, true, 900001);
INSERT INTO accounts_accessed (ledger_index, block_id, account_identifier_id, token_symbol_id, balance,
    nonce, receipt_chain_hash, delegate_id, voting_for_id, timing_id, permissions_id, zkapp_id)
  VALUES (900109, 900028, 900003, 1, '1000000000', 0,
    '2mzbV7WevxLuchs2dAMY4vQBS6XttnCUF8Hvks4XNBQ5qiSGGBQe', NULL, 1, 1, 1, 900109);

-- adjacent: action 3 in block 29 (state S3)
INSERT INTO zkapp_field_array (id, element_ids) VALUES (900110, '{900051}');
INSERT INTO zkapp_events (id, element_ids) VALUES (900110, '{900110}');
INSERT INTO zkapp_account_update_body (id, account_identifier_id, update_id, balance_change,
    increment_nonce, events_id, actions_id, call_data_id, call_depth, zkapp_network_precondition_id,
    zkapp_account_precondition_id, use_full_commitment, implicit_account_creation_fee, may_use_token,
    authorization_kind)
  VALUES (900110, 900003, 1, '0', false, 1, 900110, 1,
    0, 1, 1, false, false, 'No', 'Proof');
INSERT INTO zkapp_account_update (id, body_id) VALUES (900110, 900110);
INSERT INTO zkapp_commands (id, zkapp_fee_payer_body_id, zkapp_account_updates_ids, memo, hash)
  VALUES (900110, 1, '{900110}', 'action-state-fixture', 'CkpZActionStateFixtureTx900110');
INSERT INTO blocks_zkapp_commands (block_id, zkapp_command_id, sequence_no, status)
  VALUES (900029, 900110, 2, 'applied');
INSERT INTO zkapp_action_states (id, element0, element1, element2, element3, element4)
  VALUES (900110, 900032, 900033, 1, 1, 1);
INSERT INTO zkapp_accounts (id, app_state_id, verification_key_id, zkapp_version, action_state_id,
    last_action_slot, proved_state, zkapp_uri_id)
  VALUES (900110, 900001, NULL, 1, 900110, 29, true, 900001);
INSERT INTO accounts_accessed (ledger_index, block_id, account_identifier_id, token_symbol_id, balance,
    nonce, receipt_chain_hash, delegate_id, voting_for_id, timing_id, permissions_id, zkapp_id)
  VALUES (900110, 900029, 900003, 1, '1000000000', 0,
    '2mzbV7WevxLuchs2dAMY4vQBS6XttnCUF8Hvks4XNBQ5qiSGGBQe', NULL, 1, 1, 1, 900110);

-- adjacent: action 4 in block 30 (state S4)
INSERT INTO zkapp_field_array (id, element_ids) VALUES (900111, '{900052}');
INSERT INTO zkapp_events (id, element_ids) VALUES (900111, '{900111}');
INSERT INTO zkapp_account_update_body (id, account_identifier_id, update_id, balance_change,
    increment_nonce, events_id, actions_id, call_data_id, call_depth, zkapp_network_precondition_id,
    zkapp_account_precondition_id, use_full_commitment, implicit_account_creation_fee, may_use_token,
    authorization_kind)
  VALUES (900111, 900003, 1, '0', false, 1, 900111, 1,
    0, 1, 1, false, false, 'No', 'Proof');
INSERT INTO zkapp_account_update (id, body_id) VALUES (900111, 900111);
INSERT INTO zkapp_commands (id, zkapp_fee_payer_body_id, zkapp_account_updates_ids, memo, hash)
  VALUES (900111, 1, '{900111}', 'action-state-fixture', 'CkpZActionStateFixtureTx900111');
INSERT INTO blocks_zkapp_commands (block_id, zkapp_command_id, sequence_no, status)
  VALUES (900030, 900111, 2, 'applied');
INSERT INTO zkapp_action_states (id, element0, element1, element2, element3, element4)
  VALUES (900111, 900034, 900032, 1, 1, 1);
INSERT INTO zkapp_accounts (id, app_state_id, verification_key_id, zkapp_version, action_state_id,
    last_action_slot, proved_state, zkapp_uri_id)
  VALUES (900111, 900001, NULL, 1, 900111, 30, true, 900001);
INSERT INTO accounts_accessed (ledger_index, block_id, account_identifier_id, token_symbol_id, balance,
    nonce, receipt_chain_hash, delegate_id, voting_for_id, timing_id, permissions_id, zkapp_id)
  VALUES (900111, 900030, 900003, 1, '1000000000', 0,
    '2mzbV7WevxLuchs2dAMY4vQBS6XttnCUF8Hvks4XNBQ5qiSGGBQe', NULL, 1, 1, 1, 900111);

