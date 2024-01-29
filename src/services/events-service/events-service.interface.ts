import { Events } from '../../blockchain/types.js';
import { EventFilterOptionsInput } from '../../resolvers-types.js';

export interface IEventsService {
  getEvents(input: EventFilterOptionsInput, options: unknown): Promise<Events>;
}
