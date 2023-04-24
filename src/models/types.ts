export const DEFAULT_TOKEN_ID =
  'wSHV2S4qX9jFsLjQo8r1BsMLH2ZRKsZx6EJd1sbozGPieEC4Jf' as const;

export type BlocksWithTransactionsMap = Map<
  string,
  Map<string, ArchiveNodeDatabaseRow[]>
>;

export type FieldElementIdWithValueMap = Map<string, string>;

export enum BlockStatusFilter {
  all = 'ALL',
  pending = 'PENDING',
  canonical = 'CANONICAL',
}

export type Event = {
  transactionInfo: TransactionInfo;
  data: string[];
};

export type Action = {
  accountUpdateId: string;
  transactionInfo: TransactionInfo;
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
  lastVrfOutput: string;
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
}[];

export type ActionStates = {
  actionStateOne: string;
  actionStateTwo: string;
  actionStateThree: string;
  actionStateFour: string;
  actionStateFive: string;
};

export type Actions = {
  actionState: ActionStates;
  actionData: Action[];
  blockInfo: BlockInfo;
}[];

export type ArchiveNodeDatabaseRow = {
  zkapp_account_update_id: number;
  requesting_zkapp_account_identifier_id: number;
  block_id: number;
  account_identifier_id: number;
  zkapp_id: number;
  account_access_id: number;
  state_hash: string;
  parent_hash: string;
  height: string;
  global_slot_since_genesis: string;
  global_slot_since_hard_fork: string;
  authorization_kind: string;
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
  zkapp_event_array_id: number;
  last_vrf_output: string;
  action_state_value1?: string;
  action_state_value2?: string;
  action_state_value3?: string;
  action_state_value4?: string;
  action_state_value5?: string;
};
