import type postgres from 'postgres';
import { BlockStatusFilter } from '../../resolvers-types';

function accountIdentifierCTE(
  db_client: postgres.Sql,
  address: string,
  tokenId: string
) {
  return db_client`
    account_identifier AS (
      SELECT id 
      FROM account_identifiers ai
      WHERE ai.public_key_id = (SELECT id FROM public_keys WHERE value = ${address})
      AND ai.token_id = (SELECT id FROM tokens WHERE value = ${tokenId})
    )`;
}

function blocksAccessedCTE(
  db_client: postgres.Sql,
  status: BlockStatusFilter,
  to?: string,
  from?: string
) {
  return db_client`
    blocks_accessed AS (
      SELECT *
      FROM account_identifier ai
      INNER JOIN accounts_accessed aa
      ON ai.id = aa.account_identifier_id
      INNER JOIN blocks b
      ON aa.block_id = b.id
      WHERE chain_status <> 'orphaned'
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
      SELECT *
      FROM blocks_accessed
      INNER JOIN blocks_zkapp_commands bzkc
      ON blocks_accessed.block_id = bzkc.block_id
      INNER JOIN zkapp_commands zkc
      ON bzkc.zkapp_command_id = zkc.id
      INNER JOIN zkapp_account_update zkcu
      ON zkcu.id = ANY(zkc.zkapp_account_updates_ids)
      INNER JOIN zkapp_account_update_body zkcu_body
      ON zkcu_body.id = zkcu.body_id
    )`;
}

function emittedEventsCTE(db_client: postgres.Sql) {
  return db_client`
  emitted_events AS (
    SELECT *
    FROM emitted_zkapp_commands
    INNER JOIN zkapp_events zke
    ON zke.id = events_id
    INNER JOIN zkapp_state_data_array zksda
    ON zksda.id = ANY(zke.element_ids)
    INNER JOIN zkapp_state_data zksd
    ON zksd.id = ANY(zksda.element_ids)
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
  return db_client`
    WITH ${accountIdentifierCTE(db_client, address, tokenId)},
    ${blocksAccessedCTE(db_client, status, to, from)},
    ${emittedZkAppCommandsCTE(db_client)},
    ${emittedEventsCTE(db_client)}
    SELECT *
    FROM emitted_events`;
}
