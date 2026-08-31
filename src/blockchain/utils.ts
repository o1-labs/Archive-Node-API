import type { BlockInfo, TransactionInfo, Event, Action } from './types.js';
import type { ArchiveNodeDatabaseRow } from '../db/sql/events-actions/types.js';

type BlockInfoRow = Pick<
  ArchiveNodeDatabaseRow,
  | 'height'
  | 'state_hash'
  | 'parent_hash'
  | 'ledger_hash'
  | 'chain_status'
  | 'timestamp'
  | 'global_slot_since_hard_fork'
  | 'global_slot_since_genesis'
  | 'distance_from_max_block_height'
  | 'last_vrf_output'
>;

type TransactionInfoRow = Pick<
  ArchiveNodeDatabaseRow,
  | 'status'
  | 'hash'
  | 'memo'
  | 'authorization_kind'
  | 'sequence_number'
  | 'zkapp_account_updates_ids'
>;

export function createBlockInfo(row: BlockInfoRow): BlockInfo {
  return {
    height: Number(row.height),
    stateHash: row.state_hash,
    parentHash: row.parent_hash,
    ledgerHash: row.ledger_hash,
    chainStatus: row.chain_status,
    timestamp: row.timestamp,
    globalSlotSinceHardfork: Number(row.global_slot_since_hard_fork),
    globalSlotSinceGenesis: Number(row.global_slot_since_genesis),
    distanceFromMaxBlockHeight: Number(row.distance_from_max_block_height),
    lastVrfOutput: row.last_vrf_output,
  };
}

export function createTransactionInfo(
  row: TransactionInfoRow
): TransactionInfo {
  return {
    status: row.status,
    hash: row.hash,
    memo: row.memo,
    authorizationKind: row.authorization_kind,
    sequenceNumber: row.sequence_number,
    zkappAccountUpdateIds: row.zkapp_account_updates_ids,
  };
}

export function createEvent(
  accountUpdateId: string,
  data: string[],
  transactionInfo: TransactionInfo
): Event {
  return {
    accountUpdateId,
    data,
    transactionInfo,
  };
}

export function createAction(
  accountUpdateId: string,
  data: string[],
  transactionInfo: TransactionInfo
): Action {
  return {
    accountUpdateId,
    data,
    transactionInfo,
  };
}
