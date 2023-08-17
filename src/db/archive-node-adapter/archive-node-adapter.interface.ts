import type { EventFilterOptionsInput } from 'src/resolvers-types';
import type { Actions, Events } from 'src/blockchain/types';

export interface DatabaseAdapter {
  getEvents(input: EventFilterOptionsInput, options?: unknown): Promise<Events>;
  getActions(
    input: EventFilterOptionsInput,
    options?: unknown
  ): Promise<Actions>;
}
