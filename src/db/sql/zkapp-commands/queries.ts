import type postgres from 'postgres';
import { BlockStatusFilter } from '../../../blockchain/types.js';
import type { ZkappCommandDatabaseRow } from './types.js';

function blockRangeCte(
  dbClient: postgres.Sql,
  status: BlockStatusFilter,
  to: number,
  from: number
) {
  if (status === BlockStatusFilter.canonical) {
    return dbClient`
      max_height AS (
        SELECT MAX(height) AS value FROM blocks
      ),
      block_range AS (
        SELECT
          b.id,
          b.state_hash,
          b.parent_hash,
          b.height,
          b.global_slot_since_genesis,
          b.global_slot_since_hard_fork,
          b.timestamp,
          b.chain_status,
          b.ledger_hash,
          b.last_vrf_output
        FROM blocks b
        WHERE b.chain_status = 'canonical'
          AND b.height >= ${from}
          AND b.height < ${to}
      )
    `;
  }

  return dbClient`
    RECURSIVE max_height AS (
      SELECT MAX(height) AS value FROM blocks
    ),
    pending_chain AS (
      (
        SELECT
          id,
          state_hash,
          parent_hash,
          parent_id,
          height,
          global_slot_since_genesis,
          global_slot_since_hard_fork,
          timestamp,
          chain_status,
          ledger_hash,
          last_vrf_output
        FROM blocks
        WHERE height = (SELECT value FROM max_height)
      )
      UNION ALL
      SELECT
        b.id,
        b.state_hash,
        b.parent_hash,
        b.parent_id,
        b.height,
        b.global_slot_since_genesis,
        b.global_slot_since_hard_fork,
        b.timestamp,
        b.chain_status,
        b.ledger_hash,
        b.last_vrf_output
      FROM blocks b
      INNER JOIN pending_chain
        ON b.id = pending_chain.parent_id
        AND pending_chain.id <> pending_chain.parent_id
        AND pending_chain.chain_status <> 'canonical'
    ),
    full_chain AS (
      SELECT DISTINCT
        id,
        state_hash,
        parent_id,
        parent_hash,
        height,
        global_slot_since_genesis,
        global_slot_since_hard_fork,
        timestamp,
        chain_status,
        ledger_hash,
        last_vrf_output
      FROM (
        SELECT
          id,
          state_hash,
          parent_id,
          parent_hash,
          height,
          global_slot_since_genesis,
          global_slot_since_hard_fork,
          timestamp,
          chain_status,
          ledger_hash,
          last_vrf_output
        FROM pending_chain
        WHERE height >= ${from}
          AND height < ${to}
        UNION ALL
        SELECT
          id,
          state_hash,
          parent_id,
          parent_hash,
          height,
          global_slot_since_genesis,
          global_slot_since_hard_fork,
          timestamp,
          chain_status,
          ledger_hash,
          last_vrf_output
        FROM blocks b
        WHERE chain_status = 'canonical'
          AND b.height >= ${from}
          AND b.height < ${to}
      ) AS resolved_chain
    ),
    block_range AS (
      SELECT
        b.id,
        b.state_hash,
        b.parent_hash,
        b.height,
        b.global_slot_since_genesis,
        b.global_slot_since_hard_fork,
        b.timestamp,
        b.chain_status,
        b.ledger_hash,
        b.last_vrf_output
      FROM full_chain b
      WHERE 1 = 1
        ${
          status === BlockStatusFilter.all
            ? dbClient``
            : dbClient`AND b.chain_status = ${status.toLowerCase()}`
        }
    )
  `;
}

export function getZkappCommandsQuery(
  dbClient: postgres.Sql,
  status: BlockStatusFilter,
  to: number,
  from: number,
  accountPublicKey?: string,
  tokenId?: string
) {
  return dbClient<ZkappCommandDatabaseRow[]>`
    WITH ${blockRangeCte(dbClient, status, to, from)}
    SELECT
      b.id AS block_id,
      b.state_hash,
      b.parent_hash,
      b.height,
      b.global_slot_since_genesis,
      b.global_slot_since_hard_fork,
      b.timestamp,
      b.chain_status,
      b.ledger_hash,
      (SELECT value FROM max_height) - b.height AS distance_from_max_block_height,
      b.last_vrf_output,
      zkc.hash,
      zkc.memo,
      bzkc.sequence_no AS sequence_number,
      fee_payer_pk.value AS fee_payer,
      fpb.fee,
      zkau.id AS account_update_id,
      account_update_ids.account_update_order,
      account_update_pk.value AS public_key,
      t.value AS token_id,
      zkub.authorization_kind,
      zkub.balance_change,
      zkub.increment_nonce,
      zkub.call_depth,
      COALESCE(actions.fields, '[]'::jsonb) AS actions,
      COALESCE(events.fields, '[]'::jsonb) AS events,
      app_state.fields AS app_state,
      account_precondition_state.fields AS account_precondition_state,
      account_precondition_action_state.fields AS account_precondition_action_state,
      account_precondition.proved_state AS account_precondition_proved_state,
      account_precondition.is_new AS account_precondition_is_new,
      network_global_slot_bounds.global_slot_lower_bound AS network_precondition_global_slot_lower_bound,
      network_global_slot_bounds.global_slot_upper_bound AS network_precondition_global_slot_upper_bound
    FROM block_range b
    JOIN blocks_zkapp_commands bzkc
      ON b.id = bzkc.block_id
      AND bzkc.status <> 'failed'
    JOIN zkapp_commands zkc ON bzkc.zkapp_command_id = zkc.id
    JOIN zkapp_fee_payer_body fpb ON zkc.zkapp_fee_payer_body_id = fpb.id
    JOIN public_keys fee_payer_pk ON fpb.public_key_id = fee_payer_pk.id
    JOIN LATERAL unnest(zkc.zkapp_account_updates_ids)
      WITH ORDINALITY AS account_update_ids(account_update_id, account_update_order) ON true
    JOIN zkapp_account_update zkau ON zkau.id = account_update_ids.account_update_id
    JOIN zkapp_account_update_body zkub ON zkau.body_id = zkub.id
    JOIN account_identifiers ai ON zkub.account_identifier_id = ai.id
    JOIN public_keys account_update_pk
      ON ai.public_key_id = account_update_pk.id
      ${
        accountPublicKey
          ? dbClient`AND account_update_pk.value = ${accountPublicKey}`
          : dbClient``
      }
    JOIN tokens t
      ON ai.token_id = t.id
      ${tokenId ? dbClient`AND t.value = ${tokenId}` : dbClient``}
    LEFT JOIN zkapp_updates update_body ON update_body.id = zkub.update_id
    LEFT JOIN zkapp_states_nullable app_state_rows ON app_state_rows.id = update_body.app_state_id
    LEFT JOIN zkapp_account_precondition account_precondition
      ON account_precondition.id = zkub.zkapp_account_precondition_id
    LEFT JOIN zkapp_states_nullable account_precondition_state_rows
      ON account_precondition_state_rows.id = account_precondition.state_id
    LEFT JOIN zkapp_action_states account_precondition_action_state_rows
      ON account_precondition_action_state_rows.id = account_precondition.action_state_id
    LEFT JOIN zkapp_network_precondition network_precondition
      ON network_precondition.id = zkub.zkapp_network_precondition_id
    LEFT JOIN zkapp_global_slot_bounds network_global_slot_bounds
      ON network_global_slot_bounds.id = network_precondition.global_slot_since_genesis
    LEFT JOIN LATERAL (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('fields', field_array.fields) ORDER BY event_ids.event_order), '[]'::jsonb) AS fields
      FROM zkapp_events action_events
      JOIN LATERAL unnest(action_events.element_ids)
        WITH ORDINALITY AS event_ids(field_array_id, event_order) ON true
      JOIN zkapp_field_array event_field_array ON event_field_array.id = event_ids.field_array_id
      JOIN LATERAL (
        SELECT COALESCE(jsonb_agg(zkf.field ORDER BY field_ids.field_order), '[]'::jsonb) AS fields
        FROM unnest(event_field_array.element_ids)
          WITH ORDINALITY AS field_ids(field_id, field_order)
        JOIN zkapp_field zkf ON zkf.id = field_ids.field_id
      ) field_array ON true
      WHERE action_events.id = zkub.actions_id
    ) actions ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('fields', field_array.fields) ORDER BY event_ids.event_order), '[]'::jsonb) AS fields
      FROM zkapp_events account_update_events
      JOIN LATERAL unnest(account_update_events.element_ids)
        WITH ORDINALITY AS event_ids(field_array_id, event_order) ON true
      JOIN zkapp_field_array event_field_array ON event_field_array.id = event_ids.field_array_id
      JOIN LATERAL (
        SELECT COALESCE(jsonb_agg(zkf.field ORDER BY field_ids.field_order), '[]'::jsonb) AS fields
        FROM unnest(event_field_array.element_ids)
          WITH ORDINALITY AS field_ids(field_id, field_order)
        JOIN zkapp_field zkf ON zkf.id = field_ids.field_id
      ) field_array ON true
      WHERE account_update_events.id = zkub.events_id
    ) events ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_build_object('fields', jsonb_agg(zkf.field ORDER BY state_fields.field_order)) AS fields
      FROM (VALUES
        (0, app_state_rows.element0), (1, app_state_rows.element1),
        (2, app_state_rows.element2), (3, app_state_rows.element3),
        (4, app_state_rows.element4), (5, app_state_rows.element5),
        (6, app_state_rows.element6), (7, app_state_rows.element7),
        (8, app_state_rows.element8), (9, app_state_rows.element9),
        (10, app_state_rows.element10), (11, app_state_rows.element11),
        (12, app_state_rows.element12), (13, app_state_rows.element13),
        (14, app_state_rows.element14), (15, app_state_rows.element15),
        (16, app_state_rows.element16), (17, app_state_rows.element17),
        (18, app_state_rows.element18), (19, app_state_rows.element19),
        (20, app_state_rows.element20), (21, app_state_rows.element21),
        (22, app_state_rows.element22), (23, app_state_rows.element23),
        (24, app_state_rows.element24), (25, app_state_rows.element25),
        (26, app_state_rows.element26), (27, app_state_rows.element27),
        (28, app_state_rows.element28), (29, app_state_rows.element29),
        (30, app_state_rows.element30), (31, app_state_rows.element31)
      ) AS state_fields(field_order, field_id)
      LEFT JOIN zkapp_field zkf ON zkf.id = state_fields.field_id
      WHERE app_state_rows.id IS NOT NULL
    ) app_state ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_build_object('fields', jsonb_agg(zkf.field ORDER BY state_fields.field_order)) AS fields
      FROM (VALUES
        (0, account_precondition_state_rows.element0), (1, account_precondition_state_rows.element1),
        (2, account_precondition_state_rows.element2), (3, account_precondition_state_rows.element3),
        (4, account_precondition_state_rows.element4), (5, account_precondition_state_rows.element5),
        (6, account_precondition_state_rows.element6), (7, account_precondition_state_rows.element7),
        (8, account_precondition_state_rows.element8), (9, account_precondition_state_rows.element9),
        (10, account_precondition_state_rows.element10), (11, account_precondition_state_rows.element11),
        (12, account_precondition_state_rows.element12), (13, account_precondition_state_rows.element13),
        (14, account_precondition_state_rows.element14), (15, account_precondition_state_rows.element15),
        (16, account_precondition_state_rows.element16), (17, account_precondition_state_rows.element17),
        (18, account_precondition_state_rows.element18), (19, account_precondition_state_rows.element19),
        (20, account_precondition_state_rows.element20), (21, account_precondition_state_rows.element21),
        (22, account_precondition_state_rows.element22), (23, account_precondition_state_rows.element23),
        (24, account_precondition_state_rows.element24), (25, account_precondition_state_rows.element25),
        (26, account_precondition_state_rows.element26), (27, account_precondition_state_rows.element27),
        (28, account_precondition_state_rows.element28), (29, account_precondition_state_rows.element29),
        (30, account_precondition_state_rows.element30), (31, account_precondition_state_rows.element31)
      ) AS state_fields(field_order, field_id)
      LEFT JOIN zkapp_field zkf ON zkf.id = state_fields.field_id
      WHERE account_precondition_state_rows.id IS NOT NULL
    ) account_precondition_state ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_build_object('fields', jsonb_agg(zkf.field ORDER BY action_state_fields.field_order)) AS fields
      FROM (VALUES
        (0, account_precondition_action_state_rows.element0),
        (1, account_precondition_action_state_rows.element1),
        (2, account_precondition_action_state_rows.element2),
        (3, account_precondition_action_state_rows.element3),
        (4, account_precondition_action_state_rows.element4)
      ) AS action_state_fields(field_order, field_id)
      LEFT JOIN zkapp_field zkf ON zkf.id = action_state_fields.field_id
      WHERE account_precondition_action_state_rows.id IS NOT NULL
    ) account_precondition_action_state ON true
    ORDER BY b.height, bzkc.sequence_no, account_update_ids.account_update_order;
  `;
}

export function getZkappCommandAccountUpdateCountQuery(
  dbClient: postgres.Sql,
  status: BlockStatusFilter,
  to: number,
  from: number,
  accountPublicKey?: string,
  tokenId?: string
) {
  if (!accountPublicKey && !tokenId) {
    return dbClient<{ count: string }[]>`
      WITH ${blockRangeCte(dbClient, status, to, from)}
      SELECT COALESCE(SUM(cardinality(zkc.zkapp_account_updates_ids)), 0)::text AS count
      FROM block_range b
      JOIN blocks_zkapp_commands bzkc
        ON b.id = bzkc.block_id
        AND bzkc.status <> 'failed'
      JOIN zkapp_commands zkc ON bzkc.zkapp_command_id = zkc.id;
    `;
  }

  return dbClient<{ count: string }[]>`
    WITH ${blockRangeCte(dbClient, status, to, from)}
    SELECT COUNT(*) AS count
    FROM block_range b
    JOIN blocks_zkapp_commands bzkc
      ON b.id = bzkc.block_id
      AND bzkc.status <> 'failed'
    JOIN zkapp_commands zkc ON bzkc.zkapp_command_id = zkc.id
    JOIN LATERAL unnest(zkc.zkapp_account_updates_ids)
      WITH ORDINALITY AS account_update_ids(account_update_id, account_update_order) ON true
    JOIN zkapp_account_update zkau ON zkau.id = account_update_ids.account_update_id
    JOIN zkapp_account_update_body zkub ON zkau.body_id = zkub.id
    JOIN account_identifiers ai ON zkub.account_identifier_id = ai.id
    JOIN public_keys account_update_pk
      ON ai.public_key_id = account_update_pk.id
      ${
        accountPublicKey
          ? dbClient`AND account_update_pk.value = ${accountPublicKey}`
          : dbClient``
      }
    JOIN tokens t
      ON ai.token_id = t.id
      ${tokenId ? dbClient`AND t.value = ${tokenId}` : dbClient``}
  `;
}
