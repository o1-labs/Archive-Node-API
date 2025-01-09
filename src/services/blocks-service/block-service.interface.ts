import { MaxBlockHeightInfo } from '../../blockchain/types.js';

export interface IBlockService {
  maxBlockHeightInfo(options: unknown): Promise<MaxBlockHeightInfo>;
}
