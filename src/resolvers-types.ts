import { BlockStatusFilter } from './blockchain/types.js';
import {
  GraphQLResolveInfo,
  GraphQLScalarType,
  GraphQLScalarTypeConfig,
} from 'graphql';
import { GraphQLContext } from './context.js';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = {
  [K in keyof T]: T[K];
};
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]?: Maybe<T[SubKey]>;
};
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]: Maybe<T[SubKey]>;
};
export type MakeEmpty<
  T extends { [key: string]: unknown },
  K extends keyof T,
> = { [_ in K]?: never };
export type Incremental<T> =
  | T
  | {
      [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never;
    };
export type EnumResolverSignature<T, AllowedValues = any> = {
  [key in keyof T]?: AllowedValues;
};
export type RequireFields<T, K extends keyof T> = Omit<T, K> & {
  [P in K]-?: NonNullable<T[P]>;
};
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string };
  String: { input: string; output: string };
  Boolean: { input: boolean; output: boolean };
  Int: { input: number; output: number };
  Float: { input: number; output: number };
  DateTime: { input: string; output: string };
};

export type ActionData = {
  __typename?: 'ActionData';
  accountUpdateId: Scalars['String']['output'];
  data: Array<Maybe<Scalars['String']['output']>>;
  transactionInfo?: Maybe<TransactionInfo>;
};

/**
 * Filter actions from a specific account
 *
 * **WARNING**: The graphQL schema server will limit the block scan range to a fixed number of blocks.  The default is 10,000 blocks, but can be changed by the host.
 * It is the responsibility of the client to use a block range that is within the limit, which will guarantee that all actions are eventually returned.  It is possible to get a partial result if you do not specify both a `from` and a `to` parameter.
 */
export type ActionFilterOptionsInput = {
  address: Scalars['String']['input'];
  /** Filter for actions that happened before this action state, inclusive */
  endActionState?: InputMaybe<Scalars['String']['input']>;
  /** Mina block height to filter actions from, inclusive */
  from?: InputMaybe<Scalars['Int']['input']>;
  /** Filter for actions that happened after this action state, inclusive */
  fromActionState?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<BlockStatusFilter>;
  /** Mina block height to filter actions to, exclusive */
  to?: InputMaybe<Scalars['Int']['input']>;
  tokenId?: InputMaybe<Scalars['String']['input']>;
};

export type ActionOutput = {
  __typename?: 'ActionOutput';
  actionData?: Maybe<Array<Maybe<ActionData>>>;
  actionState: ActionStates;
  blockInfo?: Maybe<BlockInfo>;
  transactionInfo?: Maybe<TransactionInfo>;
};

export type ActionStates = {
  __typename?: 'ActionStates';
  actionStateFive?: Maybe<Scalars['String']['output']>;
  actionStateFour?: Maybe<Scalars['String']['output']>;
  actionStateOne?: Maybe<Scalars['String']['output']>;
  actionStateThree?: Maybe<Scalars['String']['output']>;
  actionStateTwo?: Maybe<Scalars['String']['output']>;
};

export type Block = {
  __typename?: 'Block';
  blockHeight: Scalars['Int']['output'];
  creator: Scalars['String']['output'];
  dateTime: Scalars['DateTime']['output'];
  stateHash: Scalars['String']['output'];
  transactions: BlockTransactions;
};

export type BlockInfo = {
  __typename?: 'BlockInfo';
  chainStatus: Scalars['String']['output'];
  distanceFromMaxBlockHeight: Scalars['Int']['output'];
  globalSlotSinceGenesis: Scalars['Int']['output'];
  globalSlotSinceHardfork: Scalars['Int']['output'];
  height: Scalars['Int']['output'];
  ledgerHash: Scalars['String']['output'];
  parentHash: Scalars['String']['output'];
  stateHash: Scalars['String']['output'];
  timestamp: Scalars['String']['output'];
};

/** Filter for blocks by date range, canonical status, and other criteria */
export type BlockQueryInput = {
  /** Filter blocks from this height, inclusive */
  blockHeight_gte?: InputMaybe<Scalars['Int']['input']>;
  /** Filter blocks to this height, exclusive */
  blockHeight_lt?: InputMaybe<Scalars['Int']['input']>;
  /** Filter for canonical (finalized) blocks only */
  canonical?: InputMaybe<Scalars['Boolean']['input']>;
  /** Filter blocks from this date/time, inclusive */
  dateTime_gte?: InputMaybe<Scalars['DateTime']['input']>;
  /** Filter blocks to this date/time, exclusive */
  dateTime_lt?: InputMaybe<Scalars['DateTime']['input']>;
  /** Filter for blocks in best chain only */
  inBestChain?: InputMaybe<Scalars['Boolean']['input']>;
};

export enum BlockSortByInput {
  BlockheightAsc = 'BLOCKHEIGHT_ASC',
  BlockheightDesc = 'BLOCKHEIGHT_DESC',
}

export { BlockStatusFilter };

export type BlockTransactions = {
  __typename?: 'BlockTransactions';
  coinbase: Scalars['String']['output'];
};

export type EventData = {
  __typename?: 'EventData';
  accountUpdateId: Scalars['String']['output'];
  data: Array<Maybe<Scalars['String']['output']>>;
  transactionInfo?: Maybe<TransactionInfo>;
};

/**
 * Filter events from a specific account
 *
 * **WARNING**: The graphQL schema server will limit the block scan range to a fixed number of blocks.  The default is 10,000 blocks, but can be changed by the host.
 * It is the responsibility of the client to use a block range that is within the limit, which will guarantee that all events are eventually returned.  It is possible to get a partial result if you do not specify both a `from` and a `to` parameter.
 */
export type EventFilterOptionsInput = {
  address: Scalars['String']['input'];
  /** Mina block height to filter events from, inclusive */
  from?: InputMaybe<Scalars['Int']['input']>;
  status?: InputMaybe<BlockStatusFilter>;
  /** Mina block height to filter events to, exclusive */
  to?: InputMaybe<Scalars['Int']['input']>;
  tokenId?: InputMaybe<Scalars['String']['input']>;
};

export type EventOutput = {
  __typename?: 'EventOutput';
  blockInfo?: Maybe<BlockInfo>;
  eventData?: Maybe<Array<Maybe<EventData>>>;
};

export type MaxBlockHeightInfo = {
  __typename?: 'MaxBlockHeightInfo';
  canonicalMaxBlockHeight: Scalars['Int']['output'];
  pendingMaxBlockHeight: Scalars['Int']['output'];
};

/** Metadata about the network */
export type NetworkStateOutput = {
  __typename?: 'NetworkStateOutput';
  /** Returns the latest pending and canonical block heights that are synced by the archive node.  If the archive node is not fully synced, the pending block height will be lower than the actual network state.  Wait some time for the archive node to get back in sync. */
  maxBlockHeight?: Maybe<MaxBlockHeightInfo>;
};

export type Query = {
  __typename?: 'Query';
  actions: Array<Maybe<ActionOutput>>;
  blocks: Array<Maybe<Block>>;
  events: Array<Maybe<EventOutput>>;
  networkState: NetworkStateOutput;
};

export type QueryActionsArgs = {
  input: ActionFilterOptionsInput;
};

export type QueryBlocksArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  query?: InputMaybe<BlockQueryInput>;
  sortBy?: InputMaybe<BlockSortByInput>;
};

export type QueryEventsArgs = {
  input: EventFilterOptionsInput;
};

export type TransactionInfo = {
  __typename?: 'TransactionInfo';
  authorizationKind: Scalars['String']['output'];
  hash: Scalars['String']['output'];
  memo: Scalars['String']['output'];
  sequenceNumber: Scalars['Int']['output'];
  status: Scalars['String']['output'];
  zkappAccountUpdateIds: Array<Maybe<Scalars['Int']['output']>>;
};

export type ResolverTypeWrapper<T> = Promise<T> | T;

export type ResolverWithResolve<TResult, TParent, TContext, TArgs> = {
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};
export type Resolver<
  TResult,
  TParent = Record<PropertyKey, never>,
  TContext = Record<PropertyKey, never>,
  TArgs = Record<PropertyKey, never>,
> =
  | ResolverFn<TResult, TParent, TContext, TArgs>
  | ResolverWithResolve<TResult, TParent, TContext, TArgs>;

export type ResolverFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => Promise<TResult> | TResult;

export type SubscriptionSubscribeFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => AsyncIterable<TResult> | Promise<AsyncIterable<TResult>>;

export type SubscriptionResolveFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;

export interface SubscriptionSubscriberObject<
  TResult,
  TKey extends string,
  TParent,
  TContext,
  TArgs,
> {
  subscribe: SubscriptionSubscribeFn<
    { [key in TKey]: TResult },
    TParent,
    TContext,
    TArgs
  >;
  resolve?: SubscriptionResolveFn<
    TResult,
    { [key in TKey]: TResult },
    TContext,
    TArgs
  >;
}

export interface SubscriptionResolverObject<TResult, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<any, TParent, TContext, TArgs>;
  resolve: SubscriptionResolveFn<TResult, any, TContext, TArgs>;
}

export type SubscriptionObject<
  TResult,
  TKey extends string,
  TParent,
  TContext,
  TArgs,
> =
  | SubscriptionSubscriberObject<TResult, TKey, TParent, TContext, TArgs>
  | SubscriptionResolverObject<TResult, TParent, TContext, TArgs>;

export type SubscriptionResolver<
  TResult,
  TKey extends string,
  TParent = Record<PropertyKey, never>,
  TContext = Record<PropertyKey, never>,
  TArgs = Record<PropertyKey, never>,
> =
  | ((
      ...args: any[]
    ) => SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>)
  | SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>;

export type TypeResolveFn<
  TTypes,
  TParent = Record<PropertyKey, never>,
  TContext = Record<PropertyKey, never>,
> = (
  parent: TParent,
  context: TContext,
  info: GraphQLResolveInfo
) => Maybe<TTypes> | Promise<Maybe<TTypes>>;

export type IsTypeOfResolverFn<
  T = Record<PropertyKey, never>,
  TContext = Record<PropertyKey, never>,
> = (
  obj: T,
  context: TContext,
  info: GraphQLResolveInfo
) => boolean | Promise<boolean>;

export type NextResolverFn<T> = () => Promise<T>;

export type DirectiveResolverFn<
  TResult = Record<PropertyKey, never>,
  TParent = Record<PropertyKey, never>,
  TContext = Record<PropertyKey, never>,
  TArgs = Record<PropertyKey, never>,
> = (
  next: NextResolverFn<TResult>,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;

/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = {
  ActionData: ResolverTypeWrapper<ActionData>;
  ActionFilterOptionsInput: ActionFilterOptionsInput;
  ActionOutput: ResolverTypeWrapper<ActionOutput>;
  ActionStates: ResolverTypeWrapper<ActionStates>;
  Block: ResolverTypeWrapper<Block>;
  BlockInfo: ResolverTypeWrapper<BlockInfo>;
  BlockQueryInput: BlockQueryInput;
  BlockSortByInput: BlockSortByInput;
  BlockStatusFilter: BlockStatusFilter;
  BlockTransactions: ResolverTypeWrapper<BlockTransactions>;
  Boolean: ResolverTypeWrapper<Scalars['Boolean']['output']>;
  DateTime: ResolverTypeWrapper<Scalars['DateTime']['output']>;
  EventData: ResolverTypeWrapper<EventData>;
  EventFilterOptionsInput: EventFilterOptionsInput;
  EventOutput: ResolverTypeWrapper<EventOutput>;
  Int: ResolverTypeWrapper<Scalars['Int']['output']>;
  MaxBlockHeightInfo: ResolverTypeWrapper<MaxBlockHeightInfo>;
  NetworkStateOutput: ResolverTypeWrapper<NetworkStateOutput>;
  Query: ResolverTypeWrapper<Record<PropertyKey, never>>;
  String: ResolverTypeWrapper<Scalars['String']['output']>;
  TransactionInfo: ResolverTypeWrapper<TransactionInfo>;
};

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
  ActionData: ActionData;
  ActionFilterOptionsInput: ActionFilterOptionsInput;
  ActionOutput: ActionOutput;
  ActionStates: ActionStates;
  Block: Block;
  BlockInfo: BlockInfo;
  BlockQueryInput: BlockQueryInput;
  BlockTransactions: BlockTransactions;
  Boolean: Scalars['Boolean']['output'];
  DateTime: Scalars['DateTime']['output'];
  EventData: EventData;
  EventFilterOptionsInput: EventFilterOptionsInput;
  EventOutput: EventOutput;
  Int: Scalars['Int']['output'];
  MaxBlockHeightInfo: MaxBlockHeightInfo;
  NetworkStateOutput: NetworkStateOutput;
  Query: Record<PropertyKey, never>;
  String: Scalars['String']['output'];
  TransactionInfo: TransactionInfo;
};

export type ActionDataResolvers<
  ContextType = GraphQLContext,
  ParentType extends
    ResolversParentTypes['ActionData'] = ResolversParentTypes['ActionData'],
> = {
  accountUpdateId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  data?: Resolver<
    Array<Maybe<ResolversTypes['String']>>,
    ParentType,
    ContextType
  >;
  transactionInfo?: Resolver<
    Maybe<ResolversTypes['TransactionInfo']>,
    ParentType,
    ContextType
  >;
};

export type ActionOutputResolvers<
  ContextType = GraphQLContext,
  ParentType extends
    ResolversParentTypes['ActionOutput'] = ResolversParentTypes['ActionOutput'],
> = {
  actionData?: Resolver<
    Maybe<Array<Maybe<ResolversTypes['ActionData']>>>,
    ParentType,
    ContextType
  >;
  actionState?: Resolver<
    ResolversTypes['ActionStates'],
    ParentType,
    ContextType
  >;
  blockInfo?: Resolver<
    Maybe<ResolversTypes['BlockInfo']>,
    ParentType,
    ContextType
  >;
  transactionInfo?: Resolver<
    Maybe<ResolversTypes['TransactionInfo']>,
    ParentType,
    ContextType
  >;
};

export type ActionStatesResolvers<
  ContextType = GraphQLContext,
  ParentType extends
    ResolversParentTypes['ActionStates'] = ResolversParentTypes['ActionStates'],
> = {
  actionStateFive?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  actionStateFour?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  actionStateOne?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  actionStateThree?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
  actionStateTwo?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >;
};

export type BlockResolvers<
  ContextType = GraphQLContext,
  ParentType extends
    ResolversParentTypes['Block'] = ResolversParentTypes['Block'],
> = {
  blockHeight?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  creator?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  dateTime?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  stateHash?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  transactions?: Resolver<
    ResolversTypes['BlockTransactions'],
    ParentType,
    ContextType
  >;
};

export type BlockInfoResolvers<
  ContextType = GraphQLContext,
  ParentType extends
    ResolversParentTypes['BlockInfo'] = ResolversParentTypes['BlockInfo'],
> = {
  chainStatus?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  distanceFromMaxBlockHeight?: Resolver<
    ResolversTypes['Int'],
    ParentType,
    ContextType
  >;
  globalSlotSinceGenesis?: Resolver<
    ResolversTypes['Int'],
    ParentType,
    ContextType
  >;
  globalSlotSinceHardfork?: Resolver<
    ResolversTypes['Int'],
    ParentType,
    ContextType
  >;
  height?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  ledgerHash?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  parentHash?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  stateHash?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  timestamp?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type BlockStatusFilterResolvers = EnumResolverSignature<
  { ALL?: any; CANONICAL?: any; PENDING?: any },
  ResolversTypes['BlockStatusFilter']
>;

export type BlockTransactionsResolvers<
  ContextType = GraphQLContext,
  ParentType extends
    ResolversParentTypes['BlockTransactions'] = ResolversParentTypes['BlockTransactions'],
> = {
  coinbase?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export interface DateTimeScalarConfig
  extends GraphQLScalarTypeConfig<ResolversTypes['DateTime'], any> {
  name: 'DateTime';
}

export type EventDataResolvers<
  ContextType = GraphQLContext,
  ParentType extends
    ResolversParentTypes['EventData'] = ResolversParentTypes['EventData'],
> = {
  accountUpdateId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  data?: Resolver<
    Array<Maybe<ResolversTypes['String']>>,
    ParentType,
    ContextType
  >;
  transactionInfo?: Resolver<
    Maybe<ResolversTypes['TransactionInfo']>,
    ParentType,
    ContextType
  >;
};

export type EventOutputResolvers<
  ContextType = GraphQLContext,
  ParentType extends
    ResolversParentTypes['EventOutput'] = ResolversParentTypes['EventOutput'],
> = {
  blockInfo?: Resolver<
    Maybe<ResolversTypes['BlockInfo']>,
    ParentType,
    ContextType
  >;
  eventData?: Resolver<
    Maybe<Array<Maybe<ResolversTypes['EventData']>>>,
    ParentType,
    ContextType
  >;
};

export type MaxBlockHeightInfoResolvers<
  ContextType = GraphQLContext,
  ParentType extends
    ResolversParentTypes['MaxBlockHeightInfo'] = ResolversParentTypes['MaxBlockHeightInfo'],
> = {
  canonicalMaxBlockHeight?: Resolver<
    ResolversTypes['Int'],
    ParentType,
    ContextType
  >;
  pendingMaxBlockHeight?: Resolver<
    ResolversTypes['Int'],
    ParentType,
    ContextType
  >;
};

export type NetworkStateOutputResolvers<
  ContextType = GraphQLContext,
  ParentType extends
    ResolversParentTypes['NetworkStateOutput'] = ResolversParentTypes['NetworkStateOutput'],
> = {
  maxBlockHeight?: Resolver<
    Maybe<ResolversTypes['MaxBlockHeightInfo']>,
    ParentType,
    ContextType
  >;
};

export type QueryResolvers<
  ContextType = GraphQLContext,
  ParentType extends
    ResolversParentTypes['Query'] = ResolversParentTypes['Query'],
> = {
  actions?: Resolver<
    Array<Maybe<ResolversTypes['ActionOutput']>>,
    ParentType,
    ContextType,
    RequireFields<QueryActionsArgs, 'input'>
  >;
  blocks?: Resolver<
    Array<Maybe<ResolversTypes['Block']>>,
    ParentType,
    ContextType,
    Partial<QueryBlocksArgs>
  >;
  events?: Resolver<
    Array<Maybe<ResolversTypes['EventOutput']>>,
    ParentType,
    ContextType,
    RequireFields<QueryEventsArgs, 'input'>
  >;
  networkState?: Resolver<
    ResolversTypes['NetworkStateOutput'],
    ParentType,
    ContextType
  >;
};

export type TransactionInfoResolvers<
  ContextType = GraphQLContext,
  ParentType extends
    ResolversParentTypes['TransactionInfo'] = ResolversParentTypes['TransactionInfo'],
> = {
  authorizationKind?: Resolver<
    ResolversTypes['String'],
    ParentType,
    ContextType
  >;
  hash?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  memo?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  sequenceNumber?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  status?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  zkappAccountUpdateIds?: Resolver<
    Array<Maybe<ResolversTypes['Int']>>,
    ParentType,
    ContextType
  >;
};

export type Resolvers<ContextType = GraphQLContext> = {
  ActionData?: ActionDataResolvers<ContextType>;
  ActionOutput?: ActionOutputResolvers<ContextType>;
  ActionStates?: ActionStatesResolvers<ContextType>;
  Block?: BlockResolvers<ContextType>;
  BlockInfo?: BlockInfoResolvers<ContextType>;
  BlockStatusFilter?: BlockStatusFilterResolvers;
  BlockTransactions?: BlockTransactionsResolvers<ContextType>;
  DateTime?: GraphQLScalarType;
  EventData?: EventDataResolvers<ContextType>;
  EventOutput?: EventOutputResolvers<ContextType>;
  MaxBlockHeightInfo?: MaxBlockHeightInfoResolvers<ContextType>;
  NetworkStateOutput?: NetworkStateOutputResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  TransactionInfo?: TransactionInfoResolvers<ContextType>;
};
