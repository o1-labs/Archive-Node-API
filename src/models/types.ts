export const defaultTokenID =
  'wSHV2S4qX9jFsLjQo8r1BsMLH2ZRKsZx6EJd1sbozGPieEC4Jf';

export enum BlockStatusFilter {
  all = 'ALL',
  pending = 'PENDING',
  canonical = 'CANONICAL',
}

export type Event = {
  index: string;
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
  actionData: Action[];
  blockInfo: BlockInfo;
  transactionInfo: TransactionInfo;
}[];
