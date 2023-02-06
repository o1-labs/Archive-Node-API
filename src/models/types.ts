export const defaultTokenID =
  'wSHV2S4qX9jFsLjQo8r1BsMLH2ZRKsZx6EJd1sbozGPieEC4Jf';

export enum BlockStatusFilter {
  all = 'ALL',
  pending = 'PENDING',
  canonical = 'CANONICAL',
}

export type Event = {
  index: string;
  fields: string[];
};

export type BlockInfo = {
  height: string;
  stateHash: string;
  parentHash: string;
  ledgerHash: string;
  chainStatus: string;
  timestamp: string;
  globalSlotSinceHardfork: string;
  globalSlotSinceGenesis: string;
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
