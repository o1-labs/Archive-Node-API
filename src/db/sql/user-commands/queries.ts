import type postgres from 'postgres';
import { BlockStatusFilter } from '../../../blockchain/types.js';

export type UserCommandDatabaseRow = {
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
  sequence_no: number;
  status: string;
  failure_reason: string | null;
  hash: string;
  command_type: string;
  fee_payer: string;
  source: string;
  receiver: string;
  amount: string;
  fee: string;
  nonce: string;
  memo: string;
};

/**
 * The indexes this query is written for. Mina's archive schema creates them
 * from 5.0.0 (`upgrade.sql`, MinaProtocol/mina#19477). Without them every
 * request reads all of `user_commands`.
 */
export const USER_COMMAND_ACCOUNT_INDEXES = [
  'idx_user_commands_fee_payer_id',
  'idx_user_commands_source_id',
  'idx_user_commands_receiver_id',
] as const;

export function getPublicKeyIdQuery(client: postgres.Sql, address: string) {
  return client<{ id: number }[]>`
    SELECT id FROM public_keys WHERE value = ${address}
  `;
}

export function getMissingUserCommandIndexesQuery(client: postgres.Sql) {
  return client<{ name: string }[]>`
    SELECT wanted.name
    FROM unnest(${USER_COMMAND_ACCOUNT_INDEXES as unknown as string[]}::text[])
      AS wanted(name)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE tablename = 'user_commands' AND indexname = wanted.name
    )
  `;
}

const STATUS_CLAUSE: Record<BlockStatusFilter, string> = {
  [BlockStatusFilter.all]: '',
  [BlockStatusFilter.canonical]: "AND b.chain_status = 'canonical'",
  [BlockStatusFilter.pending]: "AND b.chain_status = 'pending'",
};

/**
 * User commands in which `publicKeyId` is the fee payer, the source or the
 * receiver, in blocks `from <= height < to` that are canonical or on the
 * pending best chain.
 *
 * Shape, measured on a mainnet archive (10.4M user commands) with the three
 * account indexes:
 *
 * - One UNION branch for each account column, each with the account id as an
 *   equality. A single `fee_payer_id = $1 OR source_id = $1 OR ...` condition
 *   cannot use the indexes well; the Rosetta search in MinaProtocol/mina#19477
 *   measured the same.
 * - The block range is inside each branch, so the planner chooses per branch
 *   between the account index and the height index. For an account with 1.34M
 *   commands over 10 000 blocks: 2.5 s; with the range applied only after the
 *   UNION: 17 s. A sparse account: under 1 ms either way.
 * - The account id is a bound VALUE, not a sub-select on public_keys, and the
 *   statement is not prepared (`prepare: false`), so Postgres plans each call
 *   with that id and its column statistics. A generic plan, which a reused
 *   prepared statement switches to, estimates every account at about 3 500
 *   rows and takes the account index even for the busiest account.
 */
export function userCommandsSql(status: BlockStatusFilter): string {
  const branch = (column: string) => `
      SELECT buc.block_id, buc.user_command_id, buc.sequence_no, buc.status,
        buc.failure_reason
      FROM user_commands uc
      INNER JOIN blocks_user_commands buc ON buc.user_command_id = uc.id
      INNER JOIN blocks b ON b.id = buc.block_id
        AND b.height >= $2 AND b.height < $3
      WHERE uc.${column} = $1`;

  return `
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
    involved AS (
      ${branch('fee_payer_id')}
      UNION
      ${branch('source_id')}
      UNION
      ${branch('receiver_id')}
    )
    SELECT
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
      i.sequence_no,
      i.status,
      i.failure_reason,
      uc.hash,
      uc.command_type,
      fee_payer.value AS fee_payer,
      source.value AS source,
      receiver.value AS receiver,
      COALESCE(uc.amount, '0') AS amount,
      uc.fee,
      uc.nonce,
      uc.memo
    FROM involved i
    INNER JOIN blocks b ON b.id = i.block_id
    INNER JOIN user_commands uc ON uc.id = i.user_command_id
    INNER JOIN public_keys fee_payer ON fee_payer.id = uc.fee_payer_id
    INNER JOIN public_keys source ON source.id = uc.source_id
    INNER JOIN public_keys receiver ON receiver.id = uc.receiver_id
    WHERE (
        b.chain_status = 'canonical'
        OR b.id IN (SELECT id FROM pending_chain)
      )
      ${STATUS_CLAUSE[status]}
    -- state_hash makes the order total: competing pending tips share a height,
    -- and a command they both carry has the same sequence_no in each.
    ORDER BY b.height ASC, b.state_hash ASC, i.sequence_no ASC
    LIMIT $4
  `;
}

export function getUserCommandsQuery(
  client: postgres.Sql,
  publicKeyId: number,
  from: number,
  to: number,
  status: BlockStatusFilter,
  limit: number
) {
  return client.unsafe<UserCommandDatabaseRow[]>(
    userCommandsSql(status),
    [publicKeyId, from, to, limit],
    { prepare: false }
  );
}
