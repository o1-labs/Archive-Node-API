import { Blocks } from '../../blockchain/types.js';
import { BlockQueryInput, BlockSortByInput } from '../../resolvers-types.js';

export interface IBlocksService {
  getBlocks(
    query: BlockQueryInput | null | undefined,
    limit: number | null | undefined,
    sortBy: BlockSortByInput | null | undefined,
    options: unknown
  ): Promise<Blocks>;
}
