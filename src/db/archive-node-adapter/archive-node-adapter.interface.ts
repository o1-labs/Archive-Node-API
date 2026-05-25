import type {
  ActionFilterOptionsInput,
  EventFilterOptionsInput,
  ZkappCommandFilterOptionsInput,
} from '../../resolvers-types.js';
import type {
  Actions,
  Events,
  NetworkState,
  Blocks,
  ZkappCommands,
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
  getNetworkState(options?: unknown): Promise<NetworkState>;
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
