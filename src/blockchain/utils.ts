import type { BlockInfo, TransactionInfo, Event, Action } from './types.js';
import type { ArchiveNodeDatabaseRow } from '../db/sql/events-actions/types.js';

export function createBlockInfo(row: ArchiveNodeDatabaseRow): BlockInfo {
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
  row: ArchiveNodeDatabaseRow
): TransactionInfo {
  return {
    status: row.status,
    hash: row.hash,
    memo: row.memo,
    authorizationKind: row.authorization_kind,
  };
}

export function createEvent(
  data: string[],
  transactionInfo: TransactionInfo
): Event {
  return {
    data,
    transactionInfo,
  };
}

export function createAction(
  accountUpdateId: string,
  data: string[],
  transactionInfo: TransactionInfo,
  sequenceNumber: number,
  zkappAccountUpdateIds: number[],
  zkappEventElementIds: number[]
): Action {
  return {
    accountUpdateId,
    data,
    transactionInfo,
    sequenceNumber,
    zkappAccountUpdateIds,
    zkappEventElementIds,
  };
}
