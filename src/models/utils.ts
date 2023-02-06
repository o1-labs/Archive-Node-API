import type { BlockInfo, TransactionInfo, Event } from './types';

export function createBlockInfo(row: any) {
  return {
    height: row.height,
    stateHash: row.state_hash,
    parentHash: row.parent_hash,
    ledgerHash: row.ledger_hash,
    chainStatus: row.chain_status,
    timestamp: row.timestamp,
    globalSlotSinceHardfork: row.global_slot_since_hard_fork,
    globalSlotSinceGenesis: row.global_slot_since_genesis,
  } as BlockInfo;
}

export function createTransactionInfo(row: any) {
  return {
    status: row.status,
    hash: row.hash,
    memo: row.memo,
    authorizationKind: row.authorization_kind,
  } as TransactionInfo;
}

export function createEvent(index: string, fields: string[]) {
  return {
    index,
    fields,
  } as Event;
}
