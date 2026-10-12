import type { AccountUserCommands } from '../../blockchain/types.js';
import type { UserCommandFilterInput } from '../../resolvers-types.js';

export interface IUserCommandsService {
  getUserCommands(
    input: UserCommandFilterInput,
    options: unknown
  ): Promise<AccountUserCommands>;
}
