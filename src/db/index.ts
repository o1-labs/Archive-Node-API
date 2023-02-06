import type { EventFilterOptionsInput } from '../resolvers-types';
import type { Events } from '../models/types';
import { ArchiveNodeAdapter } from './archive-node-adapter';

export interface DatabaseAdapter {
  getEvents(input: EventFilterOptionsInput): Promise<Events>;
}

export { ArchiveNodeAdapter };
