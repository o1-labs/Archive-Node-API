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
  const statusClause =
    status === BlockStatusFilter.all
      ? client`AND b.chain_status <> 'orphaned'`
      : client`AND b.chain_status = ${status.toLowerCase()}`;

  return client<VerificationKeyUpdateDatabaseRow[]>`
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
      -- Resolve the requested hash to the set of zkapp_updates rows that SET
      -- that verification key, before touching any block. The set is small — one
      -- row per distinct update that ever wrote this key — and MATERIALIZED
      -- keeps the planner from inlining it back into the join tree, where it
      -- would hash the whole of zkapp_updates and zkapp_account_update_body once
      -- per query. Measured on a 681k-block devnet archive over the maximum
      -- 10 000-block range: 405 ms inlined, 199 ms materialised.
      target_updates AS MATERIALIZED (
        SELECT zu.id
        FROM zkapp_verification_key_hashes vkh
        INNER JOIN zkapp_verification_keys vk ON vk.hash_id = vkh.id
        INNER JOIN zkapp_updates zu ON zu.verification_key_id = vk.id
        WHERE vkh.value = ${verificationKeyHash}
      ),
      full_chain AS (
        SELECT b.*
        FROM blocks b
        WHERE b.height >= ${from}
          AND b.height < ${to}
          AND (
            b.chain_status = 'canonical'
            OR b.id IN (SELECT id FROM pending_chain)
          )
      )
      SELECT
        zau.id AS account_update_id,
        pk.value AS address,
        t.value AS token_id,
        ${verificationKeyHash}::text AS verification_key_hash,
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
      -- An account update SETS a verification key through update_id. The other
      -- column that names a verification key on this table,
      -- verification_key_hash_id, is the PRECONDITION: the key the update
      -- requires the account to already have. Filtering on that one would answer
      -- "who called this contract" instead of "who deployed it".
      INNER JOIN zkapp_account_update_body zaub ON zaub.id = zau.body_id
        AND zaub.update_id IN (SELECT id FROM target_updates)
      INNER JOIN account_identifiers ai ON ai.id = zaub.account_identifier_id
      INNER JOIN public_keys pk ON pk.id = ai.public_key_id
      INNER JOIN tokens t ON t.id = ai.token_id
      WHERE bzc.status = 'applied'
        ${statusClause}
      -- state_hash is what makes this order total. Two competing tips sit at the
      -- same height, and pending_chain seeds from every block at the maximum
      -- pending height, so both are in the answer. A command carried by both —
      -- the normal case during a reorg; one command was measured in 8 blocks at
      -- a single height on devnet — then produces rows that agree on height,
      -- sequence_no, account-update position and zkapp_account_update.id alike.
      ORDER BY
        b.height ASC,
        b.state_hash ASC,
        bzc.sequence_no ASC,
        update_ref.position ASC
    `;
}
