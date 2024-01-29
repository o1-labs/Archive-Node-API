import type { EventFilterOptionsInput } from '../../resolvers-types.js';
import type { Actions, Events } from '../../blockchain/types.js';

export interface DatabaseAdapter {
  getEvents(input: EventFilterOptionsInput, options?: unknown): Promise<Events>;
  getActions(
    input: EventFilterOptionsInput,
    options?: unknown
  ): Promise<Actions>;
}
