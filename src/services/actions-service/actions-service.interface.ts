import { Actions } from 'src/blockchain/types';
import { ActionFilterOptionsInput } from 'src/resolvers-types';

export interface IActionsService {
  getActions(input: ActionFilterOptionsInput): Promise<Actions>;
}
