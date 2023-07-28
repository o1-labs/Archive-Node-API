export interface PrecomputedBlock {
  version: number;
  data: PrecomputedData;
}

export type PrecomputedData = {
  scheduled_time: string;
  protocol_state: ProtocolState;
  protocol_state_proof: string;
  staged_ledger_diff: StagedLedgerDiff;
  delta_transition_chain_proof: Array<any[] | string>;
  protocol_version: ProtocolVersion;
  accounts_accessed: Array<Array<AccountsAccessedClass | number>>;
  accounts_created: any[];
  tokens_used: Array<Array<null | string>>;
};

export type AccountsAccessedClass = {
  public_key: string;
  token_id: string;
  token_symbol: string;
  balance: string;
  nonce: string;
  receipt_chain_hash: string;
  delegate: string;
  voting_for: string;
  timing: string[];
  permissions: { [key: string]: Permission[] };
  zkapp: null;
};

export enum Permission {
  None = 'None',
  Signature = 'Signature',
}

export type ProtocolState = {
  previous_state_hash: string;
  body: Body;
};

export type Body = {
  genesis_state_hash: string;
  blockchain_state: BlockchainState;
  consensus_state: ConsensusState;
  constants: Constants;
};

export type BlockchainState = {
  staged_ledger_hash: StagedLedgerHash;
  genesis_ledger_hash: string;
  ledger_proof_statement: LedgerProofStatement;
  timestamp: string;
  body_reference: string;
};

export type LedgerProofStatement = {
  source: Source;
  target: Source;
  connecting_ledger_left: string;
  connecting_ledger_right: string;
  supply_increase: SupplyIncrease;
  fee_excess: FeeExcess[];
  sok_digest: null;
};

export type FeeExcess = {
  token: string;
  amount: SupplyIncrease;
};

export type SupplyIncrease = {
  magnitude: string;
  sgn: string[];
};

export type Source = {
  first_pass_ledger: string;
  second_pass_ledger: string;
  pending_coinbase_stack: PendingCoinbaseStack;
  local_state: LocalState;
};

export type LocalState = {
  stack_frame: string;
  call_stack: string;
  transaction_commitment: string;
  full_transaction_commitment: string;
  excess: SupplyIncrease;
  supply_increase: SupplyIncrease;
  ledger: string;
  success: boolean;
  account_update_index: string;
  failure_status_tbl: any[];
  will_succeed: boolean;
};

export type PendingCoinbaseStack = {
  data: string;
  state: State;
};

export type State = {
  init: string;
  curr: string;
};

export type StagedLedgerHash = {
  non_snark: NonSnark;
  pending_coinbase_hash: string;
};

export type NonSnark = {
  ledger_hash: string;
  aux_hash: string;
  pending_coinbase_aux: string;
};

export type ConsensusState = {
  blockchain_length: string;
  epoch_count: string;
  min_window_density: string;
  sub_window_densities: string[];
  last_vrf_output: string;
  total_currency: string;
  curr_global_slot: CurrGlobalSlot;
  global_slot_since_genesis: string[];
  staking_epoch_data: EpochData;
  next_epoch_data: EpochData;
  has_ancestor_in_same_checkpoint_window: boolean;
  block_stake_winner: string;
  block_creator: string;
  coinbase_receiver: string;
  supercharge_coinbase: boolean;
};

export function GetSlot(slot: string[]): number {
  for (let i = 0; i < slot.length; i++) {
    const slotElement = parseInt(slot[i]);
    if (!isNaN(slotElement)) {
      return slotElement;
    }
  }
  throw new Error('Invalid slot');
}

export type CurrGlobalSlot = {
  slot_number: string[];
  slots_per_epoch: string;
};

export type EpochData = {
  ledger: Ledger;
  seed: string;
  start_checkpoint: string;
  lock_checkpoint: string;
  epoch_length: string;
};

export type Ledger = {
  hash: string;
  total_currency: string;
};

export type Constants = {
  k: string;
  slots_per_epoch: string;
  slots_per_sub_window: string;
  delta: string;
  genesis_state_timestamp: string;
};

export type ProtocolVersion = {
  major: number;
  minor: number;
  patch: number;
};

export type StagedLedgerDiff = {
  diff: Array<Diff | null>;
};

export type Diff = {
  completed_works: any[];
  commands: any[];
  coinbase: Array<null | string>;
  internal_command_statuses: Array<string[]>;
};
