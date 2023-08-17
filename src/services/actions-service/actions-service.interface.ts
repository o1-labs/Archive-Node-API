import { Actions } from '../../blockchain/types';
import { ActionFilterOptionsInput } from '../../resolvers-types';

export interface IActionsService {
  getActions(input: ActionFilterOptionsInput): Promise<Actions>;
}
