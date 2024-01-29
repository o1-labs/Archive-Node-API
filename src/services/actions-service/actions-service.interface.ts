import { Actions } from '../../blockchain/types.js';
import { ActionFilterOptionsInput } from '../../resolvers-types.js';

export interface IActionsService {
  getActions(
    input: ActionFilterOptionsInput,
    options: unknown
  ): Promise<Actions>;
}
