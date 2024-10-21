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
  transactionInfo: TransactionInfo;
  data: string[];
};

export type Action = {
  accountUpdateId: string;
  transactionInfo: TransactionInfo;
  data: string[];
  sequenceNumber: number;
  zkappAccountUpdateIds: number[];
  zkappEventElementIds: number[];
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
