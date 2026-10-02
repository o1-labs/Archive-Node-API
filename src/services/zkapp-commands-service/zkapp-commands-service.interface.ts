import type { ZkappCommands } from '../../blockchain/types.js';
import type { ZkappCommandFilterOptionsInput } from '../../resolvers-types.js';

export interface IZkappCommandsService {
  getZkappCommands(
    input: ZkappCommandFilterOptionsInput,
    options: unknown
  ): Promise<ZkappCommands>;
}
