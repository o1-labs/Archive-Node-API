-- Applied on top of archive_db.sql for tests/integration/user-commands.test.ts.
--
-- The base dump has 61 user commands, all self-payments of one key, so it
-- cannot show the account roles, the status filter or the exclusion of
-- orphaned blocks. This file adds three accounts and seven commands:
--
--   id      block (height, status)   kind        fee payer  source  receiver  status
--   920001  31 (19, canonical)       payment     alice      alice   bob       applied
--   920002  32 (20, canonical)       payment     bob        bob     carol     applied
--   920003  33 (21, canonical)       delegation  carol      carol   alice     applied
--   920004  33 (21, canonical)       payment     alice      alice   carol     failed
--   920005  37 (23, orphaned)        payment     bob        bob     alice     applied
--   920006  920001 (26, pending)     payment     alice      alice   bob       applied
--   920007  920002 (27, pending)     payment     alice      alice   alice     applied
--
-- Blocks 920001 and 920002 extend the canonical tip (block 39, height 25) as a
-- pending chain; the base dump has no pending block.

INSERT INTO public_keys (id, value) VALUES
  (920001, 'B62qUserCommandsFixtureAlice000000000000000000000000000'),
  (920002, 'B62qUserCommandsFixtureBob00000000000000000000000000000'),
  (920003, 'B62qUserCommandsFixtureCarol000000000000000000000000000'),
  (920004, 'B62qUserCommandsFixtureDaveHasNoCommands00000000000000');

INSERT INTO blocks (
  id, state_hash, parent_id, parent_hash, creator_id, block_winner_id,
  last_vrf_output, snarked_ledger_hash_id, staking_epoch_data_id,
  next_epoch_data_id, min_window_density, sub_window_densities, total_currency,
  ledger_hash, height, global_slot_since_hard_fork, global_slot_since_genesis,
  protocol_version_id, proposed_protocol_version_id, "timestamp", chain_status)
SELECT 920001, '3NKUserCommandsFixturePending26000000000000000000', id, state_hash,
  creator_id, block_winner_id, last_vrf_output, snarked_ledger_hash_id,
  staking_epoch_data_id, next_epoch_data_id, min_window_density,
  sub_window_densities, total_currency, ledger_hash, 26,
  global_slot_since_hard_fork + 1, global_slot_since_genesis + 1,
  protocol_version_id, proposed_protocol_version_id,
  ("timestamp"::bigint + 180000)::text, 'pending'
FROM blocks WHERE id = 39;

INSERT INTO blocks (
  id, state_hash, parent_id, parent_hash, creator_id, block_winner_id,
  last_vrf_output, snarked_ledger_hash_id, staking_epoch_data_id,
  next_epoch_data_id, min_window_density, sub_window_densities, total_currency,
  ledger_hash, height, global_slot_since_hard_fork, global_slot_since_genesis,
  protocol_version_id, proposed_protocol_version_id, "timestamp", chain_status)
SELECT 920002, '3NKUserCommandsFixturePending27000000000000000000', id, state_hash,
  creator_id, block_winner_id, last_vrf_output, snarked_ledger_hash_id,
  staking_epoch_data_id, next_epoch_data_id, min_window_density,
  sub_window_densities, total_currency, ledger_hash, 27,
  global_slot_since_hard_fork + 1, global_slot_since_genesis + 1,
  protocol_version_id, proposed_protocol_version_id,
  ("timestamp"::bigint + 180000)::text, 'pending'
FROM blocks WHERE id = 920001;

INSERT INTO user_commands (
  id, command_type, fee_payer_id, source_id, receiver_id, nonce, amount, fee,
  valid_until, memo, hash) VALUES
  (920001, 'payment',    920001, 920001, 920002, 0, 1000000000, 10000000, NULL,
   'E4YM2vTHhWEg66xpj52JErHUBU4pZ1yageL4TVDDpTTSsv8mK6YaH', '5JuUserCommandsFixture920001'),
  (920002, 'payment',    920002, 920002, 920003, 0, 2000000000, 10000000, NULL,
   'E4YM2vTHhWEg66xpj52JErHUBU4pZ1yageL4TVDDpTTSsv8mK6YaH', '5JuUserCommandsFixture920002'),
  (920003, 'delegation', 920003, 920003, 920001, 0, NULL,       10000000, NULL,
   'E4YM2vTHhWEg66xpj52JErHUBU4pZ1yageL4TVDDpTTSsv8mK6YaH', '5JuUserCommandsFixture920003'),
  (920004, 'payment',    920001, 920001, 920003, 1, 3000000000, 10000000, NULL,
   'E4YM2vTHhWEg66xpj52JErHUBU4pZ1yageL4TVDDpTTSsv8mK6YaH', '5JuUserCommandsFixture920004'),
  (920005, 'payment',    920002, 920002, 920001, 1, 4000000000, 10000000, NULL,
   'E4YM2vTHhWEg66xpj52JErHUBU4pZ1yageL4TVDDpTTSsv8mK6YaH', '5JuUserCommandsFixture920005'),
  (920006, 'payment',    920001, 920001, 920002, 2, 5000000000, 10000000, NULL,
   'E4YM2vTHhWEg66xpj52JErHUBU4pZ1yageL4TVDDpTTSsv8mK6YaH', '5JuUserCommandsFixture920006'),
  (920007, 'payment',    920001, 920001, 920001, 3, 6000000000, 10000000, NULL,
   'E4YM2vTHhWEg66xpj52JErHUBU4pZ1yageL4TVDDpTTSsv8mK6YaH', '5JuUserCommandsFixture920007');

INSERT INTO blocks_user_commands (
  block_id, user_command_id, sequence_no, status, failure_reason) VALUES
  (31,     920001, 0, 'applied', NULL),
  (32,     920002, 0, 'applied', NULL),
  (33,     920003, 0, 'applied', NULL),
  (33,     920004, 1, 'failed',  'Amount_insufficient_to_create_account'),
  (37,     920005, 0, 'applied', NULL),
  (920001, 920006, 0, 'applied', NULL),
  (920002, 920007, 0, 'applied', NULL);
