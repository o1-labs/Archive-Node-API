import { BlockStatusFilter } from './models/types';
import { GraphQLResolveInfo } from 'graphql';
import { GraphQLContext } from './context';
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
export type EnumResolverSignature<T, AllowedValues = any> = {
  [key in keyof T]?: AllowedValues;
};
export type RequireFields<T, K extends keyof T> = Omit<T, K> & {
  [P in K]-?: NonNullable<T[P]>;
};
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: string;
  String: string;
  Boolean: boolean;
  Int: number;
  Float: number;
};

export type ActionData = {
  __typename?: 'ActionData';
  data: Array<Maybe<Scalars['String']>>;
};

export type ActionOutput = {
  __typename?: 'ActionOutput';
  actionData?: Maybe<Array<Maybe<ActionData>>>;
  actionState: Scalars['String'];
  blockInfo?: Maybe<BlockInfo>;
  transactionInfo?: Maybe<TransactionInfo>;
};

export type BlockInfo = {
  __typename?: 'BlockInfo';
  chainStatus: Scalars['String'];
  distanceFromMaxBlockHeight: Scalars['Int'];
  globalSlotSinceGenesis: Scalars['Int'];
  globalSlotSinceHardfork: Scalars['Int'];
  height: Scalars['Int'];
  ledgerHash: Scalars['String'];
  parentHash: Scalars['String'];
  stateHash: Scalars['String'];
  timestamp: Scalars['String'];
};

export { BlockStatusFilter };

export type EventData = {
  __typename?: 'EventData';
  data: Array<Maybe<Scalars['String']>>;
};

export type EventFilterOptionsInput = {
  address: Scalars['String'];
  from?: InputMaybe<Scalars['Int']>;
  status?: InputMaybe<BlockStatusFilter>;
  to?: InputMaybe<Scalars['Int']>;
  tokenId?: InputMaybe<Scalars['String']>;
};

export type EventOutput = {
  __typename?: 'EventOutput';
  blockInfo?: Maybe<BlockInfo>;
  eventData?: Maybe<Array<Maybe<EventData>>>;
  transactionInfo?: Maybe<TransactionInfo>;
};

export type Query = {
  __typename?: 'Query';
  actions: Array<Maybe<ActionOutput>>;
  events: Array<Maybe<EventOutput>>;
};

export type QueryActionsArgs = {
  input: EventFilterOptionsInput;
};

export type QueryEventsArgs = {
  input: EventFilterOptionsInput;
};

export type TransactionInfo = {
  __typename?: 'TransactionInfo';
  authorizationKind: Scalars['String'];
  hash: Scalars['String'];
  memo: Scalars['String'];
  status: Scalars['String'];
};

export type ResolverTypeWrapper<T> = Promise<T> | T;

export type ResolverWithResolve<TResult, TParent, TContext, TArgs> = {
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};
export type Resolver<TResult, TParent = {}, TContext = {}, TArgs = {}> =
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
  TArgs
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
  TArgs
> =
  | SubscriptionSubscriberObject<TResult, TKey, TParent, TContext, TArgs>
  | SubscriptionResolverObject<TResult, TParent, TContext, TArgs>;

export type SubscriptionResolver<
  TResult,
  TKey extends string,
  TParent = {},
  TContext = {},
  TArgs = {}
> =
  | ((
      ...args: any[]
    ) => SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>)
  | SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>;

export type TypeResolveFn<TTypes, TParent = {}, TContext = {}> = (
  parent: TParent,
  context: TContext,
  info: GraphQLResolveInfo
) => Maybe<TTypes> | Promise<Maybe<TTypes>>;

export type IsTypeOfResolverFn<T = {}, TContext = {}> = (
  obj: T,
  context: TContext,
  info: GraphQLResolveInfo
) => boolean | Promise<boolean>;

export type NextResolverFn<T> = () => Promise<T>;

export type DirectiveResolverFn<
  TResult = {},
  TParent = {},
  TContext = {},
  TArgs = {}
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
  ActionOutput: ResolverTypeWrapper<ActionOutput>;
  BlockInfo: ResolverTypeWrapper<BlockInfo>;
  BlockStatusFilter: BlockStatusFilter;
  Boolean: ResolverTypeWrapper<Scalars['Boolean']>;
  EventData: ResolverTypeWrapper<EventData>;
  EventFilterOptionsInput: EventFilterOptionsInput;
  EventOutput: ResolverTypeWrapper<EventOutput>;
  Int: ResolverTypeWrapper<Scalars['Int']>;
  Query: ResolverTypeWrapper<{}>;
  String: ResolverTypeWrapper<Scalars['String']>;
  TransactionInfo: ResolverTypeWrapper<TransactionInfo>;
};

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
  ActionData: ActionData;
  ActionOutput: ActionOutput;
  BlockInfo: BlockInfo;
  Boolean: Scalars['Boolean'];
  EventData: EventData;
  EventFilterOptionsInput: EventFilterOptionsInput;
  EventOutput: EventOutput;
  Int: Scalars['Int'];
  Query: {};
  String: Scalars['String'];
  TransactionInfo: TransactionInfo;
};

export type ActionDataResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['ActionData'] = ResolversParentTypes['ActionData']
> = {
  data?: Resolver<
    Array<Maybe<ResolversTypes['String']>>,
    ParentType,
    ContextType
  >;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type ActionOutputResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['ActionOutput'] = ResolversParentTypes['ActionOutput']
> = {
  actionData?: Resolver<
    Maybe<Array<Maybe<ResolversTypes['ActionData']>>>,
    ParentType,
    ContextType
  >;
  actionState?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
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
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type BlockInfoResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['BlockInfo'] = ResolversParentTypes['BlockInfo']
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
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type BlockStatusFilterResolvers = EnumResolverSignature<
  { ALL?: any; CANONICAL?: any; PENDING?: any },
  ResolversTypes['BlockStatusFilter']
>;

export type EventDataResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['EventData'] = ResolversParentTypes['EventData']
> = {
  data?: Resolver<
    Array<Maybe<ResolversTypes['String']>>,
    ParentType,
    ContextType
  >;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type EventOutputResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['EventOutput'] = ResolversParentTypes['EventOutput']
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
  transactionInfo?: Resolver<
    Maybe<ResolversTypes['TransactionInfo']>,
    ParentType,
    ContextType
  >;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type QueryResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']
> = {
  actions?: Resolver<
    Array<Maybe<ResolversTypes['ActionOutput']>>,
    ParentType,
    ContextType,
    RequireFields<QueryActionsArgs, 'input'>
  >;
  events?: Resolver<
    Array<Maybe<ResolversTypes['EventOutput']>>,
    ParentType,
    ContextType,
    RequireFields<QueryEventsArgs, 'input'>
  >;
};

export type TransactionInfoResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['TransactionInfo'] = ResolversParentTypes['TransactionInfo']
> = {
  authorizationKind?: Resolver<
    ResolversTypes['String'],
    ParentType,
    ContextType
  >;
  hash?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  memo?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  status?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type Resolvers<ContextType = GraphQLContext> = {
  ActionData?: ActionDataResolvers<ContextType>;
  ActionOutput?: ActionOutputResolvers<ContextType>;
  BlockInfo?: BlockInfoResolvers<ContextType>;
  BlockStatusFilter?: BlockStatusFilterResolvers;
  EventData?: EventDataResolvers<ContextType>;
  EventOutput?: EventOutputResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  TransactionInfo?: TransactionInfoResolvers<ContextType>;
};
