import type postgres from 'postgres';
import { ArchiveNodeDatabaseRow } from './types.js';
import { BlockStatusFilter } from '../../../blockchain/types.js';

function fullChainCTE(db_client: postgres.Sql) {
  return db_client`
  RECURSIVE pending_chain AS (
    (
      SELECT
        id, state_hash, parent_hash, parent_id, height, global_slot_since_genesis, global_slot_since_hard_fork, timestamp, chain_status, ledger_hash, last_vrf_output
      FROM
        blocks b
      WHERE
        height = (SELECT max(height) FROM blocks)
    ) 
    UNION ALL
    SELECT
      b.id, b.state_hash, b.parent_hash, b.parent_id, b.height, b.global_slot_since_genesis, b.global_slot_since_hard_fork, b.timestamp, b.chain_status, b.ledger_hash, b.last_vrf_output
    FROM
      blocks b
    INNER JOIN pending_chain ON b.id = pending_chain.parent_id
    AND pending_chain.id <> pending_chain.parent_id
    AND pending_chain.chain_status <> 'canonical'
  ), 
  full_chain AS (
    SELECT
      DISTINCT id, state_hash, parent_id, parent_hash, height, global_slot_since_genesis, global_slot_since_hard_fork, timestamp, chain_status, ledger_hash, (SELECT max(height) FROM blocks) - height AS distance_from_max_block_height, last_vrf_output
    FROM
      (
        SELECT
          id, state_hash, parent_id, parent_hash, height, global_slot_since_genesis, global_slot_since_hard_fork, timestamp, chain_status, ledger_hash, last_vrf_output
        FROM
          pending_chain
        UNION ALL
        SELECT
          id, state_hash, parent_id, parent_hash, height, global_slot_since_genesis, global_slot_since_hard_fork, timestamp, chain_status, ledger_hash, last_vrf_output
        FROM
          blocks b
        WHERE
          chain_status = 'canonical'
      ) AS full_chain
  )
  `;
}

function accountIdentifierCTE(
  db_client: postgres.Sql,
  address: string,
  tokenId: string
) {
  return db_client`
  account_identifier AS (
    SELECT
      id AS requesting_zkapp_account_identifier_id
    FROM
      account_identifiers ai
    WHERE
      ai.public_key_id = (SELECT id FROM public_keys WHERE value = ${address})
      AND
      ai.token_id = (SELECT id FROM tokens WHERE value = ${tokenId})
  )`;
}

function blocksAccessedCTE(
  db_client: postgres.Sql,
  status: BlockStatusFilter,
  to?: string,
  from?: string
) {
  return db_client`
  blocks_accessed AS
  (
    SELECT
      requesting_zkapp_account_identifier_id,
      block_id,
      account_identifier_id,
      zkapp_id,
      id AS account_access_id,
      state_hash,
      parent_hash,
      height,
      global_slot_since_genesis,
      global_slot_since_hard_fork,
      timestamp,
      chain_status,
      ledger_hash,
      distance_from_max_block_height,
      last_vrf_output
  FROM
    account_identifier ai
    INNER JOIN accounts_accessed aa ON ai.requesting_zkapp_account_identifier_id = aa.account_identifier_id
    INNER JOIN full_chain b ON aa.block_id = b.id
  WHERE
    1 = 1
    ${
      status === BlockStatusFilter.all
        ? db_client``
        : db_client`AND chain_status = ${status.toLowerCase()}`
    }
    ${to ? db_client`AND b.height <= ${to}` : db_client``}
    ${from ? db_client`AND b.height >= ${from}` : db_client``}
  )`;
}

function emittedZkAppCommandsCTE(db_client: postgres.Sql) {
  return db_client`
  emitted_zkapp_commands AS (
    SELECT
      blocks_accessed.requesting_zkapp_account_identifier_id,
      blocks_accessed.block_id,
      blocks_accessed.account_identifier_id,
      blocks_accessed.zkapp_id,
      blocks_accessed.account_access_id,
      blocks_accessed.state_hash,
      blocks_accessed.parent_hash,
      blocks_accessed.height,
      blocks_accessed.global_slot_since_genesis,
      blocks_accessed.global_slot_since_hard_fork,
      blocks_accessed.timestamp,
      blocks_accessed.chain_status,
      blocks_accessed.ledger_hash,
      blocks_accessed.distance_from_max_block_height,
      blocks_accessed.last_vrf_output,
      zkcu.id AS zkapp_account_update_id,
      bzkc.sequence_no AS sequence_number,
      zkapp_fee_payer_body_id,
      zkapp_account_updates_ids,
      authorization_kind,
      status,
      memo,
      hash,
      body_id,
      events_id,
      actions_id
    FROM
      blocks_accessed
      INNER JOIN blocks_zkapp_commands bzkc ON blocks_accessed.block_id = bzkc.block_id
      INNER JOIN zkapp_commands zkc ON bzkc.zkapp_command_id = zkc.id
      INNER JOIN zkapp_account_update zkcu ON zkcu.id = ANY(zkc.zkapp_account_updates_ids)
      INNER JOIN zkapp_account_update_body zkcu_body ON zkcu_body.id = zkcu.body_id
      AND zkcu_body.account_identifier_id = requesting_zkapp_account_identifier_id
    WHERE 
      bzkc.status <> 'failed'
  )`;
}

function emittedEventsCTE(db_client: postgres.Sql) {
  return db_client`
  emitted_events AS (
    SELECT
      emitted_zkapp_commands.requesting_zkapp_account_identifier_id,
      emitted_zkapp_commands.block_id,
      emitted_zkapp_commands.account_identifier_id,
      emitted_zkapp_commands.zkapp_id,
      emitted_zkapp_commands.account_access_id,
      emitted_zkapp_commands.state_hash,
      emitted_zkapp_commands.parent_hash,
      emitted_zkapp_commands.height,
      emitted_zkapp_commands.global_slot_since_genesis,
      emitted_zkapp_commands.global_slot_since_hard_fork,
      emitted_zkapp_commands.timestamp,
      emitted_zkapp_commands.chain_status,
      emitted_zkapp_commands.ledger_hash,
      emitted_zkapp_commands.distance_from_max_block_height,
      emitted_zkapp_commands.last_vrf_output,
      emitted_zkapp_commands.zkapp_account_update_id,
      emitted_zkapp_commands.sequence_number,
      emitted_zkapp_commands.zkapp_fee_payer_body_id,
      emitted_zkapp_commands.zkapp_account_updates_ids,
      emitted_zkapp_commands.authorization_kind,
      emitted_zkapp_commands.status,
      emitted_zkapp_commands.memo,
      emitted_zkapp_commands.hash,
      emitted_zkapp_commands.body_id,
      emitted_zkapp_commands.events_id,
      emitted_zkapp_commands.actions_id,
      zke.id AS account_update_event_id,
      zke.element_ids AS event_element_ids,
      zkfa.element_ids AS event_field_element_ids,
      zkfa.id AS event_field_elements_id,
      zkf.id AS field_id,
      zkf.field AS field_value
    FROM
      emitted_zkapp_commands
      INNER JOIN zkapp_events zke ON zke.id = emitted_zkapp_commands.events_id
      INNER JOIN zkapp_field_array zkfa ON zkfa.id = ANY(zke.element_ids)
      INNER JOIN zkapp_field zkf ON zkf.id = ANY(zkfa.element_ids)
  )
  `;
}

function emittedActionsCTE(db_client: postgres.Sql) {
  return db_client`
  emitted_actions AS (
    SELECT
      emitted_zkapp_commands.block_id,
      emitted_zkapp_commands.zkapp_id,
      emitted_zkapp_commands.state_hash,
      emitted_zkapp_commands.parent_hash,
      emitted_zkapp_commands.height,
      emitted_zkapp_commands.global_slot_since_genesis,
      emitted_zkapp_commands.global_slot_since_hard_fork,
      emitted_zkapp_commands.timestamp,
      emitted_zkapp_commands.chain_status,
      emitted_zkapp_commands.ledger_hash,
      emitted_zkapp_commands.distance_from_max_block_height,
      emitted_zkapp_commands.last_vrf_output,
      emitted_zkapp_commands.zkapp_account_update_id,
      emitted_zkapp_commands.sequence_number,
      emitted_zkapp_commands.zkapp_fee_payer_body_id,
      emitted_zkapp_commands.zkapp_account_updates_ids,
      emitted_zkapp_commands.authorization_kind,
      emitted_zkapp_commands.status,
      emitted_zkapp_commands.memo,
      emitted_zkapp_commands.hash,
      emitted_zkapp_commands.body_id,
      emitted_zkapp_commands.events_id,
      emitted_zkapp_commands.actions_id,
      zke.id AS account_update_event_id,
      zke.element_ids AS event_element_ids,
      zkfa.element_ids AS event_field_element_ids,
      zkfa.id AS event_field_elements_id,
      zkf.id AS field_id,
      zkf.field AS field_value
    FROM
      emitted_zkapp_commands
      INNER JOIN zkapp_events zke ON zke.id = emitted_zkapp_commands.actions_id
      INNER JOIN zkapp_field_array zkfa ON zkfa.id = ANY(zke.element_ids)
      INNER JOIN zkapp_field zkf ON zkf.id = ANY(zkfa.element_ids)
  )
  `;
}

function emittedActionStateCTE(
  db_client: postgres.Sql,
  fromActionState?: string,
  endActionState?: string
) {
  return db_client`
  emitted_action_state AS (
    SELECT
      zkf0.field AS action_state_value1,
      zkf1.field AS action_state_value2,
      zkf2.field AS action_state_value3,
      zkf3.field AS action_state_value4,
      zkf4.field AS action_state_value5,
      emitted_actions.last_vrf_output,
      emitted_actions.block_id,
      emitted_actions.zkapp_id,
      emitted_actions.state_hash,
      emitted_actions.parent_hash,
      emitted_actions.height,
      emitted_actions.global_slot_since_genesis,
      emitted_actions.global_slot_since_hard_fork,
      emitted_actions.timestamp,
      emitted_actions.chain_status,
      emitted_actions.ledger_hash,
      emitted_actions.distance_from_max_block_height,
      emitted_actions.last_vrf_output,
      emitted_actions.zkapp_account_update_id,
      emitted_actions.sequence_number,
      emitted_actions.zkapp_fee_payer_body_id,
      emitted_actions.zkapp_account_updates_ids,
      emitted_actions.authorization_kind,
      emitted_actions.status,
      emitted_actions.memo,
      emitted_actions.hash,
      emitted_actions.body_id,
      emitted_actions.events_id,
      emitted_actions.actions_id,
      emitted_actions.account_update_event_id,
      emitted_actions.event_element_ids,
      emitted_actions.event_field_element_ids,
      emitted_actions.event_field_elements_id,
      emitted_actions.field_id,
      emitted_actions.field_value
    FROM
      emitted_actions
      INNER JOIN zkapp_accounts zkacc ON zkacc.id = emitted_actions.zkapp_id
      INNER JOIN zkapp_action_states zks ON zks.id = zkacc.action_state_id
      INNER JOIN zkapp_field zkf0 ON zkf0.id = zks.element0
      INNER JOIN zkapp_field zkf1 ON zkf1.id = zks.element1
      INNER JOIN zkapp_field zkf2 ON zkf2.id = zks.element2
      INNER JOIN zkapp_field zkf3 ON zkf3.id = zks.element3
      INNER JOIN zkapp_field zkf4 ON zkf4.id = zks.element4
    WHERE
      1 = 1
    ${
      fromActionState
        ? db_client`AND zkf0.id >= (SELECT id FROM zkapp_field WHERE field = ${fromActionState})`
        : db_client``
    }
    ${
      endActionState
        ? db_client`AND zkf0.id <= (SELECT id FROM zkapp_field WHERE field = ${endActionState})`
        : db_client``
    }
  )`;
}

export function getEventsQuery(
  db_client: postgres.Sql,
  address: string,
  tokenId: string,
  status: BlockStatusFilter,
  to?: string,
  from?: string
) {
  return db_client<ArchiveNodeDatabaseRow[]>`
  WITH 
  ${fullChainCTE(db_client)},
  ${accountIdentifierCTE(db_client, address, tokenId)},
  ${blocksAccessedCTE(db_client, status, to, from)},
  ${emittedZkAppCommandsCTE(db_client)},
  ${emittedEventsCTE(db_client)}
  SELECT
    last_vrf_output,
    block_id,
    zkapp_id,
    state_hash,
    parent_hash,
    height,
    global_slot_since_genesis,
    global_slot_since_hard_fork,
    timestamp,
    chain_status,
    ledger_hash,
    distance_from_max_block_height,
    last_vrf_output,
    zkapp_account_update_id,
    sequence_number,
    zkapp_fee_payer_body_id,
    zkapp_account_updates_ids,
    authorization_kind,
    status,
    memo,
    hash,
    body_id,
    events_id,
    actions_id,
    account_update_event_id,
    event_element_ids,
    event_field_element_ids,
    event_field_elements_id,
    field_id,
    field_value
  FROM emitted_events
  `;
}

export function getActionsQuery(
  db_client: postgres.Sql,
  address: string,
  tokenId: string,
  status: BlockStatusFilter,
  to?: string,
  from?: string,
  fromActionState?: string,
  endActionState?: string
) {
  return db_client<ArchiveNodeDatabaseRow[]>`
  WITH 
  ${fullChainCTE(db_client)},
  ${accountIdentifierCTE(db_client, address, tokenId)},
  ${blocksAccessedCTE(db_client, status, to, from)},
  ${emittedZkAppCommandsCTE(db_client)},
  ${emittedActionsCTE(db_client)},
  ${emittedActionStateCTE(db_client, fromActionState, endActionState)}
  SELECT *
  FROM emitted_action_state
  `;
}

export function getNetworkStateQuery(db_client: postgres.Sql) {
  return db_client`
WITH max_heights AS (
    SELECT 
        chain_status,
        MAX(height) AS max_height
    FROM blocks
    WHERE chain_status IN ('canonical', 'pending')
    GROUP BY chain_status
)
SELECT b.*
FROM blocks b
JOIN max_heights mh
  ON b.chain_status = mh.chain_status
  AND b.height = mh.max_height;
  `;
}

export function checkActionState(db_client: postgres.Sql, actionState: string) {
  return db_client`
  SELECT field FROM zkapp_field WHERE field = ${actionState}
  `;
}

export function getTables(db_client: postgres.Sql) {
  return db_client`
  SELECT tablename FROM pg_catalog.pg_tables where schemaname='public';
  `;
}

export const USED_TABLES = [
  'blocks',
  'account_identifiers',
  'accounts_accessed',
  'blocks_zkapp_commands',
  'zkapp_commands',
  'zkapp_account_update',
  'zkapp_account_update_body',
  'zkapp_events',
  'zkapp_field_array',
  'zkapp_field',
  'zkapp_verification_key_hashes',
  'zkapp_verification_keys',
  'zkapp_accounts',
  'zkapp_action_states',
] as const;
