import { ArchiveNodeDatabaseRow } from '../db/sql/events-actions/types.js';

export type Transactions = Map<string, ArchiveNodeDatabaseRow[]>;

export type BlocksWithTransactionsMap = Map<string, Transactions>;

export type FieldElementIdWithValueMap = Map<string, string>;

export enum BlockStatusFilter {
  all = 'ALL',
  pending = 'PENDING',
  canonical = 'CANONICAL',
}

export type Event = {
  accountUpdateId: string;
  transactionInfo: TransactionInfo;
  data: string[];
};

export type Action = {
  accountUpdateId: string;
  transactionInfo: TransactionInfo;
  data: string[];
};

export type NetworkState = {
  maxBlockHeight: MaxBlockHeightInfo;
};

export type MaxBlockHeightInfo = {
  canonicalMaxBlockHeight: number;
  pendingMaxBlockHeight: number;
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
  sequenceNumber: number;
  zkappAccountUpdateIds: number[];
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

export type UserCommand = {
  hash: string;
  kind: string;
  from: string;
  to: string;
  amount: string;
  fee: string;
  memo: string;
  nonce: number;
  status: string;
  failureReason: string | null;
};

export type ZkAppCommand = {
  hash: string;
  feePayer: string;
  fee: string;
  memo: string;
  status: string;
  failureReason: string | null;
};

export type FeeTransfer = {
  recipient: string;
  fee: string;
  type: string;
};

export type BlockTransactions = {
  coinbase: string;
  userCommands: UserCommand[];
  zkappCommands: ZkAppCommand[];
  feeTransfer: FeeTransfer[];
};

export type Block = {
  blockHeight: number;
  creator: string;
  stateHash: string;
  parentHash: string;
  dateTime: string;
  transactions: BlockTransactions;
};

export type Blocks = Block[];
