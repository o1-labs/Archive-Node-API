import type { EventFilterOptionsInput } from '../../resolvers-types.js';
import type {
  Actions,
  Events,
  NetworkState,
  Blocks,
} from '../../blockchain/types.js';
import type { BlockQueryInput, BlockSortByInput } from '../../resolvers-types.js';

export interface DatabaseAdapter {
  getEvents(input: EventFilterOptionsInput, options?: unknown): Promise<Events>;
  getActions(
    input: EventFilterOptionsInput,
    options?: unknown
  ): Promise<Actions>;
  getNetworkState(options?: unknown): Promise<NetworkState>;
  getBlocks(
    query: BlockQueryInput | null | undefined,
    limit: number | null | undefined,
    sortBy: BlockSortByInput | null | undefined,
    options: unknown
  ): Promise<Blocks>;
}
