import type {
  ActionFilterOptionsInput,
  EventFilterOptionsInput,
  VerificationKeyUpdateFilterInput,
  ZkappCommandFilterOptionsInput,
  UserCommandFilterInput,
} from '../../resolvers-types.js';
import type {
  Actions,
  Events,
  NetworkState,
  Blocks,
  VerificationKeyUpdates,
  ZkappCommands,
  AccountUserCommands,
} from '../../blockchain/types.js';
import type {
  BlockQueryInput,
  BlockSortByInput,
} from '../../resolvers-types.js';

export interface DatabaseAdapter {
  getEvents(input: EventFilterOptionsInput, options?: unknown): Promise<Events>;
  getActions(
    input: ActionFilterOptionsInput,
    options?: unknown
  ): Promise<Actions>;
  getZkappCommands(
    input: ZkappCommandFilterOptionsInput,
    options?: unknown
  ): Promise<ZkappCommands>;
  getUserCommands(
    input: UserCommandFilterInput,
    options?: unknown
  ): Promise<AccountUserCommands>;
  getNetworkState(options?: unknown): Promise<NetworkState>;
  getVerificationKeyUpdates(
    input: VerificationKeyUpdateFilterInput,
    options?: unknown
  ): Promise<VerificationKeyUpdates>;
  getBlocks(
    query: BlockQueryInput | null | undefined,
    limit: number | null | undefined,
    sortBy: BlockSortByInput | null | undefined,
    options: unknown
  ): Promise<Blocks>;
  /**
   * Lightweight connectivity check for readiness probes. Resolves `true` when the
   * database answers a trivial query, `false` otherwise. Never throws.
   */
  ping(): Promise<boolean>;
}
