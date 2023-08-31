import type { EventFilterOptionsInput } from '../../resolvers-types';
import type { Actions, Events } from '../../blockchain/types';

export interface DatabaseAdapter {
  getEvents(input: EventFilterOptionsInput, options?: unknown): Promise<Events>;
  getActions(
    input: EventFilterOptionsInput,
    options?: unknown
  ): Promise<Actions>;
}
