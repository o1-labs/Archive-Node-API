import type postgres from 'postgres';
import type { BlockInfo, TransactionInfo, Event, Action } from './types';

export function createBlockInfo(row: postgres.Row) {
  return {
    height: row.height,
    stateHash: row.state_hash,
    parentHash: row.parent_hash,
    ledgerHash: row.ledger_hash,
    chainStatus: row.chain_status,
    timestamp: row.timestamp,
    globalSlotSinceHardfork: row.global_slot_since_hard_fork,
    globalSlotSinceGenesis: row.global_slot_since_genesis,
    distanceFromMaxBlockHeight: row.distance_from_max_block_height,
  } as BlockInfo;
}

export function createTransactionInfo(row: postgres.Row) {
  return {
    status: row.status,
    hash: row.hash,
    memo: row.memo,
    authorizationKind: row.authorization_kind,
  } as TransactionInfo;
}

export function createEvent(data: string[], transactionInfo: TransactionInfo) {
  return {
    data,
    transactionInfo,
  } as Event;
}

export function createAction(
  accountUpdateId: string,
  data: string[],
  transactionInfo: TransactionInfo
) {
  return {
    accountUpdateId,
    data,
    transactionInfo,
  } as Action;
}
