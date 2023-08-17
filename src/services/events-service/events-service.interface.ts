import { Events } from '../../blockchain/types';
import { EventFilterOptionsInput } from '../../resolvers-types';

export interface IEventsService {
  getEvents(input: EventFilterOptionsInput): Promise<Events>;
}
