import type {
  BlockInfo,
  TransactionInfo,
  Event,
  Action,
  ArchiveNodeDatabaseRow,
} from './types';

export function createBlockInfo(row: ArchiveNodeDatabaseRow) {
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
  } as BlockInfo;
}

export function createTransactionInfo(row: ArchiveNodeDatabaseRow) {
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
