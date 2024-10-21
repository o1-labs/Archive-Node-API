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
      blocks_accessed.*,
      zkcu.id AS zkapp_account_update_id,
      bzkc.sequence_no,
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
      *,
      zke.id AS zkapp_event_id,
      zke.element_ids AS zkapp_event_element_ids,
      zkfa.id AS zkapp_event_array_id
    FROM
      emitted_zkapp_commands
      INNER JOIN zkapp_events zke ON zke.id = events_id
      INNER JOIN zkapp_field_array zkfa ON zkfa.id = ANY(zke.element_ids)
      INNER JOIN zkapp_field zkf ON zkf.id = ANY(zkfa.element_ids)
  )
  `;
}

function emittedActionsCTE(db_client: postgres.Sql) {
  return db_client`
  emitted_actions AS (
    SELECT
      *,
      zke.id AS zkapp_event_id,
      zke.element_ids AS zkapp_event_element_ids,
      zkfa.id AS zkapp_event_array_id
    FROM
      emitted_zkapp_commands
      INNER JOIN zkapp_events zke ON zke.id = actions_id
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
      emitted_actions.*
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
  SELECT *
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
