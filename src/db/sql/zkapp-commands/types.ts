export type RawFieldArray = {
  fields: (string | null)[];
};

export type RawNestedFieldArray = {
  fields: string[];
}[];

export type ZkappCommandDatabaseRow = {
  block_id: number;
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
  hash: string;
  memo: string;
  sequence_number: number;
  fee_payer: string;
  fee: string;
  account_update_id: number;
  account_update_order: string;
  public_key: string;
  token_id: string;
  authorization_kind: string;
  balance_change: string;
  increment_nonce: boolean;
  call_depth: number;
  actions: RawNestedFieldArray;
  events: RawNestedFieldArray;
  app_state: RawFieldArray | null;
  account_precondition_state: RawFieldArray | null;
  account_precondition_action_state: RawFieldArray | null;
  account_precondition_proved_state: boolean | null;
  account_precondition_is_new: boolean | null;
  network_precondition_global_slot_lower_bound: number | null;
  network_precondition_global_slot_upper_bound: number | null;
};
