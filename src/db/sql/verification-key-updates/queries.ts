import type postgres from 'postgres';
import { BlockStatusFilter } from '../../../blockchain/types.js';

export type VerificationKeyUpdateDatabaseRow = {
  account_update_id: number;
  address: string;
  token_id: string;
  verification_key_hash: string;
  state_hash: string;
  parent_hash: string;
  height: string;
  global_slot_since_genesis: string;
  global_slot_since_hard_fork: string;
  timestamp: string;
  chain_status: string;
  ledger_hash: string;
  distance_from_max_block_height: string;
  last_vrf_output: string;
  status: string;
  hash: string;
  memo: string;
  authorization_kind: string;
  sequence_number: number;
  zkapp_account_updates_ids: number[];
};

export function getVerificationKeyUpdatesQuery(
  client: postgres.Sql,
  verificationKeyHash: string,
  from: number,
  to: number,
  status: BlockStatusFilter
) {
  const params: (string | number)[] = [verificationKeyHash, from, to];
  let statusClause = "AND b.chain_status <> 'orphaned'";

  if (status !== BlockStatusFilter.all) {
    params.push(status.toLowerCase());
    statusClause = `AND b.chain_status = $${params.length}`;
  }

  return client.unsafe(
    `
      WITH RECURSIVE pending_chain AS (
        SELECT id, parent_id
        FROM blocks
        WHERE chain_status = 'pending'
          AND height = (
            SELECT MAX(height) FROM blocks WHERE chain_status = 'pending'
          )

        UNION ALL

        SELECT parent.id, parent.parent_id
        FROM blocks parent
        INNER JOIN pending_chain child ON parent.id = child.parent_id
        WHERE parent.chain_status <> 'canonical'
          AND child.id <> child.parent_id
      ),
      full_chain AS (
        SELECT b.*
        FROM blocks b
        WHERE b.height >= $2
          AND b.height < $3
          AND (
            b.chain_status = 'canonical'
            OR b.id IN (SELECT id FROM pending_chain)
          )
      )
      SELECT
        zau.id AS account_update_id,
        pk.value AS address,
        t.value AS token_id,
        vkh.value AS verification_key_hash,
        b.state_hash,
        b.parent_hash,
        b.height,
        b.global_slot_since_genesis,
        b.global_slot_since_hard_fork,
        b.timestamp,
        b.chain_status,
        b.ledger_hash,
        (SELECT MAX(height) FROM blocks) - b.height
          AS distance_from_max_block_height,
        b.last_vrf_output,
        bzc.status,
        zc.hash,
        zc.memo,
        zaub.authorization_kind,
        bzc.sequence_no AS sequence_number,
        zc.zkapp_account_updates_ids
      FROM full_chain b
      INNER JOIN blocks_zkapp_commands bzc ON bzc.block_id = b.id
      INNER JOIN zkapp_commands zc ON zc.id = bzc.zkapp_command_id
      INNER JOIN LATERAL UNNEST(zc.zkapp_account_updates_ids)
        WITH ORDINALITY AS update_ref(id, position) ON TRUE
      INNER JOIN zkapp_account_update zau ON zau.id = update_ref.id
      INNER JOIN zkapp_account_update_body zaub ON zaub.id = zau.body_id
      INNER JOIN zkapp_updates zu ON zu.id = zaub.update_id
      INNER JOIN zkapp_verification_keys vk ON vk.id = zu.verification_key_id
      INNER JOIN zkapp_verification_key_hashes vkh ON vkh.id = vk.hash_id
      INNER JOIN account_identifiers ai ON ai.id = zaub.account_identifier_id
      INNER JOIN public_keys pk ON pk.id = ai.public_key_id
      INNER JOIN tokens t ON t.id = ai.token_id
      WHERE vkh.value = $1
        AND bzc.status = 'applied'
        ${statusClause}
      ORDER BY
        b.height ASC,
        bzc.sequence_no ASC,
        update_ref.position ASC,
        zau.id ASC
    `,
    params
  );
}
