export const DEFAULT_TOKEN_ID =
  'wSHV2S4qX9jFsLjQo8r1BsMLH2ZRKsZx6EJd1sbozGPieEC4Jf' as const;

export enum BlockStatusFilter {
  all = 'ALL',
  pending = 'PENDING',
  canonical = 'CANONICAL',
}

export type Event = {
  data: string[];
};

export type Action = {
  data: string[];
};

export type BlockInfo = {
  height: number;
  stateHash: string;
  parentHash: string;
  ledgerHash: string;
  chainStatus: string;
  timestamp: string;
  globalSlotSinceHardfork: number;
  globalSlotSinceGenesis: number;
  distanceFromMaxBlockHeight: number;
};

export type TransactionInfo = {
  status: string;
  hash: string;
  memo: string;
  authorizationKind: string;
};

export type Events = {
  eventData: Event[];
  blockInfo: BlockInfo;
  transactionInfo: TransactionInfo;
}[];

export type Actions = {
  actionState: string;
  actionData: Action[];
  blockInfo: BlockInfo;
  transactionInfo: TransactionInfo;
}[];

export type ArchiveNodeDatabaseRow = {
  requesting_zkapp_account_identifier_id: number;
  block_id: number;
  account_identifier_id: number;
  zkapp_id: number;
  account_access_id: number;
  state_hash: string;
  parent_hash: string;
  height: string;
  global_slot_since_genesis: string;
  timestamp: string;
  chain_status: string;
  ledger_hash: string;
  distance_from_max_block_height: string;
  zkapp_fee_payer_body_id: number;
  zkapp_account_updates_ids: number[];
  status: string;
  memo: string;
  hash: string;
  body_id: number;
  events_id: number;
  actions_id: number;
  id: number;
  element_ids: number[];
  field: string;
  zkapp_event_element_ids: number[];
  action_state_value?: string;
};
