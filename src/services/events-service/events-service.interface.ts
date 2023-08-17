import { Events } from 'src/blockchain/types';
import { EventFilterOptionsInput } from 'src/resolvers-types';

export interface IEventsService {
  getEvents(input: EventFilterOptionsInput): Promise<Events>;
}
